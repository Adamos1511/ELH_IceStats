"use strict";

/* =========================================================
   ELH ICESTATS
   Kompletní frontendový řídicí modul
========================================================= */


/* =========================================================
   KONFIGURACE DAT
========================================================= */

const GITHUB_RAW =
  "https://raw.githubusercontent.com/Adamos1511/ELH_web/refs/heads/main/";

const DATA_URLS = {
  players: `${GITHUB_RAW}hraciELH.csv`,
  playerDetails: `${GITHUB_RAW}hraci_detail.csv`,
  goalieDetails: `${GITHUB_RAW}brankari_detail.csv`,
  clubs: `${GITHUB_RAW}kluby.csv`,
  transfers: `${GITHUB_RAW}prestupy.csv`,
  standings: `${GITHUB_RAW}TabulkaELH.csv`,
  schedule: `${GITHUB_RAW}rozpis.csv`,
  careers: `${GITHUB_RAW}kariery.csv`
};


/* =========================================================
   TÝMY ELH
========================================================= */

const TEAMS = [
  {
    code: "PCE",
    name: "HC Dynamo Pardubice",
    aliases: [
      "HC Dynamo Pardubice"
    ]
  },
  {
    code: "SPA",
    name: "HC Sparta Praha",
    aliases: [
      "HC Sparta Praha"
    ]
  },
  {
    code: "TRI",
    name: "HC Oceláři Třinec",
    aliases: [
      "HC Oceláři Třinec"
    ]
  },
  {
    code: "KOM",
    name: "HC Kometa Brno",
    aliases: [
      "HC Kometa Brno"
    ]
  },
  {
    code: "PLZ",
    name: "HC Škoda Plzeň",
    aliases: [
      "HC Škoda Plzeň"
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
      "HC VÍTKOVICE RIDERA"
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
      "HC Energie Karlovy Vary"
    ]
  },
  {
    code: "CBU",
    name: "Banes Motor České Budějovice",
    aliases: [
      "Banes Motor České Budějovice",
      "Banes Motor Č. Budějovice"
    ]
  },
  {
    code: "LIT",
    name: "HC Verva Litvínov",
    aliases: [
      "HC Litvínov",
      "HC Verva Litvínov",
      "HC VERVA Litvínov"
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
  expanded: false
},

  selectedPlayer: null,
  selectedClub: null,

  transferSlideIndex: 0
};


const PAGE_IDS = {
  home: "strankaMenu",
  players: "strankaHraci",
  playerDetail: "strankaDetailHrace",
  clubs: "kluby",
  clubDetail: "strankaDetailKlubu",
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
  const parsed = Number.parseFloat(
    cleanCell(value)
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace("%", "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : NaN;
}


function getValue(object, wantedKey) {
  if (!object) {
    return "";
  }

  const normalizedKey = normalize(wantedKey);

  const realKey = Object.keys(object).find(
    key => normalize(key) === normalizedKey
  );

  return realKey
    ? cleanCell(object[realKey])
    : "";
}


function uniqueSorted(values) {
  const map = new Map();

  values
    .map(cleanCell)
    .filter(Boolean)
    .forEach(value => {
      const key = normalize(value);

      if (!map.has(key)) {
        map.set(key, value);
      }
    });

  return [...map.values()]
    .sort((a, b) => collator.compare(a, b));
}


function errorHtml(message) {
  return `
    <div class="error-card">
      <strong>Nepodařilo se načíst data.</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}


/* =========================================================
   MAPOVÁNÍ TÝMŮ
========================================================= */

const teamLookup = new Map();

TEAMS.forEach(team => {
  [
    team.code,
    team.name,
    ...team.aliases
  ].forEach(alias => {
    teamLookup.set(
      normalize(alias),
      team
    );
  });
});


function getTeam(value) {
  return teamLookup.get(
    normalize(value)
  ) || null;
}


function getTeamCode(value) {
  const team = getTeam(value);

  if (team) {
    return team.code;
  }

  return cleanCell(value);
}


function getTeamName(value) {
  const team = getTeam(value);

  if (team) {
    return team.name;
  }

  return cleanCell(value);
}


function logoUrl(value) {
  const code = getTeamCode(value);

  if (!code) {
    return "";
  }

  return `${GITHUB_RAW}loga_tymu/${encodeURIComponent(code)}.png`;
}


function teamButtonHtml(value, className = "") {
  const team = getTeam(value);

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
  const response = await fetch(
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
  const result = Papa.parse(
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

      Object.entries(row).forEach(
        ([key, value]) => {
          cleaned[cleanCell(key)] =
            cleanCell(value);
        }
      );

      return cleaned;
    });
}


async function loadObjectCsv(url) {
  const text = await fetchText(url);

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
  const targetId = PAGE_IDS[page];

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
    .querySelectorAll(".app-page")
    .forEach(element => {
      element.hidden =
        element.id !== targetId;
    });

  const appNav =
    document.getElementById("appNav");

  if (appNav) {
    appNav.hidden =
      page === "home";
  }

  state.currentPage = page;

  updateActiveNavigation();

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}


function goBack() {
  const previous =
    state.history.pop() || "home";

  navigate(
    previous,
    {
      push: false
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
    .querySelectorAll("[data-nav]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.nav === active
      );
    });
}


async function handleNavigation(target) {
  switch (target) {
    case "home":
      state.history = [];

      navigate(
        "home",
        {
          push: false
        }
      );

      break;


    case "players":
      navigate("players");

      if (!state.players.length) {
        await loadPlayers();
      }

      renderPlayers();

      break;


    case "clubs":
      navigate("clubs");

      renderClubs();

      break;


    case "table":
      navigate("table");

      if (!state.standings.length) {
        await loadStandings();
      }

      renderStandings();

      break;


    case "transfers":
      navigate("transfers");

      if (!state.transfers.length) {
        await loadTransfers();
      }

      renderTransfers();

      break;


    case "schedule":
      navigate("schedule");

      if (!state.schedule.length) {
        await loadSchedule();
      }

      renderSchedule();

      break;
  }
}


/* =========================================================
   HRÁČI – NAČTENÍ
========================================================= */

async function loadPlayers() {
  const text =
    await fetchText(
      DATA_URLS.players
    );

  const parsed = Papa.parse(
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
    normalize(rows[0]?.[0]).includes("jmeno")
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
        jmeno: cleanCell(row[0]),
        prijmeni: cleanCell(row[1]),
        smlouva: cleanCell(row[2]),
        pozice: cleanCell(row[3]),
        tym: cleanCell(row[4]),
        vek: cleanCell(row[5]),
        drzeni: cleanCell(row[6]),
        narodnost: cleanCell(row[7]),
        foto: cleanCell(row[8]),
        zdroj: cleanCell(row[9])
      }));


  state.playerMap.clear();

  state.players.forEach(player => {
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
    normalize(getTeamCode(player.tym))
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


  items.forEach(item => {
    const value =
      typeof item === "string"
        ? item
        : item.value;

    const label =
      typeof item === "string"
        ? item
        : item.label;

    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = label;

    select.appendChild(option);
  });


  if (
    [...select.options].some(
      option =>
        option.value === selected
    )
  ) {
    select.value = selected;
  }
}


function populatePlayerFilters() {
  const teamOptions =
    TEAMS.map(team => ({
      value: team.code,
      label: team.name
    }));


  populateSelect(
    document.getElementById("filtrTymu"),
    teamOptions,
    "Všechny týmy"
  );


  populateSelect(
    document.getElementById("filtrPozice"),
    uniqueSorted(
      state.players.map(
        player => player.pozice
      )
    ),
    "Všechny pozice"
  );


  populateSelect(
    document.getElementById("filtrDrzeni"),
    uniqueSorted(
      state.players.map(
        player => player.drzeni
      )
    ),
    "Všechna držení"
  );


  populateSelect(
    document.getElementById("filtrNarodnost"),
    uniqueSorted(
      state.players.map(
        player => player.narodnost
      )
    ),
    "Všechny národnosti"
  );


  populateSelect(
    document.getElementById("filtrSmlouva"),
    uniqueSorted(
      state.players.map(
        player => player.smlouva
      )
    ),
    "Všechny smlouvy"
  );
}


function contractRank(contract) {
  const text =
    cleanCell(contract);

  if (!text) {
    return Number.POSITIVE_INFINITY;
  }

  const match =
    text.match(
      /(\d{2,4})\s*\/\s*(\d{2,4})(?:\s*\+\s*(\d+))?/
    );

  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  let endYear =
    Number(match[2]);

  if (endYear < 100) {
    endYear += 2000;
  }

  const extension =
    Number(match[3] || 0);

  return endYear + extension;
}


function renderPlayers() {
  const container =
    document.getElementById("hraci");

  const counter =
    document.getElementById("pocetHracu");

  if (!container) {
    return;
  }


  const search =
    normalize(
      document.getElementById("vyhledavani")
        ?.value
    );


  const team =
    cleanCell(
      document.getElementById("filtrTymu")
        ?.value
    );


  const position =
    normalize(
      document.getElementById("filtrPozice")
        ?.value
    );


  const stick =
    normalize(
      document.getElementById("filtrDrzeni")
        ?.value
    );


  const nationality =
    normalize(
      document.getElementById("filtrNarodnost")
        ?.value
    );


  const contract =
    normalize(
      document.getElementById("filtrSmlouva")
        ?.value
    );


  const sort =
    cleanCell(
      document.getElementById("razeni")
        ?.value
    );


  let data =
    state.players.filter(player => {
      const searchTarget =
        normalize(
          [
            player.jmeno,
            player.prijmeni,
            player.tym,
            getTeamName(player.tym),
            player.pozice,
            player.narodnost
          ].join(" ")
        );


      return (
        (!search ||
          searchTarget.includes(search)) &&

        (!team ||
          getTeamCode(player.tym) === team) &&

        (!position ||
          normalize(player.pozice) === position) &&

        (!stick ||
          normalize(player.drzeni) === stick) &&

        (!nationality ||
          normalize(player.narodnost) === nationality) &&

        (!contract ||
          normalize(player.smlouva) === contract)
      );
    });


  data = [...data];


  data.sort((a, b) => {
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
          (toNumber(a.vek) || 999) -
          (toNumber(b.vek) || 999)
        );


      case "vek_desc":
        return (
          (toNumber(b.vek) || -1) -
          (toNumber(a.vek) || -1)
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
          contractRank(a.smlouva) -
          contractRank(b.smlouva)
        );


      case "smlouva_desc":
        return (
          contractRank(b.smlouva) -
          contractRank(a.smlouva)
        );


      default:
        return collator.compare(
          a.prijmeni,
          b.prijmeni
        );
    }
  });


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
          getTeamCode(player.tym);

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
                  player.narodnost || "-"
                )}
              </small>
            </span>


            <span class="hrac-tym">
              ${
                code
                  ? `
                    <img
                      src="${escapeHtml(logoUrl(code))}"
                      alt=""
                      class="logoMale"
                      data-hide-on-error
                    >
                  `
                  : ""
              }

              <strong>
                ${escapeHtml(code || "-")}
              </strong>
            </span>


            <span class="hrac-pozice">
              ${escapeHtml(
                player.pozice || "-"
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
                player.smlouva || "-"
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
    state.goalieDetails = data;
  } else {
    state.skaterDetails = data;
  }


  return data;
}


function findDetailRecord(
  dataset,
  player
) {
  const candidates =
    dataset.filter(record =>
      normalize(getValue(record, "Jméno")) ===
        normalize(player.jmeno) &&

      normalize(getValue(record, "Příjmení")) ===
        normalize(player.prijmeni)
    );


  if (!candidates.length) {
    return null;
  }


  if (candidates.length === 1) {
    return candidates[0];
  }


  const wantedTeam =
    getTeamCode(player.tym);


  return (
    candidates.find(record =>
      getTeamCode(
        getValue(record, "Tým")
      ) === wantedTeam
    ) ||
    candidates[0]
  );
}


async function openPlayer(player) {
  if (!player) {
    return;
  }

  state.selectedPlayer = player;

  navigate("playerDetail");

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
    await renderPlayerDetail(player);
  } catch (error) {
    console.error(error);

    if (container) {
      container.innerHTML =
        errorHtml(error.message);
    }
  }
}


async function openPlayerByName(
  firstName,
  surname
) {
  const basePlayer =
    state.players.find(player =>
      normalize(player.jmeno) ===
        normalize(firstName) &&

      normalize(player.prijmeni) ===
        normalize(surname)
    );


  if (basePlayer) {
    await openPlayer(basePlayer);
    return;
  }


  const [
    skaters,
    goalies
  ] =
    await Promise.all([
      loadDetailData("skater"),
      loadDetailData("goalie")
    ]);


  const skater =
    skaters.find(record =>
      normalize(getValue(record, "Jméno")) ===
        normalize(firstName) &&

      normalize(getValue(record, "Příjmení")) ===
        normalize(surname)
    );


  const goalie =
    goalies.find(record =>
      normalize(getValue(record, "Jméno")) ===
        normalize(firstName) &&

      normalize(getValue(record, "Příjmení")) ===
        normalize(surname)
    );


  const detail =
    skater || goalie;


  if (!detail) {
    alert(
      "Profil tohoto hráče zatím není v databázi."
    );

    return;
  }


  const isGoalie =
    Boolean(goalie);


  const player = {
    jmeno:
      getValue(detail, "Jméno") ||
      firstName,

    prijmeni:
      getValue(detail, "Příjmení") ||
      surname,

    smlouva:
      getValue(detail, "Smlouva"),

    pozice:
      isGoalie
        ? "Brankář"
        : getValue(detail, "Pozice"),

    tym:
      getValue(detail, "Tým"),

    vek:
      getValue(detail, "Věk"),

    drzeni:
      getValue(detail, "Držení hole"),

    narodnost:
      getValue(detail, "Národnost"),

    foto:
      getValue(detail, "Foto"),

    zdroj: "",

    __detailType:
      isGoalie
        ? "goalie"
        : "skater"
  };


  await openPlayer(player);
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
      "goly",
      "góly"
    ]
      .map(normalize)
      .includes(normalizedKey)
  ) {
    return "stat-star";
  }


  if (
    normalizedKey.includes(
      normalize("času na ledě")
    )
  ) {
    return "stat-toi";
  }


  if (
    normalizedKey === normalize("hity") ||
    normalizedKey === normalize("bloky")
  ) {
    return "stat-physical";
  }


  if (Number.isFinite(number)) {
    if (
      normalizedKey.includes(
        normalize("body na zápas")
      ) &&
      number >= 0.7
    ) {
      return "stat-elite";
    }


    if (
      normalizedKey.includes(
        normalize("úspěšnost střelby")
      ) &&
      number >= 12
    ) {
      return "stat-elite";
    }


    if (
      normalizedKey.includes("+/-") &&
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

  if (!Number.isFinite(current)) {
    return 0;
  }


  const values =
    dataset
      .map(record =>
        toNumber(
          getValue(record, key)
        )
      )
      .filter(Number.isFinite);


  if (!values.length) {
    return 0;
  }


  const normalizedKey =
    normalize(key);


  if (
    normalizedKey.includes(
      normalize(
        "průměr obdržených branek"
      )
    )
  ) {
    const positives =
      values.filter(
        number => number > 0
      );


    if (
      !positives.length ||
      current <= 0
    ) {
      return 0;
    }


    const best =
      Math.min(...positives);


    return Math.min(
      100,
      (best / current) * 100
    );
  }


  const maximum =
    Math.max(...values);


  if (maximum <= 0) {
    return 0;
  }


  return Math.min(
    100,
    (current / maximum) * 100
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
    !text.includes("%")
  ) {
    return `${text} %`;
  }


  return text;
}

/* =========================================================
   KARIÉRA HRÁČE / BRANKÁŘE
========================================================= */

const CAREER_COLLAPSED_ROWS = 7;


function careerPlayerKey(
  firstName,
  surname
) {
  return [
    normalize(firstName),
    normalize(surname)
  ].join("|");
}


function normalizeCareerRecord(row) {
  const sectionRaw =
    normalize(
      getValue(row, "Sekce")
    );


  const rowTypeRaw =
    normalize(
      getValue(row, "Typ řádku")
    );


  /*
   * Kompatibilita i se starým kariery.csv.
   * Starý formát neměl Sekce / Typ řádku.
   */
  const section =
    sectionRaw.includes("repre")
      ? "REPREZENTACE"
      : "KLUBOVA";


  const rowType =
    rowTypeRaw.includes("souhrn")
      ? "SOUHRN"
      : "DETAIL";


  return {
    ...row,

    __careerSection:
      section,

    __careerRowType:
      rowType,

    __careerCompetition:
      getValue(row, "Soutěž") ||
      getValue(row, "Liga"),

    __careerClub:
      getValue(row, "Klub") ||
      getValue(row, "Tým")
  };
}


function careerFingerprint(row) {
  const keys = [
    "Sekce",
    "Typ řádku",
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
    "T"
  ];


  return keys
    .map(key =>
      normalize(
        getValue(row, key)
      )
    )
    .join("|");
}


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
        getValue(row, "Jméno") &&
        getValue(row, "Příjmení")
      )
      .map(
        normalizeCareerRecord
      );


  state.careerIndex =
    new Map();


  state.careers.forEach(row => {
    const key =
      careerPlayerKey(
        getValue(row, "Jméno"),
        getValue(row, "Příjmení")
      );


    if (
      !state.careerIndex.has(key)
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


  return state.careers;
}


async function getPlayerCareerRows(
  firstName,
  surname,
  team
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
   * Kdyby existovali dva hráči stejného jména,
   * pokusíme se je rozlišit podle současného ELH týmu.
   */
  const wantedTeam =
    getTeamCode(team);


  if (wantedTeam) {
    const teamRows =
      rows.filter(row =>
        getTeamCode(
          getValue(
            row,
            "Tým ELH"
          )
        ) === wantedTeam
      );


    if (teamRows.length) {
      rows = teamRows;
    }
  }


  /*
   * Frontendová ochrana proti případným
   * přesně duplicitním řádkům scraperu.
   */
  const unique =
    new Map();


  rows.forEach(row => {
    const fingerprint =
      careerFingerprint(row);


    if (
      !unique.has(fingerprint)
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
   * Pořadí generuje kariérní scraper podle
   * pořadí na Hokej.cz.
   */
  rows.sort((a, b) => {
    const aOrder =
      toNumber(
        getValue(a, "Pořadí")
      );


    const bOrder =
      toNumber(
        getValue(b, "Pořadí")
      );


    if (
      Number.isFinite(aOrder) &&
      Number.isFinite(bOrder)
    ) {
      return aOrder - bOrder;
    }


    return 0;
  });


  return rows;
}


function careerGetValue(
  row,
  key
) {
  if (key === "Soutěž") {
    return (
      row.__careerCompetition ||
      "-"
    );
  }


  if (key === "Klub") {
    return (
      row.__careerClub ||
      "-"
    );
  }


  const value =
    getValue(row, key);


  if (
    key === "Z%" &&
    value &&
    !value.includes("%")
  ) {
    return `${value} %`;
  }


  return value || "-";
}


function careerColumns(
  type,
  summary = false
) {
  if (type === "goalie") {
    if (summary) {
      return [
        "Soutěž",
        "Počet klubů",
        "Z",
        "V",
        "P",
        "Pr.",
        "SO",
        "Z%"
      ];
    }


    return [
      "Sezona",
      "Soutěž",
      "Klub",
      "Č",
      "GOb",
      "Zás",
      "SP",
      "Z",
      "ZZ",
      "V",
      "P",
      "R",
      "Pr.",
      "SO",
      "Z%",
      "T"
    ];
  }


  if (summary) {
    return [
      "Soutěž",
      "Počet klubů",
      "Z",
      "G",
      "A",
      "B",
      "+/-",
      "TM"
    ];
  }


  return [
    "Sezona",
    "Soutěž",
    "Klub",
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
    "GO"
  ];
}


function careerSectionRows(
  section,
  rowType
) {
  return state.careerView.rows.filter(
    row =>
      row.__careerSection === section &&
      row.__careerRowType === rowType
  );
}


function careerClubWord(value) {
  const number =
    Math.round(
      toNumber(value)
    );


  if (!Number.isFinite(number)) {
    return "klubů";
  }


  if (number === 1) {
    return "klub";
  }


  if (
    number >= 2 &&
    number <= 4
  ) {
    return "kluby";
  }


  return "klubů";
}


function careerMetricHtml(
  label,
  value
) {
  const cleanValue =
    cleanCell(value) || "-";


  return `
    <span class="career-league-metric">
      <strong>
        ${escapeHtml(cleanValue)}
      </strong>

      <small>
        ${escapeHtml(label)}
      </small>
    </span>
  `;
}


function careerSummaryCards(
  rows,
  type
) {
  if (!rows.length) {
    return "";
  }


  return `
    <div class="career-summary-heading">
      <span>
        Přehled podle soutěží
      </span>

      <small>
        ${rows.length}
        ${
          rows.length === 1
            ? "soutěž"
            : "soutěží"
        }
      </small>
    </div>


    <div class="career-league-strip">

      ${rows.map(row => {
        const league =
          careerGetValue(
            row,
            "Soutěž"
          );


        const clubs =
          careerGetValue(
            row,
            "Počet klubů"
          );


        let metrics = "";


        if (type === "goalie") {
          metrics = [
            careerMetricHtml(
              "Z",
              careerGetValue(
                row,
                "Z"
              )
            ),

            careerMetricHtml(
              "V",
              careerGetValue(
                row,
                "V"
              )
            ),

            careerMetricHtml(
              "Pr.",
              careerGetValue(
                row,
                "Pr."
              )
            ),

            careerMetricHtml(
              "Z%",
              careerGetValue(
                row,
                "Z%"
              )
            )
          ].join("");
        } else {
          metrics = [
            careerMetricHtml(
              "Z",
              careerGetValue(
                row,
                "Z"
              )
            ),

            careerMetricHtml(
              "G",
              careerGetValue(
                row,
                "G"
              )
            ),

            careerMetricHtml(
              "A",
              careerGetValue(
                row,
                "A"
              )
            ),

            careerMetricHtml(
              "B",
              careerGetValue(
                row,
                "B"
              )
            )
          ].join("");
        }


        return `
          <article class="career-league-card">

            <span class="career-league-name">
              ${escapeHtml(league)}
            </span>


            <div class="career-league-clubs">
              <strong>
                ${escapeHtml(clubs)}
              </strong>

              <span>
                ${careerClubWord(clubs)}
              </span>
            </div>


            <div class="career-league-metrics">
              ${metrics}
            </div>

          </article>
        `;
      }).join("")}

    </div>
  `;
}


function careerTableHtml(
  rows,
  type
) {
  if (!rows.length) {
    return `
      <div class="career-empty">
        Pro tuto část kariéry nejsou k dispozici data.
      </div>
    `;
  }


  const columns =
    careerColumns(
      type,
      false
    );


  const visibleRows =
    state.careerView.expanded
      ? rows
      : rows.slice(
          0,
          CAREER_COLLAPSED_ROWS
        );


  const needsToggle =
    rows.length >
    CAREER_COLLAPSED_ROWS;


  return `
    <div class="career-table-heading">
      <span>
        Sezony a soutěže
      </span>

      <small>
        ${rows.length}
        ${
          rows.length === 1
            ? "záznam"
            : "záznamů"
        }
      </small>
    </div>


    <div
      class="
        career-table-scroll
        ${
          state.careerView.expanded
            ? "expanded"
            : ""
        }
      "
    >
      <table
        class="
          career-table
          ${
            type === "goalie"
              ? "career-table-goalie"
              : "career-table-skater"
          }
        "
      >

        <thead>
          <tr>
            ${columns
              .map(column => `
                <th>
                  ${escapeHtml(column)}
                </th>
              `)
              .join("")}
          </tr>
        </thead>


        <tbody>

          ${visibleRows
            .map((row, index) => `
              <tr
                class="${
                  index === 0
                    ? "career-latest-row"
                    : ""
                }"
              >
                ${columns
                  .map(column => `
                    <td
                      class="
                        career-cell-${normalize(column)
                          .replace(/[^a-z0-9]/g, "-")}
                      "
                    >
                      ${escapeHtml(
                        careerGetValue(
                          row,
                          column
                        )
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


    ${
      needsToggle
        ? `
          <div class="career-actions">

            <button
              type="button"
              class="career-toggle"
              data-career-toggle
            >
              ${
                state.careerView.expanded
                  ? "Skrýt starší sezony"
                  : `Zobrazit celou kariéru (${rows.length})`
              }

              <span aria-hidden="true">
                ${
                  state.careerView.expanded
                    ? "↑"
                    : "↓"
                }
              </span>
            </button>

          </div>
        `
        : ""
    }
  `;
}


function safeCareerSourceUrl(
  rows
) {
  const raw =
    rows
      .map(row =>
        getValue(
          row,
          "Kariéra URL"
        )
      )
      .find(Boolean);


  if (!raw) {
    return "";
  }


  try {
    const url =
      new URL(raw);


    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(
        "hokej.cz"
      )
    ) {
      return "";
    }


    return url.href;

  } catch {
    return "";
  }
}


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
        rows.some(
          row =>
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
      availableSections[0]?.key ||
      "KLUBOVA";
  }


  const section =
    state.careerView.section;


  const detailRows =
    careerSectionRows(
      section,
      "DETAIL"
    );


  const summaryRows =
    careerSectionRows(
      section,
      "SOUHRN"
    );


  const seasons =
    new Set(
      detailRows
        .map(row =>
          getValue(
            row,
            "Sezona"
          )
        )
        .filter(Boolean)
    );


  const clubs =
    new Set(
      detailRows
        .map(row =>
          row.__careerClub
        )
        .filter(Boolean)
        .map(normalize)
    );


  const sourceUrl =
    safeCareerSourceUrl(
      rows
    );


  container.innerHTML = `
    <div class="career-shell">

      <header class="career-header">

        <div class="career-title-wrap">

          <span class="career-kicker">
            Kompletní historie
          </span>

          <h2>
            Kariéra
          </h2>

          <p>
            ${
              seasons.size
                ? `${seasons.size} sezon`
                : "Kompletní přehled"
            }

            ${
              section === "KLUBOVA" &&
              clubs.size
                ? ` · ${clubs.size} klubů`
                : ""
            }
          </p>

        </div>


        ${
          sourceUrl
            ? `
              <a
                href="${escapeHtml(sourceUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="career-source"
              >
                Hokej.cz
                <span aria-hidden="true">
                  ↗
                </span>
              </a>
            `
            : ""
        }

      </header>


      ${
        availableSections.length > 1
          ? `
            <div
              class="career-tabs"
              role="tablist"
              aria-label="Typ kariéry"
            >

              ${availableSections
                .map(item => `
                  <button
                    type="button"
                    class="
                      career-tab
                      ${
                        item.key === section
                          ? "active"
                          : ""
                      }
                    "
                    data-career-tab="${item.key}"
                    role="tab"
                    aria-selected="${
                      item.key === section
                        ? "true"
                        : "false"
                    }"
                  >
                    ${escapeHtml(item.label)}
                  </button>
                `)
                .join("")}

            </div>
          `
          : ""
      }


      <div class="career-content">

        ${
          careerSummaryCards(
            summaryRows,
            state.careerView.type
          )
        }


        ${
          careerTableHtml(
            detailRows,
            state.careerView.type
          )
        }

      </div>

    </div>
  `;
}


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
        team
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

      expanded: false
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

async function renderPlayerDetail(player) {
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
    await loadDetailData(type);


  const detail =
    findDetailRecord(
      dataset,
      player
    );


  const team =
    getTeam(
      getValue(detail, "Tým") ||
      player.tym
    );


  const teamCode =
    team?.code ||
    getTeamCode(player.tym);


  const teamName =
    team?.name ||
    getTeamName(player.tym) ||
    "-";


  const firstName =
    getValue(detail, "Jméno") ||
    player.jmeno;


  const surname =
    getValue(detail, "Příjmení") ||
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
    getValue(detail, "Věk") ||
    player.vek ||
    "-";


  const height =
    getValue(
      detail,
      "Výška (cm)"
    ) || "-";


  const weight =
    getValue(
      detail,
      "Váha (kg)"
    ) || "-";


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


  let statsHtml = "";


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
              ${playerStatType(key, value)}
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
              teamCode
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
              <span>Profil hráče</span>

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
  return state.clubs.find(record => {
    const value =
      getValue(
        record,
        "NÁZEV TÝMU"
      );

    return (
      getTeamCode(value) === code ||
      normalize(value) ===
        normalize(code)
    );
  });
}


function topTeamPlayer(
  details,
  teamCode,
  statistic
) {
  return [...details]
    .filter(record =>
      getTeamCode(
        getValue(record, "Tým")
      ) === teamCode &&
      getValue(record, "Jméno") &&
      getValue(record, "Příjmení")
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
        ) || "0"
      )}
    </small>
  `;
}


async function openClub(value) {
  const code =
    getTeamCode(value);

  if (!getTeam(code)) {
    return;
  }


  state.selectedClub =
    code;

  navigate("clubDetail");


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


    await renderClubDetail(code);
  } catch (error) {
    console.error(error);

    if (container) {
      container.innerHTML =
        errorHtml(error.message);
    }
  }
}


async function renderClubDetail(code) {
  const club =
    findClubRecord(code);


  const team =
    getTeam(code);


  if (!club || !team) {
    throw new Error(
      "Klub nebyl nalezen v kluby.csv."
    );
  }


  const details =
    await loadDetailData("skater");


  const roster =
    state.players
      .filter(player =>
        getTeamCode(player.tym) === code
      )
      .sort((a, b) =>
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
          <span>${season} ZČ</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                `${season} ZČ`
              ) || "-"
            )}
          </strong>
        </article>

        <article class="result-card">
          <span>${season} Playoff</span>
          <strong>
            ${escapeHtml(
              getValue(
                club,
                `${season} PLAYOFF`
              ) || "-"
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
                playerKey(player)
              )}"
            >
              <strong>
                ${escapeHtml(player.jmeno)}
                ${escapeHtml(player.prijmeni)}
              </strong>

              <span>
                ${escapeHtml(
                  player.pozice || "-"
                )}
              </span>

              <dl>
                <div>
                  <dt>Věk</dt>
                  <dd>
                    ${escapeHtml(
                      player.vek || "-"
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Národnost</dt>
                  <dd>
                    ${escapeHtml(
                      player.narodnost || "-"
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Smlouva</dt>
                  <dd>
                    ${escapeHtml(
                      player.smlouva || "-"
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
            ${
              escapeHtml(
                getValue(
                  club,
                  "NÁZEV STADIONU"
                ) || "Tipsport extraliga"
              )
            }
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
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
              ) || "-"
            )}
          </strong>
        </article>

      </div>


      <h2 class="section-title">
        TOP hráči týmu
      </h2>


      <div class="top-players-grid">

        <article class="top-player-card">
          <span>Nejvíce bodů</span>
          <strong>
            ${topPlayerText(
              topPoints,
              "Body"
            )}
          </strong>
        </article>


        <article class="top-player-card">
          <span>Nejvíce gólů</span>
          <strong>
            ${topPlayerText(
              topGoals,
              "Goly"
            )}
          </strong>
        </article>


        <article class="top-player-card">
          <span>Nejvíce asistencí</span>
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
      getValue(row, "JMÉNO") &&
      getValue(row, "PŘÍJMENÍ")
    );


  populateTransferFilters();

  renderTransfers();

  renderTransferSlider();
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
        .filter(
          value =>
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
        .filter(
          value =>
            value &&
            value !== "-"
        )
    ),

    "Kam"
  );
}


function transferTeamHtml(value) {
  const text =
    cleanCell(value) || "-";

  const team =
    getTeam(text);


  if (!team) {
    return escapeHtml(text);
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
    state.transfers.filter(transfer => {
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


      return (
        (
          !search ||
          normalize(
            `${firstName} ${surname}`
          ).includes(search)
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

          ${data.map(transfer => {
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
                    ) || "-"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    getValue(
                      transfer,
                      "SEZONA"
                    ) || "-"
                  )}
                </td>

              </tr>
            `;
          }).join("")}

        </tbody>
      </table>
    </div>
  `;
}


/* =========================================================
   SLIDER PŘESTUPŮ NA ÚVODU
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


  state.transferSlideIndex = 0;


  container.innerHTML = `
    <div class="transfer-slider">

      ${latest.map(
        (transfer, index) => `
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
                ) || "-"
              )}
            </div>

            <div class="transfer-route">
              <span>
                ${escapeHtml(
                  getValue(
                    transfer,
                    "ODKUD"
                  ) || "-"
                )}
              </span>

              <strong>→</strong>

              <span>
                ${escapeHtml(
                  getValue(
                    transfer,
                    "KAM"
                  ) || "-"
                )}
              </span>
            </div>

            <div class="transfer-season">
              ${escapeHtml(
                getValue(
                  transfer,
                  "SEZONA"
                ) || ""
              )}
            </div>

          </div>
        `
      ).join("")}


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

    </div>
  `;
}


function changeTransferSlide(direction) {
  const slides =
    document.querySelectorAll(
      "#posledniPrestupy .transfer-slide"
    );


  if (!slides.length) {
    return;
  }


  state.transferSlideIndex =
    (
      state.transferSlideIndex +
      direction +
      slides.length
    ) % slides.length;


  slides.forEach(
    (slide, index) => {
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
    ) || [];


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
          ${result}
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


      ${state.standings.map(row => {
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
          getTeam(teamValue);


        const rowClass =
          position <= 4
            ? "top4"
            : position >= 5 &&
              position <= 12
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
                        logoUrl(team.code)
                      )}"
                      alt=""
                      class="logoMale"
                      data-hide-on-error
                    >

                    <button
                      type="button"
                      data-team-code="${escapeHtml(team.code)}"
                    >
                      ${escapeHtml(team.name)}
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
      }).join("")}

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


  const matches = [];

  let currentRound = 0;


  (parsed.data || [])
    .forEach(row => {
      const first =
        cleanCell(row?.[0]);


      const roundMatch =
        first.match(
          /^(\d+)\s*\.\s*kolo/i
        );


      if (roundMatch) {
        currentRound =
          Number(roundMatch[1]);

        return;
      }


      const home =
        cleanCell(row?.[1]);

      const versus =
        normalize(row?.[2]);

      const away =
        cleanCell(row?.[3]);


      if (
        !currentRound ||
        !home ||
        !away ||
        versus !== "vs"
      ) {
        return;
      }


      matches.push({
        round: currentRound,
        home,
        away,
        date: cleanCell(row?.[4]),
        time: cleanCell(row?.[5])
      });
    });


  state.schedule =
    matches;


  populateScheduleFilters();

  renderSchedule();

  renderCurrentRound();
}


function scheduleDate(
  dateValue,
  timeValue = "00:00"
) {
  const date =
    cleanCell(dateValue);


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
        !Number.isFinite(number)
    )
  ) {
    return null;
  }


  const timeParts =
    cleanCell(timeValue || "00:00")
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
          match => match.round
        )
      )
    ]
      .sort(
        (a, b) => a - b
      )
      .map(round => ({
        value: String(round),
        label: `${round}. kolo`
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
      value: team.code,
      label: team.name
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

    <strong class="match-time">
      ${escapeHtml(time || "–")}
    </strong>
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
      <div class="schedule-team ${side}">
        <span>
          ${escapeHtml(value)}
        </span>
      </div>
    `;
  }


  return `
    <button
      type="button"
      class="schedule-team ${side}"
      data-team-code="${escapeHtml(team.code)}"
    >
      ${
        side === "home"
          ? `
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
          `
          : `
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
          `
      }
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
      )?.value || 0
    );


  const teamFilter =
    cleanCell(
      document.getElementById(
        "filtrTymRozpis"
      )?.value
    );


  let matches =
    state.schedule.filter(match => {
      return (
        (
          !roundFilter ||
          match.round === roundFilter
        ) &&

        (
          !teamFilter ||
          getTeamCode(match.home) ===
            teamFilter ||
          getTeamCode(match.away) ===
            teamFilter
        )
      );
    });


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
          match => match.round
        )
      )
    ].sort(
      (a, b) => a - b
    );


  container.innerHTML =
    rounds
      .map(round => {
        const roundMatches =
          matches.filter(
            match =>
              match.round === round
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

              ${roundMatches.map(match => `
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
              `).join("")}

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
          a.date - b.date
      );


  const next =
    dated.find(
      item =>
        item.date >= now
    );


  if (next) {
    return next.match.round;
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
      return nextUnknown.round;
    }


    return lastDatedRound;
  }


  return state.schedule[0].round;
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
        match.round === round
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
                  ? escapeHtml(match.time)
                  : (
                      match.date
                        ? escapeHtml(match.date)
                        : "TBD"
                    )
              }
            </span>

          </div>
        `;
      })
      .join("");
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
      getValue(record, "Jméno") &&
      getValue(record, "Příjmení")
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
      .slice(0, 5);


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
      .slice(0, 5);


  renderHomeTopList(
    "#topBody .live-stats",
    topPoints,
    "Body"
  );


  renderHomeTopList(
    "#topGoly .live-stats",
    topGoals,
    "Goly"
  );
}


function renderHomeTopList(
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
                ) || "0"
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
  ].forEach(id => {
    const element =
      document.getElementById(id);

    if (element) {
      element.value = "";
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
  ].forEach(id => {
    const element =
      document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });


  renderTransfers();
}


function resetScheduleFilters() {
  [
    "filtrKoloRozpis",
    "filtrTymRozpis"
  ].forEach(id => {
    const element =
      document.getElementById(id);

    if (element) {
      element.value = "";
    }
  });


  renderSchedule();
}


/* =========================================================
   UDÁLOSTI
========================================================= */

function bindEvents() {
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
          await openPlayer(player);
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

      const careerTab =
  event.target.closest(
    "[data-career-tab]"
  );


if (careerTab) {
  state.careerView.section =
    careerTab.dataset.careerTab;

  state.careerView.expanded =
    false;

  renderCareerView();

  return;
}


const careerToggle =
  event.target.closest(
    "[data-career-toggle]"
  );


if (careerToggle) {
  state.careerView.expanded =
    !state.careerView.expanded;

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
        changeTransferSlide(-1);

        return;
      }


      if (
        event.target.closest(
          "[data-transfer-next]"
        )
      ) {
        changeTransferSlide(1);
      }
    }
  );


  document.addEventListener(
    "error",
    event => {
      const target =
        event.target;

      if (
        target instanceof HTMLImageElement &&
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


  [
    "filtrTymu",
    "filtrPozice",
    "filtrDrzeni",
    "filtrNarodnost",
    "filtrSmlouva",
    "razeni"
  ].forEach(id => {
    document
      .getElementById(id)
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


  document
    .getElementById(
      "resetHraci"
    )
    ?.addEventListener(
      "click",
      resetPlayerFilters
    );


  [
    "filtrSezonaPrestupy",
    "filtrOdkudPrestupy",
    "filtrKamPrestupy"
  ].forEach(id => {
    document
      .getElementById(id)
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


  [
    "filtrKoloRozpis",
    "filtrTymRozpis"
  ].forEach(id => {
    document
      .getElementById(id)
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


  results.forEach(result => {
    if (
      result.status === "rejected"
    ) {
      console.error(
        "ELH IceStats:",
        result.reason
      );
    }
  });


  const parameters =
    new URLSearchParams(
      window.location.search
    );


  const club =
    parameters.get("klub");


  if (club && getTeam(club)) {
    state.history = ["home"];

    await openClub(club);
  }
}


document.addEventListener(
  "DOMContentLoaded",
  init
);