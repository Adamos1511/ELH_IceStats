from __future__ import annotations

from io import StringIO
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

from data_bot.config import (
    BRANKARI_DETAIL_CSV,
    HEADERS,
    OUTPUT_DIR,
    PLAYER_STATS_URL,
    REQUEST_TIMEOUT,
)
from data_bot.modules.utils import (
    normalize_text,
    read_csv,
    write_csv,
)


GOALIE_STATS_URL = f"{PLAYER_STATS_URL}/detailni"

COMPETITION_ID = 7537
SEASON_START_YEAR = 2025

REQUIRED_GOALIE_COLUMNS = {
    "POŘ.",
    "JMÉNO",
    "TÝM",
    "POZ.",
    "GP",
    "TOI",
    "GA",
    "Svs",
    "SA",
    "W",
    "L",
    "GAA",
    "Sv%",
    "A",
    "PIM",
    "SO",
}

TEAM_CODES = {
    "banes motor c. budejovice": "CBU",
    "banes motor ceske budejovice": "CBU",
    "motor ceske budejovice": "CBU",
    "hc dynamo pardubice": "PCE",
    "hc sparta praha": "SPA",
    "hc ocelari trinec": "TRI",
    "hc kometa brno": "KOM",
    "hc skoda plzen": "PLZ",
    "mountfield hk": "MHK",
    "hc vitkovice ridera": "VIT",
    "hc olomouc": "OLO",
    "bk mlada boleslav": "MBL",
    "hc energie karlovy vary": "KVA",
    "hc verva litvinov": "LIT",
    "bili tygri liberec": "LIB",
    "rytiri kladno": "KLA",
}


def create_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def get_base_params() -> dict[str, object]:
    return {
        "stats-filter-competition": COMPETITION_ID,
        "stats-filter-season": SEASON_START_YEAR,
        "stats-menu-section": "goalkeeper",
    }


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
            f"Nepodařilo se načíst statistiky brankářů: {error}"
        ) from error


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
            "Na stránce nebyly nalezeny tabulky brankářů."
        ) from error
    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se přečíst brankářské tabulky: {error}"
        ) from error

    return [flatten_columns(table) for table in tables]


def find_goalie_table(
    tables: list[pd.DataFrame],
) -> pd.DataFrame:
    for table in tables:
        columns = {
            str(column).strip()
            for column in table.columns
        }

        if REQUIRED_GOALIE_COLUMNS.issubset(columns):
            return table.copy()

    available = [
        list(map(str, table.columns))
        for table in tables
    ]

    raise RuntimeError(
        "Nepodařilo se najít tabulku brankářů. "
        f"Nalezené tabulky: {available}"
    )


def find_show_all_url(
    response: requests.Response,
) -> str | None:
    soup = BeautifulSoup(response.text, "lxml")

    for link in soup.find_all("a"):
        text = link.get_text(" ", strip=True).lower()

        if "zobrazit všechny" not in text:
            continue

        href = link.get("href")

        if href:
            return urljoin(response.url, str(href))

    return None


