$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BotRoot = Join-Path $ProjectRoot "data_bot"
$ModulesRoot = Join-Path $BotRoot "modules"

Write-Host ""
Write-Host "==============================================="
Write-Host " INSTALACE ELH DATA BOT"
Write-Host "==============================================="
Write-Host "Projekt: $ProjectRoot"
Write-Host ""

$Directories = @(
    $BotRoot,
    $ModulesRoot,
    (Join-Path $BotRoot "output"),
    (Join-Path $BotRoot "backups"),
    (Join-Path $BotRoot "logs")
)

foreach ($Directory in $Directories) {
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
}

Set-Content -Path (Join-Path $BotRoot "__init__.py") -Encoding UTF8 -Value ""
Set-Content -Path (Join-Path $ModulesRoot "__init__.py") -Encoding UTF8 -Value ""

@'
beautifulsoup4>=4.12,<5
lxml>=5,<7
pandas>=2.2,<3
requests>=2.31,<3
'@ | Set-Content -Path (Join-Path $BotRoot "requirements.txt") -Encoding UTF8

$StatePath = Join-Path $BotRoot "state.json"

if (-not (Test-Path $StatePath)) {
@'
{
  "current_season": "2025/26",
  "last_archived_season": null
}
'@ | Set-Content -Path $StatePath -Encoding UTF8
}

@'
from __future__ import annotations

from pathlib import Path


BOT_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BOT_ROOT.parent

MODULES_DIR = BOT_ROOT / "modules"
OUTPUT_DIR = BOT_ROOT / "output"
BACKUP_DIR = BOT_ROOT / "backups"
LOG_DIR = BOT_ROOT / "logs"
STATE_FILE = BOT_ROOT / "state.json"

HRACI_ELH_CSV = PROJECT_ROOT / "hraciELH.csv"
HRACI_DETAIL_CSV = PROJECT_ROOT / "hraci_detail.csv"
BRANKARI_DETAIL_CSV = PROJECT_ROOT / "brankari_detail.csv"
TABULKA_ELH_CSV = PROJECT_ROOT / "TabulkaELH.csv"
KLUBY_CSV = PROJECT_ROOT / "kluby.csv"
PRESTUPY_CSV = PROJECT_ROOT / "prestupy.csv"
KARIERY_CSV = PROJECT_ROOT / "kariery.csv"
ZAPASY_CSV = PROJECT_ROOT / "zapasy.csv"

HOKEJ_BASE_URL = "https://www.hokej.cz"
PLAYER_STATS_URL = (
    f"{HOKEJ_BASE_URL}/tipsport-extraliga/player-stats"
)

DEFAULT_SEASON = "2025/26"
NEXT_SEASON = "2026/27"

AUTO_SEASON_ROLLOVER = True
WRITE_DIRECTLY_TO_PROJECT = False
CREATE_BACKUPS = True

REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
}
'@ | Set-Content -Path (Join-Path $BotRoot "config.py") -Encoding UTF8

@'
from __future__ import annotations

import json
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from data_bot.config import (
    BACKUP_DIR,
    BOT_ROOT,
    DEFAULT_SEASON,
    LOG_DIR,
    OUTPUT_DIR,
    PROJECT_ROOT,
    STATE_FILE,
)


def ensure_directories() -> None:
    for directory in (OUTPUT_DIR, BACKUP_DIR, LOG_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def normalize_text(value: object) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)

    return "".join(
        character
        for character in text
        if unicodedata.category(character) != "Mn"
    )


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        state = {
            "current_season": DEFAULT_SEASON,
            "last_archived_season": None,
        }
        save_state(state)
        return state

    try:
        with STATE_FILE.open("r", encoding="utf-8-sig") as file:
            state = json.load(file)
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError(
            f"Nepodařilo se načíst {STATE_FILE}: {error}"
        ) from error

    state.setdefault("current_season", DEFAULT_SEASON)
    state.setdefault("last_archived_season", None)

    return state


def save_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

    with STATE_FILE.open("w", encoding="utf-8") as file:
        json.dump(
            state,
            file,
            ensure_ascii=False,
            indent=2,
        )


