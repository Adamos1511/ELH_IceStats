from __future__ import annotations

import argparse
import json
import re
import unicodedata
import os
import tempfile
from pathlib import Path

from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup


# =========================================================
# ELH ICESTATS – HOKEJ.CZ MATCH CENTER
#
# Umí:
# - metadata zápasu
# - domácí / hosté
# - Preview
# - posledních 5 zápasů
# - H2H
# - live / final skóre
# - skóre třetin
# - stav zápasu
# - góly
# - tresty
#
# CLI:
#
# plný Match Center:
# python -m data_bot.modules.hokej_games 2928260
#
# rychlý live refresh:
# python -m data_bot.modules.hokej_games 2928260 --live
# =========================================================


HOKEJ_BASE_URL = "https://www.hokej.cz"

DEFAULT_MATCH_ID = "2928260"

REQUEST_TIMEOUT = 20


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 "
        "(Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/140.0 Safari/537.36"
    ),
    "Accept-Language": (
        "cs-CZ,cs;q=0.9,en;q=0.8"
    ),
}


# =========================================================
# ELH – MAPOVÁNÍ TÝMŮ
# =========================================================

TEAM_ALIASES = {
    "CBU": [
        "Banes Motor České Budějovice",
        "Banes Motor Č. Budějovice",
        "Motor České Budějovice",
    ],

    "MHK": [
        "Mountfield HK",
    ],

    "KVA": [
        "BYD Energie Karlovy Vary",
        "HC Energie Karlovy Vary",
        "Energie Karlovy Vary",
        "Karlovy Vary",
    ],

    "KLA": [
        "Rytíři Kladno",
        "Kladno",
    ],

    "KOM": [
        "HC Kometa Brno",
        "Kometa Brno",
    ],

    "LIB": [
        "Bílí Tygři Liberec",
        "Liberec",
    ],

    "LIT": [
        "HC VERVA Litvínov",
        "HC Verva Litvínov",
        "HC Litvínov",
        "Verva Litvínov",
        "Litvínov",
    ],

    "MBL": [
        "BK Mladá Boleslav",
        "Mladá Boleslav",
    ],

    "OLO": [
        "HC Olomouc",
        "Olomouc",
    ],

    "PCE": [
        "HC Dynamo Pardubice",
        "Dynamo Pardubice",
        "Pardubice",
    ],

    "PLZ": [
        "HC Škoda Plzeň",
        "Škoda Plzeň",
        "Plzeň",
    ],

    "SPA": [
        "HC Sparta Praha",
        "Sparta Praha",
        "Sparta",
    ],

    "TRI": [
        "HC Oceláři Třinec",
        "Oceláři Třinec",
        "Třinec",
    ],

    "VIT": [
        "HC VÍTKOVICE RIDERA",
        "HC Vítkovice Ridera",
        "Vítkovice Ridera",
        "Vítkovice",
    ],
}


# =========================================================
# DATOVÝ TYP STRÁNKY
# =========================================================

@dataclass
class MatchPage:
    name: str
    url: str
    status_code: int
    title: str
    text: str
    html: str


# =========================================================
# OBECNÉ UTILITY
# =========================================================

def _clean_text(
    value: str | None,
) -> str:
    return re.sub(
        r"\s+",
        " ",
        value or "",
    ).strip()


def _normalize_name(
    value: str,
) -> str:
    text = unicodedata.normalize(
        "NFD",
        _clean_text(value).lower(),
    )

    text = "".join(
        char
        for char in text
        if not unicodedata.combining(
            char
        )
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text,
    )

    return _clean_text(
        text
    )


def _page_lines(
    page: MatchPage,
) -> list[str]:
    return [
        _clean_text(line)
        for line
        in page.text.splitlines()
        if _clean_text(line)
    ]


def _match_url(
    match_id: str,
    suffix: str = "",
) -> str:
    match_id = str(
        match_id
    ).strip()

    suffix = (
        suffix
        .strip()
        .strip("/")
    )

    base = (
        f"{HOKEJ_BASE_URL}/"
        f"zapas/{match_id}"
    )

    if not suffix:
        return base

    return (
        f"{base}/{suffix}"
    )


def _generated_at() -> str:
    return (
        datetime.now(
            timezone.utc
        )
        .isoformat(
            timespec="seconds"
        )
    )


# =========================================================
# TÝMY
# =========================================================

def _team_code_from_name(
    value: str,
) -> str:
    wanted = _normalize_name(
        value
    )

    if not wanted:
        return ""


    for code, aliases in (
        TEAM_ALIASES.items()
    ):

        for alias in aliases:

            normalized_alias = (
                _normalize_name(
                    alias
                )
            )


            if (
                wanted
                ==
                normalized_alias
            ):
                return code


    # -----------------------------------------------------
    # Fallback – název může obsahovat
    # nějaké další slovo.
    # -----------------------------------------------------

    for code, aliases in (
        TEAM_ALIASES.items()
    ):

        for alias in aliases:

            normalized_alias = (
                _normalize_name(
                    alias
                )
            )


            if (
                normalized_alias
                and
                (
                    normalized_alias
                    in wanted
                    or
                    wanted
                    in normalized_alias
                )
            ):
                return code


    return ""


def _extract_team_code(
    value: str,
) -> str:
    """
    Vytáhne kód na konci textu.

    Např.:
    HC Oceláři Třinec Třinec TRI
    -> TRI

    Číslo 15 apod. nikdy
    nepovažujeme za týmový kód.
    """

    text = _clean_text(
        value
    )


    match = re.search(
        r"(?:^|\s)"
        r"([A-Z]{2,5})"
        r"$",
        text,
    )


    if not match:
        return ""


    code = (
        match.group(1)
        .upper()
    )


    if code in TEAM_ALIASES:
        return code


    return ""


# =========================================================
# STAŽENÍ STRÁNKY
# =========================================================

def _download_page(
    session: requests.Session,
    name: str,
    url: str,
) -> MatchPage:
    for attempt in range(2):
        try:
            response = session.get(
                url,
                headers=HEADERS,
                timeout=(10, REQUEST_TIMEOUT),
            )
            response.raise_for_status()
            break

        except requests.Timeout as exc:
            if attempt == 1:
                raise RuntimeError(
                    f"Stránku '{name}' se nepodařilo "
                    f"stáhnout ani na druhý pokus: {url}"
                ) from exc


    response.encoding = (
        response.apparent_encoding
        or
        response.encoding
        or
        "utf-8"
    )


    soup = BeautifulSoup(
        response.text,
        "html.parser",
    )


    title = _clean_text(
        soup.title.get_text(
            " ",
            strip=True,
        )
        if soup.title
        else ""
    )


    text = soup.get_text(
        "\n",
        strip=True,
    )


    return MatchPage(
        name=name,
        url=url,
        status_code=(
            response.status_code
        ),
        title=title,
        text=text,
        html=response.text,
    )


