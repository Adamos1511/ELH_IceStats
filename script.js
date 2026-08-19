"use strict";

/* =========================================================
   ELH ICESTATS
   Kompletní frontendový řídicí modul
========================================================= */


/* =========================================================
   KONFIGURACE DAT
========================================================= */

const GITHUB_RAW =
  "https://raw.githubusercontent.com/Adamos1511/ELH_IceStats/refs/heads/main/";

const DATA_URLS = {
  players: `${GITHUB_RAW}hraciELH.csv`,
  playerDetails: `${GITHUB_RAW}hraci_detail.csv`,
  goalieDetails: `${GITHUB_RAW}brankari_detail.csv`,
  clubs: `${GITHUB_RAW}kluby.csv`,
  transfers: `${GITHUB_RAW}prestupy.csv`,
  standings: `${GITHUB_RAW}TabulkaELH.csv`,
  schedule: `${GITHUB_RAW}rozpis.csv`,
  careers: `${GITHUB_RAW}kariery.csv?v=20260817-career3`
};


/* =========================================================
   TÝMY ELH
========================================================= */

const TEAMS = [
  {
    code: "PCE",
    name: "HC Dynamo Pardubice",
    aliases: [
      "HC Dynamo Pardubice",
      "Dynamo Pardubice"
    ]
  },

  {
    code: "SPA",
    name: "HC Sparta Praha",
    aliases: [
      "HC Sparta Praha",
      "Sparta Praha"
    ]
  },

  {
    code: "TRI",
    name: "HC Oceláři Třinec",
    aliases: [
      "HC Oceláři Třinec",
      "Oceláři Třinec"
    ]
  },

  {
    code: "KOM",
    name: "HC Kometa Brno",
    aliases: [
      "HC Kometa Brno",
      "Kometa Brno"
    ]
  },

  {
    code: "PLZ",
    name: "HC Škoda Plzeň",
    aliases: [
      "HC Škoda Plzeň",
      "Škoda Plzeň"
    ]
  },

  {
    code: "MHK",
    name: "Mountfield HK",
    aliases: [
      "Mountfield HK",
      "HRA"
    ]
  },

  {
    code: "VIT",
    name: "HC Vítkovice Ridera",
    aliases: [
      "HC Vítkovice Ridera",
      "HC VÍTKOVICE RIDERA",
      "Vítkovice Ridera"
    ]
  },

  {
    code: "OLO",
    name: "HC Olomouc",
    aliases: [
      "HC Olomouc"
    ]
  },

  {
    code: "MBL",
    name: "BK Mladá Boleslav",
    aliases: [
      "BK Mladá Boleslav"
    ]
  },

  {
    code: "KVA",
    name: "HC Energie Karlovy Vary",
    aliases: [
      "HC Energie Karlovy Vary",
      "Energie Karlovy Vary"
    ]
  },

  {
    code: "CBU",
    name: "Banes Motor České Budějovice",
    aliases: [
      "Banes Motor České Budějovice",
      "Banes Motor Č. Budějovice",
      "Motor České Budějovice"
    ]
  },

  {
    code: "LIT",
    name: "HC Verva Litvínov",
    aliases: [
      "HC Litvínov",
      "HC Verva Litvínov",
      "HC VERVA Litvínov",
      "Verva Litvínov"
    ]
  },

  {
    code: "LIB",
    name: "Bílí Tygři Liberec",
    aliases: [
      "Bílí Tygři Liberec"
    ]
  },

  {
    code: "KLA",
    name: "Rytíři Kladno",
    aliases: [
      "Rytíři Kladno"
    ]
  }
];


/* =========================================================
   STAV APLIKACE
========================================================= */

const state = {
  currentPage: "home",
  history: [],
  routeIndex: 0,

  players: [],
  playerMap: new Map(),

  clubs: [],
  transfers: [],
  standings: [],
  schedule: [],

  skaterDetails: null,
  goalieDetails: null,

  careers: null,
  careerIndex: null,

  careerView: {
    rows: [],
    type: "skater",
    section: "KLUBOVA",
    league: "",
    phase: "ALL"
  },

  selectedPlayer: null,
  selectedClub: null,

  transferSlideIndex: 0,

statsView: {
  type: "skater",
  mode: "total",
  sortKey: "Body",
  sortDir: "desc",
  hiddenColumns: []
}
};


const PAGE_IDS = {
  home: "strankaMenu",
  players: "strankaHraci",
  playerDetail: "strankaDetailHrace",
  clubs: "kluby",
  clubDetail: "strankaDetailKlubu",
  statistics: "strankaStatistiky",
  table: "strankaTabulka",
  transfers: "strankaPrestupy",
  schedule: "strankaRozpis"
};


const collator = new Intl.Collator(
  "cs",
  {
    sensitivity: "base",
    numeric: true
  }
);


/* =========================================================
   OBECNÉ UTILITY
========================================================= */

function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
}


function normalize(value) {
  return cleanCell(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function toNumber(value) {
  const text =
    cleanCell(value)
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace("%", "");

  const parsed =
    Number.parseFloat(text);

  return Number.isFinite(parsed)
    ? parsed
    : NaN;
}


function getValue(
  object,
  wantedKey
) {
  if (!object) {
    return "";
  }

  const normalizedKey =
    normalize(wantedKey);

  const realKey =
    Object.keys(object).find(
      key =>
        normalize(key) ===
        normalizedKey
    );

  return realKey
    ? cleanCell(object[realKey])
    : "";
}


function uniqueSorted(values) {
  const map =
    new Map();

  values
    .map(cleanCell)
    .filter(Boolean)
    .forEach(value => {
      const key =
        normalize(value);

      if (!map.has(key)) {
        map.set(
          key,
          value
        );
      }
    });

  return [...map.values()]
    .sort(
      (a, b) =>
        collator.compare(a, b)
    );
}


function errorHtml(message) {
  return `
    <div class="error-card">
      <strong>
        Nepodařilo se načíst data.
      </strong>

      <span>
        ${escapeHtml(message)}
      </span>
    </div>
  `;
}


/* =========================================================
   URL ROUTING + SEO
========================================================= */

const SITE_ORIGIN =
  "https://elhicestats.cz";


const PAGE_PATHS = {
  home: "/",
  players: "/hraci",
  clubs: "/kluby",
  statistics: "/statistiky",
  table: "/tabulka",
  transfers: "/prestupy",
  schedule: "/rozpis"
};


const PAGE_SEO = {
  home: {
    title:
      "ELH IceStats | ELH 2026/27",

    description:
      "Kompletní databáze hráčů, statistik, klubů, tabulky, rozpisu a přestupů Tipsport extraligy."
  },

  players: {
    title:
      "Hráči ELH 2026/27 | ELH IceStats",

    description:
      "Přehled hráčů Tipsport extraligy 2026/27, jejich profily, statistiky a kariéry."
  },

  clubs: {
    title:
      "Kluby ELH 2026/27 | ELH IceStats",

    description:
      "Profily klubů Tipsport extraligy, soupisky, statistiky hráčů a klubové informace."
  },

  statistics: {
    title:
      "Statistiky ELH 2026/27 | ELH IceStats",

    description:
      "Kompletní statistiky hráčů a brankářů Tipsport extraligy 2026/27."
  },

  table: {
    title:
      "Tabulka ELH 2026/27 | ELH IceStats",

    description:
      "Aktuální tabulka Tipsport extraligy 2026/27."
  },

  transfers: {
    title:
      "Přestupy ELH | ELH IceStats",

    description:
      "Přehled přestupů hráčů v Tipsport extralize."
  },

  schedule: {
    title:
      "Rozpis ELH 2026/27 | ELH IceStats",

    description:
      "Kompletní rozpis zápasů Tipsport extraligy 2026/27."
  }
};


function slugify(value) {
  return normalize(value)
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}


function playerPath(player) {
  return (
    "/hraci/" +
    slugify(
      `${player.jmeno} ${player.prijmeni}`
    )
  );
}


function clubPath(value) {
  const team =
    getTeam(value);


  if (!team) {
    return "/kluby";
  }


  return (
    "/kluby/" +
    slugify(team.name)
  );
}


function currentPath() {
  const pathname =
    window.location.pathname
      .replace(
        /\/+$/,
        ""
      );


  return pathname || "/";
}


function setBrowserPath(
  path,
  {
    replace = false
  } = {}
) {
  const current =
    window.location.pathname +
    window.location.search;


  if (
    current === path
  ) {
    return;
  }


  if (replace) {
    window.history.replaceState(
      {
        iceStats: true,
        routeIndex:
          state.routeIndex
      },
      "",
      path
    );

    return;
  }


  state.routeIndex += 1;


  window.history.pushState(
    {
      iceStats: true,
      routeIndex:
        state.routeIndex
    },
    "",
    path
  );
}


function setSeo({
  title,
  description,
  path
}) {
  document.title =
    title;


  const descriptionMeta =
    document.querySelector(
      'meta[name="description"]'
    );


  if (descriptionMeta) {
    descriptionMeta.setAttribute(
      "content",
      description
    );
  }


  const canonical =
    document.querySelector(
      'link[rel="canonical"]'
    );


  if (canonical) {
    canonical.setAttribute(
      "href",
      `${SITE_ORIGIN}${path}`
    );
  }


  const ogTitle =
    document.querySelector(
      'meta[property="og:title"]'
    );


  if (ogTitle) {
    ogTitle.setAttribute(
      "content",
      title
    );
  }


  const ogDescription =
    document.querySelector(
      'meta[property="og:description"]'
    );


  if (ogDescription) {
    ogDescription.setAttribute(
      "content",
      description
    );
  }


  const ogUrl =
    document.querySelector(
      'meta[property="og:url"]'
    );


  if (ogUrl) {
    ogUrl.setAttribute(
      "content",
      `${SITE_ORIGIN}${path}`
    );
  }
}


function applyPageSeo(page) {
  const seo =
    PAGE_SEO[page];


  const path =
    PAGE_PATHS[page];


  if (
    !seo ||
    !path
  ) {
    return;
  }


  setSeo({
    ...seo,
    path
  });
}


function findPlayerBySlug(
  slug
) {
  return (
    state.players.find(player =>
      slugify(
        `${player.jmeno} ${player.prijmeni}`
      ) === slug
    ) ||
    null
  );
}


function findTeamBySlug(
  slug
) {
  return (
    TEAMS.find(team =>
      slugify(team.name) === slug ||
      slugify(team.code) === slug
    ) ||
    null
  );
}


/* =========================================================
   MAPOVÁNÍ TÝMŮ
========================================================= */

const teamLookup =
  new Map();


TEAMS.forEach(team => {
  [
    team.code,
    team.name,
    ...team.aliases
  ]
    .forEach(alias => {
      teamLookup.set(
        normalize(alias),
        team
      );
    });
});


function getTeam(value) {
  return (
    teamLookup.get(
      normalize(value)
    ) ||
    null
  );
}


function getTeamCode(value) {
  const team =
    getTeam(value);

  if (team) {
    return team.code;
  }

  return cleanCell(value);
}


function getTeamName(value) {
  const team =
    getTeam(value);

  if (team) {
    return team.name;
  }

  return cleanCell(value);
}


function logoUrl(value) {
  const code =
    getTeamCode(value);

  if (!code) {
    return "";
  }

  return (
    `${GITHUB_RAW}loga_tymu/` +
    `${encodeURIComponent(code)}.png`
  );
}


function teamButtonHtml(
  value,
  className = ""
) {
  const team =
    getTeam(value);

  if (!team) {
    return `
      <span class="${escapeHtml(className)}">
        ${escapeHtml(value || "-")}
      </span>
    `;
  }

  return `
    <button
      type="button"
      class="team-link-button ${escapeHtml(className)}"
      data-team-code="${escapeHtml(team.code)}"
    >
      ${escapeHtml(team.name)}
    </button>
  `;
}


/* =========================================================
   CSV
========================================================= */

async function fetchText(url) {
  const response =
    await fetch(
      url,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `${url}: HTTP ${response.status}`
    );
  }

  return response.text();
}


function parseObjectCsv(text) {
  const result =
    Papa.parse(
      text,
      {
        header: true,
        delimiter: ";",
        skipEmptyLines: "greedy",

        transformHeader(header) {
          return cleanCell(header);
        }
      }
    );


  if (result.errors?.length) {
    console.warn(
      "CSV upozornění:",
      result.errors
    );
  }


  return (result.data || [])
    .map(row => {
      const cleaned = {};

      Object.entries(row)
        .forEach(
          ([key, value]) => {
            cleaned[
              cleanCell(key)
            ] =
              cleanCell(value);
          }
        );

      return cleaned;
    });
}


async function loadObjectCsv(url) {
  const text =
    await fetchText(url);

  return parseObjectCsv(text);
}


/* =========================================================
   NAVIGACE
========================================================= */

function navigate(
  page,
  {
    push = true
  } = {}
) {
  const targetId =
    PAGE_IDS[page];

  if (!targetId) {
    return;
  }


  if (
    push &&
    state.currentPage &&
    state.currentPage !== page
  ) {
    state.history.push(
      state.currentPage
    );
  }


  document
    .querySelectorAll(
      ".app-page"
    )
    .forEach(element => {
      element.hidden =
        element.id !==
        targetId;
    });


  const appNav =
    document.getElementById(
      "appNav"
    );


  if (appNav) {
    appNav.hidden =
      page === "home";
  }


  state.currentPage =
    page;


  updateActiveNavigation();


  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}


function goBack() {
  const routeIndex =
    Number(
      window.history.state
        ?.routeIndex ||
      0
    );


  /*
   * Pokud jsme se uvnitř IceStats
   * už někam proklikli, použijeme
   * skutečnou historii prohlížeče.
   */
  if (routeIndex > 0) {
    window.history.back();
    return;
  }


  /*
   * Pokud někdo přišel přímo
   * například z Googlu na profil,
   * tlačítko Zpět ho nevyhodí
   * z webu, ale vrátí na seznam.
   */
  let fallback =
    "home";


  if (
    state.currentPage ===
    "playerDetail"
  ) {
    fallback =
      "players";
  }


  if (
    state.currentPage ===
    "clubDetail"
  ) {
    fallback =
      "clubs";
  }


  handleNavigation(
    fallback,
    {
      replaceUrl: true
    }
  );
}


function activeNavigationPage() {
  switch (state.currentPage) {
    case "playerDetail":
      return "players";

    case "clubDetail":
      return "clubs";

    default:
      return state.currentPage;
  }
}


function updateActiveNavigation() {
  const active =
    activeNavigationPage();

  document
    .querySelectorAll(
      "[data-nav]"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.nav ===
          active
      );
    });
}


async function handleNavigation(
  target,
  {
    updateUrl = true,
    replaceUrl = false
  } = {}
) {
  switch (target) {

    case "home":
      navigate(
        "home",
        {
          push: false
        }
      );

      break;


    case "players":
      navigate(
        "players",
        {
          push: false
        }
      );

      if (!state.players.length) {
        await loadPlayers();
      }

      renderPlayers();

      break;


    case "clubs":
      navigate(
        "clubs",
        {
          push: false
        }
      );

      if (!state.clubs.length) {
        await loadClubs();
      }

      renderClubs();

      break;


    case "statistics":
      navigate(
        "statistics",
        {
          push: false
        }
      );

      await loadDetailData(
        state.statsView.type
      );

      populateStatisticsFilters();
      renderStatistics();

      break;


    case "table":
      navigate(
        "table",
        {
          push: false
        }
      );

      if (!state.standings.length) {
        await loadStandings();
      }

      renderStandings();

      break;


    case "transfers":
      navigate(
        "transfers",
        {
          push: false
        }
      );

      if (!state.transfers.length) {
        await loadTransfers();
      }

      renderTransfers();

      break;


    case "schedule":
      navigate(
        "schedule",
        {
          push: false
        }
      );

      if (!state.schedule.length) {
        await loadSchedule();
      }

      renderSchedule();

      break;


    default:
      return;
  }


  if (
    updateUrl &&
    PAGE_PATHS[target]
  ) {
    setBrowserPath(
      PAGE_PATHS[target],
      {
        replace:
          replaceUrl
      }
    );
  }


  applyPageSeo(
    target
  );
}


/* =========================================================
   HRÁČI – NAČTENÍ
========================================================= */

async function loadPlayers() {
  const text =
    await fetchText(
      DATA_URLS.players
    );


  const parsed =
    Papa.parse(
      text,
      {
        delimiter: ";",
        skipEmptyLines: "greedy"
      }
    );


  const rows =
    parsed.data || [];


  let startIndex = 0;


  if (
    rows.length &&
    normalize(
      rows[0]?.[0]
    ).includes("jmeno")
  ) {
    startIndex = 1;
  }


  state.players =
    rows
      .slice(startIndex)
      .filter(row =>
        cleanCell(row?.[0]) &&
        cleanCell(row?.[1])
      )
      .map(row => ({
        jmeno:
          cleanCell(row[0]),

        prijmeni:
          cleanCell(row[1]),

        smlouva:
          cleanCell(row[2]),

        pozice:
          cleanCell(row[3]),

        tym:
          cleanCell(row[4]),

        vek:
          cleanCell(row[5]),

        drzeni:
          cleanCell(row[6]),

        narodnost:
          cleanCell(row[7]),

        foto:
          cleanCell(row[8]),

        zdroj:
          cleanCell(row[9])
      }));


  state.playerMap.clear();


  state.players
    .forEach(player => {
      state.playerMap.set(
        playerKey(player),
        player
      );
    });


  populatePlayerFilters();
  renderPlayers();
}


