from __future__ import annotations

from pathlib import Path

import pandas as pd

from data_bot.modules.utils import write_csv


def export_frame(
    frame: pd.DataFrame,
    path: Path,
) -> None:
    write_csv(frame, path)
