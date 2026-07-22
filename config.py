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
