from __future__ import annotations

from io import StringIO
import re
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from data_bot.config import (
    BRANKARI_DETAIL_CSV,
    HEADERS,
    HOKEJ_BASE_URL,
    HRACI_DETAIL_CSV,
    KARIERY_CSV,
    OUTPUT_DIR,
    PLAYER_STATS_URL,
    REQUEST_TIMEOUT,
)
from data_bot.modules.utils import (
    normalize_text,
    read_csv,
    write_csv,
)


# =========================================================
# KONFIGURACE
# =========================================================

LEAGUE_HOME_URL = (
    f"{HOKEJ_BASE_URL}/tipsport-extraliga"
)

# Stejná soutěž, kterou používají současné
# moduly hráčů / brankářů.
# Používá se pouze jako záložní zdroj profilových odkazů.
STATS_COMPETITION_ID = 7537

REQUEST_DELAY = 0.12
ROSTER_REQUEST_DELAY = 0.05


TEAM_ALIASES: dict[
    str,
    tuple[str, ...],
] = {
    "CBU": (
        "Banes Motor Č. Budějovice",
        "Banes Motor České Budějovice",
        "Motor České Budějovice",
        "Č. Budějovice",
        "České Budějovice",
    ),
    "MHK": (
        "Mountfield HK",
        "Hr. Králové",
        "Hradec Králové",
    ),
    "KVA": (
        "HC Energie Karlovy Vary",
        "Karlovy Vary",
    ),
    "KLA": (
        "Rytíři Kladno",
        "Kladno",
    ),
    "KOM": (
        "HC Kometa Brno",
        "Kometa",
        "Brno",
    ),
    "LIB": (
        "Bílí Tygři Liberec",
        "Liberec",
    ),
    "LIT": (
        "HC VERVA Litvínov",
        "HC Verva Litvínov",
        "HC Litvínov",
        "Litvínov",
    ),
    "MBL": (
        "BK Mladá Boleslav",
        "Ml. Boleslav",
        "Mladá Boleslav",
    ),
    "OLO": (
        "HC Olomouc",
        "Olomouc",
    ),
    "PCE": (
        "HC Dynamo Pardubice",
        "Dynamo Pardubice",
        "Pardubice",
    ),
    "PLZ": (
        "HC Škoda Plzeň",
        "Škoda Plzeň",
        "Plzeň",
    ),
    "SPA": (
        "HC Sparta Praha",
        "Sparta Praha",
        "Sparta",
    ),
    "TRI": (
        "HC Oceláři Třinec",
        "Oceláři Třinec",
        "Třinec",
    ),
    "VIT": (
        "HC VÍTKOVICE RIDERA",
        "HC Vítkovice Ridera",
        "Vítkovice",
    ),
}


TEAM_CODE_ALIASES = {
    "HRA": "MHK",
}


CAREER_COLUMNS = [
    "Jméno",
    "Příjmení",
    "Tým ELH",
    "Typ hráče",
    "Sekce",
    "Typ řádku",
    "Pořadí",
    "Sezona",
    "Soutěž",
    "Klub",
    "Počet klubů",

    # Hráčské statistiky
    "Z",
    "G",
    "A",
    "B",
    "+/-",
    "+",
    "-",
    "TM",
    "GV",
    "GP",
    "GO",

    # Brankářské statistiky
    "Č",
    "GOb",
    "Zás",
    "SP",
    "ZZ",
    "V",
    "P",
    "R",
    "Pr.",
    "SO",
    "Z%",
    "T",

    # Zdroj
    "Profil URL",
    "Kariéra URL",
]


CAREER_FORMAT_REQUIRED_COLUMNS = {
    "Jméno",
    "Příjmení",
    "Sekce",
    "Typ řádku",
    "Soutěž",
    "Profil URL",
}


# Hokej.cz aktuálně používá např. 2025-2026,
# ale přijmeme i 2025/2026 a dlouhou pomlčku.
SEASON_PATTERN = re.compile(
    r"^\d{4}\s*[-/–—]\s*\d{4}$"
)


PROFILE_PATH_PATTERN = re.compile(
    r"^(/hrac/(?:[^/?#]+/)?\d+)"
)


CLUB_PATH_PATTERN = re.compile(
    r"^(/klub/[^/?#]+/\d+)"
)


# =========================================================
# OBECNÉ FUNKCE
# =========================================================

def clean_value(
    value: object,
) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (
        TypeError,
        ValueError,
    ):
        pass

    text = (
        str(value)
        .replace(
            "\xa0",
            " ",
        )
        .replace(
            "\r",
            "",
        )
        .strip()
    )

    if text.lower() in {
        "",
        "nan",
        "none",
        "nat",
    }:
        return ""

    return text


def make_name_key(
    first_name: object,
    last_name: object,
) -> str:
    return normalize_text(
        f"{clean_value(first_name)} "
        f"{clean_value(last_name)}"
    )


def make_roster_key(
    first_name: object,
    last_name: object,
    team: object,
) -> str:
    return "|".join(
        [
            make_name_key(
                first_name,
                last_name,
            ),
            normalize_text(
                team
            ),
        ]
    )


def parse_season_start_year(
    season: str,
) -> int:
    match = re.search(
        r"(\d{4})",
        clean_value(
            season
        ),
    )

    if not match:
        return 2025

    return int(
        match.group(1)
    )


def normalize_season(
    value: object,
) -> str:
    """
    Převede různé varianty sezony na formát YYYY-YYYY.
    """
    raw = clean_value(
        value
    )

    if not raw:
        return ""

    match = re.match(
        r"^(\d{4})\s*[-/–—]\s*(\d{4})$",
        raw,
    )

    if not match:
        return ""

    return (
        f"{match.group(1)}-"
        f"{match.group(2)}"
    )