def clean_goalie_table(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    result = frame.copy()

    for column in result.columns:
        result[column] = (
            result[column]
            .astype(str)
            .str.replace("\xa0", " ", regex=False)
            .str.strip()
        )

    result = result[
        result["JMÉNO"].ne("")
        & result["JMÉNO"].ne("nan")
    ].copy()

    return result.reset_index(drop=True)


def load_all_goalies() -> pd.DataFrame:
    session = create_session()

    base_response = download_page(
        session,
        GOALIE_STATS_URL,
        get_base_params(),
    )

    show_all_url = find_show_all_url(base_response)

    response = (
        download_page(session, show_all_url)
        if show_all_url
        else base_response
    )

    tables = read_html_tables(response.text)
    goalie_table = find_goalie_table(tables)

    return clean_goalie_table(goalie_table)


def make_full_name_key(
    first_name: object,
    last_name: object,
) -> str:
    return normalize_text(
        f"{first_name or ''} {last_name or ''}"
    )


def split_full_name(full_name: object) -> tuple[str, str]:
    parts = str(full_name or "").strip().split()

    if not parts:
        return "", ""

    if len(parts) == 1:
        return parts[0], ""

    return " ".join(parts[:-1]), parts[-1]


def team_code(team_name: object) -> str:
    normalized = normalize_text(team_name)
    return TEAM_CODES.get(normalized, str(team_name or "").strip())


def valid_value(value: object) -> bool:
    return str(value).strip() not in {
        "",
        "nan",
        "NaN",
        "None",
    }


def source_to_output_row(
    source: pd.Series,
    columns: list[str],
) -> dict[str, object]:
    first_name, last_name = split_full_name(
        source.get("JMÉNO", "")
    )

    games = pd.to_numeric(
        source.get("GP", 0),
        errors="coerce",
    )
    shots = pd.to_numeric(
        source.get("SA", 0),
        errors="coerce",
    )

    average_shots = (
        round(float(shots) / float(games), 2)
        if pd.notna(games)
        and pd.notna(shots)
        and float(games) > 0
        else 0
    )

    values = {
        "Jméno": first_name,
        "Příjmení": last_name,
        "Smlouva": "",
        "Tým": team_code(source.get("TÝM", "")),
        "Věk": "",
        "Držení hole": "",
        "Národnost": "",
        "Výška (cm)": "",
        "Váha (kg)": "",
        "Odchytané zápasy": source.get("GP", ""),
        "Odchytané minuty": source.get("TOI", ""),
        "Výhry": source.get("W", ""),
        "průměr obdržených branek": source.get("GAA", ""),
        "% zákroků": source.get("Sv%", ""),
        "Čistá konta": source.get("SO", ""),
        "Zákroky": source.get("Svs", ""),
        "Střel proti": source.get("SA", ""),
        "Průměr střel na zápas": average_shots,
    }

    return {
        column: values.get(column, "")
        for column in columns
    }


def update_and_add_goalies(
    original: pd.DataFrame,
    goalies: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, int, int]:
    result = original.copy()

    existing_lookup: dict[str, int] = {}

    for index, row in result.iterrows():
        first_name = str(row.get("Jméno", "")).strip()
        last_name = str(row.get("Příjmení", "")).strip()

        if first_name or last_name:
            existing_lookup[
                make_full_name_key(first_name, last_name)
            ] = index

    mapping = {
        "Odchytané zápasy": "GP",
        "Odchytané minuty": "TOI",
        "Výhry": "W",
        "průměr obdržených branek": "GAA",
        "% zákroků": "Sv%",
        "Čistá konta": "SO",
        "Zákroky": "Svs",
        "Střel proti": "SA",
    }

    matched_count = 0
    added_count = 0
    source_keys: set[str] = set()

    for _, source in goalies.iterrows():
        first_name, last_name = split_full_name(
            source.get("JMÉNO", "")
        )

        key = make_full_name_key(first_name, last_name)

        if not key:
            continue

        source_keys.add(key)
        existing_index = existing_lookup.get(key)

        if existing_index is not None:
            matched_count += 1

            for target_column, source_column in mapping.items():
                if target_column not in result.columns:
                    continue

                value = source.get(source_column, "")

                if valid_value(value):
                    result.at[
                        existing_index,
                        target_column,
                    ] = value

            if "Tým" in result.columns:
                result.at[
                    existing_index,
                    "Tým",
                ] = team_code(source.get("TÝM", ""))

        else:
            new_row = source_to_output_row(
                source,
                list(result.columns),
            )

            result = pd.concat(
                [
                    result,
                    pd.DataFrame([new_row]),
                ],
                ignore_index=True,
            )

            added_count += 1

    unmatched_rows: list[dict[str, str]] = []

    for _, row in original.iterrows():
        first_name = str(row.get("Jméno", "")).strip()
        last_name = str(row.get("Příjmení", "")).strip()
        team = str(row.get("Tým", "")).strip()

        if not first_name and not last_name:
            continue

        key = make_full_name_key(first_name, last_name)

        if key not in source_keys:
            unmatched_rows.append(
                {
                    "Jméno": first_name,
                    "Příjmení": last_name,
                    "Tým": team,
                    "Důvod": (
                        "Brankář zatím nemá odchytaný zápas"
                    ),
                }
            )

    unmatched = pd.DataFrame(
        unmatched_rows,
        columns=[
            "Jméno",
            "Příjmení",
            "Tým",
            "Důvod",
        ],
    )

    return result, unmatched, matched_count, added_count


def calculate_average_shots(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    result = frame.copy()

    required = {
        "Střel proti",
        "Odchytané zápasy",
        "Průměr střel na zápas",
    }

    if not required.issubset(result.columns):
        return result

    shots = pd.to_numeric(
        result["Střel proti"]
        .astype(str)
        .str.replace(",", ".", regex=False),
        errors="coerce",
    )

    games = pd.to_numeric(
        result["Odchytané zápasy"]
        .astype(str)
        .str.replace(",", ".", regex=False),
        errors="coerce",
    )

    average = shots.div(
        games.where(games.ne(0))
    )

    result["Průměr střel na zápas"] = (
        average.round(2).fillna(0)
    )

    return result


def export_goalie_preview() -> dict[str, object]:
    original = read_csv(BRANKARI_DETAIL_CSV)
    goalies = load_all_goalies()

    updated, unmatched, matched_count, added_count = (
        update_and_add_goalies(
            original,
            goalies,
        )
    )

    updated = calculate_average_shots(updated)

    valid_original = original[
        original["Jméno"].astype(str).str.strip().ne("")
        | original["Příjmení"].astype(str).str.strip().ne("")
    ]

    output_path = (
        OUTPUT_DIR / "brankari_detail_preview.csv"
    )
    unmatched_path = (
        OUTPUT_DIR / "brankari_unmatched.csv"
    )
    raw_path = (
        OUTPUT_DIR / "hokej_goalies_raw.csv"
    )

    write_csv(updated, output_path)
    write_csv(unmatched, unmatched_path)
    write_csv(goalies, raw_path)

    return {
        "original_count": len(valid_original),
        "hokej_count": len(goalies),
        "matched_count": matched_count,
        "added_count": added_count,
        "final_count": len(
            updated[
                updated["Jméno"].astype(str).str.strip().ne("")
                | updated["Příjmení"].astype(str).str.strip().ne("")
            ]
        ),
        "unmatched_count": len(unmatched),
        "output_path": output_path,
        "unmatched_path": unmatched_path,
        "raw_path": raw_path,
    }