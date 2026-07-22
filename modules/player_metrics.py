from __future__ import annotations

import re

import pandas as pd

from data_bot.config import OUTPUT_DIR
from data_bot.modules.utils import normalize_text, write_csv


def parse_number(value: object) -> float:
    """
    Převede číslo uložené jako text na float.
    Zvládne desetinnou čárku i běžné prázdné hodnoty.
    """
    text = str(value or "").strip()

    if text.lower() in {"", "nan", "none", "-"}:
        return 0.0

    text = text.replace(",", ".")

    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_time_to_seconds(value: object) -> float:
    """
    Převede čas na ledě ve formátu MM:SS nebo HH:MM:SS na sekundy.
    Pokud je hodnota už číslo, vrátí ji jako počet minut převedený
    na sekundy.
    """
    text = str(value or "").strip()

    if text.lower() in {"", "nan", "none", "-"}:
        return 0.0

    if ":" not in text:
        return parse_number(text) * 60

    parts = text.split(":")

    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return 0.0

    if len(numbers) == 2:
        minutes, seconds = numbers
        return minutes * 60 + seconds

    if len(numbers) == 3:
        hours, minutes, seconds = numbers
        return hours * 3600 + minutes * 60 + seconds

    return 0.0


def format_decimal(value: float) -> str:
    """
    Uloží číslo bez zbytečných nul, s maximálně dvěma desetinnými místy.
    """
    rounded = round(float(value), 2)

    if rounded.is_integer():
        return str(int(rounded))

    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def build_team_points(frame: pd.DataFrame) -> dict[str, float]:
    """
    Spočítá součet bodů všech hráčů v každém týmu.
    """
    totals: dict[str, float] = {}

    for _, row in frame.iterrows():
        team = normalize_text(row.get("Tým", ""))

        if not team:
            continue

        totals[team] = totals.get(team, 0.0) + parse_number(
            row.get("Body", 0)
        )

    return totals


def assign_team_rank(
    frame: pd.DataFrame,
    value_column: str,
    output_column: str,
    value_parser,
) -> pd.DataFrame:
    """
    Přidělí hráčům pořadí v rámci týmu podle zvoleného sloupce.
    Shodné hodnoty dostanou stejné pořadí.
    """
    result = frame.copy()

    if output_column not in result.columns:
        return result

    result[output_column] = ""

    team_groups: dict[str, list[tuple[int, float]]] = {}

    for index, row in result.iterrows():
        first_name = str(row.get("Jméno", "")).strip()
        last_name = str(row.get("Příjmení", "")).strip()

        if not first_name and not last_name:
            continue

        team = normalize_text(row.get("Tým", ""))

        if not team:
            continue

        value = value_parser(row.get(value_column, ""))

        team_groups.setdefault(team, []).append(
            (index, value)
        )

    for players in team_groups.values():
        players.sort(
            key=lambda item: item[1],
            reverse=True,
        )

        previous_value: float | None = None
        current_rank = 0

        for position, (index, value) in enumerate(
            players,
            start=1,
        ):
            if previous_value is None or value != previous_value:
                current_rank = position

            result.at[index, output_column] = str(current_rank)
            previous_value = value

    return result


def calculate_player_metrics(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    """
    Přepočítá všechny odvozené hráčské statistiky.
    Zachová názvy i pořadí sloupců původního CSV.
    """
    result = frame.copy()

    team_points = build_team_points(result)

    for index, row in result.iterrows():
        first_name = str(row.get("Jméno", "")).strip()
        last_name = str(row.get("Příjmení", "")).strip()

        if not first_name and not last_name:
            continue

        games = parse_number(row.get("Odehrané zápasy", 0))
        points = parse_number(row.get("Body", 0))
        hits = parse_number(row.get("Hity", 0))
        blocks = parse_number(row.get("Bloky", 0))

        if "Body na zápas" in result.columns:
            value = points / games if games > 0 else 0
            result.at[index, "Body na zápas"] = format_decimal(value)

        if "Hity na zápas" in result.columns:
            value = hits / games if games > 0 else 0
            result.at[index, "Hity na zápas"] = format_decimal(value)

        if "Bloky na zápas" in result.columns:
            value = blocks / games if games > 0 else 0
            result.at[index, "Bloky na zápas"] = format_decimal(value)

        if "Podíl na ofenzivě týmu" in result.columns:
            team = normalize_text(row.get("Tým", ""))
            total = team_points.get(team, 0.0)

            share = (
                points / total * 100
                if total > 0
                else 0
            )

            result.at[
                index,
                "Podíl na ofenzivě týmu",
            ] = format_decimal(share)

    result = assign_team_rank(
        result,
        value_column="Body",
        output_column="Pořadí podle bodu v tymu",
        value_parser=parse_number,
    )

    result = assign_team_rank(
        result,
        value_column="Ø Času na ledě",
        output_column="Poradi prumerneho casu na lede",
        value_parser=parse_time_to_seconds,
    )

    return result


def export_player_metrics_preview(
    frame: pd.DataFrame,
) -> dict[str, object]:
    """
    Uloží samostatný náhled výsledku po výpočtu metrik.
    """
    calculated = calculate_player_metrics(frame)

    output_path = OUTPUT_DIR / "hraci_detail_metrics_preview.csv"
    write_csv(calculated, output_path)

    return {
        "row_count": len(calculated),
        "output_path": output_path,
    }