def is_summary_marker(
    value: object,
) -> bool:
    marker = normalize_text(
        clean_value(
            value
        )
    )

    return marker in {
        "vse",
        "vsechny",
        "celkem",
        "souhrn",
        "total",
    }


def create_session() -> requests.Session:
    session = requests.Session()

    session.headers.update(
        HEADERS
    )

    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=0.6,
        status_forcelist=(
            429,
            500,
            502,
            503,
            504,
        ),
        allowed_methods=frozenset(
            ["GET"]
        ),
        raise_on_status=False,
    )

    adapter = HTTPAdapter(
        max_retries=retry
    )

    session.mount(
        "https://",
        adapter,
    )

    session.mount(
        "http://",
        adapter,
    )

    return session


def download_page(
    session: requests.Session,
    url: str,
    params: dict[
        str,
        object,
    ] | None = None,
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
            "Nepodařilo se načíst "
            f"Hokej.cz: {error}"
        ) from error


# =========================================================
# URL
# =========================================================

def canonical_profile_url(
    value: object,
) -> str:
    raw = clean_value(
        value
    )

    if not raw:
        return ""

    absolute = urljoin(
        HOKEJ_BASE_URL,
        raw,
    )

    parsed = urlsplit(
        absolute
    )

    if (
        not parsed.hostname
        or not parsed.hostname.endswith(
            "hokej.cz"
        )
    ):
        return ""

    match = PROFILE_PATH_PATTERN.match(
        parsed.path
    )

    if not match:
        return ""

    return urlunsplit(
        (
            parsed.scheme
            or "https",
            parsed.netloc,
            match.group(1),
            "",
            "",
        )
    )


def canonical_club_url(
    value: object,
) -> str:
    raw = clean_value(
        value
    )

    if not raw:
        return ""

    absolute = urljoin(
        HOKEJ_BASE_URL,
        raw,
    )

    parsed = urlsplit(
        absolute
    )

    if (
        not parsed.hostname
        or not parsed.hostname.endswith(
            "hokej.cz"
        )
    ):
        return ""

    match = CLUB_PATH_PATTERN.match(
        parsed.path
    )

    if not match:
        return ""

    return urlunsplit(
        (
            parsed.scheme
            or "https",
            parsed.netloc,
            match.group(1),
            "",
            "",
        )
    )


def career_url(
    profile_url: object,
) -> str:
    profile = canonical_profile_url(
        profile_url
    )

    if not profile:
        return ""

    return (
        f"{profile}/career"
        "?stats-section=all"
    )


# =========================================================
# TÝMY
# =========================================================

def resolve_team_code(
    value: object,
) -> str:
    raw = clean_value(
        value
    )

    if not raw:
        return ""

    upper = raw.upper()

    if upper in TEAM_CODE_ALIASES:
        return TEAM_CODE_ALIASES[
            upper
        ]

    if upper in TEAM_ALIASES:
        return upper

    normalized = normalize_text(
        raw
    )

    for (
        code,
        aliases,
    ) in TEAM_ALIASES.items():

        for alias in aliases:
            if (
                normalize_text(
                    alias
                )
                == normalized
            ):
                return code

    return upper


def score_team_anchor(
    text: object,
    team_code: str,
) -> int | None:
    normalized_text = normalize_text(
        text
    )

    if not normalized_text:
        return None

    aliases = TEAM_ALIASES.get(
        team_code,
        (),
    )

    best_score: int | None = (
        None
    )

    for alias in aliases:
        normalized_alias = (
            normalize_text(
                alias
            )
        )

        if (
            normalized_text
            == normalized_alias
        ):
            score = 0

        elif (
            normalized_alias
            in normalized_text
        ):
            score = (
                10
                + abs(
                    len(
                        normalized_text
                    )
                    - len(
                        normalized_alias
                    )
                )
            )

        else:
            continue

        if (
            best_score is None
            or score < best_score
        ):
            best_score = score

    return best_score


# =========================================================
# SOUPISKA ELH
# =========================================================

def load_current_roster(
) -> list[dict[str, str]]:
    players = read_csv(
        HRACI_DETAIL_CSV
    )

    goalies = read_csv(
        BRANKARI_DETAIL_CSV
    )

    roster: dict[
        str,
        dict[str, str],
    ] = {}


    def add_frame(
        frame: pd.DataFrame,
        player_type: str,
    ) -> None:

        for _, row in (
            frame.iterrows()
        ):
            first_name = clean_value(
                row.get(
                    "Jméno",
                    "",
                )
            )

            last_name = clean_value(
                row.get(
                    "Příjmení",
                    "",
                )
            )

            if (
                not first_name
                and not last_name
            ):
                continue

            team = clean_value(
                row.get(
                    "Tým",
                    "",
                )
            )

            key = make_roster_key(
                first_name,
                last_name,
                team,
            )

            candidate = {
                "Jméno":
                    first_name,

                "Příjmení":
                    last_name,

                "Tým":
                    team,

                "Tým kód":
                    resolve_team_code(
                        team
                    ),

                "Typ hráče":
                    player_type,

                "Profil URL":
                    canonical_profile_url(
                        row.get(
                            "Profil Hráče",
                            "",
                        )
                    ),
            }

            existing = roster.get(
                key
            )

            if existing is None:
                roster[
                    key
                ] = candidate

                continue

            # Pokud se jeden člověk omylem
            # objeví v obou souborech,
            # brankář má přednost.
            if (
                player_type
                == "BRANKAR"
            ):
                roster[
                    key
                ] = candidate


    add_frame(
        players,
        "HRAC",
    )

    add_frame(
        goalies,
        "BRANKAR",
    )

    result = list(
        roster.values()
    )

    result.sort(
        key=lambda row: (
            normalize_text(
                row[
                    "Příjmení"
                ]
            ),
            normalize_text(
                row[
                    "Jméno"
                ]
            ),
        )
    )

    return result


