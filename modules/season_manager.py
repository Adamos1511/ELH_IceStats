from __future__ import annotations

from typing import Any

from data_bot.config import DEFAULT_SEASON
from data_bot.modules.utils import load_state


def get_active_season() -> str:
    state: dict[str, Any] = load_state()
    return str(state.get("current_season", DEFAULT_SEASON))


def check_season_rollover() -> dict[str, object]:
    """
    PĹ™echod sezony se zatĂ­m pouze hlĂˇsĂ­.
    AutomatickĂˇ archivace bude aktivovĂˇna po ovÄ›Ĺ™enĂ­ zĂˇpasĹŻ.
    """
    return {
        "current_season": get_active_season(),
        "rollover_performed": False,
    }