function playerKey(player) {
  return [
    normalize(player.jmeno),
    normalize(player.prijmeni),
    normalize(
      getTeamCode(
        player.tym
      )
    )
  ].join("|");
}


/* =========================================================
   HRÁČI – FILTRY
========================================================= */

function populateSelect(
  select,
  items,
  placeholder
) {
  if (!select) {
    return;
  }


  const selected =
    select.value;


  select.innerHTML = `
    <option value="">
      ${escapeHtml(placeholder)}
    </option>
  `;


  items
    .forEach(item => {
      const value =
        typeof item ===
          "string"
          ? item
          : item.value;

      const label =
        typeof item ===
          "string"
          ? item
          : item.label;


      const option =
        document.createElement(
          "option"
        );


      option.value =
        value;

      option.textContent =
        label;


      select.appendChild(
        option
      );
    });


  if (
    [...select.options]
      .some(
        option =>
          option.value ===
          selected
      )
  ) {
    select.value =
      selected;
  }
}


function populatePlayerFilters() {
  populateSelect(
    document.getElementById(
      "filtrTymu"
    ),
    TEAMS.map(team => ({
      value: team.code,
      label: team.name
    })),
    "Všechny týmy"
  );


  populateSelect(
    document.getElementById(
      "filtrPozice"
    ),
    uniqueSorted(
      state.players.map(
        player =>
          player.pozice
      )
    ),
    "Všechny pozice"
  );


  populateSelect(
    document.getElementById(
      "filtrDrzeni"
    ),
    uniqueSorted(
      state.players.map(
        player =>
          player.drzeni
      )
    ),
    "Všechna držení"
  );


  populateSelect(
    document.getElementById(
      "filtrNarodnost"
    ),
    uniqueSorted(
      state.players.map(
        player =>
          player.narodnost
      )
    ),
    "Všechny národnosti"
  );


  populateSelect(
    document.getElementById(
      "filtrSmlouva"
    ),
    uniqueSorted(
      state.players.map(
        player =>
          player.smlouva
      )
    ),
    "Všechny smlouvy"
  );
}


function contractRank(contract) {
  const text =
    cleanCell(contract);


  if (!text) {
    return (
      Number.POSITIVE_INFINITY
    );
  }


  const match =
    text.match(
      /(\d{2,4})\s*\/\s*(\d{2,4})(?:\s*\+\s*(\d+))?/
    );


  if (!match) {
    return (
      Number.POSITIVE_INFINITY
    );
  }


  let endYear =
    Number(match[2]);


  if (endYear < 100) {
    endYear += 2000;
  }


  return (
    endYear +
    Number(match[3] || 0)
  );
}


