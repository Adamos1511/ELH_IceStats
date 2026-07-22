from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from data_bot.config import (
    BACKUP_DIR,
    BRANKARI_DETAIL_CSV,
    HRACI_DETAIL_CSV,
    KARIERY_CSV,
    KLUBY_CSV,
    OUTPUT_DIR,
    TABULKA_ELH_CSV,
)
from data_bot.modules.utils import log_message


PUBLISH_MAP: dict[Path, Path] = {
    OUTPUT_DIR / "hraci_detail_preview.csv": HRACI_DETAIL_CSV,
    OUTPUT_DIR / "brankari_detail_preview.csv": BRANKARI_DETAIL_CSV,
    OUTPUT_DIR / "TabulkaELH_preview.csv": TABULKA_ELH_CSV,
    OUTPUT_DIR / "kluby_preview.csv": KLUBY_CSV,
    OUTPUT_DIR / "kariery_preview.csv": KARIERY_CSV,
}


def validate_preview_files() -> list[Path]:
    """
    Vrátí seznam chybějících preview souborů.
    """
    return [
        preview_path
        for preview_path in PUBLISH_MAP
        if not preview_path.exists()
    ]


def validate_preview_content() -> list[str]:
    """
    Základní ochrana proti publikaci prázdných souborů.
    """
    errors: list[str] = []

    for preview_path in PUBLISH_MAP:
        if not preview_path.exists():
            continue

        if preview_path.stat().st_size == 0:
            errors.append(
                f"Preview soubor je prázdný: {preview_path.name}"
            )

    return errors


def create_backup_directory() -> Path:
    """
    Vytvoří časově označenou složku zálohy.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_directory = BACKUP_DIR / timestamp
    backup_directory.mkdir(parents=True, exist_ok=False)

    return backup_directory


def backup_production_files(
    backup_directory: Path,
) -> list[Path]:
    """
    Zazálohuje všechny existující produkční CSV.
    """
    backup_paths: list[Path] = []

    for target_path in PUBLISH_MAP.values():
        if not target_path.exists():
            continue

        backup_path = backup_directory / target_path.name
        shutil.copy2(target_path, backup_path)
        backup_paths.append(backup_path)

    return backup_paths


def publish_preview_files() -> list[Path]:
    """
    Zkopíruje ověřené preview soubory do produkčních CSV.
    """
    published_paths: list[Path] = []

    for preview_path, target_path in PUBLISH_MAP.items():
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(preview_path, target_path)
        published_paths.append(target_path)

    return published_paths


def main() -> None:
    print("=" * 55)
    print("ELH ENGINE — PUBLISH")
    print("=" * 55)

    print("\nKontroluji preview soubory...")

    missing_files = validate_preview_files()

    if missing_files:
        print("\nPublikace byla zrušena.")
        print("Chybí tyto preview soubory:")

        for path in missing_files:
            print(f"  - {path}")

        raise SystemExit(1)

    content_errors = validate_preview_content()

    if content_errors:
        print("\nPublikace byla zrušena.")
        print("Byly nalezeny chyby:")

        for error in content_errors:
            print(f"  - {error}")

        raise SystemExit(1)

    print("Všechny preview soubory jsou připravené.")

    print("\nVytvářím zálohu produkčních CSV...")

    backup_directory = create_backup_directory()
    backup_paths = backup_production_files(backup_directory)

    print(f"Záloha: {backup_directory}")

    for path in backup_paths:
        print(f"  - {path.name}")

    print("\nPublikuji nové CSV do webu...")

    published_paths = publish_preview_files()

    for path in published_paths:
        print(f"  - {path.name}")

    log_message(
        "Publikovány produkční CSV: "
        + ", ".join(path.name for path in published_paths)
    )

    print("\nPublikace dokončena.")
    print("Produkční CSV byla aktualizována.")
    print(f"Záloha je uložená v: {backup_directory}")


if __name__ == "__main__":
    main()