# =========================================================
# HLAVIČKA ZÁPASU
# =========================================================

def _extract_match_header(
    page: MatchPage,
) -> dict[str, str]:
    text = page.text


    result = {
        "competition": "",
        "date": "",
        "time": "",
        "round": "",
        "home_team": "",
        "away_team": "",
    }


    if re.search(
        r"Tipsport\s+extraliga",
        text,
        flags=re.IGNORECASE,
    ):
        result[
            "competition"
        ] = (
            "Tipsport extraliga"
        )


    date_time_match = re.search(
        r"(\d{1,2}\.\s*"
        r"\d{1,2}\.\s*"
        r"\d{4})"
        r"\s+"
        r"(\d{1,2}:\d{2})",
        text,
    )


    if date_time_match:

        result["date"] = (
            re.sub(
                r"\s+",
                "",
                date_time_match.group(1),
            )
        )

        result["time"] = (
            date_time_match.group(2)
        )


    round_match = re.search(
        r"(\d+)\.\s*kolo",
        text,
        flags=re.IGNORECASE,
    )


    if round_match:

        result["round"] = (
            round_match.group(1)
        )


    # -----------------------------------------------------
    # TITLE:
    #
    # BYD Energie Karlovy Vary -
    # HC Oceláři Třinec, 15.09.2026 | ...
    # -----------------------------------------------------

    title_match = re.match(
        r"(.+?)\s+-\s+(.+?),"
        r"\s*\d{1,2}\.\d{1,2}\.\d{4}",
        page.title,
    )


    if title_match:

        result["home_team"] = (
            _clean_text(
                title_match.group(1)
            )
        )

        result["away_team"] = (
            _clean_text(
                title_match.group(2)
            )
        )


    return result


# =========================================================
# NALEZENÍ KOLA V TEXTU
# =========================================================

def _find_match_round_index(
    page: MatchPage,
    lines: list[str],
) -> int | None:
    """
    Najde kolo patřící konkrétnímu
    zápasu.

    Nejprve použije datum zápasu.
    Když struktura Hokej.cz nebude
    přesně stejná, má fallback.
    """

    header = (
        _extract_match_header(
            page
        )
    )


    match_date = (
        header.get(
            "date",
            "",
        )
    )


    date_index = None


    if match_date:

        wanted_date = (
            match_date.replace(
                " ",
                ""
            )
        )


        for index, line in enumerate(
            lines
        ):

            compact_line = (
                line.replace(
                    " ",
                    ""
                )
            )


            if wanted_date in compact_line:

                date_index = index
                break


    # -----------------------------------------------------
    # Pokud známe datum,
    # kolo hledáme poblíž.
    # -----------------------------------------------------

    if date_index is not None:

        for index in range(
            date_index,
            min(
                len(lines),
                date_index + 15,
            ),
        ):

            if re.fullmatch(
                r"\d+\.\s*kolo",
                lines[index],
                flags=re.IGNORECASE,
            ):
                return index


    # -----------------------------------------------------
    # Fallback
    # -----------------------------------------------------

    for index, line in enumerate(
        lines
    ):

        if re.fullmatch(
            r"\d+\.\s*kolo",
            line,
            flags=re.IGNORECASE,
        ):
            return index


    return None


# =========================================================
# ČTENÍ SKÓRE
# =========================================================

def _read_score_at(
    lines: list[str],
    start_index: int,
) -> tuple[
    int | None,
    int | None,
    int,
]:
    """
    Hokej.cz může vrátit:

    0 : 2

    nebo přes BeautifulSoup:

    0
    :
    2

    Proto skládáme několik
    sousedních textových řádků.
    """

    for width in range(
        1,
        6,
    ):

        end_index = (
            start_index
            +
            width
        )


        if end_index > len(
            lines
        ):
            break


        candidate = (
            _clean_text(
                " ".join(
                    lines[
                        start_index:
                        end_index
                    ]
                )
            )
        )


        match = re.fullmatch(
            r"(\d{1,2})"
            r"\s*:\s*"
            r"(\d{1,2})",
            candidate,
        )


        if not match:
            continue


        return (
            int(
                match.group(1)
            ),
            int(
                match.group(2)
            ),
            end_index,
        )


    return (
        None,
        None,
        start_index + 1,
    )


def _find_match_score(
    page: MatchPage,
) -> tuple[
    int | None,
    int | None,
    int | None,
    int | None,
]:
    """
    Vrací:

    home_score
    away_score
    score_start
    score_end
    """

    lines = (
        _page_lines(
            page
        )
    )


    round_index = (
        _find_match_round_index(
            page,
            lines,
        )
    )


    if round_index is None:

        return (
            None,
            None,
            None,
            None,
        )


    search_end = min(
        len(lines),
        round_index + 45,
    )


    for index in range(
        round_index + 1,
        search_end,
    ):

        (
            home_score,
            away_score,
            end_index,
        ) = (
            _read_score_at(
                lines,
                index,
            )
        )


        if (
            home_score is None
            or
            away_score is None
        ):
            continue


        return (
            home_score,
            away_score,
            index,
            end_index,
        )


    return (
        None,
        None,
        None,
        None,
    )


# =========================================================
# STAV ZÁPASU
# =========================================================

STATUS_MARKERS = (
    "konec",
    "ukončen",
    "ukoncen",

    "třetina",
    "tretina",

    "přestáv",
    "prestav",

    "prodlou",

    "nájezd",
    "najezd",

    "před zápasem",
    "pred zapasem",

    "nezačal",
    "nezacal",

    "odlož",
    "odloz",

    "přeruš",
    "prerus",
)