function renderPlayers() {
  const container =
    document.getElementById(
      "hraci"
    );

  const counter =
    document.getElementById(
      "pocetHracu"
    );


  if (!container) {
    return;
  }


  const search =
    normalize(
      document.getElementById(
        "vyhledavani"
      )?.value
    );


  const team =
    cleanCell(
      document.getElementById(
        "filtrTymu"
      )?.value
    );


  const position =
    normalize(
      document.getElementById(
        "filtrPozice"
      )?.value
    );


  const stick =
    normalize(
      document.getElementById(
        "filtrDrzeni"
      )?.value
    );


  const nationality =
    normalize(
      document.getElementById(
        "filtrNarodnost"
      )?.value
    );


  const contract =
    normalize(
      document.getElementById(
        "filtrSmlouva"
      )?.value
    );


  const sort =
    cleanCell(
      document.getElementById(
        "razeni"
      )?.value
    );


  let data =
    state.players
      .filter(player => {
        const searchTarget =
          normalize(
            [
              player.jmeno,
              player.prijmeni,
              player.tym,
              getTeamName(
                player.tym
              ),
              player.pozice,
              player.narodnost
            ].join(" ")
          );


        return (
          (
            !search ||
            searchTarget.includes(
              search
            )
          ) &&

          (
            !team ||
            getTeamCode(
              player.tym
            ) === team
          ) &&

          (
            !position ||
            normalize(
              player.pozice
            ) === position
          ) &&

          (
            !stick ||
            normalize(
              player.drzeni
            ) === stick
          ) &&

          (
            !nationality ||
            normalize(
              player.narodnost
            ) === nationality
          ) &&

          (
            !contract ||
            normalize(
              player.smlouva
            ) === contract
          )
        );
      });


  data =
    [...data];


  data.sort(
    (a, b) => {
      switch (sort) {
        case "prijmeni_az":
          return collator.compare(
            a.prijmeni,
            b.prijmeni
          );

        case "prijmeni_za":
          return collator.compare(
            b.prijmeni,
            a.prijmeni
          );

        case "vek_asc":
          return (
            (
              toNumber(a.vek) ||
              999
            ) -
            (
              toNumber(b.vek) ||
              999
            )
          );

        case "vek_desc":
          return (
            (
              toNumber(b.vek) ||
              -1
            ) -
            (
              toNumber(a.vek) ||
              -1
            )
          );

        case "tym_az":
          return collator.compare(
            getTeamName(a.tym),
            getTeamName(b.tym)
          );

        case "tym_za":
          return collator.compare(
            getTeamName(b.tym),
            getTeamName(a.tym)
          );

        case "pozice_az":
          return collator.compare(
            a.pozice,
            b.pozice
          );

        case "pozice_za":
          return collator.compare(
            b.pozice,
            a.pozice
          );

        case "narodnost_az":
          return collator.compare(
            a.narodnost,
            b.narodnost
          );

        case "narodnost_za":
          return collator.compare(
            b.narodnost,
            a.narodnost
          );

        case "smlouva_asc":
          return (
            contractRank(
              a.smlouva
            ) -
            contractRank(
              b.smlouva
            )
          );

        case "smlouva_desc":
          return (
            contractRank(
              b.smlouva
            ) -
            contractRank(
              a.smlouva
            )
          );

        default:
          return collator.compare(
            a.prijmeni,
            b.prijmeni
          );
      }
    }
  );


  if (counter) {
    counter.textContent =
      `${data.length} hráčů`;
  }


  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        Žádní hráči neodpovídají zvoleným filtrům.
      </div>
    `;

    return;
  }


  container.innerHTML =
    data
      .map(player => {
        const key =
          playerKey(player);

        const code =
          getTeamCode(
            player.tym
          );


        return `
          <button
            type="button"
            class="hrac-radek"
            data-player-key="${escapeHtml(key)}"
          >

            <span class="hrac-foto-mini">
              ${
                player.foto
                  ? `
                    <img
                      src="${escapeHtml(player.foto)}"
                      alt="${escapeHtml(
                        `${player.jmeno} ${player.prijmeni}`
                      )}"
                      loading="lazy"
                      data-hide-on-error
                    >
                  `
                  : `
                    <span class="foto-mini-placeholder"></span>
                  `
              }
            </span>


            <span class="hrac-jmeno">

              <strong>
                ${escapeHtml(player.jmeno)}
                ${escapeHtml(player.prijmeni)}
              </strong>

              <small>
                ${escapeHtml(
                  player.narodnost ||
                  "-"
                )}
              </small>

            </span>


            <span class="hrac-tym">

              ${
                code
                  ? `
                    <img
                      src="${escapeHtml(
                        logoUrl(code)
                      )}"
                      alt=""
                      class="logoMale"
                      data-hide-on-error
                    >
                  `
                  : ""
              }

              <strong>
                ${escapeHtml(
                  code || "-"
                )}
              </strong>

            </span>


            <span class="hrac-pozice">
              ${escapeHtml(
                player.pozice ||
                "-"
              )}
            </span>


            <span class="hrac-vek">
              ${
                player.vek
                  ? `${escapeHtml(player.vek)} let`
                  : "-"
              }
            </span>


            <span class="hrac-smlouva">
              ${escapeHtml(
                player.smlouva ||
                "-"
              )}
            </span>

          </button>
        `;
      })
      .join("");
}


/* =========================================================
   DETAIL HRÁČE / BRANKÁŘE
========================================================= */

function isGoaliePosition(value) {
  const position =
    normalize(value);

  return [
    "b",
    "g",
    "gk",
    "brankar",
    "brankac",
    "goalie",
    "goaltender"
  ].includes(position);
}


async function loadDetailData(type) {
  if (
    type === "goalie" &&
    state.goalieDetails
  ) {
    return state.goalieDetails;
  }


  if (
    type === "skater" &&
    state.skaterDetails
  ) {
    return state.skaterDetails;
  }


  const url =
    type === "goalie"
      ? DATA_URLS.goalieDetails
      : DATA_URLS.playerDetails;


  const data =
    await loadObjectCsv(url);


  if (type === "goalie") {
    state.goalieDetails =
      data;
  } else {
    state.skaterDetails =
      data;
  }


  return data;
}


function findDetailRecord(
  dataset,
  player
) {
  const candidates =
    dataset.filter(record =>
      normalize(
        getValue(
          record,
          "Jméno"
        )
      ) ===
        normalize(
          player.jmeno
        ) &&

      normalize(
        getValue(
          record,
          "Příjmení"
        )
      ) ===
        normalize(
          player.prijmeni
        )
    );


  if (!candidates.length) {
    return null;
  }


  if (
    candidates.length === 1
  ) {
    return candidates[0];
  }


  const wantedTeam =
    getTeamCode(
      player.tym
    );


  return (
    candidates.find(record =>
      getTeamCode(
        getValue(
          record,
          "Tým"
        )
      ) === wantedTeam
    ) ||
    candidates[0]
  );
}


async function openPlayer(
  player,
  {
    updateUrl = true,
    replaceUrl = false
  } = {}
) {
  if (!player) {
    return;
  }


  state.selectedPlayer =
    player;


  const path =
    playerPath(player);


  if (updateUrl) {
    setBrowserPath(
      path,
      {
        replace:
          replaceUrl
      }
    );
  }


  const fullName =
    `${player.jmeno} ${player.prijmeni}`;


  const teamName =
    getTeamName(
      player.tym
    );


  setSeo({
    title:
      `${fullName} – statistiky a kariéra | ELH IceStats`,

    description:
      `${fullName} – profil hráče, aktuální statistiky, kariéra a informace${teamName ? `, ${teamName}` : ""}.`,

    path
  });


  navigate(
    "playerDetail",
    {
      push: false
    }
  );


  const container =
    document.getElementById(
      "detailHraceObsah"
    );


  if (container) {
    container.innerHTML = `
      <div class="loading-card">
        Načítám profil...
      </div>
    `;
  }


  try {
    await renderPlayerDetail(
      player
    );

  } catch (error) {
    console.error(error);

    if (container) {
      container.innerHTML =
        errorHtml(
          error.message
        );
    }
  }
}


async function openPlayerByName(
  firstName,
  surname,
  options = {}
) {
  if (!state.players.length) {
    try {
      await loadPlayers();
    } catch (error) {
      console.error(error);
    }
  }


  const basePlayer =
    state.players.find(player =>
      normalize(
        player.jmeno
      ) ===
        normalize(firstName) &&

      normalize(
        player.prijmeni
      ) ===
        normalize(surname)
    );


  if (basePlayer) {
    await openPlayer(
  basePlayer,
  options
);

    return;
  }


  const [
    skaters,
    goalies
  ] =
    await Promise.all([
      loadDetailData(
        "skater"
      ),

      loadDetailData(
        "goalie"
      )
    ]);


  const skater =
    skaters.find(record =>
      normalize(
        getValue(
          record,
          "Jméno"
        )
      ) ===
        normalize(firstName) &&

      normalize(
        getValue(
          record,
          "Příjmení"
        )
      ) ===
        normalize(surname)
    );


  const goalie =
    goalies.find(record =>
      normalize(
        getValue(
          record,
          "Jméno"
        )
      ) ===
        normalize(firstName) &&

      normalize(
        getValue(
          record,
          "Příjmení"
        )
      ) ===
        normalize(surname)
    );


  const detail =
    skater ||
    goalie;


  if (!detail) {
    alert(
      "Profil tohoto hráče zatím není v databázi."
    );

    return;
  }


  const goalieProfile =
    Boolean(goalie);


  const player = {
    jmeno:
      getValue(
        detail,
        "Jméno"
      ) ||
      firstName,

    prijmeni:
      getValue(
        detail,
        "Příjmení"
      ) ||
      surname,

    smlouva:
      getValue(
        detail,
        "Smlouva"
      ),

    pozice:
      goalieProfile
        ? "Brankář"
        : getValue(
            detail,
            "Pozice"
          ),

    tym:
      getValue(
        detail,
        "Tým"
      ),

    vek:
      getValue(
        detail,
        "Věk"
      ),

    drzeni:
      getValue(
        detail,
        "Držení hole"
      ),

    narodnost:
      getValue(
        detail,
        "Národnost"
      ),

    foto:
      getValue(
        detail,
        "Foto"
      ),

    zdroj: "",

    __detailType:
      goalieProfile
        ? "goalie"
        : "skater"
  };


  await openPlayer(
  player,
  options
);
}


function hiddenPlayerFields() {
  return new Set(
    [
      "foto",
      "jmeno",
      "prijmeni",
      "smlouva",
      "pozice",
      "tym",
      "vek",
      "drzeni hole",
      "narodnost",
      "vyska (cm)",
      "vaha (kg)",
      "profil hrace"
    ].map(normalize)
  );
}


function playerStatType(
  key,
  value
) {
  const normalizedKey =
    normalize(key);

  const number =
    toNumber(value);


  if (
    [
      "body",
      "goly"
    ].includes(
      normalizedKey
    )
  ) {
    return "stat-star";
  }


  if (
    normalizedKey.includes(
      "casu na lede"
    )
  ) {
    return "stat-toi";
  }


  if (
    normalizedKey === "hity" ||
    normalizedKey === "bloky"
  ) {
    return "stat-physical";
  }


  if (
    Number.isFinite(number)
  ) {
    if (
      normalizedKey.includes(
        "body na zapas"
      ) &&
      number >= 0.7
    ) {
      return "stat-elite";
    }


    if (
      normalizedKey.includes(
        "uspesnost strelby"
      ) &&
      number >= 12
    ) {
      return "stat-elite";
    }


    if (
      normalizedKey.includes(
        "+/-"
      ) &&
      number < 0
    ) {
      return "stat-bad";
    }
  }


  return "";
}


function statSupportsProgress(
  key,
  type
) {
  const normalizedKey =
    normalize(key);


  const goalieStats = [
    "odchytane zapasy",
    "odchytane minuty",
    "vyhry",
    "% zakroku",
    "uspesnost zakroku",
    "cista konta",
    "zakroky",
    "strel proti",
    "prumer strel na zapas",
    "prumer obdrzenych branek"
  ];


  const playerStats = [
    "body",
    "goly",
    "asistence",
    "hity",
    "bloky",
    "body na zapas",
    "uspesnost strelby",
    "uspesnost vhazovani"
  ];


  const list =
    type === "goalie"
      ? goalieStats
      : playerStats;


  return list.some(item =>
    normalizedKey.includes(
      normalize(item)
    )
  );
}


function statProgress(
  dataset,
  key,
  value,
  type
) {
  if (
    !statSupportsProgress(
      key,
      type
    )
  ) {
    return 0;
  }


  const current =
    toNumber(value);


  if (
    !Number.isFinite(
      current
    )
  ) {
    return 0;
  }


  const values =
    dataset
      .map(record =>
        toNumber(
          getValue(
            record,
            key
          )
        )
      )
      .filter(
        Number.isFinite
      );


  if (!values.length) {
    return 0;
  }


  const normalizedKey =
    normalize(key);


  if (
    normalizedKey.includes(
      "prumer obdrzenych branek"
    )
  ) {
    const positives =
      values.filter(
        number =>
          number > 0
      );


    if (
      !positives.length ||
      current <= 0
    ) {
      return 0;
    }


    return Math.min(
      100,
      (
        Math.min(
          ...positives
        ) /
        current
      ) * 100
    );
  }


  const maximum =
    Math.max(
      ...values
    );


  if (maximum <= 0) {
    return 0;
  }


  return Math.min(
    100,
    (
      current /
      maximum
    ) * 100
  );
}


function formatStatValue(
  key,
  value
) {
  const text =
    cleanCell(value);


  if (
    key.includes("%") &&
    text &&
    !text.includes("%")
  ) {
    return `${text} %`;
  }


  return text;
}


/* =========================================================
   KARIÉRA HRÁČE / BRANKÁŘE
========================================================= */

function careerPlayerKey(
  firstName,
  surname
) {
  return [
    normalize(firstName),
    normalize(surname)
  ].join("|");
}


/* =========================================================
   KARIÉRA – SEZONA
========================================================= */

function careerSeasonRank(value) {
  const text =
    cleanCell(value);


  const longYear =
    text.match(
      /\b((?:19|20)\d{2})\b/
    );


  if (longYear) {
    return Number(
      longYear[1]
    );
  }


  const shortYear =
    text.match(
      /\b(\d{2})\s*[\/.\-]\s*(\d{2})\b/
    );


  if (shortYear) {
    const first =
      Number(
        shortYear[1]
      );

    return (
      first >= 70
        ? 1900 + first
        : 2000 + first
    );
  }


  return 0;
}


/* =========================================================
   KARIÉRA – IDENTITA PROFILU
========================================================= */

function careerProfileIdentity(
  row
) {
  return normalize(
    getValue(
      row,
      "Profil URL"
    ) ||
    getValue(
      row,
      "Kariéra URL"
    )
  );
}


function careerExplicitType(
  row
) {
  return normalize(
    getValue(
      row,
      "Typ hráče"
    )
  );
}


function careerTypeMatches(
  row,
  type
) {
  const raw =
    careerExplicitType(row);


  if (!raw) {
    return true;
  }


  if (
    type === "goalie"
  ) {
    return (
      raw.includes(
        "brankar"
      ) ||
      raw.includes(
        "goalie"
      ) ||
      raw.includes(
        "goaltender"
      )
    );
  }


  return (
    raw.includes("hrac") ||
    raw.includes("skater") ||
    raw.includes("utocnik") ||
    raw.includes("obrance")
  );
}


/* =========================================================
   KARIÉRA – TYP ŘÁDKU
========================================================= */

function careerRowType(row) {
  const rawType =
    normalize(
      getValue(
        row,
        "Typ řádku"
      )
    );


  const season =
    cleanCell(
      getValue(
        row,
        "Sezona"
      )
    );


  const seasonNormalized =
    normalize(season);


  const club =
    getValue(
      row,
      "Klub"
    ) ||
    getValue(
      row,
      "Tým"
    );


  const clubCount =
    getValue(
      row,
      "Počet klubů"
    );


  /*
   * Pokud je typ řádku přímo v CSV,
   * věříme mu přednostně.
   */
  if (
    rawType.includes(
      "souhrn"
    ) ||
    rawType.includes(
      "summary"
    ) ||
    rawType.includes(
      "total"
    )
  ) {
    return "SOUHRN";
  }


  if (
    rawType.includes(
      "detail"
    )
  ) {
    return "DETAIL";
  }


  /*
   * Hokej.cz používá u souhrnů
   * často Vše / Celkem.
   */
  if (
    [
      "vse",
      "vsechny",
      "celkem",
      "souhrn",
      "total",
      "career"
    ].includes(
      seasonNormalized
    )
  ) {
    return "SOUHRN";
  }


  /*
   * Reálný rok sezony = DETAIL.
   */
  if (
    careerSeasonRank(
      season
    ) > 0
  ) {
    return "DETAIL";
  }


  /*
   * Počet klubů je znak souhrnu.
   */
  if (
    clubCount &&
    !club
  ) {
    return "SOUHRN";
  }


  /*
   * Starší CSV nemuselo mít Typ řádku.
   * Konkrétní klub tedy bereme jako detail.
   */
  if (
    club &&
    club !== "-"
  ) {
    return "DETAIL";
  }


  return "SOUHRN";
}


/* =========================================================
   KARIÉRA – NORMALIZACE
========================================================= */

function normalizeCareerRecord(
  row
) {
  const sectionRaw =
    normalize(
      getValue(
        row,
        "Sekce"
      )
    );


  const section =
    sectionRaw.includes(
      "repre"
    )
      ? "REPREZENTACE"
      : "KLUBOVA";


  const competition =
    getValue(
      row,
      "Soutěž"
    ) ||
    getValue(
      row,
      "Liga"
    );


  const club =
    getValue(
      row,
      "Klub"
    ) ||
    getValue(
      row,
      "Tým"
    );


  return {
    ...row,

    __careerSection:
      section,

    __careerRowType:
      careerRowType(
        row
      ),

    __careerCompetition:
      competition,

    __careerClub:
      club,

    __careerProfile:
      careerProfileIdentity(
        row
      )
  };
}


function careerFingerprint(row) {
  const keys = [
    "Sekce",
    "Typ řádku",
    "Typ hráče",
    "Pořadí",
    "Sezona",
    "Soutěž",
    "Liga",
    "Klub",
    "Tým",
    "Počet klubů",

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

    "Profil URL",
    "Kariéra URL"
  ];


  return keys
    .map(key =>
      normalize(
        getValue(
          row,
          key
        )
      )
    )
    .join("|");
}


/* =========================================================
   KARIÉRA – NAČTENÍ
========================================================= */

async function loadCareers() {
  if (state.careers) {
    return state.careers;
  }


  const rows =
    await loadObjectCsv(
      DATA_URLS.careers
    );


  state.careers =
    rows
      .filter(row =>
        getValue(
          row,
          "Jméno"
        ) &&
        getValue(
          row,
          "Příjmení"
        )
      )
      .map(
        normalizeCareerRecord
      );


  state.careerIndex =
    new Map();


  state.careers
    .forEach(row => {
      const key =
        careerPlayerKey(
          getValue(
            row,
            "Jméno"
          ),
          getValue(
            row,
            "Příjmení"
          )
        );


      if (
        !state.careerIndex
          .has(key)
      ) {
        state.careerIndex.set(
          key,
          []
        );
      }


      state.careerIndex
        .get(key)
        .push(row);
    });


  console.info(
    "Kariéry načteny:",
    state.careers.length
  );


  return state.careers;
}


/* =========================================================
   KARIÉRA – VÝBĚR SPRÁVNÉHO PROFILU
========================================================= */

function careerSelectCorrectProfile(
  rows,
  team
) {
  const profileIds =
    new Set(
      rows
        .map(
          careerProfileIdentity
        )
        .filter(Boolean)
    );


  /*
   * Jeden profil = nefiltrujeme podle týmu.
   * Tohle je zásadní, aby se neztratila
   * historická kariéra.
   */
  if (
    profileIds.size <= 1
  ) {
    return rows;
  }


  const wantedTeam =
    getTeamCode(team);


  if (!wantedTeam) {
    return rows;
  }


  const scores =
    new Map();


  rows.forEach(row => {
    const profile =
      careerProfileIdentity(
        row
      );


    if (!profile) {
      return;
    }


    if (
      !scores.has(
        profile
      )
    ) {
      scores.set(
        profile,
        0
      );
    }


    const rowTeam =
      getTeamCode(
        getValue(
          row,
          "Tým ELH"
        )
      );


    if (
      rowTeam ===
      wantedTeam
    ) {
      scores.set(
        profile,
        scores.get(
          profile
        ) + 1
      );
    }
  });


  if (!scores.size) {
    return rows;
  }


  const sorted =
    [...scores.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      );


  if (
    !sorted.length ||
    sorted[0][1] <= 0
  ) {
    return rows;
  }


  const selectedProfile =
    sorted[0][0];


  return rows.filter(row => {
    const id =
      careerProfileIdentity(
        row
      );

    return (
      !id ||
      id === selectedProfile
    );
  });
}


/* =========================================================
   KARIÉRA – ŘÁDKY HRÁČE
========================================================= */

async function getPlayerCareerRows(
  firstName,
  surname,
  team,
  type
) {
  await loadCareers();


  const key =
    careerPlayerKey(
      firstName,
      surname
    );


  let rows =
    [
      ...(
        state.careerIndex
          ?.get(key) ||
        []
      )
    ];


  if (!rows.length) {
    return [];
  }


  /*
   * Rozlišení hráče a brankáře.
   * Použije se jen pokud Typ hráče
   * v CSV skutečně existuje.
   */
  const typedRows =
    rows.filter(row =>
      careerExplicitType(
        row
      )
    );


  if (typedRows.length) {
    const matchingTyped =
      typedRows.filter(row =>
        careerTypeMatches(
          row,
          type
        )
      );


    if (
      matchingTyped.length
    ) {
      rows =
        rows.filter(row =>
          !careerExplicitType(
            row
          ) ||
          careerTypeMatches(
            row,
            type
          )
        );
    }
  }


  /*
   * Tým používáme pouze pro případ
   * stejného jména dvou různých lidí.
   *
   * NIKDY už podle aktuálního týmu
   * nefiltrujeme jednotlivé sezony.
   */
  rows =
    careerSelectCorrectProfile(
      rows,
      team
    );


  /*
   * Odstranění přesných duplicit.
   */
  const unique =
    new Map();


  rows.forEach(row => {
    const fingerprint =
      careerFingerprint(
        row
      );


    if (
      !unique.has(
        fingerprint
      )
    ) {
      unique.set(
        fingerprint,
        row
      );
    }
  });


  rows =
    [...unique.values()];


  /*
   * Stabilní pořadí.
   */
  rows.sort(
    (a, b) => {
      const aOrder =
        toNumber(
          getValue(
            a,
            "Pořadí"
          )
        );

      const bOrder =
        toNumber(
          getValue(
            b,
            "Pořadí"
          )
        );


      if (
        Number.isFinite(
          aOrder
        ) &&
        Number.isFinite(
          bOrder
        ) &&
        aOrder !== bOrder
      ) {
        return (
          aOrder -
          bOrder
        );
      }


      return (
        careerSeasonRank(
          getValue(
            b,
            "Sezona"
          )
        ) -
        careerSeasonRank(
          getValue(
            a,
            "Sezona"
          )
        )
      );
    }
  );


  return rows;
}


/* =========================================================
   KARIÉRA – HODNOTY
========================================================= */

function careerGetValue(
  row,
  key
) {
  if (
    key === "Soutěž"
  ) {
    return (
      row.__careerCompetition ||
      "-"
    );
  }


  if (
    key === "Klub"
  ) {
    return (
      row.__careerClub ||
      "-"
    );
  }


  const value =
    getValue(
      row,
      key
    );


  if (
    key === "Z%" &&
    value &&
    !value.includes("%")
  ) {
    return `${value} %`;
  }


  return value || "-";
}


function careerSectionRows(
  section,
  rowType
) {
  return state.careerView.rows
    .filter(row =>
      row.__careerSection ===
        section &&
      row.__careerRowType ===
        rowType
    );
}


/* =========================================================
   KARIÉRA – FÁZE
========================================================= */

function careerPhase(row) {
  const text =
    normalize(
      [
        getValue(
          row,
          "Fáze"
        ),

        getValue(
          row,
          "Část"
        ),

        row.__careerCompetition
      ].join(" ")
    );


  if (
    text.includes(
      "play off"
    ) ||
    text.includes(
      "play-off"
    ) ||
    text.includes(
      "playoff"
    ) ||
    text.includes(
      "playoffs"
    ) ||
    text.includes(
      "vyrazovaci"
    )
  ) {
    return "PLAYOFF";
  }


  return "REGULAR";
}


/* =========================================================
   KARIÉRA – LIGY
========================================================= */

function careerBaseLeagueName(
  value
) {
  return cleanCell(value)
    .replace(
      /\(\s*play[\s-]*offs?\s*\)/gi,
      ""
    )
    .replace(
      /\bplay[\s-]*offs?\b/gi,
      ""
    )
    .replace(
      /\bzákladní část\b/gi,
      ""
    )
    .replace(
      /\bregular season\b/gi,
      ""
    )
    .replace(
      /\bnadstavba\b/gi,
      ""
    )
    .replace(
      /\s*[–—:/-]\s*$/g,
      ""
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .trim();
}


function careerLeagueKey(value) {
  const raw =
    normalize(
      cleanCell(value)
    )
      .replace(/\s+/g, " ")
      .trim();

  const base =
    normalize(
      careerBaseLeagueName(value)
    )
      .replace(/\s+/g, " ")
      .trim();

  const text =
    base || raw;


  if (!text) {
    return "";
  }


  // NHL
  if (
    /\bnhl\b/.test(text)
  ) {
    return "nhl";
  }


  // AHL
  if (
    /\bahl\b/.test(text)
  ) {
    return "ahl";
  }


  // KHL
  if (
    /\bkhl\b/.test(text)
  ) {
    return "khl";
  }


  // SHL
  if (
    /\bshl\b/.test(text)
  ) {
    return "shl";
  }


  // Finská Liiga
  if (
    text.includes("liiga")
  ) {
    return "liiga";
  }


  /*
   * SLOVENSKÁ EXTRALIGA
   *
   * Musí být vyhodnocena před českou.
   */
  if (
    (
      text.includes("slovensk") &&
      text.includes("extralig")
    ) ||

    (
      text.includes("tipos") &&
      text.includes("extralig")
    ) ||

    text.includes(
      "extraliga sr"
    )
  ) {
    return "sk-extraliga";
  }


  /*
   * ČESKÁ EXTRALIGA + PLAY OFF ELH
   *
   * Všechny tyto názvy budou jedna liga:
   *
   * Tipsport extraliga
   * Play off Tipsport extraligy
   * Generali Česká pojišťovna play off
   * O2 extraliga
   *
   * POZOR:
   * Generali Česká Cup – play off
   * sem NEPATŘÍ.
   */
  if (
    raw.includes(
      "generali ceska pojistovna play off"
    ) ||

    raw.includes(
      "play off tipsport extralig"
    ) ||

    text === "elh" ||

    text === "telh" ||

    text.includes(
      "tipsport extralig"
    ) ||

    text.includes(
      "o2 extralig"
    ) ||

    text.includes(
      "ceska extralig"
    ) ||

    text.includes(
      "extraliga cr"
    ) ||

    (
      text.includes("extralig") &&
      !text.includes("slovensk") &&
      !text.includes("tipos")
    )
  ) {
    return "cz-extraliga";
  }


  /*
   * ČESKÁ 1. LIGA
   */
  if (
    text.includes(
      "maxa liga"
    ) ||

    text.includes(
      "chance liga"
    ) ||

    text.includes(
      "wsm liga"
    ) ||

    text === "1. liga" ||

    text === "1 liga"
  ) {
    return "cz-1-liga";
  }


  return text;
}


function careerLeagueLabel(
  key,
  rows
) {
  const known = {
    "cz-extraliga":
      "Extraliga",

    "sk-extraliga":
      "Slovenská extraliga",

    "cz-1-liga":
      "1. liga",

    nhl:
      "NHL",

    ahl:
      "AHL",

    khl:
      "KHL",

    shl:
      "SHL",

    liiga:
      "Liiga"
  };


  if (known[key]) {
    return known[key];
  }


  const row =
    rows.find(item =>
      careerLeagueKey(
        item.__careerCompetition
      ) === key
    );


  return (
    careerBaseLeagueName(
      row?.__careerCompetition
    ) ||
    key
  );
}


function careerLeagueOptions(
  rows
) {
  const leagues =
    new Map();


  rows.forEach(row => {
    const key =
      careerLeagueKey(
        row.__careerCompetition
      );


    if (!key) {
      return;
    }


    const season =
      careerSeasonRank(
        getValue(
          row,
          "Sezona"
        )
      );


    if (!leagues.has(key)) {
      leagues.set(
        key,
        {
          key,
          latestSeason:
            season
        }
      );

      return;
    }


    const existing =
      leagues.get(key);


    existing.latestSeason =
      Math.max(
        existing.latestSeason,
        season
      );
  });


  return [...leagues.values()]
    .map(item => ({
      ...item,

      label:
        careerLeagueLabel(
          item.key,
          rows
        )
    }))
    .sort(
      (a, b) => {
        const seasonDifference =
          b.latestSeason -
          a.latestSeason;


        if (
          seasonDifference
        ) {
          return (
            seasonDifference
          );
        }


        return collator.compare(
          a.label,
          b.label
        );
      }
    );
}


function careerLeagueRows(
  rows,
  leagueKey
) {
  return rows.filter(row =>
    careerLeagueKey(
      row.__careerCompetition
    ) === leagueKey
  );
}


function careerFindSummaryRow(
  rows,
  leagueKey
) {
  const candidates =
    rows.filter(row =>
      careerLeagueKey(
        row.__careerCompetition
      ) === leagueKey
    );


  if (!candidates.length) {
    return null;
  }


  /*
   * Preferujeme řádek s největším
   * množstvím vyplněných statistik.
   */
  return [...candidates]
    .sort(
      (a, b) => {
        const keys = [
          "Z",
          "G",
          "A",
          "B",
          "+/-",
          "TM",
          "V",
          "P",
          "Pr.",
          "Z%",
          "SO"
        ];


        const count =
          row =>
            keys.filter(
              key =>
                getValue(
                  row,
                  key
                )
            ).length;


        return (
          count(b) -
          count(a)
        );
      }
    )[0];
}


/* =========================================================
   KARIÉRA – SOUČTY
========================================================= */

function careerNumericSum(
  rows,
  key
) {
  const values =
    rows
      .map(row =>
        toNumber(
          getValue(
            row,
            key
          )
        )
      )
      .filter(
        Number.isFinite
      );


  if (!values.length) {
    return NaN;
  }


  return values.reduce(
    (sum, value) =>
      sum + value,
    0
  );
}


function careerFormatNumber(
  value,
  decimals = 0
) {
  if (
    !Number.isFinite(value)
  ) {
    return "-";
  }


  if (
    decimals === 0
  ) {
    return String(
      Math.round(value)
    );
  }


  return value
    .toFixed(decimals)
    .replace(
      ".",
      ","
    );
}


function careerAdditiveValue(
  rows,
  key
) {
  const total =
    careerNumericSum(
      rows,
      key
    );


  if (
    !Number.isFinite(total)
  ) {
    return "-";
  }


  return (
    Number.isInteger(total)
      ? String(total)
      : String(
          Math.round(
            total * 100
          ) / 100
        ).replace(
          ".",
          ","
        )
  );
}


function careerGoalieMinutes(
  rows
) {
  let total =
    0;

  let found =
    false;


  rows.forEach(row => {
    const raw =
      cleanCell(
        getValue(
          row,
          "Č"
        )
      )
        .replace(
          /\s/g,
          ""
        );


    if (!raw) {
      return;
    }


    if (
      raw.includes(":")
    ) {
      const [
        minutesText,
        secondsText
      ] =
        raw.split(":");


      const minutes =
        Number(
          minutesText
        );

      const seconds =
        Number(
          secondsText
        );


      if (
        Number.isFinite(
          minutes
        )
      ) {
        total +=
          minutes;

        if (
          Number.isFinite(
            seconds
          )
        ) {
          total +=
            seconds / 60;
        }

        found = true;
      }

      return;
    }


    const value =
      toNumber(raw);


    if (
      Number.isFinite(
        value
      )
    ) {
      total += value;
      found = true;
    }
  });


  return found
    ? total
    : NaN;
}


function careerSummaryValue(
  summaryRow,
  detailRows,
  key
) {
  const summaryValue =
    summaryRow
      ? getValue(
          summaryRow,
          key
        )
      : "";


  if (
    summaryValue &&
    summaryValue !== "-"
  ) {
    if (
      key === "Z%" &&
      !summaryValue.includes(
        "%"
      )
    ) {
      return (
        `${summaryValue} %`
      );
    }

    return summaryValue;
  }


  /*
   * Brankářská procenta a průměr
   * nesčítáme prostým součtem.
   */
  if (
    key === "Z%"
  ) {
    const saves =
      careerNumericSum(
        detailRows,
        "Zás"
      );

    const shots =
      careerNumericSum(
        detailRows,
        "SP"
      );


    if (
      Number.isFinite(
        saves
      ) &&
      Number.isFinite(
        shots
      ) &&
      shots > 0
    ) {
      return (
        `${careerFormatNumber(
          (
            saves /
            shots
          ) * 100,
          2
        )} %`
      );
    }


    return "-";
  }


  if (
    key === "Pr."
  ) {
    const goalsAgainst =
      careerNumericSum(
        detailRows,
        "GOb"
      );


    const minutes =
      careerGoalieMinutes(
        detailRows
      );


    if (
      Number.isFinite(
        goalsAgainst
      ) &&
      Number.isFinite(
        minutes
      ) &&
      minutes > 0
    ) {
      return careerFormatNumber(
        (
          goalsAgainst *
          60
        ) /
        minutes,
        2
      );
    }


    return "-";
  }


  const additiveKeys =
    new Set([
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

      "Č",
      "GOb",
      "Zás",
      "SP",
      "ZZ",
      "V",
      "P",
      "R",
      "SO",
      "T"
    ]);


  if (
    additiveKeys.has(
      key
    )
  ) {
    return careerAdditiveValue(
      detailRows,
      key
    );
  }


  return "-";
}


/* =========================================================
   KARIÉRA – POČTY
========================================================= */

function careerSeasonCount(
  rows
) {
  return new Set(
    rows
      .map(row =>
        getValue(
          row,
          "Sezona"
        )
      )
      .filter(value =>
        careerSeasonRank(
          value
        ) > 0
      )
      .map(normalize)
  ).size;
}


function careerClubCount(
  rows
) {
  return new Set(
    rows
      .map(row =>
        cleanCell(
          row.__careerClub
        )
      )
      .filter(value =>
        value &&
        value !== "-"
      )
      .map(normalize)
  ).size;
}


function careerSeasonWord(
  count
) {
  if (count === 1) {
    return "sezona";
  }

  if (
    count >= 2 &&
    count <= 4
  ) {
    return "sezony";
  }

  return "sezon";
}


function careerClubWord(
  count
) {
  if (count === 1) {
    return "klub";
  }

  if (
    count >= 2 &&
    count <= 4
  ) {
    return "kluby";
  }

  return "klubů";
}


/* =========================================================
   KARIÉRA – TABULKA
========================================================= */

function careerTableColumns(
  type,
  showPhase
) {
  const common = [
    {
      key: "Sezona",
      label: "Sezona",
      className: "season"
    },

    {
      key: "Klub",
      label: "Klub",
      className: "club"
    }
  ];


  if (showPhase) {
    common.push({
      key: "__phase",
      label: "Část",
      className: "phase"
    });
  }


  if (
    type === "goalie"
  ) {
    return [
      ...common,

      {
        key: "Z",
        label: "Z"
      },

      {
        key: "V",
        label: "V"
      },

      {
        key: "P",
        label: "P"
      },

      {
        key: "Pr.",
        label: "Pr."
      },

      {
        key: "Z%",
        label: "Z%"
      },

      {
        key: "SO",
        label: "SO"
      }
    ];
  }


  return [
    ...common,

    {
      key: "Z",
      label: "Z"
    },

    {
      key: "G",
      label: "G"
    },

    {
      key: "A",
      label: "A"
    },

    {
      key: "B",
      label: "B"
    },

    {
      key: "+/-",
      label: "+/-"
    },

    {
      key: "TM",
      label: "TM"
    }
  ];
}


function careerCellValue(
  row,
  column
) {
  if (
    column.key ===
    "__phase"
  ) {
    return (
      careerPhase(row) ===
        "PLAYOFF"
        ? "Play off"
        : "Základní část"
    );
  }


  return careerGetValue(
    row,
    column.key
  );
}


/* =========================================================
   KARIÉRA – VYKRESLENÍ
========================================================= */

function renderCareerView() {
  const container =
    document.getElementById(
      "careerSection"
    );


  if (!container) {
    return;
  }


  const rows =
    state.careerView.rows;


  if (!rows.length) {
    container.innerHTML = `
      <div class="career-empty">
        Kariéra tohoto hráče zatím není v databázi.
      </div>
    `;

    return;
  }


  const availableSections =
    [
      {
        key: "KLUBOVA",
        label: "Klubová kariéra"
      },

      {
        key: "REPREZENTACE",
        label: "Reprezentace"
      }
    ]
      .filter(section =>
        rows.some(row =>
          row.__careerSection ===
          section.key
        )
      );


  if (
    !availableSections.some(
      section =>
        section.key ===
        state.careerView.section
    )
  ) {
    state.careerView.section =
      availableSections[0]
        ?.key ||
      "KLUBOVA";
  }


  const section =
    state.careerView.section;


  let detailRows =
    careerSectionRows(
      section,
      "DETAIL"
    );


  const summaryRows =
    careerSectionRows(
      section,
      "SOUHRN"
    );


  /*
   * Bezpečnostní fallback:
   * pokud starší CSV označilo řádky špatně,
   * vybereme řádky s reálnou sezonou.
   */
  if (!detailRows.length) {
    detailRows =
      rows.filter(row =>
        row.__careerSection ===
          section &&
        careerSeasonRank(
          getValue(
            row,
            "Sezona"
          )
        ) > 0
      );
  }


  /*
   * Druhý fallback pro starší data
   * bez sloupce Sezona.
   */
  if (!detailRows.length) {
    detailRows =
      rows.filter(row =>
        row.__careerSection ===
          section &&
        row.__careerClub &&
        row.__careerCompetition
      );
  }


  if (!detailRows.length) {
    container.innerHTML = `
      <div class="career-empty">
        Pro tuto část kariéry nejsou k dispozici sezonní data.
      </div>
    `;

    return;
  }


  const leagues =
    careerLeagueOptions(
      detailRows
    );


  if (!leagues.length) {
    container.innerHTML = `
      <div class="career-empty">
        Nepodařilo se rozpoznat soutěže hráče.
      </div>
    `;

    return;
  }


  if (
    !leagues.some(
      league =>
        league.key ===
        state.careerView.league
    )
  ) {
    /*
     * Ligy jsou seřazené podle nejnovější
     * sezony, takže automaticky vybereme
     * aktuální / nejnovější soutěž.
     */
    state.careerView.league =
      leagues[0].key;

    state.careerView.phase =
      "ALL";
  }


  const leagueKey =
    state.careerView.league;


  const leagueLabel =
    leagues.find(
      league =>
        league.key ===
        leagueKey
    )?.label ||
    "Vybraná soutěž";


  const allLeagueRows =
    careerLeagueRows(
      detailRows,
      leagueKey
    );


  const phases =
    new Set(
      allLeagueRows.map(
        careerPhase
      )
    );


  if (
    state.careerView.phase !==
      "ALL" &&
    !phases.has(
      state.careerView.phase
    )
  ) {
    state.careerView.phase =
      "ALL";
  }


  let visibleRows =
    state.careerView.phase ===
      "ALL"
      ? [...allLeagueRows]
      : allLeagueRows.filter(
          row =>
            careerPhase(row) ===
            state.careerView.phase
        );


  visibleRows.sort(
    (a, b) => {
      const seasonDifference =
        careerSeasonRank(
          getValue(
            b,
            "Sezona"
          )
        ) -
        careerSeasonRank(
          getValue(
            a,
            "Sezona"
          )
        );


      if (
        seasonDifference
      ) {
        return (
          seasonDifference
        );
      }


      const aOrder =
        toNumber(
          getValue(
            a,
            "Pořadí"
          )
        );

      const bOrder =
        toNumber(
          getValue(
            b,
            "Pořadí"
          )
        );


      if (
        Number.isFinite(
          aOrder
        ) &&
        Number.isFinite(
          bOrder
        )
      ) {
        return (
          aOrder -
          bOrder
        );
      }


      return 0;
    }
  );


  const summaryRow =
    careerFindSummaryRow(
      summaryRows,
      leagueKey
    );


  const showPhase =
    phases.size > 1;


  const columns =
    careerTableColumns(
      state.careerView.type,
      showPhase
    );


  const seasons =
    careerSeasonCount(
      allLeagueRows
    );


  const clubs =
    careerClubCount(
      allLeagueRows
    );


  const totalKeys =
    state.careerView.type ===
      "goalie"
      ? [
          ["Z", "Z"],
          ["V", "V"],
          ["P", "P"],
          ["Pr.", "Pr."],
          ["Z%", "Z%"],
          ["SO", "SO"]
        ]
      : [
          ["Z", "Z"],
          ["G", "G"],
          ["A", "A"],
          ["B", "B"],
          ["+/-", "+/-"],
          ["TM", "TM"]
        ];


  container.innerHTML = `
    <section class="career-pro">

      <header class="career-pro-header">

        <div class="career-pro-title">

          <span>
            Kompletní historie
          </span>

          <h2>
            Kariéra
          </h2>

        </div>


        ${
          availableSections.length > 1
            ? `
              <div
                class="career-pro-tabs"
                role="tablist"
              >

                ${
                  availableSections
                    .map(item => `
                      <button
                        type="button"
                        class="
                          career-pro-tab
                          ${
                            item.key ===
                            section
                              ? "active"
                              : ""
                          }
                        "
                        data-career-tab="${escapeHtml(item.key)}"
                      >
                        ${escapeHtml(item.label)}
                      </button>
                    `)
                    .join("")
                }

              </div>
            `
            : ""
        }

      </header>


      <div class="career-pro-body">

        <div class="career-pro-toolbar">

          <div class="career-pro-league-title">

            <span>
              Vybraná soutěž
            </span>

            <strong>
              ${escapeHtml(leagueLabel)}
            </strong>

          </div>


          <div class="career-pro-filters">

            <label>

              <span>
                Liga
              </span>

              <select
                data-career-league
                aria-label="Vybrat soutěž"
              >

                ${
                  leagues
                    .map(league => `
                      <option
                        value="${escapeHtml(league.key)}"
                        ${
                          league.key ===
                          leagueKey
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(league.label)}
                      </option>
                    `)
                    .join("")
                }

              </select>

            </label>


            ${
              showPhase
                ? `
                  <label>

                    <span>
                      Část
                    </span>

                    <select
                      data-career-phase
                      aria-label="Vybrat část soutěže"
                    >

                      <option
                        value="ALL"
                        ${
                          state.careerView.phase ===
                            "ALL"
                            ? "selected"
                            : ""
                        }
                      >
                        Vše
                      </option>


                      ${
                        phases.has(
                          "REGULAR"
                        )
                          ? `
                            <option
                              value="REGULAR"
                              ${
                                state.careerView.phase ===
                                  "REGULAR"
                                  ? "selected"
                                  : ""
                              }
                            >
                              Základní část
                            </option>
                          `
                          : ""
                      }


                      ${
                        phases.has(
                          "PLAYOFF"
                        )
                          ? `
                            <option
                              value="PLAYOFF"
                              ${
                                state.careerView.phase ===
                                  "PLAYOFF"
                                  ? "selected"
                                  : ""
                              }
                            >
                              Play off
                            </option>
                          `
                          : ""
                      }

                    </select>

                  </label>
                `
                : ""
            }

          </div>

        </div>


        <div class="career-pro-table-shell">

          <div class="career-pro-table-scroll">

            <table class="career-pro-table">

              <thead>

                <tr>

                  ${
                    columns
                      .map(column => `
                        <th
                          class="${
                            column.className
                              ? `career-column-${column.className}`
                              : ""
                          }"
                        >
                          ${escapeHtml(column.label)}
                        </th>
                      `)
                      .join("")
                  }

                </tr>

              </thead>


              <tbody>

                ${
                  visibleRows.length
                    ? visibleRows
                        .map(
                          (
                            row,
                            index
                          ) => `
                            <tr
                              class="${
                                index === 0
                                  ? "career-current-row"
                                  : ""
                              }"
                            >

                              ${
                                columns
                                  .map(column => `
                                    <td
                                      class="${
                                        column.className
                                          ? `career-column-${column.className}`
                                          : ""
                                      }"
                                    >
                                      ${escapeHtml(
                                        careerCellValue(
                                          row,
                                          column
                                        )
                                      )}
                                    </td>
                                  `)
                                  .join("")
                              }

                            </tr>
                          `
                        )
                        .join("")
                    : `
                      <tr>
                        <td
                          colspan="${columns.length}"
                          class="career-pro-no-results"
                        >
                          Pro zvolený filtr nejsou žádné záznamy.
                        </td>
                      </tr>
                    `
                }

              </tbody>

            </table>

          </div>


          <footer class="career-pro-total">

            <div class="career-pro-total-copy">

              <span>
                Celkem v lize
              </span>

              <strong>
                ${escapeHtml(leagueLabel)}
              </strong>

              <small>

                ${seasons}
                ${careerSeasonWord(seasons)}

                ${
                  clubs
                    ? `
                      ·
                      ${clubs}
                      ${careerClubWord(clubs)}
                    `
                    : ""
                }

              </small>

            </div>


            <div class="career-pro-total-stats">

              ${
                totalKeys
                  .map(
                    (
                      [
                        key,
                        label
                      ]
                    ) => `
                      <div class="career-pro-total-stat">

                        <span>
                          ${escapeHtml(label)}
                        </span>

                        <strong>
                          ${escapeHtml(
                            careerSummaryValue(
                              summaryRow,
                              allLeagueRows,
                              key
                            )
                          )}
                        </strong>

                      </div>
                    `
                  )
                  .join("")
              }

            </div>

          </footer>

        </div>

      </div>

    </section>
  `;
}


/* =========================================================
   KARIÉRA – PROFIL HRÁČE
========================================================= */

async function renderPlayerCareer({
  firstName,
  surname,
  team,
  type
}) {
  const container =
    document.getElementById(
      "careerSection"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `
    <div class="career-loading">
      <span class="career-loading-dot"></span>
      Načítám kompletní kariéru...
    </div>
  `;


  try {
    const rows =
      await getPlayerCareerRows(
        firstName,
        surname,
        team,
        type
      );


    state.careerView = {
      rows,
      type,

      section:
        rows.some(
          row =>
            row.__careerSection ===
            "KLUBOVA"
        )
          ? "KLUBOVA"
          : "REPREZENTACE",

      league: "",
      phase: "ALL"
    };


    renderCareerView();


  } catch (error) {
    console.error(
      "Kariéra hráče:",
      error
    );


    container.innerHTML = `
      <div class="career-empty">
        Kompletní kariéru se momentálně nepodařilo načíst.
      </div>
    `;
  }
}


/* =========================================================
   DETAIL HRÁČE – VYKRESLENÍ
========================================================= */

async function renderPlayerDetail(
  player
) {
  const type =
    player.__detailType ||
    (
      isGoaliePosition(
        player.pozice
      )
        ? "goalie"
        : "skater"
    );


  const dataset =
    await loadDetailData(
      type
    );


  const detail =
    findDetailRecord(
      dataset,
      player
    );


  const team =
    getTeam(
      getValue(
        detail,
        "Tým"
      ) ||
      player.tym
    );


  const teamCode =
    team?.code ||
    getTeamCode(
      player.tym
    );


  const teamName =
    team?.name ||
    getTeamName(
      player.tym
    ) ||
    "-";


  const firstName =
    getValue(
      detail,
      "Jméno"
    ) ||
    player.jmeno;


  const surname =
    getValue(
      detail,
      "Příjmení"
    ) ||
    player.prijmeni;


  const position =
    type === "goalie"
      ? "Brankář"
      : (
          getValue(
            detail,
            "Pozice"
          ) ||
          player.pozice ||
          "-"
        );


  const age =
    getValue(
      detail,
      "Věk"
    ) ||
    player.vek ||
    "-";


  const height =
    getValue(
      detail,
      "Výška (cm)"
    ) ||
    "-";


  const weight =
    getValue(
      detail,
      "Váha (kg)"
    ) ||
    "-";


  const stick =
    getValue(
      detail,
      "Držení hole"
    ) ||
    player.drzeni ||
    "-";


  const nationality =
    getValue(
      detail,
      "Národnost"
    ) ||
    player.narodnost ||
    "-";


  const contract =
    getValue(
      detail,
      "Smlouva"
    ) ||
    player.smlouva ||
    "-";


  const photo =
    getValue(
      detail,
      "Foto"
    ) ||
    player.foto ||
    "";


  const profileText =
    getValue(
      detail,
      "Profil Hráče"
    );


  const hidden =
    hiddenPlayerFields();


  let statsHtml =
    "";


  if (detail) {
    Object.keys(detail)
      .forEach(key => {
        if (
          hidden.has(
            normalize(key)
          )
        ) {
          return;
        }


        const value =
          getValue(
            detail,
            key
          );


        if (!value) {
          return;
        }


        const progress =
          statProgress(
            dataset,
            key,
            value,
            type
          );


        statsHtml += `
          <article
            class="
              stat
              ${playerStatType(
                key,
                value
              )}
            "
          >

            <span>
              ${escapeHtml(key)}
            </span>


            <strong>
              ${escapeHtml(
                formatStatValue(
                  key,
                  value
                )
              )}
            </strong>


            ${
              progress > 0
                ? `
                  <div
                    class="progress"
                    aria-hidden="true"
                  >
                    <div
                      class="progress-fill"
                      style="width:${progress.toFixed(1)}%"
                    ></div>
                  </div>
                `
                : ""
            }

          </article>
        `;
      });
  }


  if (!statsHtml) {
    statsHtml = `
      <div class="empty-state">
        Statistiky hráče zatím nejsou k dispozici.
      </div>
    `;
  }


  const title =
    document.getElementById(
      "detailHraceTitle"
    );


  const kicker =
    document.getElementById(
      "detailHraceKicker"
    );


  if (title) {
    title.textContent =
      `${firstName} ${surname}`;
  }


  if (kicker) {
    kicker.textContent =
      type === "goalie"
        ? "Profil brankáře"
        : "Profil hráče";
  }


  const container =
    document.getElementById(
      "detailHraceObsah"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `
    <main class="player-page">

      <section class="player-hero">

        <div class="foto-wrapper player-photo-wrapper">

          ${
            photo
              ? `
                <img
                  src="${escapeHtml(photo)}"
                  alt="Foto ${escapeHtml(
                    `${firstName} ${surname}`
                  )}"
                  class="foto-hrace"
                  data-hide-on-error
                >
              `
              : `
                <div class="player-photo-placeholder">

                  <span>
                    ${escapeHtml(
                      firstName.charAt(0)
                    )}
                    ${escapeHtml(
                      surname.charAt(0)
                    )}
                  </span>

                </div>
              `
          }


          ${
            player.zdroj
              ? `
                <div class="foto-zdroj">
                  © Fotka:
                  ${escapeHtml(player.zdroj)}
                </div>
              `
              : ""
          }

        </div>


        <div class="player-info">

          <span class="profile-type">
            ${
              type === "goalie"
                ? "BRANKÁŘ"
                : "HRÁČ"
            }
          </span>


          <h2 class="player-name">
            ${escapeHtml(firstName)}
            ${escapeHtml(surname)}
          </h2>


          <div class="team-line">

            ${
              teamCode &&
              getTeam(teamCode)
                ? `
                  <button
                    type="button"
                    class="player-team-link"
                    data-team-code="${escapeHtml(teamCode)}"
                  >

                    <img
                      src="${escapeHtml(
                        logoUrl(teamCode)
                      )}"
                      alt=""
                      class="tym-logo"
                      data-hide-on-error
                    >

                    <span>
                      ${escapeHtml(teamName)}
                    </span>

                  </button>
                `
                : `
                  <span>
                    ${escapeHtml(teamName)}
                  </span>
                `
            }

          </div>


          <div class="info-grid">

            <div class="info-box">
              <span>Pozice</span>
              <strong>
                ${escapeHtml(position)}
              </strong>
            </div>


            <div class="info-box">
              <span>Věk</span>
              <strong>
                ${escapeHtml(age)}
              </strong>
            </div>


            <div class="info-box">
              <span>Výška</span>
              <strong>
                ${
                  height === "-"
                    ? "-"
                    : `${escapeHtml(height)} cm`
                }
              </strong>
            </div>


            <div class="info-box">
              <span>Váha</span>
              <strong>
                ${
                  weight === "-"
                    ? "-"
                    : `${escapeHtml(weight)} kg`
                }
              </strong>
            </div>


            <div class="info-box">
              <span>Držení hole</span>
              <strong>
                ${escapeHtml(stick)}
              </strong>
            </div>


            <div class="info-box">
              <span>Národnost</span>
              <strong>
                ${escapeHtml(nationality)}
              </strong>
            </div>


            <div class="info-box">
              <span>Smlouva</span>
              <strong>
                ${escapeHtml(contract)}
              </strong>
            </div>

          </div>

        </div>

      </section>


      ${
        profileText
          ? `
            <section class="profile-note">

              <span>
                Profil hráče
              </span>

              <p>
                ${escapeHtml(profileText)}
              </p>

            </section>
          `
          : ""
      }


      <h2 class="section-title">
        ${
          type === "goalie"
            ? "Statistiky brankáře"
            : "Statistiky hráče"
        }
      </h2>


      <section class="stat-box">
        ${statsHtml}
      </section>


      <section
        id="careerSection"
        class="career-section"
      >

        <div class="career-loading">
          <span class="career-loading-dot"></span>
          Načítám kompletní kariéru...
        </div>

      </section>

    </main>
  `;


  await renderPlayerCareer({
    firstName,
    surname,

    team:
      teamCode ||
      player.tym,

    type
  });
}


/* =========================================================
   KLUBY
========================================================= */

async function loadClubs() {
  state.clubs =
    await loadObjectCsv(
      DATA_URLS.clubs
    );

  return state.clubs;
}


function renderClubs() {
  const container =
    document.getElementById(
      "seznam-klubu"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    TEAMS
      .map(team => `
        <button
          type="button"
          class="klub-karta"
          data-team-code="${escapeHtml(team.code)}"
        >

          <img
            src="${escapeHtml(
              logoUrl(team.code)
            )}"
            alt="${escapeHtml(team.name)}"
            loading="lazy"
            data-hide-on-error
          >

          <h2>
            ${escapeHtml(team.name)}
          </h2>

          <span>
            ${escapeHtml(team.code)}
          </span>

        </button>
      `)
      .join("");
}


function findClubRecord(code) {
  return state.clubs.find(
    record => {
      const value =
        getValue(
          record,
          "NÁZEV TÝMU"
        );


      return (
        getTeamCode(
          value
        ) === code ||
        normalize(value) ===
          normalize(code)
      );
    }
  );
}


function topTeamPlayer(
  details,
  teamCode,
  statistic
) {
  return [...details]
    .filter(record =>
      getTeamCode(
        getValue(
          record,
          "Tým"
        )
      ) === teamCode &&

      getValue(
        record,
        "Jméno"
      ) &&

      getValue(
        record,
        "Příjmení"
      )
    )
    .sort(
      (a, b) =>
        (
          toNumber(
            getValue(
              b,
              statistic
            )
          ) || 0
        ) -
        (
          toNumber(
            getValue(
              a,
              statistic
            )
          ) || 0
        )
    )[0];
}


function topPlayerText(
  player,
  statistic
) {
  if (!player) {
    return "-";
  }


  return `
    ${escapeHtml(
      getValue(
        player,
        "Jméno"
      )
    )}
    ${escapeHtml(
      getValue(
        player,
        "Příjmení"
      )
    )}

    <small>
      ${escapeHtml(
        getValue(
          player,
          statistic
        ) ||
        "0"
      )}
    </small>
  `;
}


async function openClub(
  value,
  {
    updateUrl = true,
    replaceUrl = false
  } = {}
) {
  const code =
    getTeamCode(value);


  const team =
    getTeam(code);


  if (!team) {
    return;
  }


  state.selectedClub =
    code;


  const path =
    clubPath(code);


  if (updateUrl) {
    setBrowserPath(
      path,
      {
        replace:
          replaceUrl
      }
    );
  }


  setSeo({
    title:
      `${team.name} – soupiska a statistiky | ELH IceStats`,

    description:
      `${team.name} – profil klubu, soupiska, statistiky hráčů a výsledky v Tipsport extralize.`,

    path
  });


  navigate(
    "clubDetail",
    {
      push: false
    }
  );


  const container =
    document.getElementById(
      "detailKlubuObsah"
    );


  if (container) {
    container.innerHTML = `
      <div class="loading-card">
        Načítám klub...
      </div>
    `;
  }


  try {
    if (!state.clubs.length) {
      await loadClubs();
    }


    if (!state.players.length) {
      await loadPlayers();
    }


    await renderClubDetail(
      code
    );

  } catch (error) {
    console.error(error);

    if (container) {
      container.innerHTML =
        errorHtml(
          error.message
        );
    }
  }
}


async function renderClubDetail(
  code
) {
  const club =
    findClubRecord(
      code
    );


  const team =
    getTeam(code);


  if (
    !club ||
    !team
  ) {
    throw new Error(
      "Klub nebyl nalezen v kluby.csv."
    );
  }


  const details =
    await loadDetailData(
      "skater"
    );


  const roster =
    state.players
      .filter(player =>
        getTeamCode(
          player.tym
        ) === code
      )
      .sort(
        (a, b) =>
          collator.compare(
            a.prijmeni,
            b.prijmeni
          )
      );


  const topPoints =
    topTeamPlayer(
      details,
      code,
      "Body"
    );


  const topGoals =
    topTeamPlayer(
      details,
      code,
      "Goly"
    );


  const topAssists =
    topTeamPlayer(
      details,
      code,
      "Asistence"
    );


  const seasonPairs = [
    "2025/26",
    "2024/25",
    "2023/24",
    "2022/23",
    "2021/22",
    "2020/21"
  ];


  const resultsHtml =
    seasonPairs
      .map(season => `
        <article class="result-card">
          <span>
            ${season} ZČ
          </span>

          <strong>
            ${escapeHtml(
              getValue(
                club,
                `${season} ZČ`
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="result-card">
          <span>
            ${season} Playoff
          </span>

          <strong>
            ${escapeHtml(
              getValue(
                club,
                `${season} PLAYOFF`
              ) ||
              "-"
            )}
          </strong>
        </article>
      `)
      .join("");


  const rosterHtml =
    roster.length
      ? roster
          .map(player => `
            <button
              type="button"
              class="player-card"
              data-player-key="${escapeHtml(
                playerKey(
                  player
                )
              )}"
            >

              <strong>
                ${escapeHtml(player.jmeno)}
                ${escapeHtml(player.prijmeni)}
              </strong>

              <span>
                ${escapeHtml(
                  player.pozice ||
                  "-"
                )}
              </span>

              <dl>

                <div>
                  <dt>Věk</dt>
                  <dd>
                    ${escapeHtml(
                      player.vek ||
                      "-"
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Národnost</dt>
                  <dd>
                    ${escapeHtml(
                      player.narodnost ||
                      "-"
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Smlouva</dt>
                  <dd>
                    ${escapeHtml(
                      player.smlouva ||
                      "-"
                    )}
                  </dd>
                </div>

              </dl>

            </button>
          `)
          .join("")
      : `
          <div class="empty-state">
            Soupiska nebyla nalezena.
          </div>
        `;


  const container =
    document.getElementById(
      "detailKlubuObsah"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `
    <main class="club-page">

      <section class="club-hero">

        <div class="club-logo-box">

          <img
            src="${escapeHtml(
              logoUrl(code)
            )}"
            alt="${escapeHtml(team.name)}"
            class="club-logo"
            data-hide-on-error
          >

        </div>


        <div>

          <span class="club-code">
            ${escapeHtml(code)}
          </span>

          <h2 class="club-title">
            ${escapeHtml(team.name)}
          </h2>

          <div class="club-sub">
            ${escapeHtml(
              getValue(
                club,
                "NÁZEV STADIONU"
              ) ||
              "Tipsport extraliga"
            )}
          </div>

        </div>

      </section>


      <div class="info-grid club-info-grid">

        <article class="info-card">
          <span>Rok založení</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "ROK ZALOŽENÍ"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Počet titulů</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "POČET TITULŮ"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Hlavní trenér</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "HLAVNÍ TRENÉR"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Poslední titul</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "POSLEDNÍ TITUL"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Stadion</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "NÁZEV STADIONU"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Kapacita</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "KAPACITA"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Průměrná návštěvnost</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "PRŮMĚRNÁ NÁVŠTĚVNOST"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Zaplněnost</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "% ZAPLNĚNOST"
              ) ||
              "-"
            )}
          </strong>
        </article>


        <article class="info-card">
          <span>Průměrný věk</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                "Průměrný věk"
              ) ||
              "-"
            )}
          </strong>
        </article>

      </div>


      <h2 class="section-title">
        TOP hráči týmu
      </h2>


      <div class="top-players-grid">

        <article class="top-player-card">

          <span>
            Nejvíce bodů
          </span>

          <strong>
            ${topPlayerText(
              topPoints,
              "Body"
            )}
          </strong>

        </article>


        <article class="top-player-card">

          <span>
            Nejvíce gólů
          </span>

          <strong>
            ${topPlayerText(
              topGoals,
              "Goly"
            )}
          </strong>

        </article>


        <article class="top-player-card">

          <span>
            Nejvíce asistencí
          </span>

          <strong>
            ${topPlayerText(
              topAssists,
              "Asistence"
            )}
          </strong>

        </article>

      </div>


      <h2 class="section-title">
        Výsledky klubu
      </h2>


      <div class="club-results-grid">
        ${resultsHtml}
      </div>


      <h2 class="section-title">
        Soupiska týmu
      </h2>


      <div class="roster-grid">
        ${rosterHtml}
      </div>

    </main>
  `;
}


/* =========================================================
   PŘESTUPY
========================================================= */

async function loadTransfers() {
  const rows =
    await loadObjectCsv(
      DATA_URLS.transfers
    );


  state.transfers =
    rows.filter(row =>
      getValue(
        row,
        "JMÉNO"
      ) &&
      getValue(
        row,
        "PŘÍJMENÍ"
      )
    );


  populateTransferFilters();
  renderTransfers();
  renderTransferSlider();


  return state.transfers;
}


function populateTransferFilters() {
  populateSelect(
    document.getElementById(
      "filtrSezonaPrestupy"
    ),

    uniqueSorted(
      state.transfers.map(
        transfer =>
          getValue(
            transfer,
            "SEZONA"
          )
      )
    ),

    "Všechny sezony"
  );


  populateSelect(
    document.getElementById(
      "filtrOdkudPrestupy"
    ),

    uniqueSorted(
      state.transfers
        .map(
          transfer =>
            getValue(
              transfer,
              "ODKUD"
            )
        )
        .filter(value =>
          value &&
          value !== "-"
        )
    ),

    "Odkud"
  );


  populateSelect(
    document.getElementById(
      "filtrKamPrestupy"
    ),

    uniqueSorted(
      state.transfers
        .map(
          transfer =>
            getValue(
              transfer,
              "KAM"
            )
        )
        .filter(value =>
          value &&
          value !== "-"
        )
    ),

    "Kam"
  );
}


function transferTeamHtml(
  value
) {
  const text =
    cleanCell(value) ||
    "-";


  const team =
    getTeam(text);


  if (!team) {
    return escapeHtml(
      text
    );
  }


  return `
    <button
      type="button"
      class="prestup-tym"
      data-team-code="${escapeHtml(team.code)}"
    >
      ${escapeHtml(team.name)}
    </button>
  `;
}


function renderTransfers() {
  const container =
    document.getElementById(
      "prestupyObsah"
    );


  const counter =
    document.getElementById(
      "pocetPrestupu"
    );


  if (!container) {
    return;
  }


  const search =
    normalize(
      document.getElementById(
        "vyhledavaniPrestupy"
      )?.value
    );


  const season =
    normalize(
      document.getElementById(
        "filtrSezonaPrestupy"
      )?.value
    );


  const from =
    normalize(
      document.getElementById(
        "filtrOdkudPrestupy"
      )?.value
    );


  const to =
    normalize(
      document.getElementById(
        "filtrKamPrestupy"
      )?.value
    );


  const data =
    state.transfers
      .filter(transfer => {
        const name =
          normalize(
            [
              getValue(
                transfer,
                "JMÉNO"
              ),
              getValue(
                transfer,
                "PŘÍJMENÍ"
              )
            ].join(" ")
          );


        return (
          (
            !search ||
            name.includes(
              search
            )
          ) &&

          (
            !season ||
            normalize(
              getValue(
                transfer,
                "SEZONA"
              )
            ) === season
          ) &&

          (
            !from ||
            normalize(
              getValue(
                transfer,
                "ODKUD"
              )
            ) === from
          ) &&

          (
            !to ||
            normalize(
              getValue(
                transfer,
                "KAM"
              )
            ) === to
          )
        );
      });


  if (counter) {
    counter.textContent =
      `${data.length} přestupů`;
  }


  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        Žádné přestupy neodpovídají zvoleným filtrům.
      </div>
    `;

    return;
  }


  container.innerHTML = `
    <div class="table-scroll">

      <table class="prestupy-tabulka">

        <thead>

          <tr>
            <th>Jméno</th>
            <th>Příjmení</th>
            <th>Odkud</th>
            <th>Kam</th>
            <th>Pozice</th>
            <th>Sezona</th>
          </tr>

        </thead>


        <tbody>

          ${
            data
              .map(transfer => {
                const firstName =
                  getValue(
                    transfer,
                    "JMÉNO"
                  );

                const surname =
                  getValue(
                    transfer,
                    "PŘÍJMENÍ"
                  );


                return `
                  <tr>

                    <td>
                      <button
                        type="button"
                        class="prestup-hrac"
                        data-player-first="${escapeHtml(firstName)}"
                        data-player-last="${escapeHtml(surname)}"
                      >
                        ${escapeHtml(firstName)}
                      </button>
                    </td>


                    <td>
                      <button
                        type="button"
                        class="prestup-hrac"
                        data-player-first="${escapeHtml(firstName)}"
                        data-player-last="${escapeHtml(surname)}"
                      >
                        ${escapeHtml(surname)}
                      </button>
                    </td>


                    <td>
                      ${transferTeamHtml(
                        getValue(
                          transfer,
                          "ODKUD"
                        )
                      )}
                    </td>


                    <td>
                      ${transferTeamHtml(
                        getValue(
                          transfer,
                          "KAM"
                        )
                      )}
                    </td>


                    <td>
                      ${escapeHtml(
                        getValue(
                          transfer,
                          "POZICE"
                        ) ||
                        "-"
                      )}
                    </td>


                    <td>
                      ${escapeHtml(
                        getValue(
                          transfer,
                          "SEZONA"
                        ) ||
                        "-"
                      )}
                    </td>

                  </tr>
                `;
              })
              .join("")
          }

        </tbody>

      </table>

    </div>
  `;
}