# =========================================================
# HLEDÁNÍ KLUBOVÝCH STRÁNEK HOKEJ.CZ
# =========================================================

def discover_team_urls(
    session: requests.Session,
    roster: list[
        dict[str, str]
    ],
) -> dict[str, str]:
    wanted_codes = {
        clean_value(
            player.get(
                "Tým kód",
                "",
            )
        )
        for player in roster
        if clean_value(
            player.get(
                "Tým kód",
                "",
            )
        )
        in TEAM_ALIASES
    }

    if not wanted_codes:
        return {}

    response = download_page(
        session,
        LEAGUE_HOME_URL,
    )

    soup = BeautifulSoup(
        response.text,
        "lxml",
    )

    candidates: dict[
        str,
        tuple[int, str],
    ] = {}

    for anchor in soup.find_all(
        "a",
        href=True,
    ):
        href = clean_value(
            anchor.get(
                "href"
            )
        )

        if "/klub/" not in href:
            continue

        club_url = (
            canonical_club_url(
                href
            )
        )

        if not club_url:
            continue

        text = anchor.get_text(
            " ",
            strip=True,
        )

        for (
            team_code
        ) in wanted_codes:

            score = (
                score_team_anchor(
                    text,
                    team_code,
                )
            )

            if score is None:
                continue

            existing = (
                candidates.get(
                    team_code
                )
            )

            if (
                existing is None
                or score
                < existing[0]
            ):
                candidates[
                    team_code
                ] = (
                    score,
                    club_url,
                )

    return {
        code:
            value[1]
        for (
            code,
            value,
        ) in candidates.items()
    }


# =========================================================
# HLEDÁNÍ PROFILŮ NA SOUPISKÁCH
# =========================================================

def discover_profiles_from_rosters(
    session: requests.Session,
    roster: list[
        dict[str, str]
    ],
    team_urls: dict[
        str,
        str,
    ],
) -> tuple[
    dict[
        tuple[str, str],
        str,
    ],
    dict[
        str,
        set[str],
    ],
]:
    target_names = {
        make_name_key(
            player["Jméno"],
            player["Příjmení"],
        )
        for player in roster
    }

    by_team: dict[
        tuple[str, str],
        str,
    ] = {}

    by_name: dict[
        str,
        set[str],
    ] = {}

    for (
        team_code,
        club_url,
    ) in team_urls.items():

        roster_url = (
            f"{club_url.rstrip('/')}"
            "/soupiska"
        )

        try:
            response = download_page(
                session,
                roster_url,
            )

        except RuntimeError:
            continue

        soup = BeautifulSoup(
            response.text,
            "lxml",
        )

        for anchor in soup.find_all(
            "a",
            href=True,
        ):
            href = clean_value(
                anchor.get(
                    "href"
                )
            )

            if "/hrac/" not in href:
                continue

            name = anchor.get_text(
                " ",
                strip=True,
            )

            name_key = normalize_text(
                name
            )

            if (
                name_key
                not in target_names
            ):
                continue

            profile = (
                canonical_profile_url(
                    href
                )
            )

            if not profile:
                continue

            by_team[
                (
                    name_key,
                    team_code,
                )
            ] = profile

            by_name.setdefault(
                name_key,
                set(),
            ).add(
                profile
            )

        time.sleep(
            ROSTER_REQUEST_DELAY
        )

    return (
        by_team,
        by_name,
    )


# =========================================================
# ZÁLOŽNÍ HLEDÁNÍ PROFILŮ VE STATISTIKÁCH
# =========================================================

def find_show_all_url(
    response: requests.Response,
) -> str:
    soup = BeautifulSoup(
        response.text,
        "lxml",
    )

    for anchor in soup.find_all(
        "a",
        href=True,
    ):
        text = normalize_text(
            anchor.get_text(
                " ",
                strip=True,
            )
        )

        if (
            "zobrazit vsechny"
            not in text
        ):
            continue

        return urljoin(
            response.url,
            clean_value(
                anchor.get(
                    "href"
                )
            ),
        )

    return ""


def collect_profile_links(
    html: str,
    target_names: set[str],
    output: dict[
        str,
        set[str],
    ],
) -> None:
    soup = BeautifulSoup(
        html,
        "lxml",
    )

    for anchor in soup.find_all(
        "a",
        href=True,
    ):
        href = clean_value(
            anchor.get(
                "href"
            )
        )

        if "/hrac/" not in href:
            continue

        name = anchor.get_text(
            " ",
            strip=True,
        )

        name_key = normalize_text(
            name
        )

        if (
            name_key
            not in target_names
        ):
            continue

        profile = (
            canonical_profile_url(
                href
            )
        )

        if not profile:
            continue

        output.setdefault(
            name_key,
            set(),
        ).add(
            profile
        )


def discover_profiles_from_stats(
    session: requests.Session,
    roster: list[
        dict[str, str]
    ],
    season_start_year: int,
) -> dict[
    str,
    set[str],
]:
    target_names = {
        make_name_key(
            player["Jméno"],
            player["Příjmení"],
        )
        for player in roster
    }

    output: dict[
        str,
        set[str],
    ] = {}

    stats_url = (
        f"{PLAYER_STATS_URL}/detailni"
    )

    seasons = [
        season_start_year,
        season_start_year - 1,
    ]

    sections = [
        "",
        "goalkeeper",
    ]

    for year in seasons:
        for section in sections:
            params: dict[
                str,
                object,
            ] = {
                "stats-filter-competition":
                    STATS_COMPETITION_ID,

                "stats-filter-season":
                    year,
            }

            if section:
                params[
                    "stats-menu-section"
                ] = section

            try:
                response = (
                    download_page(
                        session,
                        stats_url,
                        params=params,
                    )
                )

                collect_profile_links(
                    response.text,
                    target_names,
                    output,
                )

                show_all_url = (
                    find_show_all_url(
                        response
                    )
                )

                if show_all_url:
                    full_response = (
                        download_page(
                            session,
                            show_all_url,
                        )
                    )

                    collect_profile_links(
                        full_response.text,
                        target_names,
                        output,
                    )

            except RuntimeError:
                continue

    return output


