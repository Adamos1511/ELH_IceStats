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
            f"NepodaĹ™ilo se naÄŤĂ­st {STATE_FILE}: {error}"
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
            f"NepodaĹ™ilo se naÄŤĂ­st CSV {path}: {error}"
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
            f"NepodaĹ™ilo se uloĹľit CSV {path}: {error}"
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
    print(f"VĂ˝stupy: {OUTPUT_DIR}")
    print(f"Stav sezony: {STATE_FILE}")