def _find_match_status(
    page: MatchPage,
    score_end: int | None,
) -> tuple[
    str,
    int | None,
]:
    lines = (
        _page_lines(
            page
        )
    )


    if score_end is not None:

        start_index = (
            score_end
        )

        end_index = min(
            len(lines),
            start_index + 15,
        )


    else:

        round_index = (
            _find_match_round_index(
                page,
                lines,
            )
        )


        if round_index is None:

            return (
                "",
                None,
            )


        start_index = (
            round_index + 1
        )

        end_index = min(
            len(lines),
            round_index + 40,
        )


    for index in range(
        start_index,
        end_index,
    ):

        candidate = (
            lines[index]
        )


        normalized = (
            candidate.lower()
        )


        if any(
            marker in normalized
            for marker
            in STATUS_MARKERS
        ):

            return (
                candidate,
                index,
            )


    return (
        "",
        None,
    )


# =========================================================
# SKÓRE TŘETIN
# =========================================================

def _parse_period_score_text(
    value: str,
) -> list[
    dict[str, int]
]:
    scores = re.findall(
        r"(\d{1,2})"
        r"\s*:\s*"
        r"(\d{1,2})",
        value,
    )


    if len(scores) < 2:
        return []


    return [
        {
            "home":
                int(home),

            "away":
                int(away),
        }

        for home, away
        in scores
    ]


def _find_period_scores(
    page: MatchPage,
    start_index: int | None,
) -> tuple[
    list[dict[str, int]],
    str,
]:
    lines = (
        _page_lines(
            page
        )
    )


    if start_index is None:

        round_index = (
            _find_match_round_index(
                page,
                lines,
            )
        )


        if round_index is None:

            return (
                [],
                "",
            )


        start_index = (
            round_index + 1
        )


    end_index = min(
        len(lines),
        start_index + 20,
    )


    # -----------------------------------------------------
    # Zkoušíme jednotlivé řádky
    # i spojení několika řádků.
    # -----------------------------------------------------

    for index in range(
        start_index,
        end_index,
    ):

        for width in range(
            1,
            5,
        ):

            candidate_end = (
                index + width
            )


            if candidate_end > len(
                lines
            ):
                break


            candidate = (
                _clean_text(
                    " ".join(
                        lines[
                            index:
                            candidate_end
                        ]
                    )
                )
            )


            # Musí obsahovat alespoň
            # dvě skóre – tím nevememe
            # hlavní 0:2 ani herní čas.

            scores = (
                _parse_period_score_text(
                    candidate
                )
            )


            if len(scores) < 2:
                continue


            # U třetin bývají čárky
            # nebo oddělení overtime "-".

            if (
                ","
                not in candidate
                and
                " - "
                not in candidate
            ):
                continue


            return (
                scores,
                ", ".join(
                    f"{score['home']}:{score['away']}"
                    for score in scores
                ),
            )


    return (
        [],
        "",
    )


# =========================================================
# TÝMOVÉ KÓDY ZE SOUHRNU
# =========================================================

def _extract_summary_team_codes(
    page: MatchPage,
) -> tuple[str, str]:
    """
    Primárně používáme názvy týmů
    z TITLE, protože jsou mnohem
    stabilnější než pozice elementů
    v HTML.

    Teprve potom zkoušíme kódy
    z textu stránky.
    """

    header = (
        _extract_match_header(
            page
        )
    )


    home_code = (
        _team_code_from_name(
            header.get(
                "home_team",
                "",
            )
        )
    )


    away_code = (
        _team_code_from_name(
            header.get(
                "away_team",
                "",
            )
        )
    )


    if (
        home_code
        and
        away_code
    ):

        return (
            home_code,
            away_code,
        )


    # -----------------------------------------------------
    # Fallback z okolí hlavičky
    # -----------------------------------------------------

    lines = (
        _page_lines(
            page
        )
    )


    round_index = (
        _find_match_round_index(
            page,
            lines,
        )
    )


    if round_index is None:

        return (
            home_code,
            away_code,
        )


    found_codes: list[str] = []


    for line in lines[
        round_index + 1:
        min(
            len(lines),
            round_index + 35,
        )
    ]:

        code = (
            _extract_team_code(
                line
            )
        )


        if (
            code
            and
            code
            not in found_codes
        ):

            found_codes.append(
                code
            )


    if (
        not home_code
        and
        found_codes
    ):

        home_code = (
            found_codes[0]
        )


    if (
        not away_code
        and
        len(found_codes) >= 2
    ):

        away_code = (
            found_codes[1]
        )


    return (
        home_code,
        away_code,
    )


# =========================================================
# SCOREBOARD
# =========================================================

def _parse_scoreboard(page: MatchPage) -> dict[str, object]:
    # Only the match's own score fragment is authoritative. Preview/H2H contains
    # unrelated results immediately below it when a game has not started.
    soup = BeautifulSoup(page.html, "html.parser")
    fragment = soup.select_one("#snippet-matchOverview-score")
    if fragment is None:
        raise ValueError("Chybí hlavička skóre zápasu; předchozí data nesmí být přepsána.")
    score = fragment.select_one(".score")
    result = {"state": "scheduled", "home_score": None, "away_score": None,
              "status": fragment.get_text(" ", strip=True), "current_period": None,
              "clock": "", "periods": [], "_score_start": None, "_score_end": None}
    if score is None:
        status = result["status"].lower()
        if "odlož" in status or "odloz" in status: result["state"] = "postponed"
        elif "přeruš" in status or "prerus" in status: result["state"] = "suspended"
        return result
    for side, selector in (("home", ".home"), ("away", ".visiting")):
        node = score.select_one(selector)
        text = node.get_text(strip=True) if node else ""
        if text.isdigit(): result[side + "_score"] = int(text)
    detail = score.find("div", recursive=False)
    spans = detail.find_all("span", recursive=False) if detail else []
    status = spans[0].get_text(" ", strip=True) if spans else (detail.get_text(" ",strip=True) if detail else "")
    lower = status.lower()
    result["status"] = detail.get_text(" ", strip=True) if detail else status
    if re.search(r"konec|ukončen|ukoncen",lower): result["state"]="final"
    elif re.search(r"odlož|odloz",lower): result["state"]="postponed"
    elif re.search(r"přeruš|prerus",lower): result["state"]="suspended"
    elif re.search(r"přestáv|prestav",lower): result["state"]="intermission"
    elif re.search(r"třetina|tretina|prodlou|nájezd|najezd",lower): result["state"]="live"
    elif result["home_score"] is not None and result["away_score"] is not None: result["state"]="live"
    period = re.search(r"([1-3])\.?\s*(?:třetina|tretina)",lower)
    result["current_period"] = period[1] if period else "OT" if "prodlou" in lower else "SO" if re.search(r"nájezd|najezd",lower) else None
    if result["state"] in ("live","intermission"):
        clock=re.search(r"\b(\d{1,2}:[0-5]\d)\b",status)
        result["clock"]=clock[1] if clock else ""
    for span in spans[1:]:
        text=span.get_text(" ",strip=True)
        if re.fullmatch(r"\d{1,2}\s*:\s*\d{1,2}(?:\s*,\s*\d{1,2}\s*:\s*\d{1,2})*",text):
            result["periods"]=[{"home":int(h),"away":int(a)} for h,a in re.findall(r"(\d+)\s*:\s*(\d+)",text)]
    return result


