from __future__ import annotations

from io import StringIO
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

from data_bot.config import (
    HEADERS,
    HRACI_ELH_CSV,
    OUTPUT_DIR,
    PLAYER_STATS_URL,
    REQUEST_TIMEOUT,
)
from data_bot.modules.player_metrics import calculate_player_metrics
from data_bot.modules.utils import normalize_text, read_csv, write_csv


DETAIL_STATS_URL = f"{PLAYER_STATS_URL}/detailni"

# Tipsport extraliga 2025/26 – základní část.
COMPETITION_ID = 7397
SEASON_START_YEAR = 2025


OUTPUT_COLUMNS = [
    "Foto",
    "Jméno",
    "Příjmení",
    "Smlouva",
    "Pozice",
    "Tým",
    "Věk",
    "Držení hole",
    "Národnost",
    "Výška (cm)",
    "Váha (kg)",
    "Odehrané zápasy",
    "Goly",
    "Asistence",
    "Body",
    "Body z přesilovek",
    "Ø Času na ledě",
    "+/-",
    "Trestné minuty",
    "Hity",
    "Bloky",
    "Úspěšnost vhazování %",
    "Úspěšnost střelby %",
    "Body na zápas",
    "Hity na zápas",
    "Bloky na zápas",
    "Pořadí podle bodu v tymu",
    "Poradi prumerneho casu na lede",
    "Podíl na ofenzivě týmu",
    "Profil Hráče",
]


MASTER_COLUMN_MAPPING = {
    "JMÉNO": "Jméno",
    "PŘÍJMENÍ": "Příjmení",
    "SMLOUVA": "Smlouva",
    "POZICE": "Pozice",
    "TÝM": "Tým",
    "VĚK": "Věk",
    "DRŽENÍ HOLE": "Držení hole",
    "NÁRODNOST": "Národnost",
    "VÝŠKA (CM)": "Výška (cm)",
    "VÁHA (KG)": "Váha (kg)",
    "Foto": "Foto",
    "Zdroj": "Profil Hráče",
}


ZERO_STAT_COLUMNS = [
    "Odehrané zápasy",
    "Goly",
    "Asistence",
    "Body",
    "Body z přesilovek",
    "+/-",
    "Trestné minuty",
    "Hity",
    "Bloky",
    "Úspěšnost vhazování %",
    "Úspěšnost střelby %",
    "Body na zápas",
    "Hity na zápas",
    "Bloky na zápas",
    "Pořadí podle bodu v tymu",
    "Poradi prumerneho casu na lede",
    "Podíl na ofenzivě týmu",
]


# Jednotlivé statistické sekce Hokej.cz.
#
# None = základní tabulka.
# Ostatní hodnoty odpovídají stats-menu-section v URL.
STAT_SECTIONS = {
    "basic": None,
    "goals": "goals",
    "shots": "shots",
    "time": "time",
    "faceoff": "faceoff",
    "radegast": "radegast",
}


# Cílový sloupec v našem CSV a možné názvy zdrojových
# sloupců v tabulkách Hokej.cz.
STAT_COLUMN_ALIASES = {
    "Odehrané zápasy": [
        "GP",
        "Z",
    ],
    "Goly": [
        "G",
    ],
    "Asistence": [
        "A",
    ],
    "Body": [
        "P",
        "B",
    ],
    "Body z přesilovek": [
        "PPP",
    ],
    "Ø Času na ledě": [
        "TOI/GP",
        "TOI / GP",
        "TOI_GP",
        "ATOI",
        "Ø TOI",
        "TOI",
    ],
    "+/-": [
        "+/-",
    ],
    "Trestné minuty": [
        "PIM",
        "TM",
    ],
    "Hity": [
        "H",
        "HIT",
        "HITS",
        "HITY",
    ],
    "Bloky": [
        "BKS",
        "BKS.",
        "BLK",
        "BLOCKS",
        "BLOKY",
        "BLOKOVANÉ STŘELY",
    ],
    "Úspěšnost vhazování %": [
        "FOV%",
        "FO%",
        "FOW%",
        "VHAZOVÁNÍ %",
        "ÚSPĚŠNOST VHAZOVÁNÍ %",
    ],
    "Úspěšnost střelby %": [
        "SH%",
        "S%",
        "STŘELBA %",
        "ÚSPĚŠNOST STŘELBY %",
    ],
}