/* =========================================================
   SLIDER PŘESTUPŮ
========================================================= */

function renderTransferSlider() {
  const container =
    document.querySelector(
      "#posledniPrestupy .live-stats"
    );


  if (!container) {
    return;
  }


  const latest =
    state.transfers
      .slice(-8)
      .reverse();


  if (!latest.length) {
    container.innerHTML = `
      <div class="live-empty">
        Žádné přestupy.
      </div>
    `;

    return;
  }


  state.transferSlideIndex =
    0;


  container.innerHTML = `
    <div class="transfer-slider">

      ${
        latest
          .map(
            (
              transfer,
              index
            ) => `
              <div
                class="transfer-slide ${
                  index === 0
                    ? "active"
                    : ""
                }"
              >

                <div class="transfer-label">
                  Nový přestup
                </div>


                <button
                  type="button"
                  class="transfer-player"
                  data-player-first="${escapeHtml(
                    getValue(
                      transfer,
                      "JMÉNO"
                    )
                  )}"
                  data-player-last="${escapeHtml(
                    getValue(
                      transfer,
                      "PŘÍJMENÍ"
                    )
                  )}"
                >
                  ${escapeHtml(
                    getValue(
                      transfer,
                      "JMÉNO"
                    )
                  )}
                  ${escapeHtml(
                    getValue(
                      transfer,
                      "PŘÍJMENÍ"
                    )
                  )}
                </button>


                <div class="transfer-position">
                  ${escapeHtml(
                    getValue(
                      transfer,
                      "POZICE"
                    ) ||
                    "-"
                  )}
                </div>


                <div class="transfer-route">

                  <span>
                    ${escapeHtml(
                      getValue(
                        transfer,
                        "ODKUD"
                      ) ||
                      "-"
                    )}
                  </span>

                  <strong>
                    →
                  </strong>

                  <span>
                    ${escapeHtml(
                      getValue(
                        transfer,
                        "KAM"
                      ) ||
                      "-"
                    )}
                  </span>

                </div>


                <div class="transfer-season">
                  ${escapeHtml(
                    getValue(
                      transfer,
                      "SEZONA"
                    ) ||
                    "-"
                  )}
                </div>

              </div>
            `
          )
          .join("")
      }


      ${
        latest.length > 1
          ? `
            <div class="transfer-controls">

              <button
                type="button"
                data-transfer-prev
                aria-label="Předchozí přestup"
              >
                ‹
              </button>

              <button
                type="button"
                data-transfer-next
                aria-label="Další přestup"
              >
                ›
              </button>

            </div>
          `
          : ""
      }

    </div>
  `;
}