# =========================================================
# HTML TABULKY
# =========================================================

def _find_text_node(
    soup: BeautifulSoup,
    wanted: str,
):
    wanted_upper = (
        wanted.upper()
    )


    for text_node in soup.find_all(
        string=True
    ):

        text = (
            _clean_text(
                str(text_node)
            )
        )


        if (
            wanted_upper
            in text.upper()
        ):

            return text_node


    return None


def _table_after_text(
    soup: BeautifulSoup,
    wanted: str,
) -> list[list[str]]:

    text_node = (
        _find_text_node(
            soup,
            wanted,
        )
    )


    if text_node is None:
        return []


    parent = (
        text_node.parent
    )


    if parent is None:
        return []


    table = (
        parent.find_next(
            "table"
        )
    )


    if table is None:
        return []


    return (
        _table_rows(
            table
        )
    )


def _table_rows(
    table,
) -> list[list[str]]:

    rows: list[
        list[str]
    ] = []


    for tr in table.find_all(
        "tr"
    ):

        cells = [
            _clean_text(
                cell.get_text(
                    " ",
                    strip=True,
                )
            )

            for cell
            in tr.find_all(
                [
                    "th",
                    "td",
                ]
            )
        ]


        cells = [
            cell
            for cell in cells
            if cell
        ]


        if cells:

            rows.append(
                cells
            )


    return rows


# =========================================================
# LIVE UDÁLOSTI
# =========================================================

def _period_key(
    heading: str,
) -> str:

    text = (
        _clean_text(
            heading
        )
    )


    period_match = re.search(
        r"([123])\.\s*"
        r"(?:třetina|tretina)",
        text,
        flags=re.IGNORECASE,
    )


    if period_match:

        return (
            period_match.group(1)
        )


    if re.search(
        r"prodlou",
        text,
        flags=re.IGNORECASE,
    ):

        return "OT"


    if re.search(
        r"nájezd|najezd",
        text,
        flags=re.IGNORECASE,
    ):

        return "SO"


    return ""


def _event_time_key(
    event: dict[str, object],
) -> int:

    value = str(
        event.get(
            "time",
            "",
        )
    )


    match = re.fullmatch(
        r"(\d+):(\d{2})",
        value,
    )


    if not match:

        return 0


    return (
        int(
            match.group(1)
        )
        * 60
        +
        int(
            match.group(2)
        )
    )


def _parse_summary_events(
    page: MatchPage,
    home_code: str,
    away_code: str,
) -> dict[str, object]:

    soup = BeautifulSoup(
        page.html,
        "html.parser",
    )


    goals: list[
        dict[str, object]
    ] = []


    penalties: list[
        dict[str, object]
    ] = []


    headings = (
        soup.find_all(
            [
                "h3",
                "h4",
            ]
        )
    )


    for heading in headings:

        heading_text = (
            _clean_text(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )
        )


        period = (
            _period_key(
                heading_text
            )
        )


        if not period:
            continue


        # -------------------------------------------------
        # Bereme tabulky patřící
        # pod konkrétní třetinu.
        # -------------------------------------------------

        for element in (
            heading.find_all_next(
                [
                    "h2",
                    "h3",
                    "h4",
                    "table",
                ]
            )
        ):

            if (
                element is not heading
                and
                element.name
                in {
                    "h2",
                    "h3",
                    "h4",
                }
            ):

                break


            if element.name != "table":

                continue


            rows = (
                _table_rows(
                    element
                )
            )


            if not rows:

                continue


            table_header = (
                " | ".join(
                    rows[0]
                )
                .lower()
            )


            # =============================================
            # GÓLY
            # =============================================

            if (
                "branky"
                in table_header
                and
                "asistence"
                in table_header
            ):

                for row in rows[1:]:

                    if len(row) < 3:

                        continue


                    if not re.fullmatch(
                        r"\d{1,2}:\d{2}",
                        row[0],
                    ):

                        continue


                    goals.append(
                        {
                            "period":
                                period,

                            "time":
                                row[0],

                            "team":
                                row[1]
                                if len(row) > 1
                                else "",

                            "scorer":
                                row[2]
                                if len(row) > 2
                                else "",

                            "assists":
                                row[3]
                                if len(row) > 3
                                else "",

                            "type":
                                row[4]
                                if len(row) > 4
                                else "",
                        }
                    )


            # =============================================
            # TRESTY
            # =============================================

            elif (
                "vyloučení"
                in table_header
                or
                "vylouceni"
                in table_header
            ):

                for row in rows[1:]:

                    if len(row) < 3:

                        continue


                    if not re.fullmatch(
                        r"\d{1,2}:\d{2}",
                        row[0],
                    ):

                        continue


                    penalties.append(
                        {
                            "period":
                                period,

                            "time":
                                row[0],

                            "team":
                                row[1]
                                if len(row) > 1
                                else "",

                            "player":
                                row[2]
                                if len(row) > 2
                                else "",

                            "penalty":
                                row[3]
                                if len(row) > 3
                                else "",
                        }
                    )


    goals.sort(
        key=_event_time_key
    )


    penalties.sort(
        key=_event_time_key
    )


    # -----------------------------------------------------
    # Dopočítáme průběžné skóre
    # po každém gólu.
    # -----------------------------------------------------

    home_running = 0
    away_running = 0


    for goal in goals:

        team = (
            str(
                goal.get(
                    "team",
                    "",
                )
            )
            .upper()
            .strip()
        )


        if (
            home_code
            and
            team == home_code
        ):

            home_running += 1


        elif (
            away_code
            and
            team == away_code
        ):

            away_running += 1


        goal[
            "score_after"
        ] = (
            f"{home_running}:"
            f"{away_running}"
        )


    return {
        "goals":
            goals,

        "penalties":
            penalties,
    }


