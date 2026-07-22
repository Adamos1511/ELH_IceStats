from __future__ import annotations

from io import StringIO
from pathlib import Path
from urllib.parse import urljoin
from data_bot.modules.player_metrics import calculate_player_metrics

import pandas as pd
import requests
from bs4 import BeautifulSoup

from data_bot.config import (
    HEADERS,
    HRACI_DETAIL_CSV,
    OUTPUT_DIR,
    PLAYER_STATS_URL,
    REQUEST_TIMEOUT,
)
from data_bot.modules.utils import (
    normalize_text,
    read_csv,
    write_csv,
)


DETAIL_STATS_URL = f"{PLAYER_STATS_URL}/detailni"

COMPETITION_ID = 7537
SEASON_START_YEAR = 2025

REQUIRED_BASIC_COLUMNS = {
    "POŘ.",
    "JMÉNO",
    "TÝM",
    "POZ.",
    "GP",
    "G",
    "A",
    "P",
    "+/-",
    "PIM",
}


def create_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def get_base_params() -> dict[str, object]:
    return {
        "stats-filter-competition": COMPETITION_ID,
        "stats-filter-season": SEASON_START_YEAR,
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
            "Na stránce nebyly nalezeny HTML tabulky."
        ) from error
    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se přečíst tabulky: {error}"
        ) from error

    return [flatten_columns(table) for table in tables]


def find_player_table(
    tables: list[pd.DataFrame],
) -> pd.DataFrame:
    for table in tables:
        columns = {
            str(column).strip()
            for column in table.columns
        }

        if REQUIRED_BASIC_COLUMNS.issubset(columns):
            return table.copy()

    available = [
        list(map(str, table.columns))
        for table in tables
    ]

    raise RuntimeError(
        "Nepodařilo se najít hráčskou tabulku. "
        f"Nalezené tabulky: {available}"
    )


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
            return urljoin(response.url, str(href))

    return None


def clean_player_table(
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


def load_all_basic_players() -> pd.DataFrame:
    session = create_session()

    base_response = download_page(
        session,
        DETAIL_STATS_URL,
        get_base_params(),
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


def make_full_name_key(
    first_name: object,
    last_name: object,
) -> str:
    return normalize_text(
        f"{first_name or ''} {last_name or ''}"
    )


def prepare_hokej_lookup(
    hokej_players: pd.DataFrame,
) -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}

    for _, row in hokej_players.iterrows():
        key = normalize_text(row.get("JMÉNO", ""))

        if not key:
            continue

        lookup[key] = {
            str(column): str(value).strip()
            for column, value in row.items()
        }

    return lookup


def is_valid_value(value: object) -> bool:
    return str(value).strip() not in {
        "",
        "nan",
        "NaN",
        "None",
    }


def update_existing_player_stats(
    original: pd.DataFrame,
    hokej_players: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    result = original.copy()
    lookup = prepare_hokej_lookup(hokej_players)

    column_mapping = {
        "Odehrané zápasy": "GP",
        "Goly": "G",
        "Asistence": "A",
        "Body": "P",
        "+/-": "+/-",
        "Trestné minuty": "PIM",
    }

    unmatched_rows: list[dict[str, str]] = []
    matched_count = 0

    for index, row in result.iterrows():
        first_name = str(row.get("Jméno", "")).strip()
        last_name = str(row.get("Příjmení", "")).strip()
        team = str(row.get("Tým", "")).strip()
        position = str(row.get("Pozice", "")).strip()

        if not first_name and not last_name:
            continue

        key = make_full_name_key(
            first_name,
            last_name,
        )

        source = lookup.get(key)

        if source is None:
            normalized_position = normalize_text(position)

            if (
                "brankar" in normalized_position
                or normalized_position in {"b", "g"}
            ):
                reason = "Brankář – zpracuje modul brankářů"
            else:
                reason = (
                    "Hráč nemá odehraný zápas "
                    "nebo nebyl nalezen"
                )

            unmatched_rows.append(
                {
                    "Jméno": first_name,
                    "Příjmení": last_name,
                    "Tým": team,
                    "Pozice": position,
                    "Důvod": reason,
                }
            )
            continue

        matched_count += 1

        for target_column, source_column in column_mapping.items():
            if target_column not in result.columns:
                continue

            value = source.get(source_column, "")

            if is_valid_value(value):
                result.at[index, target_column] = value

    unmatched = pd.DataFrame(
        unmatched_rows,
        columns=[
            "Jméno",
            "Příjmení",
            "Tým",
            "Pozice",
            "Důvod",
        ],
    )

    return result, unmatched, matched_count


def numeric_column(
    frame: pd.DataFrame,
    column: str,
) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(
            [0.0] * len(frame),
            index=frame.index,
            dtype=float,
        )

    return pd.to_numeric(
        frame[column]
        .astype(str)
        .str.replace(",", ".", regex=False),
        errors="coerce",
    ).fillna(0)


def calculate_derived_statistics(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    result = frame.copy()

    games = numeric_column(
        result,
        "Odehrané zápasy",
    )
    points = numeric_column(
        result,
        "Body",
    )
    hits = numeric_column(
        result,
        "Hity",
    )
    blocks = numeric_column(
        result,
        "Bloky",
    )

    if "Body na zápas" in result.columns:
        result["Body na zápas"] = (
            points.div(games.where(games.ne(0)))
            .round(2)
            .fillna(0)
        )

    if "Hity na zápas" in result.columns:
        result["Hity na zápas"] = (
            hits.div(games.where(games.ne(0)))
            .round(2)
            .fillna(0)
        )

    if "Bloky na zápas" in result.columns:
        result["Bloky na zápas"] = (
            blocks.div(games.where(games.ne(0)))
            .round(2)
            .fillna(0)
        )

    return result


def export_player_detail_preview() -> dict[str, object]:
    original = read_csv(HRACI_DETAIL_CSV)
    hokej_players = load_all_basic_players()

    updated, unmatched, matched_count = (
        update_existing_player_stats(
            original,
            hokej_players,
        )
    )

    updated = calculate_derived_statistics(updated)
    updated = calculate_player_metrics(updated)

    valid_original = original[
        original["Jméno"].astype(str).str.strip().ne("")
        | original["Příjmení"].astype(str).str.strip().ne("")
    ]

    output_path = OUTPUT_DIR / "hraci_detail_preview.csv"
    unmatched_path = OUTPUT_DIR / "hraci_unmatched.csv"
    raw_path = OUTPUT_DIR / "hokej_players_raw.csv"

    write_csv(updated, output_path)
    write_csv(unmatched, unmatched_path)
    write_csv(hokej_players, raw_path)

    return {
        "original_count": len(valid_original),
        "hokej_count": len(hokej_players),
        "matched_count": matched_count,
        "unmatched_count": len(unmatched),
        "output_path": output_path,
        "unmatched_path": unmatched_path,
        "raw_path": raw_path,
    }