function changeTransferSlide(
  direction
) {
  const slides =
    [
      ...document
        .querySelectorAll(
          "#posledniPrestupy .transfer-slide"
        )
    ];


  if (!slides.length) {
    return;
  }


  state.transferSlideIndex =
    (
      state.transferSlideIndex +
      direction +
      slides.length
    ) %
    slides.length;


  slides.forEach(
    (
      slide,
      index
    ) => {
      slide.classList.toggle(
        "active",
        index ===
          state.transferSlideIndex
      );
    }
  );
}


/* =========================================================
   TABULKA ELH
========================================================= */

async function loadStandings() {
  state.standings =
    (
      await loadObjectCsv(
        DATA_URLS.standings
      )
    )
      .filter(row =>
        getValue(
          row,
          "TÝM"
        )
      );


  renderStandings();


  return state.standings;
}


function parseForm(value) {
  const raw =
    cleanCell(value)
      .toUpperCase();


  if (!raw) {
    return {
      raw: "",
      tokens: [],
      valid: true
    };
  }


  const normalized =
    raw.replace(
      /\s+/g,
      ""
    );


  const tokens =
    normalized.match(
      /VP|PP|V|P/g
    ) ||
    [];


  const residue =
    normalized
      .replace(
        /VP|PP|V|P/g,
        ""
      )
      .replace(
        /[,;|/\\-]/g,
        ""
      );


  return {
    raw,
    tokens,

    valid:
      tokens.length > 0 &&
      residue === ""
  };
}