# =========================================================
# FALLBACK SKÓRE Z GÓLŮ
# =========================================================

def _apply_event_score_fallback(
    scoreboard: dict[str, object],
    events: dict[str, object],
    home_code: str,
    away_code: str,
) -> None:
    """
    Pokud Hokej.cz změní HTML
    scoreboardu, pořád dokážeme
    průběžné skóre dopočítat z gólů.
    """

    if (
        scoreboard.get(
            "home_score"
        )
        is not None
        and
        scoreboard.get(
            "away_score"
        )
        is not None
    ):

        return


    goals = (
        events.get(
            "goals",
            []
        )
    )


    if not isinstance(
        goals,
        list,
    ):

        return


    if not goals:

        return


    home_score = 0
    away_score = 0


    for goal in goals:

        if not isinstance(
            goal,
            dict,
        ):

            continue


        team = (
            str(
                goal.get(
                    "team",
                    "",
                )
            )
            .upper()
            .strip()
        )


        if (
            home_code
            and
            team == home_code
        ):

            home_score += 1


        elif (
            away_code
            and
            team == away_code
        ):

            away_score += 1


    scoreboard[
        "home_score"
    ] = home_score


    scoreboard[
        "away_score"
    ] = away_score


    if (
        scoreboard.get(
            "state"
        )
        ==
        "scheduled"
    ):

        scoreboard[
            "state"
        ] = "live"


# =========================================================
# ODSTRANĚNÍ INTERNÍCH HODNOT SCOREBOARDU
# =========================================================

def _public_scoreboard(
    scoreboard: dict[str, object],
) -> dict[str, object]:

    return {
        key: value

        for key, value
        in scoreboard.items()

        if not key.startswith(
            "_"
        )
    }


# =========================================================
# PREVIEW – POSLEDNÍCH 5
# =========================================================

LAST5_HEADING_RE = re.compile(
    r"^POSLEDNÍCH\s+5\s+ZÁPASŮ\s+"
    r"([A-Z0-9]{2,6})$",
    flags=re.IGNORECASE,
)


def _find_last5_sections(
    lines: list[str],
) -> list[
    tuple[int, str]
]:

    sections: list[
        tuple[int, str]
    ] = []


    for index, line in enumerate(
        lines
    ):

        match = (
            LAST5_HEADING_RE
            .match(line)
        )


        if not match:

            continue


        sections.append(
            (
                index,
                match.group(1)
                .upper(),
            )
        )


    return sections


def _parse_last5_games(
    lines: list[str],
) -> list[
    dict[str, str]
]:

    games: list[
        dict[str, str]
    ] = []


    index = 0


    while index < len(
        lines
    ):

        line = (
            lines[index]
        )


        if not re.fullmatch(
            r"\d{1,2}\.\s*\d{1,2}\.",
            line,
        ):

            index += 1
            continue


        if (
            index + 2
            >=
            len(lines)
        ):

            break


        matchup = (
            lines[
                index + 1
            ]
        )


        result = (
            lines[
                index + 2
            ]
        )


        if not re.search(
            r"\s[–-]\s",
            matchup,
        ):

            index += 1
            continue


        if not re.match(
            r"^\d+\s*:\s*\d+",
            result,
        ):

            index += 1
            continue


        # -------------------------------------------------
        # P / SN může být samostatný
        # textový uzel.
        # -------------------------------------------------

        if not re.search(
            r"\s(?:P|SN)$",
            result.upper(),
        ):

            for lookahead in range(
                index + 3,
                min(
                    len(lines),
                    index + 7,
                ),
            ):

                marker = (
                    lines[
                        lookahead
                    ]
                    .strip()
                    .upper()
                )


                if marker in {
                    "P",
                    "SN",
                }:

                    result = (
                        f"{result} "
                        f"{marker}"
                    )

                    break


                if re.fullmatch(
                    r"\d{1,2}\.\s*\d{1,2}\.",
                    lines[
                        lookahead
                    ],
                ):

                    break


        games.append(
            {
                "date":
                    line,

                "match":
                    matchup,

                "result":
                    result,
            }
        )


        if len(
            games
        ) >= 5:

            break


        index += 3


    return games


# =========================================================
# HTML – HLEDÁNÍ TABULKY ZA TEXTEM
# =========================================================

def _parse_h2h(
    page: MatchPage,
) -> list[
    dict[str, str]
]:

    soup = BeautifulSoup(
        page.html,
        "html.parser",
    )


    raw_rows = (
        _table_after_text(
            soup,
            (
                "POSLEDNÍCH 5 "
                "VZÁJEMNÝCH ZÁPASŮ"
            ),
        )
    )


    games: list[
        dict[str, str]
    ] = []


    for row in raw_rows:

        if len(row) < 5:

            continue


        home_team = (
            row[0]
        )

        home_score = (
            row[1]
        )

        periods = (
            row[2]
        )

        away_score = (
            row[3]
        )

        away_team = (
            row[4]
        )


        if not (
            home_score.isdigit()
            and
            away_score.isdigit()
        ):

            continue


        games.append(
            {
                "home_team":
                    home_team,

                "home_code":
                    (
                        _extract_team_code(
                            home_team
                        )
                        or
                        _team_code_from_name(
                            home_team
                        )
                    ),

                "home_score":
                    home_score,

                "away_score":
                    away_score,

                "away_team":
                    away_team,

                "away_code":
                    (
                        _extract_team_code(
                            away_team
                        )
                        or
                        _team_code_from_name(
                            away_team
                        )
                    ),

                "periods":
                    periods,
            }
        )


        if len(
            games
        ) >= 5:

            break


    return games


# =========================================================
# PREVIEW – KOMPLETNÍ PARSER
# =========================================================

def _parse_preview(
    page: MatchPage,
) -> dict[str, object]:

    lines = (
        _page_lines(
            page
        )
    )


    sections = (
        _find_last5_sections(
            lines
        )
    )


    teams: list[
        dict[str, object]
    ] = []


    for section_index, (
        start_index,
        code,
    ) in enumerate(
        sections
    ):

        end_index = len(
            lines
        )


        if (
            section_index + 1
            <
            len(sections)
        ):

            end_index = (
                sections[
                    section_index + 1
                ][0]
            )


        else:

            for index in range(
                start_index + 1,
                len(lines),
            ):

                if (
                    "POSLEDNÍCH 5 "
                    "VZÁJEMNÝCH ZÁPASŮ"
                    in lines[
                        index
                    ].upper()
                ):

                    end_index = index
                    break


        section_lines = (
            lines[
                start_index + 1:
                end_index
            ]
        )


        teams.append(
            {
                "code":
                    code,

                "last5":
                    _parse_last5_games(
                        section_lines
                    ),
            }
        )


    home = (
        teams[0]
        if len(teams) >= 1
        else {
            "code": "",
            "last5": [],
        }
    )


    away = (
        teams[1]
        if len(teams) >= 2
        else {
            "code": "",
            "last5": [],
        }
    )


    return {
        "home":
            home,

        "away":
            away,

        "h2h":
            _parse_h2h(
                page
            ),
    }