# Levá strana = normalizované jméno v hraciELH.csv.
# Pravá strana = možné zápisy ve statistikách Hokej.cz.
PLAYER_NAME_ALIASES = {
    "jaromir perez": [
        "jaromir perez lisa",
    ],
    "michael vukojevic": [
        "michael gabriel vukojevic",
        "michael vukojevic",
    ],
    "mikko artturi petman": [
        "mikko petman",
        "mikko artturi petman",
    ],
    "ville emil petman": [
        "ville petman",
        "ville emil petman",
    ],
    "layton ahac": [
        "layton ford ahac",
        "layton ahac",
    ],
    "villiam cacho": [
        "viliam cacho",
        "villiam cacho",
    ],
    "mikael sepala": [
        "mikael seppala",
        "mikael sepala",
    ],
    "niko sepala": [
        "niko seppala",
        "niko sepala",
    ],
    "john leahy": [
        "john leahy",
        "john edward leahy",
        "joseph francis leahy",

    ],
    "nick jones": [
        "nick jones",
        "nicholas jones",
    ],
    "hunter fejes": [
        "hunter fejes",
        "samuel hunter fejes",
    ],
    "martin havelka": [
        "martin havelka",
    ],
}


KNOWN_WITHOUT_SEASON_STATS = {
    "brandon davidson",
    "martin havelka",
}


def create_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def get_base_params(
    section: str | None = None,
) -> dict[str, object]:
    params: dict[str, object] = {
        "stats-filter-competition": COMPETITION_ID,
        "stats-filter-season": SEASON_START_YEAR,
    }

    if section:
        params["do"] = "stats-menu-select"
        params["stats-menu-section"] = section

    return params