function renderForm(value) {
  const form =
    parseForm(value);


  if (!form.raw) {
    return `
      <span class="forma-empty">
        –
      </span>
    `;
  }


  if (!form.valid) {
    return `
      <span
        class="forma-raw"
        title="Hodnota FORMA z CSV"
      >
        ${escapeHtml(form.raw)}
      </span>
    `;
  }


  return form.tokens
    .map(result => {
      const className =
        result === "V"
          ? "forma-v"
          : result === "VP"
            ? "forma-vp"
            : result === "PP"
              ? "forma-pp"
              : "forma-p";


      return `
        <span
          class="
            forma-vysledek
            ${className}
          "
        >
          ${escapeHtml(result)}
        </span>
      `;
    })
    .join("");
}


function renderStandings() {
  const container =
    document.getElementById(
      "tabulkaELH"
    );

  if (!container) {
    return;
  }

  if (!state.standings.length) {
    container.innerHTML = `
      <div class="empty-state">
        Tabulka zatím není k dispozici.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="elh-tabulka">

      <div class="elh-hlavicka">
        <div>#</div>
        <div>Tým</div>
        <div>Z</div>
        <div>V</div>
        <div>VP</div>
        <div>PP</div>
        <div>P</div>
        <div>Skóre</div>
        <div>Body</div>
        <div>Forma</div>
      </div>

      ${
        state.standings
          .map(row => {
            const position =
              Number(
                getValue(
                  row,
                  "POŘADÍ"
                )
              );

            const teamValue =
              getValue(
                row,
                "TÝM"
              );

            const team =
              getTeam(
                teamValue
              );

            const rowClass =
              position <= 4
                ? "top4"
                : (
                    position >= 5 &&
                    position <= 12
                  )
                  ? "predkolo"
                  : position === 14
                    ? "baraz"
                    : "";

            return `
              <div
                class="
                  elh-radek
                  ${rowClass}
                "
              >

                <div class="position-cell">
                  ${escapeHtml(
                    getValue(
                      row,
                      "POŘADÍ"
                    ) || "-"
                  )}
                </div>

                <div class="tym-nazev tabulka-tym">

                  ${
                    team
                      ? `
                        <img
                          src="${escapeHtml(
                            logoUrl(
                              team.code
                            )
                          )}"
                          alt=""
                          class="logoMale"
                          data-hide-on-error
                        >

                        <button
                          type="button"
                          data-team-code="${escapeHtml(
                            team.code
                          )}"
                        >
                          ${escapeHtml(
                            team.name
                          )}
                        </button>
                      `
                      : `
                        <span>
                          ${escapeHtml(
                            teamValue || "-"
                          )}
                        </span>
                      `
                  }

                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "ZÁPASY"
                    ) || "-"
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "V"
                    ) || "-"
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "VP"
                    ) || "-"
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "PP"
                    ) || "-"
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "P"
                    ) || "-"
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    getValue(
                      row,
                      "SKÓRE"
                    ) || "-"
                  )}
                </div>

                <div class="body-cell">
                  ${escapeHtml(
                    getValue(
                      row,
                      "BODY"
                    ) || "-"
                  )}
                </div>

                <div class="forma-cell">
                  ${renderForm(
                    getValue(
                      row,
                      "FORMA"
                    )
                  )}
                </div>

              </div>
            `;
          })
          .join("")
      }

    </div>
  `;
}


/* =========================================================
   ROZPIS
========================================================= */

async function loadSchedule() {
  const text =
    await fetchText(
      DATA_URLS.schedule
    );


  const parsed =
    Papa.parse(
      text,
      {
        delimiter: ";",
        skipEmptyLines: false
      }
    );


  const matches =
    [];


  let currentRound =
    0;


  (parsed.data || [])
    .forEach(row => {
      const first =
        cleanCell(
          row?.[0]
        );


      const roundMatch =
        first.match(
          /^(\d+)\s*\.\s*kolo/i
        );


      if (roundMatch) {
        currentRound =
          Number(
            roundMatch[1]
          );

        return;
      }


      const home =
        cleanCell(
          row?.[1]
        );


      const versus =
        normalize(
          row?.[2]
        );


      const away =
        cleanCell(
          row?.[3]
        );


      if (
        !currentRound ||
        !home ||
        !away ||
        versus !== "vs"
      ) {
        return;
      }


      matches.push({
        round:
          currentRound,

        home,

        away,

        date:
          cleanCell(
            row?.[4]
          ),

        time:
          cleanCell(
            row?.[5]
          )
      });
    });


  state.schedule =
    matches;


  populateScheduleFilters();
  renderSchedule();
  renderCurrentRound();


  return state.schedule;
}


function scheduleDate(
  dateValue,
  timeValue = "00:00"
) {
  const date =
    cleanCell(
      dateValue
    );


  if (!date) {
    return null;
  }


  const parts =
    date
      .split(".")
      .map(Number);


  if (
    parts.length < 3 ||
    parts.some(
      number =>
        !Number.isFinite(
          number
        )
    )
  ) {
    return null;
  }


  const timeParts =
    cleanCell(
      timeValue ||
      "00:00"
    )
      .split(":")
      .map(Number);


  return new Date(
    parts[2],
    parts[1] - 1,
    parts[0],
    timeParts[0] || 0,
    timeParts[1] || 0,
    0,
    0
  );
}


function populateScheduleFilters() {
  const rounds =
    [
      ...new Set(
        state.schedule.map(
          match =>
            match.round
        )
      )
    ]
      .sort(
        (a, b) =>
          a - b
      )
      .map(round => ({
        value:
          String(round),

        label:
          `${round}. kolo`
      }));


  populateSelect(
    document.getElementById(
      "filtrKoloRozpis"
    ),
    rounds,
    "Všechna kola"
  );


  populateSelect(
    document.getElementById(
      "filtrTymRozpis"
    ),

    TEAMS.map(team => ({
      value:
        team.code,

      label:
        team.name
    })),

    "Všechny týmy"
  );
}


function formatScheduleDate(
  date,
  time
) {
  if (!date) {
    return `
      <span class="match-date pending">
        Termín bude doplněn
      </span>
    `;
  }


  return `
    <span class="match-date">
      ${escapeHtml(date)}
    </span>

    ${
      time
        ? `
          <strong class="match-time">
            ${escapeHtml(time)}
          </strong>
        `
        : ""
    }
  `;
}


function scheduleTeamHtml(
  value,
  side
) {
  const team =
    getTeam(value);


  if (!team) {
    return `
      <div class="schedule-team ${escapeHtml(side)}">
        <span>
          ${escapeHtml(value)}
        </span>
      </div>
    `;
  }


  /*
   * Domácí:
   * Název → logo
   *
   * Hosté:
   * logo → název
   *
   * Díky tomu jsou obě strany
   * orientované směrem ke středu zápasu.
   */
  if (side === "home") {
    return `
      <button
        type="button"
        class="schedule-team home"
        data-team-code="${escapeHtml(team.code)}"
      >

        <span>
          ${escapeHtml(team.name)}
        </span>

        <img
          src="${escapeHtml(
            logoUrl(team.code)
          )}"
          alt=""
          data-hide-on-error
        >

      </button>
    `;
  }


  return `
    <button
      type="button"
      class="schedule-team away"
      data-team-code="${escapeHtml(team.code)}"
    >

      <img
        src="${escapeHtml(
          logoUrl(team.code)
        )}"
        alt=""
        data-hide-on-error
      >

      <span>
        ${escapeHtml(team.name)}
      </span>

    </button>
  `;
}


function renderSchedule() {
  const container =
    document.getElementById(
      "rozpisObsah"
    );


  if (!container) {
    return;
  }


  const roundFilter =
    Number(
      document.getElementById(
        "filtrKoloRozpis"
      )?.value ||
      0
    );


  const teamFilter =
    cleanCell(
      document.getElementById(
        "filtrTymRozpis"
      )?.value
    );


  const matches =
    state.schedule
      .filter(match =>
        (
          !roundFilter ||
          match.round ===
            roundFilter
        ) &&
        (
          !teamFilter ||
          getTeamCode(
            match.home
          ) === teamFilter ||
          getTeamCode(
            match.away
          ) === teamFilter
        )
      );


  if (!matches.length) {
    container.innerHTML = `
      <div class="empty-state">
        Žádné zápasy neodpovídají zvolenému filtru.
      </div>
    `;

    return;
  }


  const rounds =
    [
      ...new Set(
        matches.map(
          match =>
            match.round
        )
      )
    ]
      .sort(
        (a, b) =>
          a - b
      );


  container.innerHTML =
    rounds
      .map(round => {
        const roundMatches =
          matches.filter(
            match =>
              match.round ===
              round
          );


        return `
          <section class="round-block">

            <header class="round-header">

              <div>

                <span>
                  Tipsport extraliga
                </span>

                <h2>
                  ${round}. kolo
                </h2>

              </div>


              <strong>
                ${roundMatches.length}
                zápasů
              </strong>

            </header>


            <div class="matches-list">

              ${
                roundMatches
                  .map(match => `
                    <article class="match-card">

                      ${scheduleTeamHtml(
                        match.home,
                        "home"
                      )}


                      <div class="match-center">

                        <span class="match-vs">
                          VS
                        </span>

                        ${formatScheduleDate(
                          match.date,
                          match.time
                        )}

                      </div>


                      ${scheduleTeamHtml(
                        match.away,
                        "away"
                      )}

                    </article>
                  `)
                  .join("")
              }

            </div>

          </section>
        `;
      })
      .join("");
}


/* =========================================================
   AKTUÁLNÍ KOLO NA ÚVODU
========================================================= */

function findCurrentScheduleRound() {
  if (!state.schedule.length) {
    return null;
  }


  const now =
    new Date();


  const dated =
    state.schedule
      .map(match => ({
        match,

        date:
          scheduleDate(
            match.date,
            match.time
          )
      }))
      .filter(item =>
        item.date
      )
      .sort(
        (a, b) =>
          a.date -
          b.date
      );


  const next =
    dated.find(
      item =>
        item.date >= now
    );


  if (next) {
    return (
      next.match.round
    );
  }


  if (dated.length) {
    const lastDatedRound =
      Math.max(
        ...dated.map(
          item =>
            item.match.round
        )
      );


    const nextUnknown =
      state.schedule.find(
        match =>
          match.round >
          lastDatedRound
      );


    if (nextUnknown) {
      return (
        nextUnknown.round
      );
    }


    return lastDatedRound;
  }


  return (
    state.schedule[0]
      ?.round ||
    null
  );
}


function renderCurrentRound() {
  const container =
    document.querySelector(
      "#aktualniKolo .live-stats"
    );


  const title =
    document.getElementById(
      "aktualniKoloTitulek"
    );


  if (!container) {
    return;
  }


  const round =
    findCurrentScheduleRound();


  if (!round) {
    container.innerHTML = `
      <div class="live-empty">
        Rozpis není k dispozici.
      </div>
    `;

    return;
  }


  const matches =
    state.schedule.filter(
      match =>
        match.round ===
        round
    );


  if (title) {
    title.textContent =
      `${round}. KOLO`;
  }


  container.innerHTML =
    matches
      .map(match => {
        const home =
          getTeamCode(
            match.home
          );

        const away =
          getTeamCode(
            match.away
          );


        return `
          <div class="live-row">

            <span class="live-name">
              ${escapeHtml(home)}
              vs
              ${escapeHtml(away)}
            </span>

            <span class="live-value">
              ${
                match.time
                  ? escapeHtml(
                      match.time
                    )
                  : match.date
                    ? escapeHtml(
                        match.date
                      )
                    : "TBD"
              }
            </span>

          </div>
        `;
      })
      .join("");
}