# =========================================================
# DOSTUPNOST SEKCI
# =========================================================

def _detect_sections(
    pages: dict[
        str,
        MatchPage
    ],
) -> dict[str, bool]:

    return {
        "preview_last5": (
            "POSLEDNÍCH 5 ZÁPASŮ"
            in pages[
                "preview"
            ].text.upper()
        ),

        "preview_h2h": (
            (
                "POSLEDNÍCH 5 "
                "VZÁJEMNÝCH ZÁPASŮ"
            )
            in pages[
                "preview"
            ].text.upper()
        ),

        "roster_page": (
            "ROZESTAVENÍ"
            in pages[
                "roster"
            ].text.upper()
        ),

        "live_page": (
            "TEXTOVÝ PŘENOS"
            in pages[
                "live"
            ].text.upper()
        ),

        "stats_page": (
            "PODROBNÉ STATISTIKY"
            in pages[
                "stats"
            ].text.upper()
        ),
    }


# =========================================================
# RYCHLÝ LIVE REFRESH
# =========================================================

def inspect_live(
    match_id: str,
    include_details: bool = False,
) -> dict[str, object]:

    with requests.Session() as session:

        summary_url = (
            _match_url(
                match_id
            )
        )


        summary = (
            _download_page(
                session,
                "summary",
                summary_url,
            )
        )


    header = (
        _extract_match_header(
            summary
        )
    )


    (
        home_code,
        away_code,
    ) = (
        _extract_summary_team_codes(
            summary
        )
    )


    scoreboard = (
        _parse_scoreboard(
            summary
        )
    )


    events = (
        _parse_summary_events(
            summary,
            home_code,
            away_code,
        )
    )


    _apply_event_score_fallback(
        scoreboard,
        events,
        home_code,
        away_code,
    )


    match_info, statistics = _parse_match_statistics(summary)
    if include_details:
        statistics["players_detail"] = _download_extra_player_statistics(summary)
    return {
        "match_info": match_info,
        "statistics": statistics,
        "player_links": _match_player_links(summary),
        "status":
            "ok",

        "mode":
            "live",

        "generated_at":
            _generated_at(),

        "match_id":
            str(match_id),

        "match_url":
            summary_url,

        "competition":
            header[
                "competition"
            ],

        "date":
            header[
                "date"
            ],

        "time":
            header[
                "time"
            ],

        "round":
            header[
                "round"
            ],

        "home": {
            "name":
                header[
                    "home_team"
                ],

            "code":
                home_code,
        },

        "away": {
            "name":
                header[
                    "away_team"
                ],

            "code":
                away_code,
        },

        "scoreboard":
            _public_scoreboard(
                scoreboard
            ),

        "events":
            events,
    }


def _download_match_roster(page: MatchPage) -> dict[str, object]:
    result = {
        "status": "unavailable",
        "source_url": "",
        "home": [],
        "away": [],
    }

    match = re.search(
        r"\bvar\s+matchJson\s*=\s*(\{[^;]*\})\s*;",
        page.html,
    )

    if not match:
        result["status"] = "error"
        result["error"] = "V HTML chybí matchJson."
        return result

    try:
        metadata = json.loads(match.group(1))
        season = metadata.get("season")
        online_id = metadata.get("onlajnyID")

        if not season or not online_id:
            return result

        if not (
            str(season).isdigit()
            and str(online_id).isdigit()
        ):
            raise ValueError("Neplatná sezona nebo onlajnyID.")

        url = (
            "https://s3-eu-west-1.amazonaws.com/"
            "data.onlajny.com/hockey/roster/"
            f"{season}/{online_id}.json"
        )
        result["source_url"] = url

        response = requests.get(
            url,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
        )

        if response.status_code == 404:
            return result

        response.raise_for_status()
        data = response.json()

        if not isinstance(data, dict):
            raise ValueError("Zdroj sestav nevrátil JSON objekt.")

        if data.get("hasRoster") is not True:
            return result

        rosters = data.get("rosters")
        if not isinstance(rosters, dict):
            raise ValueError("Ve zdroji chybí rosters.")

        parsed = {}

        for source_side, output_side in (
            ("home", "home"),
            ("guest", "away"),
        ):
            players = rosters.get(source_side)

            if not isinstance(players, dict) or not players:
                raise ValueError(
                    f"Chybí sestava pro {source_side}."
                )

            parsed[output_side] = []

            for slot, player in players.items():
                if not isinstance(player, dict):
                    raise ValueError("Neplatný záznam hráče.")

                parsed[output_side].append({
                    "source_player_id": player.get("id"),
                    "name": player.get("name", ""),
                    "surname": player.get("surname", ""),
                    "jersey": player.get("jersey"),
                    "position": player.get("position", ""),
                    "slot": str(slot),
                })

        result["referees"] = {"main": [], "lines": []}
        for person in data.get("referees", []):
            if not isinstance(person, dict):
                continue
            role = "main" if str(person.get("type", "")).startswith("hlavni") else "lines" if str(person.get("type", "")).startswith("carovy") else None
            name = " ".join(str(person.get(k) or "") for k in ("name", "surname")).strip()
            if role and name:
                result["referees"][role].append(name)
        result.update(parsed)
        result["status"] = "available"

    except (requests.RequestException, ValueError) as exc:
        result["status"] = "error"
        result["error"] = str(exc)

    return result

# =========================================================
# KOMPLETNÍ MATCH CENTER
# =========================================================

# Match information and published statistics. Keep the existing event parser separate.
def _match_player_links(page: MatchPage) -> list[dict]:
    soup = BeautifulSoup(page.html, "html.parser")
    result = []
    for side, selector in (("home", ".col-soupisky-home"), ("away", ".col-soupisky-visitor")):
        for a in soup.select(selector + ' a[href^="/hrac/"]'):
            path = a.get("href", "").split("?")[0]
            if re.fullmatch(r"/hrac/[a-zA-Z0-9-]+/\d+", path):
                result.append({"side": side, "name": a.get_text(" ", strip=True), "url": "https://www.hokej.cz" + path})
    return result


