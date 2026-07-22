from __future__ import annotations

from io import StringIO

import pandas as pd
import requests

from data_bot.config import (
    HEADERS,
    OUTPUT_DIR,
    REQUEST_TIMEOUT,
    TABULKA_ELH_CSV,
)
from data_bot.modules.utils import read_csv, write_csv


STANDINGS_URL = "https://www.hokej.cz/tipsport-extraliga/table"

COMPETITION_ID = 7397
SEASON_START_YEAR = 2025

REQUIRED_COLUMNS = {
    "#",
    "Tým",
    "Z",
    "V",
    "VP",
    "PP",
    "P",
    "Skóre",
    "B",
}


def create_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def get_base_params() -> dict[str, object]:
    return {
        "table-filter-season": SEASON_START_YEAR,
        "table-filter-competition": COMPETITION_ID,
    }


def download_page() -> requests.Response:
    session = create_session()

    try:
        response = session.get(
            STANDINGS_URL,
            params=get_base_params(),
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response
    except requests.RequestException as error:
        raise RuntimeError(
            f"Nepodařilo se načíst tabulku ELH: {error}"
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


def clean_table(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()

    for column in result.columns:
        result[column] = (
            result[column]
            .astype(str)
            .str.replace("\xa0", " ", regex=False)
            .str.strip()
        )

    return result.reset_index(drop=True)


def read_html_tables(html: str) -> list[pd.DataFrame]:
    try:
        tables = pd.read_html(StringIO(html))
    except ValueError as error:
        raise RuntimeError(
            "Na stránce nebyly nalezeny HTML tabulky."
        ) from error
    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se přečíst tabulky ELH: {error}"
        ) from error

    return [
        clean_table(flatten_columns(table))
        for table in tables
    ]


def find_standings_table(
    tables: list[pd.DataFrame],
) -> pd.DataFrame:
    candidates: list[pd.DataFrame] = []

    for table in tables:
        columns = {
            str(column).strip()
            for column in table.columns
        }

        if REQUIRED_COLUMNS.issubset(columns):
            candidates.append(table.copy())

    if not candidates:
        available = [
            list(map(str, table.columns))
            for table in tables
        ]

        raise RuntimeError(
            "Nepodařilo se najít tabulku ELH. "
            f"Nalezené tabulky: {available}"
        )

    # Přednost má tabulka s 14 týmy a skutečně odehranými zápasy.
    for table in candidates:
        games = pd.to_numeric(
            table["Z"],
            errors="coerce",
        ).fillna(0)

        if len(table) == 14 and games.sum() > 0:
            return table

    # Záložní varianta: první tabulka se 14 týmy.
    for table in candidates:
        if len(table) == 14:
            return table

    return candidates[0]


def load_standings() -> tuple[pd.DataFrame, dict[str, object]]:
    response = download_page()
    tables = read_html_tables(response.text)
    standings = find_standings_table(tables)

    page_info = {
        "status_code": response.status_code,
        "url": response.url,
        "html_length": len(response.text),
        "table_count": len(tables),
    }

    return standings, page_info


def format_position(
    value: object,
    fallback: int,
) -> str:
    text = str(value or "").strip()

    if text and text.lower() not in {"nan", "none"}:
        try:
            return str(int(float(text)))
        except ValueError:
            return text

    return str(fallback)


def convert_to_website_format(
    standings: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []

    for index, row in standings.iterrows():
        position = format_position(
            row.get("#", ""),
            index + 1,
        )

        form_value = row.get("H", "")

        if str(form_value).strip().lower() in {
            "",
            "nan",
            "none",
        }:
            form_value = ""

        rows.append(
            {
                "POŘADÍ": position,
                "TÝM": row.get("Tým", ""),
                "ZÁPASY": row.get("Z", ""),
                "V": row.get("V", ""),
                "VP": row.get("VP", ""),
                "PP": row.get("PP", ""),
                "P": row.get("P", ""),
                "SKÓRE": row.get("Skóre", ""),
                "BODY": row.get("B", ""),
                "FORMA": form_value,
            }
        )

    return pd.DataFrame(
        rows,
        columns=[
            "POŘADÍ",
            "TÝM",
            "ZÁPASY",
            "V",
            "VP",
            "PP",
            "P",
            "SKÓRE",
            "BODY",
            "FORMA",
        ],
    )


def export_standings_preview() -> dict[str, object]:
    original = read_csv(TABULKA_ELH_CSV)
    standings, page_info = load_standings()

    converted = convert_to_website_format(standings)

    output_path = OUTPUT_DIR / "TabulkaELH_preview.csv"
    raw_path = OUTPUT_DIR / "hokej_standings_raw.csv"

    write_csv(converted, output_path)
    write_csv(standings, raw_path)

    games_total = pd.to_numeric(
        converted["ZÁPASY"],
        errors="coerce",
    ).fillna(0).sum()

    return {
        "original_count": len(original),
        "hokej_count": len(standings),
        "final_count": len(converted),
        "games_total": int(games_total),
        "output_path": output_path,
        "raw_path": raw_path,
        "page_url": page_info["url"],
        "status_code": page_info["status_code"],
    }