/* =========================================================
   STATISTIKY ELH
========================================================= */

const SKATER_STATS_TOTAL_COLUMNS = [
  {
    key: "Odehrané zápasy",
    label: "Z"
  },
  {
    key: "Goly",
    label: "G"
  },
  {
    key: "Asistence",
    label: "A"
  },
  {
    key: "Body",
    label: "B"
  },
  {
    key: "Body z přesilovek",
    label: "PPP"
  },
  {
    key: "+/-",
    label: "+/-"
  },
  {
    key: "Trestné minuty",
    label: "TM"
  },
  {
    key: "Ø Času na ledě",
    label: "TOI"
  },
  {
    key: "Hity",
    label: "Hity"
  },
  {
    key: "Bloky",
    label: "Bloky"
  },
  {
    key: "Úspěšnost vhazování %",
    label: "Vhaz. %"
  },
  {
    key: "Úspěšnost střelby %",
    label: "Stř. %"
  }
];


const SKATER_STATS_RATE_COLUMNS = [
  {
    key: "Odehrané zápasy",
    label: "Z"
  },
  {
    key: "__goalsPerGame",
    label: "G/Z"
  },
  {
    key: "__assistsPerGame",
    label: "A/Z"
  },
  {
    key: "Body na zápas",
    label: "B/Z"
  },
  {
    key: "__pppPerGame",
    label: "PPP/Z"
  },
  {
    key: "__plusMinusPerGame",
    label: "+/-/Z"
  },
  {
    key: "__pimPerGame",
    label: "TM/Z"
  },
  {
    key: "Ø Času na ledě",
    label: "TOI/Z"
  },
  {
    key: "Hity na zápas",
    label: "Hity/Z"
  },
  {
    key: "Bloky na zápas",
    label: "Bloky/Z"
  },
  {
    key: "Úspěšnost vhazování %",
    label: "Vhaz. %"
  },
  {
    key: "Úspěšnost střelby %",
    label: "Stř. %"
  }
];


const GOALIE_STATS_TOTAL_COLUMNS = [
  {
    key: "Odchytané zápasy",
    label: "Z"
  },
  {
    key: "Odchytané minuty",
    label: "MIN"
  },
  {
    key: "Výhry",
    label: "V"
  },
  {
    key: "průměr obdržených branek",
    label: "Pr.",
    defaultDir: "asc"
  },
  {
    key: "% zákroků",
    label: "Z%"
  },
  {
    key: "Čistá konta",
    label: "SO"
  },
  {
    key: "Zákroky",
    label: "Zákroky"
  },
  {
    key: "Střel proti",
    label: "Střely"
  },
  {
    key: "Průměr střel na zápas",
    label: "Střely/Z"
  }
];


const GOALIE_STATS_RATE_COLUMNS = [
  {
    key: "Odchytané zápasy",
    label: "Z"
  },
  {
    key: "__goalieMinutesPerGame",
    label: "MIN/Z"
  },
  {
    key: "__winsPerGame",
    label: "V/Z"
  },
  {
    key: "průměr obdržených branek",
    label: "Pr.",
    defaultDir: "asc"
  },
  {
    key: "% zákroků",
    label: "Z%"
  },
  {
    key: "__shutoutsPerGame",
    label: "SO/Z"
  },
  {
    key: "__savesPerGame",
    label: "Zákroky/Z"
  },
  {
    key: "Průměr střel na zápas",
    label: "Střely/Z"
  }
];


function statisticsColumns() {
  if (
    state.statsView.type ===
    "goalie"
  ) {
    return (
      state.statsView.mode ===
        "perGame"
        ? GOALIE_STATS_RATE_COLUMNS
        : GOALIE_STATS_TOTAL_COLUMNS
    );
  }


  return (
    state.statsView.mode ===
      "perGame"
      ? SKATER_STATS_RATE_COLUMNS
      : SKATER_STATS_TOTAL_COLUMNS
  );
}


function statisticsVisibleColumns() {
  return statisticsColumns()
    .filter(column =>
      !state.statsView.hiddenColumns
        .includes(column.key)
    );
}


function statisticsDataset() {
  return (
    state.statsView.type === "goalie"
      ? (
          state.goalieDetails ||
          []
        )
      : (
          state.skaterDetails ||
          []
        )
  );
}


function statisticsGamesKey() {
  return (
    state.statsView.type === "goalie"
      ? "Odchytané zápasy"
      : "Odehrané zápasy"
  );
}


function statisticsDefaultSort() {
  if (
    state.statsView.type ===
    "goalie"
  ) {
    return {
      key: "% zákroků",
      dir: "desc"
    };
  }


  if (
    state.statsView.mode ===
    "perGame"
  ) {
    return {
      key: "Body na zápas",
      dir: "desc"
    };
  }


  return {
    key: "Body",
    dir: "desc"
  };
}


function statisticsColumn(
  key
) {
  return (
    statisticsColumns()
      .find(
        column =>
          column.key === key
      ) ||
    null
  );
}


function statisticsDefaultDirection(
  key
) {
  return (
    statisticsColumn(key)
      ?.defaultDir ||
    "desc"
  );
}


function statisticsTimeValue(
  value
) {
  const text =
    cleanCell(value);

  if (!text) {
    return NaN;
  }

  if (!text.includes(":")) {
    return toNumber(text);
  }

  const parts =
    text.split(":");

  const minutes =
    Number(parts[0]);

  const seconds =
    Number(parts[1] || 0);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return NaN;
  }

  return (
    minutes * 60 +
    seconds
  );
}


function statisticsNumericValue(
  record,
  key
) {
  const games =
    toNumber(
      getValue(
        record,
        statisticsGamesKey()
      )
    ) || 0;


  function perGame(
    sourceKey
  ) {
    if (games <= 0) {
      return NaN;
    }

    const value =
      toNumber(
        getValue(
          record,
          sourceKey
        )
      );

    if (
      !Number.isFinite(value)
    ) {
      return NaN;
    }

    return value / games;
  }


  switch (key) {

    case "__goalsPerGame":
      return perGame(
        "Goly"
      );


    case "__assistsPerGame":
      return perGame(
        "Asistence"
      );


    case "__pppPerGame":
      return perGame(
        "Body z přesilovek"
      );


    case "__plusMinusPerGame":
      return perGame(
        "+/-"
      );


    case "__pimPerGame":
      return perGame(
        "Trestné minuty"
      );


    case "__winsPerGame":
      return perGame(
        "Výhry"
      );


    case "__shutoutsPerGame":
      return perGame(
        "Čistá konta"
      );


    case "__savesPerGame":
      return perGame(
        "Zákroky"
      );


    case "__goalieMinutesPerGame": {

      if (games <= 0) {
        return NaN;
      }

      const value =
        statisticsTimeValue(
          getValue(
            record,
            "Odchytané minuty"
          )
        );

      if (
        !Number.isFinite(value)
      ) {
        return NaN;
      }

      /*
       * statisticsTimeValue vrací
       * u času se dvojtečkou sekundy.
       */
      return (
        getValue(
          record,
          "Odchytané minuty"
        ).includes(":")
          ? (
              value /
              60 /
              games
            )
          : (
              value /
              games
            )
      );
    }

  }


  const value =
    getValue(
      record,
      key
    );


  if (
    key === "Ø Času na ledě" ||
    key === "Odchytané minuty"
  ) {
    return statisticsTimeValue(
      value
    );
  }


  return toNumber(value);
}


function statisticsValueHtml(
  record,
  key
) {
  if (
    key.startsWith("__")
  ) {
    const number =
      statisticsNumericValue(
        record,
        key
      );


    if (
      !Number.isFinite(number)
    ) {
      return "–";
    }


    const digits =
      key ===
        "__goalieMinutesPerGame"
        ? 1
        : 2;


    return escapeHtml(
      number.toLocaleString(
        "cs-CZ",
        {
          minimumFractionDigits:
            digits,

          maximumFractionDigits:
            digits
        }
      )
    );
  }


  const value =
    getValue(
      record,
      key
    );


  if (!value) {
    return "–";
  }


  if (
    key.includes("%") &&
    !value.includes("%")
  ) {
    return (
      `${escapeHtml(value)} %`
    );
  }


  return escapeHtml(value);
}


function populateStatisticsSort() {
  const select =
    document.getElementById(
      "statsSort"
    );

  if (!select) {
    return;
  }

  const columns =
    statisticsColumns();

  if (
    !columns.some(
      column =>
        column.key ===
        state.statsView.sortKey
    )
  ) {
    const defaults =
      statisticsDefaultSort();

    state.statsView.sortKey =
      defaults.key;

    state.statsView.sortDir =
      defaults.dir;
  }

  select.innerHTML =
    columns
      .map(column => `
        <option
          value="${escapeHtml(
            column.key
          )}"
        >
          ${escapeHtml(
            column.label
          )}
        </option>
      `)
      .join("");

  select.value =
    state.statsView.sortKey;
}


function populateStatisticsFilters() {
  const data =
    statisticsDataset();


  populateSelect(
    document.getElementById(
      "statsTeam"
    ),

    TEAMS.map(team => ({
      value: team.code,
      label: team.name
    })),

    "Všechny týmy"
  );


  const positionSelect =
    document.getElementById(
      "statsPosition"
    );


  if (
    state.statsView.type ===
    "goalie"
  ) {
    if (positionSelect) {
      positionSelect.innerHTML = `
        <option value="">
          Brankáři
        </option>
      `;

      positionSelect.disabled =
        true;
    }
  } else {
    if (positionSelect) {
      positionSelect.disabled =
        false;
    }

    populateSelect(
      positionSelect,

      uniqueSorted(
        data.map(record =>
          getValue(
            record,
            "Pozice"
          )
        )
      ),

      "Všechny pozice"
    );
  }


  populateSelect(
    document.getElementById(
      "statsNationality"
    ),

    uniqueSorted(
      data.map(record =>
        getValue(
          record,
          "Národnost"
        )
      )
    ),

    "Všechny národnosti"
  );


  populateStatisticsSort();


  document
    .querySelectorAll(
      "[data-stats-type]"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.statsType ===
          state.statsView.type
      );
    });
    document
  .querySelectorAll(
    "[data-stats-mode]"
  )
  .forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.statsMode ===
        state.statsView.mode
    );

  });


populateStatisticsColumnsMenu();

  }

function isCzechNationality(
  value
) {
  const nationality =
    normalize(value);


  return [
    "cesko",
    "ceska republika",
    "czechia",
    "czech republic",
    "cze"
  ].some(item =>
    nationality === item ||
    nationality.includes(item)
  );
}

function statisticsFilteredData() {
  const search =
    normalize(
      document.getElementById(
        "statsSearch"
      )?.value
    );

  const team =
    cleanCell(
      document.getElementById(
        "statsTeam"
      )?.value
    );

  const position =
    normalize(
      document.getElementById(
        "statsPosition"
      )?.value
    );

  const nationality =
    normalize(
      document.getElementById(
        "statsNationality"
      )?.value
    );

  const ageGroup =
  cleanCell(
    document.getElementById(
      "statsAgeGroup"
    )?.value
  );
  
    const minGames =
    Number(
      document.getElementById(
        "statsMinGames"
      )?.value ||
      0
    );


  const gamesKey =
    statisticsGamesKey();


  return statisticsDataset()
    .filter(record => {

      const firstName =
        getValue(
          record,
          "Jméno"
        );

      const surname =
        getValue(
          record,
          "Příjmení"
        );

      const teamValue =
        getValue(
          record,
          "Tým"
        );

      const recordPosition =
        getValue(
          record,
          "Pozice"
        );

      const recordNationality =
        getValue(
          record,
          "Národnost"
        );

      const age =
        toNumber(
        getValue(
          record,
          "Věk"
          )
        );
      
      
        const games =
        toNumber(
          getValue(
            record,
            gamesKey
          )
        ) || 0;


      const searchTarget =
        normalize(
          [
            firstName,
            surname,
            teamValue,
            getTeamName(
              teamValue
            ),
            recordPosition,
            recordNationality
          ].join(" ")
        );


      return (
        (
          !search ||
          searchTarget.includes(
            search
          )
        ) &&

        (
          !team ||
          getTeamCode(
            teamValue
          ) === team
        ) &&

        (
          state.statsView.type ===
            "goalie" ||
          !position ||
          normalize(
            recordPosition
          ) === position
        ) &&

        (
          !nationality ||
          normalize(
            recordNationality
          ) === nationality
        ) &&

        

(
  !ageGroup ||

  (
    ageGroup === "u23" &&
    Number.isFinite(age) &&
    age <= 23
  )
) &&
        
        
        
        games >= minGames
      );
    });
}


function statisticsSortData(
  data
) {
  const key =
    state.statsView.sortKey;

  const direction =
    state.statsView.sortDir;


  return [...data]
    .sort((a, b) => {

      const aValue =
        statisticsNumericValue(
          a,
          key
        );

      const bValue =
        statisticsNumericValue(
          b,
          key
        );


      const aValid =
        Number.isFinite(aValue);

      const bValid =
        Number.isFinite(bValue);


      if (
        !aValid &&
        !bValid
      ) {
        return collator.compare(
          getValue(
            a,
            "Příjmení"
          ),
          getValue(
            b,
            "Příjmení"
          )
        );
      }


      if (!aValid) {
        return 1;
      }


      if (!bValid) {
        return -1;
      }


      const difference =
        direction === "asc"
          ? aValue - bValue
          : bValue - aValue;


      if (difference !== 0) {
        return difference;
      }


      return collator.compare(
        getValue(
          a,
          "Příjmení"
        ),
        getValue(
          b,
          "Příjmení"
        )
      );
    });
}


function statisticsPlayerHtml(
  record
) {
  const firstName =
    getValue(
      record,
      "Jméno"
    );

  const surname =
    getValue(
      record,
      "Příjmení"
    );

  const photo =
    getValue(
      record,
      "Foto"
    );


  return `
    <button
      type="button"
      class="stats-player"
      data-player-first="${escapeHtml(
        firstName
      )}"
      data-player-last="${escapeHtml(
        surname
      )}"
    >

      ${
        photo
          ? `
            <img
              src="${escapeHtml(photo)}"
              alt=""
              loading="lazy"
              data-hide-on-error
            >
          `
          : `
            <span
              class="stats-player-photo-placeholder"
            ></span>
          `
      }

      <span>
        <strong>
          ${escapeHtml(firstName)}
          ${escapeHtml(surname)}
        </strong>

        <small>
          ${escapeHtml(
            getValue(
              record,
              "Národnost"
            ) || ""
          )}
        </small>
      </span>

    </button>
  `;
}


function statisticsTeamHtml(
  record
) {
  const value =
    getValue(
      record,
      "Tým"
    );

  const team =
    getTeam(value);


  if (!team) {
    return escapeHtml(
      value || "-"
    );
  }


  return `
    <button
      type="button"
      class="stats-team"
      data-team-code="${escapeHtml(
        team.code
      )}"
    >

      <img
        src="${escapeHtml(
          logoUrl(
            team.code
          )
        )}"
        alt=""
        data-hide-on-error
      >

      <span>
        ${escapeHtml(
          team.code
        )}
      </span>

    </button>
  `;
}

function populateStatisticsColumnsMenu() {
  const container =
    document.getElementById(
      "statsColumnsMenu"
    );


  if (!container) {
    return;
  }


  const columns =
    statisticsColumns();


  container.innerHTML =
    columns
      .map(column => {

        const hidden =
          state.statsView.hiddenColumns
            .includes(
              column.key
            );


        return `
          <label
            class="stats-column-option"
          >

            <input
              type="checkbox"
              data-stats-column="${escapeHtml(
                column.key
              )}"
              ${
                hidden
                  ? ""
                  : "checked"
              }
            >

            <span>
              ${escapeHtml(
                column.label
              )}
            </span>

          </label>
        `;
      })
      .join("");


  container
    .querySelectorAll(
      "[data-stats-column]"
    )
    .forEach(input => {

      input.addEventListener(
        "change",
        event => {

          const key =
            event.target.dataset
              .statsColumn;


          if (
            event.target.checked
          ) {
            state.statsView
              .hiddenColumns =
              state.statsView
                .hiddenColumns
                .filter(
                  item =>
                    item !== key
                );
          } else {

            /*
             * Nenecháme uživatele
             * skrýt úplně všechny
             * statistické sloupce.
             */
            const visibleCount =
              statisticsVisibleColumns()
                .length;


            if (
              visibleCount <= 1
            ) {
              event.target.checked =
                true;

              return;
            }


            state.statsView
              .hiddenColumns
              .push(key);
          }


          renderStatistics();
        }
      );

    });
}