# =========================================================
# EXISTUJÍCÍ KARIÉRY
# =========================================================

def prepare_existing_careers(
    existing: pd.DataFrame,
) -> pd.DataFrame:
    if not (
        CAREER_FORMAT_REQUIRED_COLUMNS
        .issubset(
            existing.columns
        )
    ):
        return pd.DataFrame(
            columns=CAREER_COLUMNS
        )

    result = existing.copy()

    for column in CAREER_COLUMNS:
        if column not in result.columns:
            result[
                column
            ] = ""

    result = result[
        CAREER_COLUMNS
    ].copy()

    result = result.fillna(
        ""
    )

    return result


def existing_profile_lookup(
    existing: pd.DataFrame,
) -> dict[str, str]:
    lookup: dict[
        str,
        str,
    ] = {}

    if existing.empty:
        return lookup

    for _, row in (
        existing.iterrows()
    ):
        name_key = make_name_key(
            row.get(
                "Jméno",
                "",
            ),
            row.get(
                "Příjmení",
                "",
            ),
        )

        profile = (
            canonical_profile_url(
                row.get(
                    "Profil URL",
                    "",
                )
            )
        )

        if (
            name_key
            and profile
        ):
            lookup[
                name_key
            ] = profile

    return lookup


def existing_rows_by_player(
    existing: pd.DataFrame,
) -> dict[
    str,
    pd.DataFrame,
]:
    output: dict[
        str,
        pd.DataFrame,
    ] = {}

    if existing.empty:
        return output

    keys = existing.apply(
        lambda row:
            make_name_key(
                row.get(
                    "Jméno",
                    "",
                ),
                row.get(
                    "Příjmení",
                    "",
                ),
            ),
        axis=1,
    )

    for key in keys.unique():
        if not key:
            continue

        output[
            key
        ] = (
            existing[
                keys == key
            ]
            .copy()
        )

    return output


# =========================================================
# VÝBĚR PROFILU HRÁČE
# =========================================================

def choose_profile_url(
    player: dict[str, str],
    old_profiles: dict[
        str,
        str,
    ],
    roster_profiles_by_team: dict[
        tuple[str, str],
        str,
    ],
    roster_profiles_by_name: dict[
        str,
        set[str],
    ],
    stats_profiles: dict[
        str,
        set[str],
    ],
) -> str:
    direct = (
        canonical_profile_url(
            player.get(
                "Profil URL",
                "",
            )
        )
    )

    if direct:
        return direct

    name_key = make_name_key(
        player["Jméno"],
        player["Příjmení"],
    )

    team_code = clean_value(
        player.get(
            "Tým kód",
            "",
        )
    )

    by_team = (
        roster_profiles_by_team
        .get(
            (
                name_key,
                team_code,
            )
        )
    )

    if by_team:
        return by_team

    roster_candidates = (
        roster_profiles_by_name.get(
            name_key,
            set(),
        )
    )

    if (
        len(
            roster_candidates
        )
        == 1
    ):
        return next(
            iter(
                roster_candidates
            )
        )

    old = old_profiles.get(
        name_key
    )

    if old:
        return old

    stats_candidates = (
        stats_profiles.get(
            name_key,
            set(),
        )
    )

    if (
        len(
            stats_candidates
        )
        == 1
    ):
        return next(
            iter(
                stats_candidates
            )
        )

    # Pokud je více kandidátů se stejným
    # jménem, raději nic netipujeme.
    return ""


# =========================================================
# PARSOVÁNÍ TABULEK HOKEJ.CZ
# =========================================================

def flatten_columns(
    frame: pd.DataFrame,
) -> pd.DataFrame:
    result = frame.copy()

    flattened: list[
        str
    ] = []

    for column in result.columns:
        if isinstance(
            column,
            tuple,
        ):
            parts = list(
                column
            )
        else:
            parts = [
                column
            ]

        cleaned_parts: list[
            str
        ] = []

        for part in parts:
            text = clean_value(
                part
            )

            if not text:
                continue

            if normalize_text(
                text
            ).startswith(
                "unnamed"
            ):
                continue

            normalized = (
                normalize_text(
                    text
                )
            )

            if (
                cleaned_parts
                and normalize_text(
                    cleaned_parts[-1]
                )
                == normalized
            ):
                continue

            cleaned_parts.append(
                text
            )

        flattened.append(
            " | ".join(
                cleaned_parts
            )
        )

    result.columns = (
        flattened
    )

    return result


