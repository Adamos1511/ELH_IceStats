from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from data_bot.config import (
    HEADERS,
    OUTPUT_DIR,
    REQUEST_TIMEOUT,
    TABULKA_ELH_CSV,
    ROZPIS_CSV,
)
from data_bot.modules.hokej_games import (
    TEAM_ALIASES,
    _team_code_from_name,
    inspect_live,
)
from data_bot.modules.utils import read_csv, write_csv


STANDINGS_URL = "https://www.hokej.cz/tipsport-extraliga/table"

COMPETITION_ID = 7562
SEASON_START_YEAR = 2026

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

def load_finished_schedule_matches() -> list[dict[str, object]]:
    if not ROZPIS_CSV.exists():
        return []

    prague = ZoneInfo("Europe/Prague")
    now = datetime.now(prague)

    matches: list[dict[str, object]] = []

    with ROZPIS_CSV.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        reader = csv.reader(
            handle,
            delimiter=";",
        )

        for row in reader:
            if len(row) < 7:
                continue

            if row[2].strip().lower() != "vs":
                continue

            match_id = row[6].strip()
            date_value = row[4].strip()
            time_value = row[5].strip() or "00:00"

            if not match_id.isdigit() or not date_value:
                continue

            try:
                start_at = datetime.strptime(
                    f"{date_value.replace(' ', '')} {time_value}",
                    "%d.%m.%Y %H:%M",
                ).replace(
                    tzinfo=prague,
                )
            except ValueError:
                continue

            if start_at > now:
                continue

            matches.append(
                {
                    "id": match_id,
                    "start_at": start_at,
                }
            )

    matches.sort(
        key=lambda match: match["start_at"],
        reverse=True,
    )

    return matches

def match_form_code(
    is_win: bool,
    status: str,
) -> str:
    normalized = (
        str(status or "")
        .lower()
    )

    if (
        "s.n." in normalized
        or "nájezd" in normalized
        or "najezd" in normalized
    ):
        return (
            "VSn"
            if is_win
            else "PSn"
        )

    if "prodlou" in normalized:
        return (
            "VP"
            if is_win
            else "PP"
        )

    return (
        "V"
        if is_win
        else "P"
    )

def load_recent_team_forms(
    limit: int = 5,
) -> tuple[
    dict[str, str],
    dict[str, str],
]:
    forms: dict[str, list[str]] = {
        code: []
        for code in TEAM_ALIASES
    }

    details: dict[str, list[str]] = {
        code: []
        for code in TEAM_ALIASES
    }

    for match in load_finished_schedule_matches():
        if all(
            len(results) >= limit
            for results in forms.values()
        ):
            break

        match_id = str(
            match["id"]
        )

        try:
            data = inspect_live(
                match_id
            )
        except Exception as error:
            print(
                "WARNING "
                f"{match_id} form update failed: "
                f"{type(error).__name__}: "
                f"{error}"
            )
            continue

        scoreboard = (
            data.get("scoreboard")
            or {}
        )

        if (
            scoreboard.get("state")
            != "final"
        ):
            continue

        home_score = scoreboard.get(
            "home_score"
        )

        away_score = scoreboard.get(
            "away_score"
        )

        if (
            not isinstance(home_score, int)
            or not isinstance(away_score, int)
            or home_score == away_score
        ):
            continue

        home_code = str(
            (
                data.get("home")
                or {}
            ).get(
                "code",
                "",
            )
        )

        away_code = str(
            (
                data.get("away")
                or {}
            ).get(
                "code",
                "",
            )
        )

        status = str(
            scoreboard.get(
                "status",
                "",
            )
        )

        start_at = match["start_at"]

        home_name = str(
            (
                data.get("home")
                or {}
            ).get(
                "name",
                "",
            )
        )

        away_name = str(
            (
                data.get("away")
                or {}
            ).get(
                "name",
                "",
            )
        )

        normalized_status = status.lower()

        if (
            "s.n." in normalized_status
            or "nájezd" in normalized_status
            or "najezd" in normalized_status
        ):
            finish_label = "po nájezdech"

        elif "prodlou" in normalized_status:
            finish_label = "po prodloužení"

        else:
            finish_label = ""

        detail_value = (
            f"{start_at.day}. {start_at.month}. {start_at.year} · "
            f"{home_name} – {away_name} "
            f"{home_score}:{away_score}"
        )

        if finish_label:
            detail_value += (
                f" · {finish_label}"
            )

        if (
            home_code in forms
            and len(forms[home_code]) < limit
        ):
            forms[home_code].append(
                match_form_code(
                    home_score > away_score,
                    status,
                )
            )

            details[home_code].append(
                detail_value
            )

        if (
            away_code in forms
            and len(forms[away_code]) < limit
        ):
            forms[away_code].append(
                match_form_code(
                    away_score > home_score,
                    status,
                )
            )

            details[away_code].append(
                detail_value
            )

    form_values = {
        code: ",".join(results)
        for code, results in forms.items()
    }

    detail_values = {
        code: " || ".join(results)
        for code, results in details.items()
    }

    return (
        form_values,
        detail_values,
    )    

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
    forms: dict[str, str],
    details: dict[str, str],
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []

    for index, row in standings.iterrows():
        position = format_position(
            row.get("#", ""),
            index + 1,
        )

        team_name = str(
            row.get(
                "Tým",
                "",
            )
        ).strip()

        team_code = (
            _team_code_from_name(
                team_name
            )
        )

        form_value = forms.get(
            team_code,
            "",
        )

        detail_value = details.get(
    team_code,
    "",
)

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
"FORMA_DETAIL": detail_value,
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
            "FORMA_DETAIL",
        ],
    )


def export_standings_preview() -> dict[str, object]:
    original = read_csv(TABULKA_ELH_CSV)
    standings, page_info = load_standings()

    forms, details = load_recent_team_forms()

    converted = convert_to_website_format(
    standings,
    forms,
    details,
)

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