def _parse_match_statistics(page: MatchPage) -> tuple[dict, dict]:
    soup = BeautifulSoup(page.html, "html.parser")
    def text_at(selector):
        node = soup.select_one(selector)
        return node.get_text(" ", strip=True) if node else ""

    def count_at(selector):
        value = re.sub(r"\s+", "", text_at(selector))
        return int(value) if value.isdigit() else None

    info = {
        "attendance": count_at(".box-count-visitors"),
        "venue": text_at(".box-heading-stadium"),
        "capacity": count_at(".box-count-stadium"),
        "referees": {"main": [], "lines": []},
    }
    stats = {"status": "unavailable", "source_url": page.url,
             "verification": "", "team": [], "tables": []}
    # The upstream status cells are sometimes outside <tr>, so walk cell siblings.
    for table in soup.select(".table-first-bold"):
        for cell in table.find_all("td"):
            label = cell.get_text(" ", strip=True).rstrip(":")
            value_cell = cell.find_next_sibling("td")
            if value_cell is None:
                continue
            value = " ".join(value_cell.stripped_strings)
            if label in ("Hlavní rozhodčí", "Čároví rozhodčí"):
                role = "main" if label == "Hlavní rozhodčí" else "lines"
                info["referees"][role] = [n.get_text(" ", strip=True)
                                            for n in value_cell.select(".referee")]
            elif label == "Stav statistik":
                stats["verification"] = value
            elif re.fullmatch(r"[+-]?\d+\s*:\s*[+-]?\d+(?:\s*,\s*[+-]?\d+\s*:\s*[+-]?\d+)*", value):
                pairs = [{"home": int(a), "away": int(b)} for a, b in
                         re.findall(r"([+-]?\d+)\s*:\s*([+-]?\d+)", value)]
                stats["team"].append({"label": label, "values": pairs})

    for side, css in (("home", ".col-soupisky-home"), ("away", ".col-soupisky-visitor")):
        for table in soup.select(css + " table"):
            headers = table.select("thead th")
            labels = [n.get_text(" ", strip=True) for n in headers]
            if "Hráč" not in labels:
                continue
            columns = []
            for i, node in enumerate(headers):
                hint = node.select_one("[data-content]")
                columns.append({"label": labels[i], "description":
                                hint.get("data-content", labels[i]) if hint else labels[i]})
            rows = []
            for row in table.select("tbody tr"):
                cells = row.find_all("td", recursive=False)
                if len(cells) != len(columns):
                    continue
                rows.append({"cells": [c.get_text(" ", strip=True) or None for c in cells],
                             "not_played": row.find("del") is not None})
            if rows:
                stats["tables"].append({"side": side,
                    "kind": "goalies" if "%Z" in labels else "skaters",
                    "columns": columns, "rows": rows})
    if stats["team"] or stats["tables"]:
        stats["status"] = "available"
    return info, stats


# Additional player metrics from the same public feed used by Onlajny.
_MATCH_PLAYER_COLUMNS = [
    ("goals", "G", "Góly"), ("assistance", "A", "Asistence"),
    ("points", "B", "Body"), ("plus_minus", "+/−", "Plus/minus"),
    ("shots", "S", "Střely na branku"), ("hits", "H", "Hity"),
    ("blocked_shots", "BLK", "Bloky"),
    ("player_shot_is_blocked_count", "S blok.", "Střely hráče zblokované soupeřem"),
    ("faceoffs", "Buly", "Celkový počet vhazování"),
    ("faceoffs_win", "Buly V", "Vyhraná vhazování"),
    ("penalty_minutes", "TM", "Trestné minuty"),
    ("shifts", "Stříd.", "Počet střídání"),
    ("time_on_ice_transformed", "TOI", "Čas na ledě"),
    ("positive_participations", "+ účast", "Pozitivní účasti"),
    ("negative_participations", "− účast", "Negativní účasti"),
    ("radegast_index", "RI", "Radegast index"),
]


def _parse_extra_player_statistics(data: dict) -> list[dict]:
    if data.get("statistics") is not True:
        return []
    tables = []
    for source_side, side in (("home", "home"), ("guest", "away")):
        players = data.get(source_side)
        if not isinstance(players, list):
            continue
        players = [p for p in players if isinstance(p, dict)]
        scopes = [("total", "Celkem", None)]
        for key, title in (("period", "třetina"), ("overtime", "prodloužení"), ("shootout", "nájezdy")):
            length = max((len(p[key]) for p in players if isinstance(p.get(key), list)), default=0)
            scopes.extend((f"{key}-{i}", f"{i + 1}. {title}", (key, i)) for i in range(length))
        for scope, title, path in scopes:
            values = [(p, p if path is None else (
                p[path[0]][path[1]] if isinstance(p.get(path[0]), list)
                and len(p[path[0]]) > path[1] else {})) for p in players]
            values = [(p, v) for p, v in values if isinstance(v, dict)]
            fields = [(key, label, desc) for key, label, desc in _MATCH_PLAYER_COLUMNS
                      if any(v.get(key) is not None for _, v in values)]
            if not fields:
                continue
            rows = []
            for player, value in values:
                rows.append({"cells": [player.get("jersey"),
                    " ".join(str(player.get(k) or "") for k in ("name", "surname")).strip()]
                    + [value.get(key) for key, _, _ in fields], "not_played": False})
            tables.append({"side": side, "scope": scope, "title": title,
                "columns": [{"label": "Č", "description": "Číslo dresu"},
                            {"label": "Hráč", "description": "Jméno hráče"}]
                    + [{"label": label, "description": desc} for _, label, desc in fields],
                "rows": rows})
    return tables