def canonical_stat_header(
    value: object,
) -> str:
    raw = clean_value(
        value
    )

    if not raw:
        return ""

    candidates = [
        raw,
        *[
            part.strip()
            for part in (
                raw.split("|")
            )
            if part.strip()
        ],
    ]

    mapping = {
        "z":
            "Z",

        "zapasy":
            "Z",

        "g":
            "G",

        "goly":
            "G",

        "a":
            "A",

        "asistence":
            "A",

        "b":
            "B",

        "body":
            "B",

        "+/-":
            "+/-",

        "+":
            "+",

        "-":
            "-",

        "tm":
            "TM",

        "gv":
            "GV",

        "gp":
            "GP",

        "go":
            "GO",

        # brankáři
        "c":
            "Č",

        "cas":
            "Č",

        "gob":
            "GOb",

        "gobdrzene":
            "GOb",

        "zas":
            "Zás",

        "zakroky":
            "Zás",

        "sp":
            "SP",

        "zz":
            "ZZ",

        "v":
            "V",

        "vyhry":
            "V",

        "p":
            "P",

        "prohry":
            "P",

        "r":
            "R",

        "pr":
            "Pr.",

        "prumer":
            "Pr.",

        "so":
            "SO",

        "cistekonto":
            "SO",

        "z%":
            "Z%",

        "procentozakroku":
            "Z%",

        "uspesnost":
            "Z%",

        "t":
            "T",
    }

    for candidate in reversed(
        candidates
    ):
        normalized = (
            normalize_text(
                candidate
            )
            .replace(
                " ",
                "",
            )
            .replace(
                ".",
                "",
            )
            .replace(
                ":",
                "",
            )
        )

        if (
            normalized
            in mapping
        ):
            return mapping[
                normalized
            ]

    return ""


def format_stat_value(
    value: object,
    stat_name: str,
) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (
        TypeError,
        ValueError,
    ):
        pass

    if isinstance(
        value,
        bool,
    ):
        return str(
            value
        )

    if isinstance(
        value,
        int,
    ):
        if stat_name in {
            "Pr.",
            "Z%",
        }:
            return (
                f"{value:.2f}"
            )

        return str(
            value
        )

    if isinstance(
        value,
        float,
    ):
        if stat_name in {
            "Pr.",
            "Z%",
        }:
            return (
                f"{value:.2f}"
            )

        if value.is_integer():
            return str(
                int(
                    value
                )
            )

        return (
            f"{value:.6f}"
            .rstrip(
                "0"
            )
            .rstrip(
                "."
            )
        )

    text = clean_value(
        value
    )

    if not text:
        return ""

    if stat_name in {
        "Pr.",
        "Z%",
    }:
        numeric_text = (
            text
            .replace(
                "%",
                "",
            )
            .replace(
                ",",
                ".",
            )
        )

        try:
            number = float(
                numeric_text
            )

            return (
                f"{number:.2f}"
            )

        except ValueError:
            pass

    return text


def find_competition_column(
    columns: list[str],
) -> int:
    for (
        index,
        column,
    ) in enumerate(
        columns
    ):
        normalized = (
            normalize_text(
                column
            )
        )

        if (
            normalized
            == "soutez"
        ):
            return index

        if (
            "soutez"
            in normalized
        ):
            return index

    return -1


def career_table_to_rows(
    frame: pd.DataFrame,
    *,
    section: str,
    player: dict[str, str],
    profile_url: str,
    source_url: str,
    starting_order: int,
) -> tuple[
    list[
        dict[str, object]
    ],
    int,
]:
    """
    Převede jednu HTML kariérní tabulku
    na DETAIL + SOUHRN řádky.

    DŮLEŽITÉ:
    Hokej.cz má DETAIL i SOUHRN často
    VE STEJNÉ HTML TABULCE.

    Typ tedy NESMÍ být určen jednou
    pro celou tabulku.

    Přepínáme do summary_mode až ve chvíli,
    kdy skutečně narazíme na marker Vše.
    """
    result = flatten_columns(
        frame
    )

    columns = [
        clean_value(
            column
        )
        for column in (
            result.columns
        )
    ]

    competition_index = (
        find_competition_column(
            columns
        )
    )

    if (
        competition_index < 0
    ):
        return (
            [],
            starting_order,
        )

    # Vlevo od soutěže je
    # sezona / marker Vše.
    if (
        competition_index == 0
    ):
        return (
            [],
            starting_order,
        )

    marker_index = (
        competition_index - 1
    )

    # Vpravo od soutěže je
    # klub / počet klubů.
    club_index = (
        competition_index + 1
    )

    if (
        club_index
        >= len(columns)
    ):
        return (
            [],
            starting_order,
        )

    rows: list[
        dict[str, object]
    ] = []

    last_season = ""

    # Jakmile narazíme na Vše,
    # následující řádky jsou ligové souhrny.
    summary_mode = False

    order = (
        starting_order
    )

    for _, source_row in (
        result.iterrows()
    ):
        marker = clean_value(
            source_row.iloc[
                marker_index
            ]
        )

        competition = clean_value(
            source_row.iloc[
                competition_index
            ]
        )

        club_or_count = (
            clean_value(
                source_row.iloc[
                    club_index
                ]
            )
        )

        normalized_marker = (
            normalize_text(
                marker
            )
        )

        normalized_competition = (
            normalize_text(
                competition
            )
        )

        # Vynecháme opakovanou
        # hlavičku tabulky.
        if (
            normalized_competition
            == "soutez"
        ):
            continue

        # Úplně prázdné řádky.
        if (
            not marker
            and not competition
            and not club_or_count
        ):
            continue


        # -------------------------------------------------
        # ZAČÁTEK SOUHRNNÉ SEKCE
        # -------------------------------------------------

        if is_summary_marker(
            marker
        ):
            summary_mode = True


        # -------------------------------------------------
        # DETAIL
        # -------------------------------------------------

        if not summary_mode:
            normalized_season = (
                normalize_season(
                    marker
                )
            )

            if normalized_season:
                last_season = (
                    normalized_season
                )

            season = (
                normalized_season
                or last_season
            )

            # Pokud nemáme sezonu,
            # nemůže jít o použitelný
            # detailní kariérní řádek.
            if not season:
                continue

            # Detail musí mít soutěž.
            if not competition:
                continue

            row_type = (
                "DETAIL"
            )

            club = (
                club_or_count
            )

            club_count = ""


        # -------------------------------------------------
        # SOUHRN
        # -------------------------------------------------

        else:
            # Řádek "Vše" může mít soutěž
            # hned ve druhém sloupci.
            # Následující souhrnné řádky
            # mají marker typicky prázdný.
            if not competition:
                continue

            row_type = (
                "SOUHRN"
            )

            season = ""

            club = ""

            club_count = (
                club_or_count
            )


        # -------------------------------------------------
        # VÝSTUPNÍ ŘÁDEK
        # -------------------------------------------------

        order += 1

        output_row: dict[
            str,
            object,
        ] = {
            column: ""
            for column in (
                CAREER_COLUMNS
            )
        }

        output_row.update(
            {
                "Jméno":
                    player[
                        "Jméno"
                    ],

                "Příjmení":
                    player[
                        "Příjmení"
                    ],

                "Tým ELH":
                    player[
                        "Tým"
                    ],

                "Typ hráče":
                    player[
                        "Typ hráče"
                    ],

                "Sekce":
                    section,

                "Typ řádku":
                    row_type,

                "Pořadí":
                    order,

                "Sezona":
                    season,

                "Soutěž":
                    competition,

                "Klub":
                    club,

                "Počet klubů":
                    club_count,

                "Profil URL":
                    profile_url,

                "Kariéra URL":
                    source_url,
            }
        )


        # -------------------------------------------------
        # STATISTIKY
        # -------------------------------------------------

        for column_index in range(
            club_index + 1,
            len(columns),
        ):
            stat_name = (
                canonical_stat_header(
                    columns[
                        column_index
                    ]
                )
            )

            if not stat_name:
                continue

            if (
                stat_name
                not in CAREER_COLUMNS
            ):
                continue

            value = (
                source_row.iloc[
                    column_index
                ]
            )

            output_row[
                stat_name
            ] = (
                format_stat_value(
                    value,
                    stat_name,
                )
            )

        rows.append(
            output_row
        )

    return (
        rows,
        order,
    )