function renderStatistics() {
  const container =
    document.getElementById(
      "statsContent"
    );

  const counter =
    document.getElementById(
      "statsCount"
    );

  const info =
    document.getElementById(
      "statsSortInfo"
    );


  if (!container) {
    return;
  }


  const columns =
  statisticsVisibleColumns();
  
  const filtered =
    statisticsFilteredData();

  const data =
    statisticsSortData(
      filtered
    );


  if (counter) {
    counter.textContent =
      state.statsView.type ===
        "goalie"
        ? `${data.length} brankářů`
        : `${data.length} hráčů`;
  }


  const activeColumn =
    statisticsColumn(
      state.statsView.sortKey
    );


  if (info) {
    info.textContent =
      activeColumn
        ? (
            `Řazeno: ` +
            `${activeColumn.label} ` +
            (
              state.statsView.sortDir ===
                "desc"
                ? "↓"
                : "↑"
            )
          )
        : "";
  }


  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        Žádní hráči neodpovídají zvoleným filtrům.
      </div>
    `;

    return;
  }


  container.innerHTML = `
    <div class="stats-table-scroll">

      <table
        class="
          stats-table
          ${
            state.statsView.type ===
              "goalie"
              ? "stats-table-goalie"
              : "stats-table-skater"
          }
        "
      >

        <thead>
          <tr>

            <th class="stats-rank-column">
              #
            </th>

            <th class="stats-player-column">
              Hráč
            </th>

            <th>
              Tým
            </th>

            ${
              state.statsView.type ===
                "skater"
                ? `
                  <th>
                    Poz.
                  </th>
                `
                : ""
            }

            ${columns
              .map(column => {

                const active =
                  column.key ===
                  state.statsView.sortKey;

                return `
                  <th
                    class="${
                      active
                        ? "stats-active-column"
                        : ""
                    }"
                  >
                    <button
                      type="button"
                      class="stats-sort-button"
                      data-stats-sort="${escapeHtml(
                        column.key
                      )}"
                      title="Seřadit podle ${escapeHtml(
                        column.label
                      )}"
                    >
                      ${escapeHtml(
                        column.label
                      )}

                      ${
                        active
                          ? (
                              state.statsView.sortDir ===
                                "desc"
                                ? " ↓"
                                : " ↑"
                            )
                          : ""
                      }
                    </button>
                  </th>
                `;
              })
              .join("")}

          </tr>
        </thead>


        <tbody>

          ${data
            .map((record, index) => `
              <tr>

                <td class="stats-rank">
                  ${index + 1}
                </td>

                <td class="stats-player-cell">
                  ${statisticsPlayerHtml(
                    record
                  )}
                </td>

                <td>
                  ${statisticsTeamHtml(
                    record
                  )}
                </td>

                ${
                  state.statsView.type ===
                    "skater"
                    ? `
                      <td>
                        ${escapeHtml(
                          getValue(
                            record,
                            "Pozice"
                          ) || "-"
                        )}
                      </td>
                    `
                    : ""
                }

                ${columns
                  .map(column => `
                    <td
                      class="${
                        column.key ===
                          state.statsView.sortKey
                          ? "stats-active-column"
                          : ""
                      }"
                    >
                      ${statisticsValueHtml(
                        record,
                        column.key
                      )}
                    </td>
                  `)
                  .join("")}

              </tr>
            `)
            .join("")}

        </tbody>

      </table>

    </div>
  `;
}


async function setStatisticsType(
  type
) {
  if (
    ![
      "skater",
      "goalie"
    ].includes(type)
  ) {
    return;
  }


  state.statsView.type =
    type;

  state.statsView.hiddenColumns =
  [];  


  const defaults =
    statisticsDefaultSort();


  state.statsView.sortKey =
    defaults.key;

  state.statsView.sortDir =
    defaults.dir;


  await loadDetailData(type);


  populateStatisticsFilters();
  renderStatistics();
}

function setStatisticsMode(
  mode
) {
  if (
    ![
      "total",
      "perGame"
    ].includes(mode)
  ) {
    return;
  }


  state.statsView.mode =
    mode;

  state.statsView.hiddenColumns =
    [];


  const defaults =
    statisticsDefaultSort();


  state.statsView.sortKey =
    defaults.key;

  state.statsView.sortDir =
    defaults.dir;


  document
    .querySelectorAll(
      "[data-stats-mode]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.statsMode ===
          mode
      );

    });


  populateStatisticsSort();
  populateStatisticsColumnsMenu();
  renderStatistics();
}

function changeStatisticsSort(
  key
) {
  if (!statisticsColumn(key)) {
    return;
  }


  if (
    state.statsView.sortKey === key
  ) {
    state.statsView.sortDir =
      state.statsView.sortDir ===
        "desc"
        ? "asc"
        : "desc";
  } else {
    state.statsView.sortKey =
      key;

    state.statsView.sortDir =
      statisticsDefaultDirection(
        key
      );
  }


  const select =
    document.getElementById(
      "statsSort"
    );


  if (select) {
    select.value =
      key;
  }


  renderStatistics();
}


function resetStatisticsFilters() {
  [
  "statsSearch",
  "statsTeam",
  "statsPosition",
  "statsNationality",
  "statsAgeGroup"
]
    .forEach(id => {
      const element =
        document.getElementById(
          id
        );

      if (element) {
        element.value =
          "";
      }
    });


  const minGames =
    document.getElementById(
      "statsMinGames"
    );


  if (minGames) {
    minGames.value =
      "0";
  }


  const defaults =
    statisticsDefaultSort();


  state.statsView.sortKey =
    defaults.key;

  state.statsView.sortDir =
    defaults.dir;


  populateStatisticsSort();
  renderStatistics();
}

/* =========================================================
   TOP BODY / GÓLY
========================================================= */

async function renderHomeStatistics() {
  const data =
    await loadDetailData(
      "skater"
    );


  const valid =
    data.filter(record =>
      getValue(
        record,
        "Jméno"
      ) &&
      getValue(
        record,
        "Příjmení"
      )
    );


  const topPoints =
    [...valid]
      .sort(
        (a, b) =>
          (
            toNumber(
              getValue(
                b,
                "Body"
              )
            ) || 0
          ) -
          (
            toNumber(
              getValue(
                a,
                "Body"
              )
            ) || 0
          )
      )
      .slice(
        0,
        5
      );


  const topGoals =
    [...valid]
      .sort(
        (a, b) =>
          (
            toNumber(
              getValue(
                b,
                "Goly"
              )
            ) || 0
          ) -
          (
            toNumber(
              getValue(
                a,
                "Goly"
              )
            ) || 0
          )
      )
      .slice(
        0,
        5
      );


  renderLiveRanking(
    "#topBody .live-stats",
    topPoints,
    "Body"
  );


  renderLiveRanking(
    "#topGoly .live-stats",
    topGoals,
    "Goly"
  );
}


function renderLiveRanking(
  selector,
  data,
  statistic
) {
  const container =
    document.querySelector(
      selector
    );


  if (!container) {
    return;
  }


  if (!data.length) {
    container.innerHTML = `
      <div class="live-empty">
        Data nejsou k dispozici.
      </div>
    `;

    return;
  }


  container.innerHTML =
    data
      .map(record => {
        const firstName =
          getValue(
            record,
            "Jméno"
          );

        const surname =
          getValue(
            record,
            "Příjmení"
          );


        return `
          <div class="live-row">

            <button
              type="button"
              class="live-name live-player-link"
              data-player-first="${escapeHtml(firstName)}"
              data-player-last="${escapeHtml(surname)}"
            >
              ${escapeHtml(firstName)}
              ${escapeHtml(surname)}
            </button>


            <span class="live-value">
              ${escapeHtml(
                getValue(
                  record,
                  statistic
                ) ||
                "0"
              )}
            </span>

          </div>
        `;
      })
      .join("");
}


/* =========================================================
   RESET FILTRŮ
========================================================= */

function resetPlayerFilters() {
  [
    "vyhledavani",
    "filtrTymu",
    "filtrPozice",
    "filtrDrzeni",
    "filtrNarodnost",
    "filtrSmlouva",
    "razeni"
  ]
    .forEach(id => {
      const element =
        document.getElementById(
          id
        );

      if (element) {
        element.value =
          "";
      }
    });


  renderPlayers();
}


function resetTransferFilters() {
  [
    "vyhledavaniPrestupy",
    "filtrSezonaPrestupy",
    "filtrOdkudPrestupy",
    "filtrKamPrestupy"
  ]
    .forEach(id => {
      const element =
        document.getElementById(
          id
        );

      if (element) {
        element.value =
          "";
      }
    });


  renderTransfers();
}


function resetScheduleFilters() {
  [
    "filtrKoloRozpis",
    "filtrTymRozpis"
  ]
    .forEach(id => {
      const element =
        document.getElementById(
          id
        );

      if (element) {
        element.value =
          "";
      }
    });


  renderSchedule();
}


/* =========================================================
   UDÁLOSTI
========================================================= */

function bindEvents() {
  /*
   * Delegované klikání
   */
  document.addEventListener(
    "click",
    async event => {

      const navButton =
        event.target.closest(
          "[data-nav]"
        );


      if (navButton) {
        event.preventDefault();

        await handleNavigation(
          navButton.dataset.nav
        );

        return;
      }


      const backButton =
        event.target.closest(
          "[data-back]"
        );


      if (backButton) {
        event.preventDefault();

        goBack();

        return;
      }


      const playerButton =
        event.target.closest(
          "[data-player-key]"
        );


      if (playerButton) {
        const player =
          state.playerMap.get(
            playerButton.dataset.playerKey
          );


        if (player) {
          await openPlayer(
            player
          );
        }

        return;
      }


      const namedPlayer =
        event.target.closest(
          "[data-player-first][data-player-last]"
        );


      if (namedPlayer) {
        await openPlayerByName(
          namedPlayer.dataset.playerFirst,
          namedPlayer.dataset.playerLast
        );

        return;
      }


      const statsTypeButton =
  event.target.closest(
    "[data-stats-type]"
  );


if (statsTypeButton) {
  await setStatisticsType(
    statsTypeButton.dataset.statsType
  );

  return;
}


const statsModeButton =
  event.target.closest(
    "[data-stats-mode]"
  );


if (statsModeButton) {
  setStatisticsMode(
    statsModeButton.dataset.statsMode
  );

  return;
}


const statsSortButton =
  event.target.closest(
    "[data-stats-sort]"
  );


if (statsSortButton) {
  changeStatisticsSort(
    statsSortButton.dataset.statsSort
  );

  return;
}
  const careerTab =
  event.target.closest(
    "[data-career-tab]"
  );

      if (careerTab) {
        state.careerView.section =
          careerTab.dataset.careerTab;

        state.careerView.league =
          "";

        state.careerView.phase =
          "ALL";

        renderCareerView();

        return;
      }


      const teamButton =
        event.target.closest(
          "[data-team-code]"
        );


      if (teamButton) {
        await openClub(
          teamButton.dataset.teamCode
        );

        return;
      }


      if (
        event.target.closest(
          "[data-transfer-prev]"
        )
      ) {
        changeTransferSlide(
          -1
        );

        return;
      }


      if (
        event.target.closest(
          "[data-transfer-next]"
        )
      ) {
        changeTransferSlide(
          1
        );

        return;
      }
    }
  );


  /*
   * Kariérní selecty.
   */
  document.addEventListener(
    "change",
    event => {

      const leagueSelect =
        event.target.closest(
          "[data-career-league]"
        );


      if (leagueSelect) {
        state.careerView.league =
          leagueSelect.value;

        state.careerView.phase =
          "ALL";

        renderCareerView();

        return;
      }


      const phaseSelect =
        event.target.closest(
          "[data-career-phase]"
        );


      if (phaseSelect) {
        state.careerView.phase =
          phaseSelect.value;

        renderCareerView();

        return;
      }
    }
  );


  /*
   * Rozbitý obrázek skryjeme.
   */
  document.addEventListener(
    "error",
    event => {
      const target =
        event.target;


      if (
        target instanceof
          HTMLImageElement &&
        target.hasAttribute(
          "data-hide-on-error"
        )
      ) {
        target.style.display =
          "none";
      }
    },
    true
  );


  /*
   * Hráčské filtry.
   */
  [
    "filtrTymu",
    "filtrPozice",
    "filtrDrzeni",
    "filtrNarodnost",
    "filtrSmlouva",
    "razeni"
  ]
    .forEach(id => {
      document
        .getElementById(
          id
        )
        ?.addEventListener(
          "change",
          renderPlayers
        );
    });


  document
    .getElementById(
      "vyhledavani"
    )
    ?.addEventListener(
      "input",
      renderPlayers
    );


  /*
 * Statistiky.
 */
[
  "statsTeam",
  "statsPosition",
  "statsNationality",
  "statsAgeGroup",
  "statsMinGames"
]
  .forEach(id => {
    document
      .getElementById(
        id
      )
      ?.addEventListener(
        "change",
        renderStatistics
      );
  });


document
  .getElementById(
    "statsSearch"
  )
  ?.addEventListener(
    "input",
    renderStatistics
  );


document
  .getElementById(
    "statsSort"
  )
  ?.addEventListener(
    "change",
    event => {

      const key =
        event.target.value;

      state.statsView.sortKey =
        key;

      state.statsView.sortDir =
        statisticsDefaultDirection(
          key
        );

      renderStatistics();
    }
  );


document
  .getElementById(
    "resetStats"
  )
  ?.addEventListener(
    "click",
    resetStatisticsFilters
  );


  /*
   * Přestupy.
   */
  [
    "filtrSezonaPrestupy",
    "filtrOdkudPrestupy",
    "filtrKamPrestupy"
  ]
    .forEach(id => {
      document
        .getElementById(
          id
        )
        ?.addEventListener(
          "change",
          renderTransfers
        );
    });


  document
    .getElementById(
      "vyhledavaniPrestupy"
    )
    ?.addEventListener(
      "input",
      renderTransfers
    );


  document
    .getElementById(
      "resetPrestupy"
    )
    ?.addEventListener(
      "click",
      resetTransferFilters
    );


  /*
   * Rozpis.
   */
  [
    "filtrKoloRozpis",
    "filtrTymRozpis"
  ]
    .forEach(id => {
      document
        .getElementById(
          id
        )
        ?.addEventListener(
          "change",
          renderSchedule
        );
    });


  document
    .getElementById(
      "resetRozpis"
    )
    ?.addEventListener(
      "click",
      resetScheduleFilters
    );
}

/* =========================================================
   ROUTER – NAČTENÍ URL
========================================================= */

async function openRouteFromLocation() {
  const path =
    currentPath();


  /*
   * Podpora starých odkazů:
   * ?klub=PCE
   */
  const parameters =
    new URLSearchParams(
      window.location.search
    );


  const legacyClub =
    parameters.get(
      "klub"
    );


  if (
    legacyClub &&
    getTeam(legacyClub)
  ) {
    const newPath =
      clubPath(
        legacyClub
      );


    setBrowserPath(
      newPath,
      {
        replace: true
      }
    );


    await openClub(
      legacyClub,
      {
        updateUrl: false
      }
    );

    return;
  }


  /*
   * Statické stránky.
   */
  const staticRoute =
    Object.entries(
      PAGE_PATHS
    )
      .find(
        ([, routePath]) =>
          routePath === path
      );


  if (staticRoute) {
    await handleNavigation(
      staticRoute[0],
      {
        updateUrl: false
      }
    );

    return;
  }


  /*
   * Profil hráče.
   */
  const playerMatch =
    path.match(
      /^\/hraci\/([^/]+)$/
    );


  if (playerMatch) {
    const player =
      findPlayerBySlug(
        playerMatch[1]
      );


    if (player) {
      await openPlayer(
        player,
        {
          updateUrl: false
        }
      );

      return;
    }


    await handleNavigation(
      "players",
      {
        updateUrl: false
      }
    );

    return;
  }


  /*
   * Profil klubu.
   */
  const clubMatch =
    path.match(
      /^\/kluby\/([^/]+)$/
    );


  if (clubMatch) {
    const team =
      findTeamBySlug(
        clubMatch[1]
      );


    if (team) {
      await openClub(
        team.code,
        {
          updateUrl: false
        }
      );

      return;
    }


    await handleNavigation(
      "clubs",
      {
        updateUrl: false
      }
    );

    return;
  }


  /*
   * Neznámá URL.
   */
  setBrowserPath(
    "/",
    {
      replace: true
    }
  );


  await handleNavigation(
    "home",
    {
      updateUrl: false
    }
  );
}


/* =========================================================
   START APLIKACE
========================================================= */

async function init() {
  bindEvents();

  renderClubs();


  const jobs = [
    loadPlayers(),
    loadClubs(),
    loadTransfers(),
    loadStandings(),
    loadSchedule(),
    renderHomeStatistics()
  ];


  const results =
    await Promise.allSettled(
      jobs
    );


    results.forEach(
    result => {
      if (
        result.status ===
        "rejected"
      ) {
        console.error(
          "ELH IceStats:",
          result.reason
        );
      }
    }
  );


  window.history.replaceState(
    {
      iceStats: true,
      routeIndex: 0
    },
    "",
    window.location.pathname +
    window.location.search
  );


  state.routeIndex =
    0;


  await openRouteFromLocation();
}

window.addEventListener(
  "popstate",
  async event => {

    state.routeIndex =
      Number(
        event.state
          ?.routeIndex ||
        0
      );


    await openRouteFromLocation();

  }
);


document.addEventListener(
  "DOMContentLoaded",
  init
);