from __future__ import annotations

import pandas as pd

from data_bot.config import (
    HRACI_DETAIL_CSV,
    KARIERY_CSV,
    OUTPUT_DIR,
)
from data_bot.modules.utils import (
    normalize_text,
    read_csv,
    write_csv,
)


CAREER_COLUMNS = [
    "Jméno",
    "Příjmení",
    "Sezona",
    "Tým",
    "Liga",
    "Z",
    "G",
    "A",
    "B",
    "+/-",
    "TM",
]


def make_career_key(
    first_name: object,
    last_name: object,
    season: object,
    team: object,
) -> str:
    return "|".join(
        [
            normalize_text(first_name),
            normalize_text(last_name),
            normalize_text(season),
            normalize_text(team),
        ]
    )


def build_current_season_rows(
    season: str,
) -> pd.DataFrame:
    players = read_csv(HRACI_DETAIL_CSV)

    rows: list[dict[str, object]] = []

    for _, player in players.iterrows():
        first_name = str(player.get("Jméno", "")).strip()
        last_name = str(player.get("Příjmení", "")).strip()

        if not first_name and not last_name:
            continue

        rows.append(
            {
                "Jméno": first_name,
                "Příjmení": last_name,
                "Sezona": season,
                "Tým": player.get("Tým", ""),
                "Liga": "ELH",
                "Z": player.get("Odehrané zápasy", ""),
                "G": player.get("Goly", ""),
                "A": player.get("Asistence", ""),
                "B": player.get("Body", ""),
                "+/-": player.get("+/-", ""),
                "TM": player.get("Trestné minuty", ""),
            }
        )

    return pd.DataFrame(
        rows,
        columns=CAREER_COLUMNS,
    )


def merge_career_rows(
    existing: pd.DataFrame,
    new_rows: pd.DataFrame,
) -> tuple[pd.DataFrame, int, int]:
    result = existing.copy()

    for column in CAREER_COLUMNS:
        if column not in result.columns:
            result[column] = ""

    result = result[CAREER_COLUMNS].copy()

    existing_keys = {
        make_career_key(
            row.get("Jméno", ""),
            row.get("Příjmení", ""),
            row.get("Sezona", ""),
            row.get("Tým", ""),
        )
        for _, row in result.iterrows()
    }

    added_count = 0
    skipped_count = 0
    rows_to_add: list[dict[str, object]] = []

    for _, row in new_rows.iterrows():
        key = make_career_key(
            row.get("Jméno", ""),
            row.get("Příjmení", ""),
            row.get("Sezona", ""),
            row.get("Tým", ""),
        )

        if key in existing_keys:
            skipped_count += 1
            continue

        rows_to_add.append(
            {
                column: row.get(column, "")
                for column in CAREER_COLUMNS
            }
        )

        existing_keys.add(key)
        added_count += 1

    if rows_to_add:
        result = pd.concat(
            [
                result,
                pd.DataFrame(rows_to_add),
            ],
            ignore_index=True,
        )

    return result, added_count, skipped_count


def export_career_preview(
    season: str,
) -> dict[str, object]:
    existing = read_csv(KARIERY_CSV)
    current_rows = build_current_season_rows(season)

    merged, added_count, skipped_count = merge_career_rows(
        existing,
        current_rows,
    )

    output_path = OUTPUT_DIR / "kariery_preview.csv"
    current_path = OUTPUT_DIR / "kariery_current_season_raw.csv"

    write_csv(merged, output_path)
    write_csv(current_rows, current_path)

    return {
        "existing_count": len(existing),
        "current_season_count": len(current_rows),
        "added_count": added_count,
        "skipped_count": skipped_count,
        "final_count": len(merged),
        "output_path": output_path,
        "current_path": current_path,
        "season": season,
    }