# =========================================================
# PARSOVÁNÍ CELÉ KARIÉRY
# =========================================================

def parse_career_page(
    html: str,
    player: dict[str, str],
    profile_url: str,
    source_url: str,
) -> list[
    dict[str, object]
]:
    soup = BeautifulSoup(
        html,
        "lxml",
    )

    page_name = ""

    h1 = soup.find(
        "h1"
    )

    if h1:
        page_name = (
            h1.get_text(
                " ",
                strip=True,
            )
        )

    expected_name = (
        f"{player['Jméno']} "
        f"{player['Příjmení']}"
    ).strip()

    normalized_expected = (
        normalize_text(
            expected_name
        )
    )

    normalized_page = (
        normalize_text(
            page_name
        )
    )

    if (
        normalized_expected
        and normalized_page
        and normalized_expected
        != normalized_page
        and normalized_expected
        not in normalized_page
        and normalized_page
        not in normalized_expected
    ):
        raise RuntimeError(
            "Profil na Hokej.cz "
            "neodpovídá hráči "
            f"{expected_name}. "
            f"Na stránce je: "
            f"{page_name}."
        )

    current_section = ""

    rows: list[
        dict[str, object]
    ] = []

    order = 0

    for element in soup.find_all(
        [
            "h2",
            "table",
        ]
    ):
        if (
            element.name
            == "h2"
        ):
            heading = (
                normalize_text(
                    element.get_text(
                        " ",
                        strip=True,
                    )
                )
            )

            if (
                "klubova kariera"
                in heading
            ):
                current_section = (
                    "KLUBOVA"
                )

            elif (
                "reprezentacni kariera"
                in heading
            ):
                current_section = (
                    "REPREZENTACE"
                )

            continue

        if (
            element.name
            != "table"
            or not current_section
        ):
            continue

        try:
            tables = pd.read_html(
                StringIO(
                    str(
                        element
                    )
                ),
                keep_default_na=False,
            )

        except ValueError:
            continue

        except Exception:
            continue

        if not tables:
            continue

        parsed_rows, order = (
            career_table_to_rows(
                tables[0],

                section=
                    current_section,

                player=
                    player,

                profile_url=
                    profile_url,

                source_url=
                    source_url,

                starting_order=
                    order,
            )
        )

        rows.extend(
            parsed_rows
        )

    if not rows:
        raise RuntimeError(
            "Na kariérní stránce "
            "nebyly nalezeny "
            "podporované tabulky."
        )

    return rows


def download_player_career(
    session: requests.Session,
    player: dict[str, str],
    profile_url: str,
) -> list[
    dict[str, object]
]:
    source_url = career_url(
        profile_url
    )

    if not source_url:
        raise RuntimeError(
            "Neplatná URL profilu."
        )

    try:
        response = download_page(
            session,
            source_url,
        )

        return parse_career_page(
            response.text,
            player,
            profile_url,
            source_url,
        )

    finally:
        time.sleep(
            REQUEST_DELAY
        )


# =========================================================
# KLÍČ KARIÉRNÍHO ŘÁDKU
# =========================================================

def make_career_key(
    row:
        pd.Series
        | dict[
            str,
            object,
        ],
) -> str:
    return "|".join(
        [
            normalize_text(
                row.get(
                    "Jméno",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Příjmení",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Sekce",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Typ řádku",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Sezona",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Soutěž",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Klub",
                    "",
                )
            ),

            normalize_text(
                row.get(
                    "Počet klubů",
                    "",
                )
            ),
        ]
    )


# =========================================================
# HLAVNÍ EXPORT
# =========================================================