def read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Soubor neexistuje: {path}")

    try:
        return pd.read_csv(
            path,
            sep=";",
            dtype=str,
            keep_default_na=False,
            encoding="utf-8-sig",
        )
    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se načíst CSV {path}: {error}"
        ) from error


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        frame.to_csv(
            path,
            sep=";",
            index=False,
            encoding="utf-8-sig",
        )
    except Exception as error:
        raise RuntimeError(
            f"Nepodařilo se uložit CSV {path}: {error}"
        ) from error


def validate_project_files(paths: list[Path]) -> list[Path]:
    return [path for path in paths if not path.exists()]


def backup_file(path: Path) -> Path | None:
    if not path.exists():
        return None

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    destination_directory = BACKUP_DIR / timestamp
    destination_directory.mkdir(parents=True, exist_ok=True)

    destination = destination_directory / path.name
    shutil.copy2(path, destination)

    return destination


def log_message(message: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    log_path = LOG_DIR / (
        datetime.now().strftime("%Y-%m-%d") + ".log"
    )

    timestamp = datetime.now().strftime("%H:%M:%S")

    with log_path.open("a", encoding="utf-8") as file:
        file.write(f"[{timestamp}] {message}\n")


def print_project_summary() -> None:
    print(f"Projekt: {PROJECT_ROOT}")
    print(f"Data bot: {BOT_ROOT}")
    print(f"Výstupy: {OUTPUT_DIR}")
    print(f"Stav sezony: {STATE_FILE}")
'@ | Set-Content -Path (Join-Path $ModulesRoot "utils.py") -Encoding UTF8

@'
from __future__ import annotations

from io import StringIO
from pathlib import Path
from urllib.parse import urljoin

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
    response = download_page(session, DETAIL_STATS_URL)
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

    raise RuntimeError(
        "Nepodařilo se najít hráčskou tabulku."
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
    )

    show_all_url = find_show_all_url(base_response)

    response = (
        download_page(session, show_all_url)
        if show_all_url
        else base_response
    )

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

        key = make_full_name_key(first_name, last_name)
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
                    "Hráč nemá odehraný zápas nebo nebyl nalezen"
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

    games = numeric_column(result, "Odehrané zápasy")
    points = numeric_column(result, "Body")
    hits = numeric_column(result, "Hity")
    blocks = numeric_column(result, "Bloky")

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
'@ | Set-Content -Path (Join-Path $ModulesRoot "hokej_players.py") -Encoding UTF8

@'
from __future__ import annotations


def export_goalie_preview() -> dict[str, object]:
    """
    Brankářský modul je připravený pro další diagnostiku Hokej.cz.
    Produkční data se zatím nemění.
    """
    return {
        "status": "pending",
        "message": (
            "Brankářský modul čeká na ověření struktury "
            "brankářské tabulky Hokej.cz."
        ),
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "hokej_goalies.py") -Encoding UTF8

@'
from __future__ import annotations


def export_standings_preview() -> dict[str, object]:
    return {
        "status": "pending",
        "message": "Modul tabulky čeká na diagnostiku Hokej.cz.",
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "hokej_standings.py") -Encoding UTF8

@'
from __future__ import annotations


def export_games_preview() -> dict[str, object]:
    return {
        "status": "pending",
        "message": "Modul zápasů čeká na diagnostiku Hokej.cz.",
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "hokej_games.py") -Encoding UTF8

@'
from __future__ import annotations


def build_career_preview() -> dict[str, object]:
    return {
        "status": "pending",
        "message": (
            "Kariéry budou doplněny po ověření historických "
            "sezon Hokej.cz."
        ),
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "hokej_careers.py") -Encoding UTF8

@'
from __future__ import annotations


def calculate_club_preview() -> dict[str, object]:
    return {
        "status": "pending",
        "message": "Klubové výpočty budou doplněny později.",
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "clubs.py") -Encoding UTF8

@'
from __future__ import annotations

from pathlib import Path

import pandas as pd

from data_bot.modules.utils import write_csv


def export_frame(
    frame: pd.DataFrame,
    path: Path,
) -> None:
    write_csv(frame, path)
'@ | Set-Content -Path (Join-Path $ModulesRoot "exporters.py") -Encoding UTF8

@'
from __future__ import annotations

from typing import Any

from data_bot.config import DEFAULT_SEASON
from data_bot.modules.utils import load_state


def get_active_season() -> str:
    state: dict[str, Any] = load_state()
    return str(state.get("current_season", DEFAULT_SEASON))


def check_season_rollover() -> dict[str, object]:
    """
    Přechod sezony se zatím pouze hlásí.
    Automatická archivace bude aktivována po ověření zápasů.
    """
    return {
        "current_season": get_active_season(),
        "rollover_performed": False,
    }
'@ | Set-Content -Path (Join-Path $ModulesRoot "season_manager.py") -Encoding UTF8

@'
from __future__ import annotations

from data_bot.config import (
    BRANKARI_DETAIL_CSV,
    HRACI_DETAIL_CSV,
    HRACI_ELH_CSV,
    KARIERY_CSV,
    KLUBY_CSV,
    PRESTUPY_CSV,
    TABULKA_ELH_CSV,
)
from data_bot.modules.hokej_players import (
    export_player_detail_preview,
    test_connection,
)
from data_bot.modules.season_manager import (
    check_season_rollover,
)
from data_bot.modules.utils import (
    ensure_directories,
    load_state,
    log_message,
    print_project_summary,
    validate_project_files,
)


def main() -> None:
    print("=" * 55)
    print("ELH DATA BOT")
    print("=" * 55)

    ensure_directories()
    print_project_summary()

    state = load_state()

    print(f"Aktivní sezona: {state['current_season']}")
    print(
        "Poslední archivovaná sezona: "
        f"{state['last_archived_season']}"
    )

    required_files = [
        HRACI_ELH_CSV,
        HRACI_DETAIL_CSV,
        BRANKARI_DETAIL_CSV,
        TABULKA_ELH_CSV,
        KLUBY_CSV,
        PRESTUPY_CSV,
        KARIERY_CSV,
    ]

    missing_files = validate_project_files(required_files)

    if missing_files:
        print("\nChybí tyto soubory:")

        for path in missing_files:
            print(f"  - {path}")

        raise SystemExit(1)

    print("\nVšechny základní CSV soubory byly nalezeny.")

    season_report = check_season_rollover()

    print(
        f"Kontrolovaná sezona: "
        f"{season_report['current_season']}"
    )

    print("\nTestuji připojení k Hokej.cz...")
    connection_info = test_connection()

    print(f"HTTP stav: {connection_info['status_code']}")
    print(f"Název stránky: {connection_info['title']}")

    print("\nVytvářím náhled statistik hráčů...")
    report = export_player_detail_preview()

    print(
        f"Hráčů v původním CSV: "
        f"{report['original_count']}"
    )
    print(
        f"Hráčů načtených z Hokej.cz: "
        f"{report['hokej_count']}"
    )
    print(
        f"Úspěšně spárovaných: "
        f"{report['matched_count']}"
    )
    print(
        f"Nespárovaných: "
        f"{report['unmatched_count']}"
    )

    print(f"Náhled: {report['output_path']}")
    print(f"Report: {report['unmatched_path']}")
    print(f"Surová data: {report['raw_path']}")

    print("\nPůvodní CSV nebyla změněna.")

    log_message(
        "Dokončen hráčský náhled: "
        f"{report['matched_count']} spárovaných hráčů."
    )


if __name__ == "__main__":
    main()
'@ | Set-Content -Path (Join-Path $BotRoot "update.py") -Encoding UTF8

Write-Host ""
Write-Host "Kontroluji syntaxi Python souborů..."

$PythonFiles = Get-ChildItem -Path $BotRoot -Filter "*.py" -Recurse

foreach ($PythonFile in $PythonFiles) {
    & python -m py_compile $PythonFile.FullName

    if ($LASTEXITCODE -ne 0) {
        throw "Chyba syntaxe v souboru: $($PythonFile.FullName)"
    }
}

Write-Host ""
Write-Host "Instalace byla dokončena."
Write-Host ""
Write-Host "Další příkazy:"
Write-Host "  pip install -r data_bot\requirements.txt"
Write-Host "  python -m data_bot.update"
Write-Host ""
Write-Host "Produkční CSV ani frontend nebyly změněny."