def _download_extra_player_statistics(page: MatchPage) -> dict:
    result = {"status": "unavailable", "source_url": "", "tables": []}
    match = re.search(r"\bvar\s+matchJson\s*=\s*(\{[^;]*\})\s*;", page.html)
    if not match:
        return result
    try:
        metadata = json.loads(match.group(1))
        season, online_id = metadata.get("season"), metadata.get("onlajnyID")
        if not str(season).isdigit() or not str(online_id).isdigit():
            return result
        result["source_url"] = ("https://s3-eu-west-1.amazonaws.com/data.onlajny.com/"
                                f"hockey/player-stats/{season}/{online_id}.json")
        response = requests.get(result["source_url"], headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if response.status_code == 404:
            return result
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Neplatný formát hráčských statistik.")
        result["tables"] = _parse_extra_player_statistics(data)
        result["status"] = "available" if result["tables"] else "unavailable"
    except (requests.RequestException, ValueError) as exc:
        result["status"] = "error"
        result["error"] = str(exc)
    return result


def inspect_match(
    match_id: str,
) -> dict[str, object]:

    urls = {
        "summary":
            _match_url(
                match_id
            ),

        "preview":
            _match_url(
                match_id,
                "preview",
            ),

        "roster":
            _match_url(
                match_id,
                "roster",
            ),

        "live":
            _match_url(
                match_id,
                "on-line",
            ),

        "stats":
            _match_url(
                match_id,
                "stats",
            ),
    }


    pages: dict[
        str,
        MatchPage
    ] = {}


    with requests.Session() as session:

        for name, url in (
            urls.items()
        ):

            pages[name] = (
                _download_page(
                    session,
                    name,
                    url,
                )
            )


    summary = (
        pages[
            "summary"
        ]
    )


    header = (
        _extract_match_header(
            summary
        )
    )


    preview = (
        _parse_preview(
            pages[
                "preview"
            ]
        )
    )


    (
        summary_home_code,
        summary_away_code,
    ) = (
        _extract_summary_team_codes(
            summary
        )
    )


    preview_home_code = str(
        preview
        .get(
            "home",
            {}
        )
        .get(
            "code",
            "",
        )
    )


    preview_away_code = str(
        preview
        .get(
            "away",
            {}
        )
        .get(
            "code",
            "",
        )
    )


    home_code = (
        summary_home_code
        or
        preview_home_code
        or
        _team_code_from_name(
            header[
                "home_team"
            ]
        )
    )


    away_code = (
        summary_away_code
        or
        preview_away_code
        or
        _team_code_from_name(
            header[
                "away_team"
            ]
        )
    )


    scoreboard = (
        _parse_scoreboard(
            summary
        )
    )


    events = (
        _parse_summary_events(
            summary,
            home_code,
            away_code,
        )
    )


    _apply_event_score_fallback(
        scoreboard,
        events,
        home_code,
        away_code,
    )


    match_info, statistics = _parse_match_statistics(pages["summary"])
    statistics["players_detail"] = _download_extra_player_statistics(pages["stats"])

    return {
        "match_info": match_info,
        "statistics": statistics,
        "player_links": _match_player_links(pages["summary"]),
        "status":
            "ok",

        "mode":
            "full",

        "generated_at":
            _generated_at(),

        "match_id":
            str(match_id),

        "match_url":
            urls[
                "summary"
            ],

        "competition":
            header[
                "competition"
            ],

        "date":
            header[
                "date"
            ],

        "time":
            header[
                "time"
            ],

        "round":
            header[
                "round"
            ],

        "home": {
            "name":
                header[
                    "home_team"
                ],

            "code":
                home_code,
        },

        "away": {
            "name":
                header[
                    "away_team"
                ],

            "code":
                away_code,
        },

        "scoreboard":
            _public_scoreboard(
                scoreboard
            ),

        "events":
            events,

        "preview":
            preview,

        "roster":
            _download_match_roster(
                pages["roster"]
            ),

            

        "pages": {
            name: {
                "url":
                    page.url,

                "http":
                    page.status_code,

                "title":
                    page.title,
            }

            for name, page
            in pages.items()
        },

        "sections":
            _detect_sections(
                pages
            ),
    }


# =========================================================
# VEŘEJNÉ FUNKCE PRO ZBYTEK DATABOTU
# =========================================================

def export_games_preview(
    match_id: str = (
        DEFAULT_MATCH_ID
    ),
) -> dict[str, object]:
    """
    Kompletní Match Center.

    Název zachováváme kvůli
    kompatibilitě s update.py.
    """

    return inspect_match(
        str(match_id)
    )


def export_game_live(
    match_id: str = (
        DEFAULT_MATCH_ID
    ),
) -> dict[str, object]:
    """
    Rychlý live refresh.

    Stahuje pouze hlavní
    stránku zápasu.

    Toto později použije
    cloud worker.
    """

    return inspect_live(
        str(match_id)
    )


# =========================================================
# CLI
# =========================================================

def save_match_json(result: dict[str, object]) -> Path:
    """Uloží plný detail do datové složky webu. CLI bez --save se nemění."""
    match_id = str(result.get("match_id", ""))
    if not re.fullmatch(r"[0-9]+", match_id):
        raise ValueError("Neplatné ID zápasu.")
    if result.get("status") != "ok" or result.get("mode") != "full":
        raise ValueError("Pro web ukládej plný detail bez přepínače --live.")

    directory = Path(__file__).resolve().parents[2] / "data" / "matches"
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{match_id}.json"
    # Případná chyba zápisu nepoškodí předchozí platný JSON.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory,
            suffix=".tmp", delete=False,
        ) as handle:
            temporary = Path(handle.name)
            json.dump(result, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        os.replace(temporary, destination)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return destination


def main() -> None:

    parser = (
        argparse.ArgumentParser(
            description=(
                "ELH IceStats – "
                "Hokej.cz Match Center"
            )
        )
    )


    parser.add_argument(
        "match_id",
        nargs="?",
        default=(
            DEFAULT_MATCH_ID
        ),
        help=(
            "Hokej.cz ID zápasu"
        ),
    )


    parser.add_argument(
        "--live",
        action="store_true",
        help=(
            "Rychlý live refresh "
            "pouze ze Souhrnu."
        ),
    )


    parser.add_argument(
        "--save",
        action="store_true",
        help="Uloží plný detail do data/matches/<match_id>.json pro web.",
    )

    args = (
        parser.parse_args()
    )

    if not re.fullmatch(r"[0-9]+", str(args.match_id)):
        parser.error("match_id musí obsahovat pouze číslice.")
    if args.save and args.live:
        parser.error("--save používej bez --live, aby se zachovaly sestavy a preview.")



    if args.live:

        result = (
            export_game_live(
                args.match_id
            )
        )

    else:

        result = (
            export_games_preview(
                args.match_id
            )
        )


    if args.save:
        save_match_json(result)

    print(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()