def export_career_preview(
    season: str,
) -> dict[
    str,
    object,
]:
    existing_raw = read_csv(
        KARIERY_CSV
    )

    existing = (
        prepare_existing_careers(
            existing_raw
        )
    )

    roster = (
        load_current_roster()
    )

    if not roster:
        raise RuntimeError(
            "V hraci_detail.csv ani "
            "brankari_detail.csv nebyli "
            "nalezeni žádní hráči."
        )

    season_start_year = (
        parse_season_start_year(
            season
        )
    )

    session = (
        create_session()
    )


    # -----------------------------------------------------
    # 1) EXISTUJÍCÍ PROFILOVÉ URL
    # -----------------------------------------------------

    old_profiles = (
        existing_profile_lookup(
            existing
        )
    )


    # -----------------------------------------------------
    # 2) PROFILY Z AKTUÁLNÍCH SOUPISEK
    # -----------------------------------------------------

    team_urls = (
        discover_team_urls(
            session,
            roster,
        )
    )

    (
        roster_profiles_by_team,
        roster_profiles_by_name,
    ) = (
        discover_profiles_from_rosters(
            session,
            roster,
            team_urls,
        )
    )


    # -----------------------------------------------------
    # 3) ZÁLOŽNÍ PROFILY ZE STATISTIK
    # -----------------------------------------------------

    stats_profiles = (
        discover_profiles_from_stats(
            session,
            roster,
            season_start_year,
        )
    )


    # -----------------------------------------------------
    # 4) STARÉ ŘÁDKY PRO PŘÍPAD VÝPADKU
    # -----------------------------------------------------

    old_rows_lookup = (
        existing_rows_by_player(
            existing
        )
    )

    current_name_keys = {
        make_name_key(
            player[
                "Jméno"
            ],
            player[
                "Příjmení"
            ],
        )
        for player in roster
    }


    # Zachováme kariéry hráčů,
    # kteří už nejsou v aktuální ELH.
    retained_old_rows = (
        existing[
            ~existing.apply(
                lambda row:
                    make_name_key(
                        row.get(
                            "Jméno",
                            "",
                        ),
                        row.get(
                            "Příjmení",
                            "",
                        ),
                    )
                    in current_name_keys,

                axis=1,
            )
        ].copy()

        if not existing.empty

        else pd.DataFrame(
            columns=
                CAREER_COLUMNS
        )
    )


    fresh_rows: list[
        dict[str, object]
    ] = []

    fallback_frames: list[
        pd.DataFrame
    ] = []

    profile_report_rows: list[
        dict[str, object]
    ] = []

    unmatched_rows: list[
        dict[str, object]
    ] = []

    scraped_player_count = 0
    failed_player_count = 0


    # -----------------------------------------------------
    # 5) KOMPLETNÍ KARIÉRA KAŽDÉHO HRÁČE
    # -----------------------------------------------------

    for (
        index,
        player,
    ) in enumerate(
        roster,
        start=1,
    ):
        full_name = (
            f"{player['Jméno']} "
            f"{player['Příjmení']}"
        ).strip()

        name_key = make_name_key(
            player[
                "Jméno"
            ],
            player[
                "Příjmení"
            ],
        )

        profile = (
            choose_profile_url(
                player,
                old_profiles,
                roster_profiles_by_team,
                roster_profiles_by_name,
                stats_profiles,
            )
        )

        source_url = (
            career_url(
                profile
            )
        )

        print(
            f"[KARIÉRY "
            f"{index}/"
            f"{len(roster)}] "
            f"{full_name}"
        )

        if not profile:
            failed_player_count += 1

            reason = (
                "Profil hráče nebyl "
                "nalezen na aktuálních "
                "soupiskách ani ve "
                "statistikách Hokej.cz."
            )

            unmatched_rows.append(
                {
                    "Jméno":
                        player[
                            "Jméno"
                        ],

                    "Příjmení":
                        player[
                            "Příjmení"
                        ],

                    "Tým":
                        player[
                            "Tým"
                        ],

                    "Typ hráče":
                        player[
                            "Typ hráče"
                        ],

                    "Důvod":
                        reason,
                }
            )

            old_player_rows = (
                old_rows_lookup.get(
                    name_key
                )
            )

            if (
                old_player_rows
                is not None
                and not
                old_player_rows.empty
            ):
                fallback_frames.append(
                    old_player_rows.copy()
                )

            profile_report_rows.append(
                {
                    "Jméno":
                        player[
                            "Jméno"
                        ],

                    "Příjmení":
                        player[
                            "Příjmení"
                        ],

                    "Tým":
                        player[
                            "Tým"
                        ],

                    "Typ hráče":
                        player[
                            "Typ hráče"
                        ],

                    "Profil URL":
                        "",

                    "Kariéra URL":
                        "",

                    "Stav":
                        "NENALEZEN",

                    "Počet řádků":
                        0,
                }
            )

            continue

        try:
            rows = (
                download_player_career(
                    session,
                    player,
                    profile,
                )
            )

            fresh_rows.extend(
                rows
            )

            scraped_player_count += 1

            profile_report_rows.append(
                {
                    "Jméno":
                        player[
                            "Jméno"
                        ],

                    "Příjmení":
                        player[
                            "Příjmení"
                        ],

                    "Tým":
                        player[
                            "Tým"
                        ],

                    "Typ hráče":
                        player[
                            "Typ hráče"
                        ],

                    "Profil URL":
                        profile,

                    "Kariéra URL":
                        source_url,

                    "Stav":
                        "OK",

                    "Počet řádků":
                        len(
                            rows
                        ),
                }
            )

        except Exception as error:
            failed_player_count += 1

            reason = str(
                error
            )

            unmatched_rows.append(
                {
                    "Jméno":
                        player[
                            "Jméno"
                        ],

                    "Příjmení":
                        player[
                            "Příjmení"
                        ],

                    "Tým":
                        player[
                            "Tým"
                        ],

                    "Typ hráče":
                        player[
                            "Typ hráče"
                        ],

                    "Důvod":
                        reason,
                }
            )

            old_player_rows = (
                old_rows_lookup.get(
                    name_key
                )
            )

            if (
                old_player_rows
                is not None
                and not
                old_player_rows.empty
            ):
                fallback_frames.append(
                    old_player_rows.copy()
                )

            profile_report_rows.append(
                {
                    "Jméno":
                        player[
                            "Jméno"
                        ],

                    "Příjmení":
                        player[
                            "Příjmení"
                        ],

                    "Tým":
                        player[
                            "Tým"
                        ],

                    "Typ hráče":
                        player[
                            "Typ hráče"
                        ],

                    "Profil URL":
                        profile,

                    "Kariéra URL":
                        source_url,

                    "Stav":
                        "CHYBA",

                    "Počet řádků":
                        0,
                }
            )


    # -----------------------------------------------------
    # BEZ ÚSPĚCHU NEVYTVOŘÍME PRÁZDNÝ SOUBOR
    # -----------------------------------------------------

    if (
        scraped_player_count
        == 0
    ):
        raise RuntimeError(
            "Nepodařilo se načíst "
            "kariéru ani jednoho "
            "hráče z Hokej.cz. "
            "kariery_preview.csv "
            "nebyl vytvořen."
        )


    # -----------------------------------------------------
    # 6) VÝSLEDNÝ DATASET
    # -----------------------------------------------------

    frames: list[
        pd.DataFrame
    ] = []

    if fresh_rows:
        frames.append(
            pd.DataFrame(
                fresh_rows,
                columns=
                    CAREER_COLUMNS,
            )
        )

    frames.extend(
        fallback_frames
    )

    if (
        not retained_old_rows.empty
    ):
        frames.append(
            retained_old_rows
        )

    if frames:
        result = pd.concat(
            frames,
            ignore_index=True,
        )

    else:
        result = pd.DataFrame(
            columns=
                CAREER_COLUMNS
        )

    for column in CAREER_COLUMNS:
        if (
            column
            not in result.columns
        ):
            result[
                column
            ] = ""

    result = (
        result[
            CAREER_COLUMNS
        ]
        .fillna("")
        .copy()
    )


    # -----------------------------------------------------
    # 7) STATISTIKY ZMĚN
    # -----------------------------------------------------

    existing_keys = {
        make_career_key(
            row
        )
        for _, row in (
            existing.iterrows()
        )
    }

    final_keys = {
        make_career_key(
            row
        )
        for _, row in (
            result.iterrows()
        )
    }

    added_count = len(
        final_keys
        - existing_keys
    )

    skipped_count = len(
        final_keys
        & existing_keys
    )


    # -----------------------------------------------------
    # 8) DIAGNOSTICKÉ SOUBORY
    # -----------------------------------------------------

    profile_report = (
        pd.DataFrame(
            profile_report_rows,
            columns=[
                "Jméno",
                "Příjmení",
                "Tým",
                "Typ hráče",
                "Profil URL",
                "Kariéra URL",
                "Stav",
                "Počet řádků",
            ],
        )
    )

    unmatched = pd.DataFrame(
        unmatched_rows,
        columns=[
            "Jméno",
            "Příjmení",
            "Tým",
            "Typ hráče",
            "Důvod",
        ],
    )


    # -----------------------------------------------------
    # 9) VÝSTUPY
    # -----------------------------------------------------

    output_path = (
        OUTPUT_DIR
        / "kariery_preview.csv"
    )

    profile_path = (
        OUTPUT_DIR
        / "kariery_profile_index.csv"
    )

    unmatched_path = (
        OUTPUT_DIR
        / "kariery_unmatched.csv"
    )

    write_csv(
        result,
        output_path,
    )

    write_csv(
        profile_report,
        profile_path,
    )

    write_csv(
        unmatched,
        unmatched_path,
    )


    # -----------------------------------------------------
    # DOPLŇKOVÁ KONTROLA DETAIL / SOUHRN
    # -----------------------------------------------------

    detail_count = (
        int(
            (
                result[
                    "Typ řádku"
                ]
                == "DETAIL"
            ).sum()
        )
        if (
            "Typ řádku"
            in result.columns
        )
        else 0
    )

    summary_count = (
        int(
            (
                result[
                    "Typ řádku"
                ]
                == "SOUHRN"
            ).sum()
        )
        if (
            "Typ řádku"
            in result.columns
        )
        else 0
    )

    print(
        "[KARIÉRY] "
        f"DETAIL: {detail_count}, "
        f"SOUHRN: {summary_count}"
    )


    # -----------------------------------------------------
    # Zachováváme staré klíče reportu,
    # aby současný update.py nespadl.
    # -----------------------------------------------------

    return {
        "existing_count":
            len(
                existing_raw
            ),

        "current_season_count":
            len(
                fresh_rows
            ),

        "added_count":
            added_count,

        "skipped_count":
            skipped_count,

        "final_count":
            len(
                result
            ),

        "output_path":
            output_path,

        # update.py tento klíč očekává
        "current_path":
            profile_path,

        "season":
            season,

        # diagnostika
        "roster_count":
            len(
                roster
            ),

        "team_page_count":
            len(
                team_urls
            ),

        "scraped_player_count":
            scraped_player_count,

        "failed_player_count":
            failed_player_count,

        "unmatched_count":
            len(
                unmatched
            ),

        "unmatched_path":
            unmatched_path,

        "profile_path":
            profile_path,

        "detail_count":
            detail_count,

        "summary_count":
            summary_count,
    }