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
from data_bot.modules.clubs import export_clubs_preview
from data_bot.modules.hokej_careers import export_career_preview
from data_bot.modules.hokej_goalies import export_goalie_preview
from data_bot.modules.hokej_players import (
    export_player_detail_preview,
    test_connection,
)
from data_bot.modules.hokej_standings import export_standings_preview
from data_bot.modules.season_manager import check_season_rollover
from data_bot.modules.utils import (
    ensure_directories,
    load_state,
    log_message,
    print_project_summary,
    validate_project_files,
)


def print_report(title: str, report: dict[str, object]) -> None:
    print(f"\n{title}")
    print("-" * len(title))
    print(f"Záznamů v původním CSV: {report['original_count']}")
    print(f"Záznamů načtených z Hokej.cz: {report['hokej_count']}")

    if "matched_count" in report:
        print(f"Úspěšně spárovaných: {report['matched_count']}")

    if "unmatched_count" in report:
        print(f"Nespárovaných: {report['unmatched_count']}")

    if "added_count" in report:
        print(f"Nově přidaných: {report['added_count']}")

    if "final_count" in report:
        print(f"Celkem ve výsledném CSV: {report['final_count']}")

    if "games_total" in report:
        print(
            "Součet odehraných zápasů v tabulce: "
            f"{report['games_total']}"
        )

    print(f"Náhled: {report['output_path']}")

    if "unmatched_path" in report:
        print(
            "Report nespárovaných: "
            f"{report['unmatched_path']}"
        )

    if "raw_path" in report:
        print(f"Surová data: {report['raw_path']}")

    if "page_url" in report:
        print(f"Zdrojová URL: {report['page_url']}")


def print_career_report(report: dict[str, object]) -> None:
    print("\nKARIÉRY")
    print("-------")
    print(f"Sezona: {report['season']}")
    print(
        "Řádků v původním kariery.csv: "
        f"{report['existing_count']}"
    )
    print(
        "Řádků připravených z aktuální sezony: "
        f"{report['current_season_count']}"
    )
    print(f"Nově přidaných: {report['added_count']}")
    print(
        "Přeskočených duplicit: "
        f"{report['skipped_count']}"
    )
    print(
        "Celkem ve výsledném CSV: "
        f"{report['final_count']}"
    )
    print(f"Náhled: {report['output_path']}")
    print(
        "Aktuální sezona raw: "
        f"{report['current_path']}"
    )


def print_clubs_report(report: dict[str, object]) -> None:
    print("\nKLUBY")
    print("------")
    print(f"Klubů v databázi: {report['clubs_count']}")
    print(f"Spočítaných týmů: {report['calculated_teams']}")
    print(f"Aktualizovaných klubů: {report['updated_teams']}")

    missing_teams = report.get("missing_teams", [])

    if missing_teams:
        print("Nepřiřazené týmy:")

        for team in missing_teams:
            print(f"  - {team}")

    print(f"Náhled: {report['output_path']}")
    print(f"Surová data: {report['metrics_path']}")


def main() -> None:
    print("=" * 55)
    print("ELH ENGINE")
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

    player_report = export_player_detail_preview()
    print_report("HRÁČI", player_report)

    print("\nVytvářím náhled statistik brankářů...")

    goalie_report = export_goalie_preview()
    print_report("BRANKÁŘI", goalie_report)

    print("\nVytvářím náhled tabulky ELH...")

    standings_report = export_standings_preview()
    print_report("TABULKA ELH", standings_report)

    print("\nVytvářím náhled kariér hráčů...")

    career_report = export_career_preview(
        str(season_report["current_season"])
    )
    print_career_report(career_report)

    print("\nVytvářím náhled klubových statistik...")

    clubs_report = export_clubs_preview()
    print_clubs_report(clubs_report)

    print("\nPůvodní CSV nebyla změněna.")
    print("Výstupy jsou uložené v data_bot/output.")

    log_message(
        "Dokončen náhled hráčů, brankářů, "
        "tabulky ELH, kariér a klubů."
    )


if __name__ == "__main__":
    main()