def download_page(
    session: requests.Session,
    url: str,
    params: dict[str, object] | None = None,
) -> requests.Response:
    try:
        response = session.get(
            url,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response

    except requests.RequestException as error:
        raise RuntimeError(
            f"Nepodařilo se načíst Hokej.cz: {error}"
        ) from error


def test_connection() -> dict[str, object]:
    session = create_session()

    response = download_page(
        session,
        DETAIL_STATS_URL,
        get_base_params(),
    )

    soup = BeautifulSoup(response.text, "lxml")

    title = (
        soup.title.get_text(" ", strip=True)
        if soup.title
        else ""
    )

    return {
        "status_code": response.status_code,
        "url": response.url,
        "title": title,
        "table_count": len(soup.find_all("table")),
        "html_length": len(response.text),
    }


def normalize_column_name(value: object) -> str:
    return (
        str(value)
        .replace("\xa0", " ")
        .replace("\n", " ")
        .replace("\r", " ")
        .strip()
        .upper()
    )


def flatten_columns(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()

    if isinstance(result.columns, pd.MultiIndex):
        result.columns = [
            " | ".join(
                str(part).strip()
                for part in column
                if str(part).strip().lower() != "nan"
            )
            for column in result.columns
        ]
    else:
        result.columns = [
            str(column).strip()
            for column in result.columns
        ]

    return result


def read_html_tables(html: str) -> list[pd.DataFrame]:
    try:
        tables = pd.read_html(StringIO(html))

    except ValueError as error:
        raise RuntimeError(
            "Na stránce Hokej.cz nebyly nalezeny HTML tabulky."
        ) from error

    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se přečíst tabulky Hokej.cz: {error}"
        ) from error

    return [
        flatten_columns(table)
        for table in tables
    ]


def find_show_all_url(
    response: requests.Response,
) -> str | None:
    soup = BeautifulSoup(response.text, "lxml")

    for link in soup.find_all("a"):
        text = link.get_text(" ", strip=True).lower()

        if "zobrazit všechny hráče" not in text:
            continue

        href = link.get("href")

        if href:
            return urljoin(
                response.url,
                str(href),
            )

    return None


def find_player_table(
    tables: list[pd.DataFrame],
) -> pd.DataFrame:
    candidates: list[pd.DataFrame] = []

    for table in tables:
        columns = {
            normalize_column_name(column)
            for column in table.columns
        }

        if "JMÉNO" in columns:
            candidates.append(table.copy())

    if not candidates:
        available = [
            list(map(str, table.columns))
            for table in tables
        ]

        raise RuntimeError(
            "Nepodařilo se najít tabulku hráčů. "
            f"Nalezené tabulky: {available}"
        )

    # Nejširší tabulka bývá hlavní statistická tabulka.
    candidates.sort(
        key=lambda frame: (
            len(frame.columns),
            len(frame),
        ),
        reverse=True,
    )

    return candidates[0]


def clean_value(value: object) -> str:
    text = (
        str(value if value is not None else "")
        .replace("\xa0", " ")
        .replace("\r", "")
        .replace("\n", " ")
        .strip()
    )

    if text.lower() in {
        "",
        "nan",
        "none",
        "-",
        "—",
    }:
        return ""

    return text


def clean_player_table(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    result = frame.copy()

    result.columns = [
        normalize_column_name(column)
        for column in result.columns
    ]

    for column in result.columns:
        result[column] = (
            result[column]
            .astype(str)
            .str.replace("\xa0", " ", regex=False)
            .str.replace("\r", "", regex=False)
            .str.replace("\n", " ", regex=False)
            .str.strip()
        )

    if "JMÉNO" not in result.columns:
        raise RuntimeError(
            "Stažená tabulka neobsahuje sloupec JMÉNO."
        )

    result = result[
        result["JMÉNO"].ne("")
        & result["JMÉNO"].str.lower().ne("nan")
    ].copy()

    return result.reset_index(drop=True)


def load_stat_section(
    session: requests.Session,
    section: str | None,
) -> pd.DataFrame:
    base_response = download_page(
        session,
        DETAIL_STATS_URL,
        get_base_params(section),
    )

    show_all_url = find_show_all_url(base_response)

    if show_all_url:
        response = download_page(
            session,
            show_all_url,
        )
    else:
        response = base_response

    tables = read_html_tables(response.text)
    player_table = find_player_table(tables)

    return clean_player_table(player_table)

def load_powerplay_points_section(
    session: requests.Session,
) -> pd.DataFrame:
    """
    Načte body hráčů dosažené v přesilovkách.

    Hokej.cz je má v:
    stats-menu-section=advancedPoints
    stats-submenu-section=powerPlay

    Ve zdrojové tabulce se výsledná hodnota
    jmenuje P. Uvnitř našeho scraperu ji
    přejmenujeme na PPP, aby zbytek současné
    logiky nemusel být vůbec měněn.
    """

    params = get_base_params()

    params["do"] = (
        "stats-submenu-select"
    )

    params["stats-menu-section"] = (
        "advancedPoints"
    )

    params["stats-submenu-section"] = (
        "powerPlay"
    )

    base_response = download_page(
        session,
        DETAIL_STATS_URL,
        params,
    )

    show_all_url = find_show_all_url(
        base_response
    )

    if show_all_url:
        response = download_page(
            session,
            show_all_url,
        )
    else:
        response = base_response

    tables = read_html_tables(
        response.text
    )

    player_table = find_player_table(
        tables
    )

    result = clean_player_table(
        player_table
    )

    if "P" not in result.columns:
        raise RuntimeError(
            "V přesilovkové tabulce "
            "Hokej.cz nebyl nalezen "
            "sloupec P."
        )

    # POZOR:
    # zde P znamená body dosažené
    # pouze při přesilovce.
    result = result.rename(
        columns={
            "P": "PPP"
        }
    )

    return result    


def load_all_stat_sections() -> dict[str, pd.DataFrame]:
    session = create_session()
    sections: dict[str, pd.DataFrame] = {}

    for section_name, section_value in STAT_SECTIONS.items():
        try:
            sections[section_name] = load_stat_section(
                session,
                section_value,
            )

        except RuntimeError as error:
            # Základní tabulka je povinná.
            if section_name == "basic":
                raise

            print(
                f"Upozornění: sekci {section_name} "
                f"se nepodařilo načíst: {error}"
            )

            sections[section_name] = pd.DataFrame()
    # -----------------------------------------------------
    # BODY Z PŘESILOVEK
    # -----------------------------------------------------

    try:
        sections[
            "powerplay_points"
        ] = (
            load_powerplay_points_section(
                session
            )
        )

    except RuntimeError as error:
        print(
            "Upozornění: "
            "body z přesilovek "
            "se nepodařilo načíst: "
            f"{error}"
        )

        sections[
            "powerplay_points"
        ] = pd.DataFrame()
    return sections


def normalized_name(value: object) -> str:
    text = normalize_text(clean_value(value))
    return " ".join(text.split())


def make_name_key(
    first_name: object,
    last_name: object,
) -> str:
    return normalized_name(
        f"{clean_value(first_name)} "
        f"{clean_value(last_name)}"
    )


def make_edge_name_key(value: object) -> str:
    name = normalized_name(value)
    parts = name.split()

    if not parts:
        return ""

    if len(parts) == 1:
        return parts[0]

    return f"{parts[0]} {parts[-1]}"


def is_goalie_position(value: object) -> bool:
    position = normalized_name(value).upper()

    return position in {
        "B",
        "G",
        "GK",
        "BRANKAR",
        "GOALIE",
    }


def prepare_master_players() -> pd.DataFrame:
    master = read_csv(HRACI_ELH_CSV)

    required_columns = {
        "JMÉNO",
        "PŘÍJMENÍ",
        "SMLOUVA",
        "POZICE",
        "TÝM",
    }

    missing_columns = required_columns.difference(
        master.columns
    )

    if missing_columns:
        missing_text = ", ".join(
            sorted(missing_columns)
        )

        raise RuntimeError(
            "V hraciELH.csv chybí povinné sloupce: "
            f"{missing_text}"
        )

    valid_rows = (
        master["JMÉNO"]
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
        |
        master["PŘÍJMENÍ"]
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
    )

    master = master.loc[valid_rows].copy()

    # Brankáře řeší samostatně hokej_goalies.py.
    goalie_mask = master["POZICE"].apply(
        is_goalie_position
    )

    master = master.loc[~goalie_mask].copy()
    master = master.reset_index(drop=True)

    result = pd.DataFrame(
        "",
        index=master.index,
        columns=OUTPUT_COLUMNS,
    )

    for source_column, target_column in (
        MASTER_COLUMN_MAPPING.items()
    ):
        if source_column not in master.columns:
            continue

        result[target_column] = (
            master[source_column]
            .fillna("")
            .astype(str)
            .str.strip()
        )

    for column in ZERO_STAT_COLUMNS:
        result[column] = "0"

    result["Ø Času na ledě"] = "0:00"

    return result


def prepare_section_lookups(
    frame: pd.DataFrame,
) -> tuple[
    dict[str, list[dict[str, str]]],
    dict[str, list[dict[str, str]]],
]:
    exact_lookup: dict[str, list[dict[str, str]]] = {}
    edge_lookup: dict[str, list[dict[str, str]]] = {}

    if frame.empty:
        return exact_lookup, edge_lookup

    for _, row in frame.iterrows():
        full_name = clean_value(
            row.get("JMÉNO", "")
        )

        exact_key = normalized_name(full_name)
        edge_key = make_edge_name_key(full_name)

        if not exact_key:
            continue

        source = {
            str(column): clean_value(value)
            for column, value in row.items()
        }

        exact_lookup.setdefault(
            exact_key,
            [],
        ).append(source)

        if edge_key:
            edge_lookup.setdefault(
                edge_key,
                [],
            ).append(source)

    return exact_lookup, edge_lookup


def get_source_value(
    source: dict[str, str],
    aliases: list[str],
) -> str:
    normalized_source = {
        normalize_column_name(column): value
        for column, value in source.items()
    }

    for alias in aliases:
        normalized_alias = normalize_column_name(alias)

        if normalized_alias not in normalized_source:
            continue

        value = clean_value(
            normalized_source[normalized_alias]
        )

        if value:
            return value

    return ""


def select_unique_candidate(
    candidates: list[dict[str, str]],
) -> dict[str, str] | None:
    if len(candidates) != 1:
        return None

    return candidates[0]


def find_player_source(
    master_key: str,
    exact_lookup: dict[str, list[dict[str, str]]],
    edge_lookup: dict[str, list[dict[str, str]]],
) -> tuple[dict[str, str] | None, str]:
    # 1. Přesná normalizovaná shoda.
    source = select_unique_candidate(
        exact_lookup.get(master_key, [])
    )

    if source is not None:
        return source, "exact"

    # 2. Ručně potvrzené aliasy.
    for alias in PLAYER_NAME_ALIASES.get(
        master_key,
        [],
    ):
        alias_key = normalized_name(alias)

        source = select_unique_candidate(
            exact_lookup.get(alias_key, [])
        )

        if source is not None:
            return source, "alias"

    # 3. První a poslední část jména.
    edge_key = make_edge_name_key(master_key)

    source = select_unique_candidate(
        edge_lookup.get(edge_key, [])
    )

    if source is not None:
        return source, "edge"

    return None, "not_found"


def clean_number_value(value: object) -> str:
    text = clean_value(value)

    if not text:
        return ""

    text = (
        text
        .replace("%", "")
        .replace("\xa0", "")
        .strip()
    )

    # Český desetinný oddělovač
    if "." in text:
        try:
            float(text)
            text = text.replace(".", ",")
        except ValueError:
            pass

    return text
    text = clean_value(value)

    if not text:
        return ""

    return (
        text
        .replace("%", "")
        .replace("\xa0", "")
        .strip()
    )


def clean_time_value(value: object) -> str:
    text = clean_value(value)

    if not text:
        return ""

    # Například 18:24 zůstane beze změny.
    if ":" in text:
        return text

    # Pokud Hokej.cz někdy vrátí desetinný počet minut,
    # ponecháme jej. player_metrics si hodnotu zpracuje.
    return text


def apply_value_to_result(
    result: pd.DataFrame,
    index: int,
    target_column: str,
    value: str,
) -> None:
    if not value:
        return

    if target_column == "Ø Času na ledě":
        result.at[index, target_column] = clean_time_value(
            value
        )
        return

    if target_column in {
        "Úspěšnost vhazování %",
        "Úspěšnost střelby %",
    }:
        result.at[index, target_column] = clean_number_value(
            value
        )
        return

    result.at[index, target_column] = clean_number_value(
        value
    )


def apply_hokej_statistics(
    players: pd.DataFrame,
    stat_sections: dict[str, pd.DataFrame],
) -> tuple[pd.DataFrame, pd.DataFrame, int, int, int]:
    result = players.copy()

    section_lookups: dict[
        str,
        tuple[
            dict[str, list[dict[str, str]]],
            dict[str, list[dict[str, str]]],
        ],
    ] = {
        section_name: prepare_section_lookups(frame)
        for section_name, frame in stat_sections.items()
    }

    basic_exact, basic_edge = section_lookups["basic"]

    matched_count = 0
    alias_matched_count = 0
    without_stats_count = 0

    report_rows: list[dict[str, str]] = []

    for index, row in result.iterrows():
        first_name = row.get("Jméno", "")
        last_name = row.get("Příjmení", "")
        team = clean_value(row.get("Tým", ""))
        position = clean_value(row.get("Pozice", ""))

        master_key = make_name_key(
            first_name,
            last_name,
        )

        basic_source, match_type = find_player_source(
            master_key,
            basic_exact,
            basic_edge,
        )

        if basic_source is None:
            without_stats_count += 1

            if master_key in KNOWN_WITHOUT_SEASON_STATS:
                status = (
                    "Známý hráč – v základní části "
                    "2025/26 bez odehraného zápasu"
                )
            else:
                status = (
                    "Nenalezen ve statistikách "
                    "základní části 2025/26"
                )

            report_rows.append(
                {
                    "Jméno": clean_value(first_name),
                    "Příjmení": clean_value(last_name),
                    "Tým": team,
                    "Pozice": position,
                    "Stav": status,
                    "Způsob párování": "",
                    "Jméno na Hokej.cz": "",
                }
            )

            continue

        matched_count += 1

        if match_type in {
            "alias",
            "edge",
        }:
            alias_matched_count += 1

        # Projdeme všechny statistické sekce.
        # V každé sekci znovu najdeme stejného hráče.
        sources: list[dict[str, str]] = []

        for section_name, (
            exact_lookup,
            edge_lookup,
        ) in section_lookups.items():
            section_source, _ = find_player_source(
                master_key,
                exact_lookup,
                edge_lookup,
            )

            if section_source is not None:
                sources.append(section_source)

        # Základní zdroj přidáme pro jistotu jako první.
        sources.insert(0, basic_source)

        # Pro každý cílový sloupec hledáme hodnotu
        # ve všech načtených sekcích.
        for target_column, aliases in (
            STAT_COLUMN_ALIASES.items()
        ):
            selected_value = ""

            for source in sources:
                value = get_source_value(
                    source,
                    aliases,
                )

                if value:
                    selected_value = value
                    break

            apply_value_to_result(
                result,
                index,
                target_column,
                selected_value,
            )

        report_rows.append(
            {
                "Jméno": clean_value(first_name),
                "Příjmení": clean_value(last_name),
                "Tým": team,
                "Pozice": position,
                "Stav": "Spárován",
                "Způsob párování": match_type,
                "Jméno na Hokej.cz": get_source_value(
                    basic_source,
                    ["JMÉNO"],
                ),
            }
        )

    matching_report = pd.DataFrame(
        report_rows,
        columns=[
            "Jméno",
            "Příjmení",
            "Tým",
            "Pozice",
            "Stav",
            "Způsob párování",
            "Jméno na Hokej.cz",
        ],
    )

    return (
        result,
        matching_report,
        matched_count,
        alias_matched_count,
        without_stats_count,
    )


def combine_raw_sections(
    stat_sections: dict[str, pd.DataFrame],
) -> pd.DataFrame:
    raw_frames: list[pd.DataFrame] = []

    for section_name, frame in stat_sections.items():
        if frame.empty:
            continue

        section_frame = frame.copy()
        section_frame.insert(
            0,
            "SEKCE",
            section_name,
        )

        raw_frames.append(section_frame)

    if not raw_frames:
        return pd.DataFrame()

    return pd.concat(
        raw_frames,
        ignore_index=True,
        sort=False,
    )


def export_player_detail_preview() -> dict[str, object]:
    master_players = prepare_master_players()
    stat_sections = load_all_stat_sections()

    basic_players = stat_sections["basic"]

    (
        updated,
        matching_report,
        matched_count,
        alias_matched_count,
        without_stats_count,
    ) = apply_hokej_statistics(
        master_players,
        stat_sections,
    )

    updated = calculate_player_metrics(updated)
    updated = updated[OUTPUT_COLUMNS].copy()

    output_path = (
        OUTPUT_DIR
        / "hraci_detail_preview.csv"
    )

    raw_path = (
        OUTPUT_DIR
        / "hokej_players_raw.csv"
    )

    report_path = (
        OUTPUT_DIR
        / "player_matching_report.csv"
    )

    without_stats_path = (
        OUTPUT_DIR
        / "players_without_stats.csv"
    )

    without_stats = matching_report[
        matching_report["Stav"].ne("Spárován")
    ].copy()

    raw_sections = combine_raw_sections(
        stat_sections
    )

    write_csv(
        updated,
        output_path,
    )

    write_csv(
        raw_sections,
        raw_path,
    )

    write_csv(
        matching_report,
        report_path,
    )

    write_csv(
        without_stats,
        without_stats_path,
    )

    return {
        "original_count": len(master_players),
        "hokej_count": len(basic_players),
        "matched_count": matched_count,
        "alias_matched_count": alias_matched_count,
        "without_stats_count": without_stats_count,
        "unmatched_count": without_stats_count,
        "final_count": len(updated),
        "output_path": output_path,
        "raw_path": raw_path,
        "matching_report_path": report_path,
        "without_stats_path": without_stats_path,
        # Kompatibilita se starším update.py.
        "unmatched_path": without_stats_path,
    }