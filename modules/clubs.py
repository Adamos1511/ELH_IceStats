from __future__ import annotations

import pandas as pd

from data_bot.config import (
    HRACI_ELH_CSV,
    KLUBY_CSV,
    OUTPUT_DIR,
)
from data_bot.modules.utils import (
    normalize_text,
    read_csv,
    write_csv,
)


TEAM_NAME_TO_CODE = {
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


def find_column(
    frame: pd.DataFrame,
    possibilities: tuple[str, ...],
) -> str | None:
    """
    Najde sloupec bez ohledu na velikost písmen a diakritiku.
    """
    normalized_columns = {
        normalize_text(column): str(column)
        for column in frame.columns
    }

    for possibility in possibilities:
        found = normalized_columns.get(
            normalize_text(possibility)
        )

        if found is not None:
            return found

    return None


def parse_number(value: object) -> float | None:
    text = str(value or "").strip()

    if normalize_text(text) in {"", "nan", "none", "-"}:
        return None

    text = (
        text
        .replace("\xa0", " ")
        .replace(",", ".")
        .strip()
    )

    try:
        return float(text)
    except ValueError:
        return None


def format_decimal(value: float | None) -> str:
    if value is None:
        return ""

    rounded = round(float(value), 2)

    if rounded.is_integer():
        return str(int(rounded))

    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def get_team_code(value: object) -> str:
    text = str(value or "").strip()

    if not text:
        return ""

    normalized = normalize_text(text)

    if normalized in TEAM_NAME_TO_CODE:
        return TEAM_NAME_TO_CODE[normalized]

    return text.upper()


def is_goalie(position: object) -> bool:
    normalized = normalize_text(position)

    return (
        normalized in {"b", "g", "goalie"}
        or "brankar" in normalized
    )


def is_defenseman(position: object) -> bool:
    normalized = normalize_text(position)

    return (
        normalized in {"o", "d", "def"}
        or "obrance" in normalized
    )


def is_center(position: object) -> bool:
    normalized = normalize_text(position)

    return (
        normalized == "c"
        or normalized.startswith("c/")
        or "/c" in normalized
        or "centr" in normalized
    )


def is_winger(position: object) -> bool:
    normalized = normalize_text(position)

    return any(
        marker in normalized
        for marker in (
            "lw",
            "rw",
            "kridlo",
            "wing",
        )
    )


def average_from_column(
    frame: pd.DataFrame,
    column: str | None,
) -> float | None:
    if column is None or column not in frame.columns:
        return None

    values = [
        parsed
        for parsed in (
            parse_number(value)
            for value in frame[column]
        )
        if parsed is not None
    ]

    if not values:
        return None

    return sum(values) / len(values)


def calculate_team_metrics(
    players: pd.DataFrame,
) -> dict[str, dict[str, object]]:
    """
    Spočítá týmové metriky ze souboru hraciELH.csv.
    Názvy sloupců hledá automaticky.
    """
    team_column = find_column(
        players,
        (
            "Tým",
            "TÝM",
            "tym",
            "Team",
        ),
    )

    if team_column is None:
        raise RuntimeError(
            "V hraciELH.csv nebyl nalezen sloupec týmu. "
            f"Dostupné sloupce: {list(players.columns)}"
        )

    first_name_column = find_column(
        players,
        ("Jméno", "JMÉNO", "jmeno"),
    )
    last_name_column = find_column(
        players,
        ("Příjmení", "PŘÍJMENÍ", "prijmeni"),
    )
    position_column = find_column(
        players,
        ("Pozice", "POZICE", "pozice"),
    )
    age_column = find_column(
        players,
        ("Věk", "VĚK", "vek"),
    )
    height_column = find_column(
        players,
        (
            "Výška (cm)",
            "VÝŠKA (CM)",
            "Výška",
            "VYSKA",
        ),
    )
    weight_column = find_column(
        players,
        (
            "Váha (kg)",
            "VÁHA (KG)",
            "Váha",
            "VAHA",
        ),
    )

    valid_players = players.copy()

    if first_name_column is not None:
        first_names = (
            valid_players[first_name_column]
            .astype(str)
            .str.strip()
        )
    else:
        first_names = pd.Series(
            [""] * len(valid_players),
            index=valid_players.index,
        )

    if last_name_column is not None:
        last_names = (
            valid_players[last_name_column]
            .astype(str)
            .str.strip()
        )
    else:
        last_names = pd.Series(
            [""] * len(valid_players),
            index=valid_players.index,
        )

    valid_players = valid_players[
        first_names.ne("") | last_names.ne("")
    ].copy()

    metrics: dict[str, dict[str, object]] = {}

    for team_value, team_frame in valid_players.groupby(
        team_column,
        dropna=False,
    ):
        team_code = get_team_code(team_value)

        if not team_code:
            continue

        if position_column is not None:
            positions = team_frame[position_column]
        else:
            positions = pd.Series(
                [""] * len(team_frame),
                index=team_frame.index,
            )

        goalies = sum(is_goalie(value) for value in positions)
        defensemen = sum(is_defenseman(value) for value in positions)
        centers = sum(is_center(value) for value in positions)
        wingers = sum(is_winger(value) for value in positions)

        metrics[team_code] = {
            "Průměřná výška": format_decimal(
                average_from_column(
                    team_frame,
                    height_column,
                )
            ),
            "Průměrná váha": format_decimal(
                average_from_column(
                    team_frame,
                    weight_column,
                )
            ),
            "Průměrný věk": format_decimal(
                average_from_column(
                    team_frame,
                    age_column,
                )
            ),
            "Počet brankářů": str(goalies),
            "Počet obránců": str(defensemen),
            "počet centrů": str(centers),
            "počet křídel": str(wingers),
        }

    return metrics


def find_club_code(row: pd.Series) -> str:
    team_name = row.get("NÁZEV TÝMU", "")

    normalized = normalize_text(team_name)

    if normalized in TEAM_NAME_TO_CODE:
        return TEAM_NAME_TO_CODE[normalized]

    text = str(team_name or "").strip()

    if text.upper() in set(TEAM_NAME_TO_CODE.values()):
        return text.upper()

    return ""


def apply_metrics_to_clubs(
    clubs: pd.DataFrame,
    metrics: dict[str, dict[str, object]],
) -> tuple[pd.DataFrame, list[str]]:
    result = clubs.copy()
    updated_teams: list[str] = []

    for index, row in result.iterrows():
        team_code = find_club_code(row)

        if not team_code:
            continue

        team_metrics = metrics.get(team_code)

        if not team_metrics:
            continue

        for column, value in team_metrics.items():
            if column in result.columns:
                result.at[index, column] = value

        updated_teams.append(team_code)

    return result, updated_teams


def export_clubs_preview() -> dict[str, object]:
    players = read_csv(HRACI_ELH_CSV)
    clubs = read_csv(KLUBY_CSV)

    metrics = calculate_team_metrics(players)

    updated, updated_teams = apply_metrics_to_clubs(
        clubs,
        metrics,
    )

    output_path = OUTPUT_DIR / "kluby_preview.csv"
    metrics_path = OUTPUT_DIR / "kluby_metrics_raw.csv"

    metrics_rows = [
        {
            "Tým": team_code,
            **values,
        }
        for team_code, values in sorted(metrics.items())
    ]

    metrics_frame = pd.DataFrame(metrics_rows)

    write_csv(updated, output_path)
    write_csv(metrics_frame, metrics_path)

    missing_teams = sorted(
        set(metrics.keys()) - set(updated_teams)
    )

    return {
        "clubs_count": len(clubs),
        "calculated_teams": len(metrics),
        "updated_teams": len(updated_teams),
        "missing_teams": missing_teams,
        "output_path": output_path,
        "metrics_path": metrics_path,
    }