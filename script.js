let hraciData = [];
function normalizujGlobal(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
/* === PŘEHLED KLUBŮ === */
const kluby = [
  { nazev: "HC Dynamo Pardubice", zkratka: "PCE" },
  { nazev: "HC Sparta Praha", zkratka: "SPA" },
  { nazev: "HC Oceláři Třinec", zkratka: "TRI" },
  { nazev: "HC Kometa Brno", zkratka: "KOM" },
  { nazev: "HC Škoda Plzeň", zkratka: "PLZ" },
  { nazev: "Mountfield HK", zkratka: "MHK" },
  { nazev: "HC Vítkovice Ridera", zkratka: "VIT" },
  { nazev: "HC Olomouc", zkratka: "OLO" },
  { nazev: "BK Mladá Boleslav", zkratka: "MBL" },
  { nazev: "HC Energie Karlovy Vary", zkratka: "KVA" },
  { nazev: "Banes Motor České Budějovice", zkratka: "CBU" },
  { nazev: "HC Litvínov", zkratka: "LIT" },
  { nazev: "Bílí Tygři Liberec", zkratka: "LIB" },
  { nazev: "Rytíři Kladno", zkratka: "KLA" }
];
// --- MAPA ZKRATEK TÝMŮ ELH ---
const zkratkyTymu = {
  "HC Dynamo Pardubice": "PCE",
  "HC Sparta Praha": "SPA",
  "HC Oceláři Třinec": "TRI",
  "HC Kometa Brno": "KOM",
  "HC Škoda Plzeň": "PLZ",
  "Mountfield HK": "MHK",
  "HC Vítkovice Ridera": "VIT",
  "HC Olomouc": "OLO",
  "BK Mladá Boleslav": "MBL",
  "HC Energie Karlovy Vary": "KVA",
  "Banes Motor České Budějovice": "CBU",
  "HC Litvínov": "LIT",
  "Bílí Tygři Liberec": "LIB",
  "Rytíři Kladno": "KLA"
};
const nazvyTymu = {
  CBU: "Banes Motor České Budějovice",
  PLZ: "HC Škoda Plzeň",
  SPA: "HC Sparta Praha",
  TRI: "HC Oceláři Třinec",
  KOM: "HC Kometa Brno",
  MBL: "BK Mladá Boleslav",
  LIT: "HC Verva Litvínov",
  KVA: "HC Energie Karlovy Vary",
  OLO: "HC Olomouc",
  LIB: "Bílí Tygři Liberec",
  MHK: "Mountfield HK",
  PCE: "HC Dynamo Pardubice",
  KLA: "Rytíři Kladno",
  VIT: "HC Vítkovice Ridera",
};

// --- FUNKCE PRO ZOBRAZENÍ LOGA TÝMU ---
function logoTymu(nazev) {
  if (!nazev) return "";
  const zkratka = zkratkyTymu[nazev] || nazev;
  const path = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${zkratka}.png`;
  return `<img src="${path}" alt="${zkratka}" class="logoMale">`;
}

// --- NAČTENÍ DAT Z CSV ---
async function nactiData() {
  const response = await fetch("https://raw.githubusercontent.com/Adamos1511/ELH_web/refs/heads/main/hraciELH.csv");
  const text = await response.text();
  const radky = text.trim().split("\n").slice(1);

  hraciData = radky.map(r => {
    const [jmeno, prijmeni, smlouva, pozice, tym, vek, drzeni, narodnost, foto] = r.split(";");
    return {
      jmeno: jmeno?.trim(),
      prijmeni: prijmeni?.trim(),
      smlouva: smlouva?.trim(),
      pozice: pozice?.trim(),
      tym: tym?.trim(),
      vek: parseInt(vek?.trim()) || "",
      drzeni: drzeni?.trim(),
      narodnost: narodnost?.trim(),
      foto: foto?.trim().replace(/\r/g, "")

    };
  });

  naplnitFiltry();
  zobrazHrace(hraciData);
}
let dataKluby = [];

Papa.parse("https://raw.githubusercontent.com/Adamos1511/ELH_web/refs/heads/main/kluby.csv", {
  download: true,
  header: true,
  complete: function(results) {
    dataKluby = results.data;
  }
});

// --- ZOBRAZENÍ HRÁČŮ ---
function zobrazHrace(data) {
  const container = document.getElementById("hraci");
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = "<p class='zadni-hraci'>Žádní hráči nenalezeni.</p>";
    return;
  }

  container.innerHTML = data.map(h => `
    <div class="hrac-radek" onclick="zobrazDetail('${h.jmeno}', '${h.prijmeni}', '${h.tym}', '${h.pozice}', '${h.vek}', '${h.smlouva}', '${h.drzeni}', '${h.narodnost}', '${h.foto}')">
      
      <div class="hrac-foto-mini">
        ${
          h.foto
            ? `<img src="${h.foto}" alt="${h.jmeno} ${h.prijmeni}">`
            : `<div class="foto-mini-placeholder"></div>`
        }
      </div>

      <div class="hrac-jmeno">
        <strong>${h.jmeno} ${h.prijmeni}</strong>
        <span>${h.narodnost || "-"}</span>
      </div>

      <div class="hrac-tym">
        ${logoTymu(h.tym)}
        <span>${zkratkyTymu[h.tym] || h.tym}</span>
      </div>

      <div class="hrac-pozice">${h.pozice || "-"}</div>
      <div class="hrac-vek">${h.vek || "-"} let</div>
      <div class="hrac-smlouva">${h.smlouva || "-"}</div>
    </div>
  `).join("");
}


// --- DETAIL HRÁČE ---
function zobrazDetail(jmeno, prijmeni, tym, pozice, vek, smlouva, drzeni, narodnost, foto) {
const jeBrankar =
  pozice &&
  (
    pozice.toLowerCase().includes("brank") ||
    pozice.toLowerCase().includes("g") ||
    pozice.toLowerCase() === "b"
  );

const csvUrl = jeBrankar
  ? "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/brankari_detail.csv"
  : "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";  const logoUrl = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${tym}.png`;
  const zkratkaProKlik = zkratkyTymu[tym] || tym;
  const plnyNazev = nazvyTymu[tym] || tym;

  function normalizuj(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getHodnota(obj, key) {
    const hledanyKey = normalizuj(key);
    const realKey = Object.keys(obj).find(k => normalizuj(k) === hledanyKey);
    return realKey ? obj[realKey] : "";
  }

  Papa.parse(csvUrl, {
    download: true,
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    complete: function (results) {
      const hrac = results.data.find(r =>
        normalizuj(r["Jméno"]) === normalizuj(jmeno) &&
        normalizuj(r["Příjmení"]) === normalizuj(prijmeni)
      );
      console.log("NALEZENÝ HRÁČ:", hrac);
      console.log("SLOUPCE CSV:", hrac ? Object.keys(hrac) : "hráč nenalezen");
      const statistiky = jeBrankar
  ? [
      ["Odchytané zápasy", "Odchytané zápasy"],
      ["Odchytané minuty", "Odchytané minuty"],
      ["Výhry", "Výhry"],
      ["Průměr obdržených branek", "průměr obdržených branek"],
      ["Úspěšnost zákroků", "% zákroků", " %"],
      ["Čistá konta", "Čistá konta"],
      ["Zákroky", "Zákroky"],
      ["Střel proti", "Střel proti"],
      ["Průměr střel na zápas", "Průměr střel na zápas"],
      ["Workload", "Workload"],
      ["Role", "Role"],
      ["Archetyp", "Archetyp"],
      ["Varianta", "Varianta"],
      ["Profil hráče", "Profil Hráče"],
      ["Týmové zápasy", "Týmové zápasy"],
      ["Podíl startů", "Podíl startů"]
    ]
  : [
      ["Odehrané zápasy", "Odehrané zápasy"],
      ["Góly", "Goly"],
      ["Asistence", "Asistence"],
      ["Body", "Body"],
      ["ØČasu na ledě", "Ø Času na ledě"],
      ["Body z přesilovek", "Body z přesilovek"],
      ["+/-", "+/-"],
      ["Trestné minuty", "Trestné minuty"],
      ["Hity", "Hity"],
      ["Bloky", "Bloky"],
      ["Úspěšnost vhazování", "Úspěšnost vhazování %", " %"],
      ["Úspěšnost střelby", "Úspěšnost střelby %", " %"],
      ["Body na zápas", "Body na zápas"],
      ["Hity na zápas", "Hity na zápas"],
      ["Bloky na zápas", "Bloky na zápas"],
      ["Pořadí podle bodů v týmu", "Pořadí podle bodu v tymu"],
      ["Pořadí podle času na ledě", "Poradi prumerneho casu na lede"],
      ["Podíl na ofenzivě týmu", "Podíl na ofenzivě týmu"],
      ["Profil hráče", "Profil Hráče"],
      
    ];

      let statsHtml = "";

function cislo(hodnota) {
  return parseFloat(String(hodnota).replace(",", "."));
}

function statTyp(key, hodnota) {
  const val = cislo(hodnota);

  if (key === "Body" || key === "Goly" || key === "Góly") return "stat-star";
  if (key === "TOI_min" || key === "Ø Času na ledě") return "stat-toi";
  if (key === "Hity" || key === "Bloky") return "stat-physical";

  if (!isNaN(val)) {
    if (key.includes("Body na zápas") && val >= 0.7) return "stat-elite";
    if (key.includes("Úspěšnost střelby") && val >= 12) return "stat-elite";
    if (key.includes("Úspěšnost") && val < 45) return "stat-bad";
    if (key.includes("+/-") && val < 0) return "stat-bad";
  }

  return "";
}

function progressProcenta(key, hodnota) {
  const val = cislo(hodnota);

  if (isNaN(val)) return 0;

  // statistiky kde chceme bary
  const povoleneStaty = jeBrankar
  ? [
      "Odchytané zápasy",
      "Odchytané minuty",
      "Výhry",
      "% zákroků",
      "Čistá konta",
      "Zákroky",
      "Střel proti",
      "Průměr střel na zápas",
      "průměr obdržených branek",
     ]
  : [
      "Body",
      "Goly",
      "Góly",
      "Asistence",
      "Hity",
      "Bloky",
      "Body na zápas",
      "Úspěšnost střelby %",
      "Úspěšnost vhazování %"
    ];

  const povoleno = povoleneStaty.some(s =>
    normalizuj(key).includes(normalizuj(s))
  );

  if (!povoleno) return 0;

  // najde všechny hodnoty stejné statistiky
  const hodnoty = results.data
    .map(hrac => cislo(getHodnota(hrac, key)))
    .filter(v => !isNaN(v));

  const max = Math.max(...hodnoty);

  if (!max || max <= 0) return 0;

  if (normalizuj(key).includes(normalizuj("průměr obdržených branek"))) {
  const min = Math.min(...hodnoty);

  if (!val || !min) return 0;

  return Math.min((min / val) * 100, 100);
}
  return Math.min((val / max) * 100, 100);
}

if (hrac) {
  const skryteUdaje = [
    "Jméno",
    "Příjmení",
    "Smlouva",
    "Pozice",
    "Tým",
    "Věk",
    "Držení hole",
    "Národnost",
    "Výška (cm)",
    "Váha (kg)"
  ];

  Object.keys(hrac).forEach(key => {
    const schovat = skryteUdaje.some(udaj => normalizuj(udaj) === normalizuj(key));
    if (schovat) return;

    let hodnota = getHodnota(hrac, key);
    if (!hodnota) return;

    let jednotka = "";
    if (key.includes("%")) jednotka = " %";

    const typ = statTyp(key, hodnota);
    const progress = progressProcenta(key, hodnota);

    statsHtml +=
      '<div class="stat ' + typ + '">' +
        '<span>' + key + '</span>' +
        '<strong>' + hodnota + jednotka + '</strong>';

    if (progress > 0) {
      statsHtml +=
        '<div class="progress">' +
          '<div class="progress-fill" style="width:' + progress + '%"></div>' +
        '</div>';
    }

    statsHtml += '</div>';
  });
} else {
  statsHtml = "<p>Statistiky nenalezeny.</p>";
}

      const vyska = hrac ? getHodnota(hrac, "Výška (cm)") : "-";
      const vaha = hrac ? getHodnota(hrac, "Váha (kg)") : "-";

      const okno = window.open("", "_blank");

      okno.document.write(`
        <html lang="cs">
        <head>
          <meta charset="UTF-8">
          <title>${jmeno} ${prijmeni}</title>
          <style>
  body {
    margin: 0;
    min-height: 100vh;
    background:
      linear-gradient(90deg, rgba(160,0,0,0.75), rgba(0,17,71,0.92)),
      #001147;
    color: white;
    font-family: 'Segoe UI', Tahoma, sans-serif;
    padding: 40px;
  }

  .player-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  .player-hero {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 35px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 22px;
    padding: 24px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.35);
  }

  .foto-hrace {
    width: 100%;
    height: 420px;
    object-fit: cover;
    object-position: top center;
    border-radius: 18px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.45);
  }

  .player-name {
    font-size: 48px;
    line-height: 1;
    margin: 0 0 18px;
    text-transform: uppercase;
  }

  .team-line {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 20px;
    font-weight: 800;
    margin-bottom: 25px;
  }

  .tym-logo {
    height: 36px;
  }

  .info-grid,
  .stat-box {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .info-box,
  .stat {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .progress {
  width: 100%;
  height: 6px;
  background: rgba(255,255,255,0.15);
  border-radius: 999px;
  margin-top: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(to right, rgba(120,180,255,0.7), rgba(180,220,255,0.95));
  border-radius: 999px;
}
  .info-box span,
  .stat span:first-child {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    font-weight: 800;
    margin-bottom: 6px;
  }
    .stat {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  padding: 14px 16px;
  transition: 0.2s ease;
}

.stat:hover {
  transform: translateY(-3px);
  background: rgba(255,255,255,0.11);
  border-color: rgba(255,255,255,0.18);
}
  .info-box strong,
  .stat span:last-child {
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
  }

  .section-title {
    margin: 38px 0 18px;
    font-size: 28px;
    text-transform: uppercase;
  }

  .stat {
    min-height: 72px;
    transition: 0.2s ease;
  }

  .stat:hover {
    transform: translateY(-3px);
    background: rgba(255,255,255,0.16);
  }
</style>
        </head>

        <body>
  <div class="player-page">

    <section class="player-hero">
      <img src="${foto}" alt="Foto ${jmeno} ${prijmeni}" class="foto-hrace" onerror="this.style.display='none'">

      <div class="player-info">
        <h1 class="player-name">${jmeno} ${prijmeni}</h1>

        <div class="team-line">
          <span>${plnyNazev}</span>
          <img 
  src="${logoUrl}" 
  alt="Logo ${plnyNazev}" 
  class="tym-logo" 
  style="cursor:pointer;"
onclick="window.open('${location.href.split("index.html")[0]}index.html?klub=${zkratkaProKlik}', '_blank')"  onerror="this.style.display='none'"
>
        </div>

        <div class="info-grid">
          <div class="info-box"><span>Pozice</span><strong>${pozice}</strong></div>
          <div class="info-box"><span>Věk</span><strong>${vek}</strong></div>
          <div class="info-box"><span>Výška</span><strong>${vyska || "-"} cm</strong></div>
          <div class="info-box"><span>Váha</span><strong>${vaha || "-"} kg</strong></div>
          <div class="info-box"><span>Držení hole</span><strong>${drzeni}</strong></div>
          <div class="info-box"><span>Národnost</span><strong>${narodnost}</strong></div>
          <div class="info-box"><span>Smlouva</span><strong>${smlouva}</strong></div>
          
        </div>
      </div>
    </section>

    <h2 class="section-title">Statistiky hráče</h2>

    <div class="stat-box">
      ${statsHtml}
    </div>

  </div>
<script>
function otevriKlubZDetailu() {

  if (window.opener && typeof window.opener.otevriKlub === "function") {
    window.opener.otevriKlub("${tym}");
    return;
  }

  if (
    window.opener &&
    window.opener.opener &&
    typeof window.opener.opener.otevriKlub === "function"
  ) {
    window.opener.opener.otevriKlub("${tym}");
    return;
  }

  alert("Klub se nepodařilo otevřít.");
}

document.querySelector(".tym-logo").style.cursor = "pointer";
document.querySelector(".team-line span").style.cursor = "pointer";

document.querySelector(".tym-logo")
  .addEventListener("click", otevriKlubZDetailu);

document.querySelector(".team-line span")
  .addEventListener("click", otevriKlubZDetailu);
<\/script>

</body>
</html>
`);
    }
  });
}
window.zobrazDetail = zobrazDetail;


/* --- FUNKCE PRO FILTROVÁNÍ --- */
function naplnitFiltry() {
  const tymy = [...new Set(hraciData.map(h => h.tym))].sort();
  const pozice = [...new Set(hraciData.map(h => h.pozice))].sort();
  const drzeni = [...new Set(hraciData.map(h => h.drzeni))].sort();
  const narody = [...new Set(hraciData.map(h => h.narodnost))].sort();
  const smlouvy = [...new Set(hraciData.map(h => h.smlouva))].sort();

  function naplnSelect(id, pole, popisek) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">${popisek}</option>`;
    pole.forEach(val => {
      if (val) {
        const option = document.createElement("option");
        option.value = val;
        option.textContent = val;
        select.appendChild(option);
      }
    });
    select.addEventListener("change", filtruj);
  }

  naplnSelect("filtrTymu", tymy, "Všechny týmy");
  naplnSelect("filtrPozice", pozice, "Všechny pozice");
  naplnSelect("filtrDrzeni", drzeni, "Všechna držení");
  naplnSelect("filtrNarodnost", narody, "Všechny národnosti");
  naplnSelect("filtrSmlouva", smlouvy, "Všechny smlouvy");

  const vyhledavani = document.getElementById("vyhledavani");
  if (vyhledavani) vyhledavani.addEventListener("input", filtruj);

  const razeni = document.getElementById("razeni");
  if (razeni) razeni.addEventListener("change", filtruj);
}

function filtruj() {
  const hledani = document.getElementById("vyhledavani")?.value.toLowerCase() || "";
  const tym = document.getElementById("filtrTymu")?.value || "";
  const pozice = document.getElementById("filtrPozice")?.value || "";
  const drzeni = document.getElementById("filtrDrzeni")?.value || "";
  const narodnost = document.getElementById("filtrNarodnost")?.value || "";
  const smlouva = document.getElementById("filtrSmlouva")?.value || "";
  const razeni = document.getElementById("razeni")?.value || "";

  let filtrovani = hraciData.filter(h =>
    (!tym || h.tym === tym) &&
    (!pozice || h.pozice === pozice) &&
    (!drzeni || h.drzeni === drzeni) &&
    (!narodnost || h.narodnost === narodnost) &&
    (!smlouva || h.smlouva === smlouva) &&
    (`${h.jmeno} ${h.prijmeni}`.toLowerCase().includes(hledani))
  );


  if (razeni) {
  filtrovani.sort((a, b) => {
    switch (razeni) {
      case "prijmeni_az":
        return a.prijmeni.localeCompare(b.prijmeni, "cs");
      case "prijmeni_za":
        return b.prijmeni.localeCompare(a.prijmeni, "cs");

      case "vek_asc":
        return (a.vek || 0) - (b.vek || 0);
      case "vek_desc":
        return (b.vek || 0) - (a.vek || 0);

      case "tym_az":
        return a.tym.localeCompare(b.tym, "cs");
      case "tym_za":
        return b.tym.localeCompare(a.tym, "cs");

      case "pozice_az":
        return a.pozice.localeCompare(b.pozice, "cs");
      case "pozice_za":
        return b.pozice.localeCompare(a.pozice, "cs");

      case "narodnost_az":
        return a.narodnost.localeCompare(b.narodnost, "cs");
      case "narodnost_za":
        return b.narodnost.localeCompare(a.narodnost, "cs");

      case "smlouva_asc":
        return a.smlouva.localeCompare(b.smlouva, "cs");
      case "smlouva_desc":
        return b.smlouva.localeCompare(a.smlouva, "cs");

      default:
        return 0;
    }
  });
}


  zobrazHrace(filtrovani);
}
/* === FUNKCE PRO ZOBRAZENÍ KLUBŮ === */


// Po kliknutí na "Kluby" v menu
document.addEventListener("DOMContentLoaded", () => {
  const odkazKluby = document.getElementById("odkazKluby");
  if (odkazKluby) {
    odkazKluby.addEventListener("click", (e) => {
      e.preventDefault();
      zobrazKluby();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

function zobrazKluby() {
  const container = document.getElementById("seznam-klubu");
  if (!container) return;
  container.innerHTML = kluby.map(k => `
    <div class="klub-karta" onclick="otevriKlub('${k.zkratka}')">
      <img src="https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${k.zkratka}.png" alt="${k.nazev}">
      <h3>${k.nazev}</h3>
    </div>
  `).join("");

  document.getElementById("kluby").style.display = "block";
}
async function otevriKlub(zkratka) {

  if (hraciData.length === 0) {
    await nactiData();
  }

  const klub = dataKluby.find(k => k["NÁZEV TÝMU"] === zkratka);

  if (!klub) {
    alert("⚠️ Klub nebyl nalezen v CSV souboru.");
    return;
  }

  const plnyNazevTymu = klub["NÁZEV TÝMU"];
  const nazevPodleZkratky = nazvyTymu[zkratka] || zkratka;

  function norm(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function esc(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, " ");
  }

  const hraciTymu = hraciData.filter(h =>
    norm(h.tym) === norm(zkratka) ||
    norm(h.tym) === norm(nazevPodleZkratky) ||
    norm(zkratkyTymu[h.tym]) === norm(zkratka) ||
    norm(nazvyTymu[h.tym]) === norm(nazevPodleZkratky)
  );

  const logo = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${zkratka}.png`;
  const detailUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";

  function cislo(hodnota) {
    return parseFloat(String(hodnota || "0").replace(",", "."));
  }

  Papa.parse(detailUrl, {
    download: true,
    header: true,
    delimiter: ";",
    skipEmptyLines: true,

    complete: function(results) {

      const detailData = results.data;

      const detailHraciTymu = detailData.filter(d =>
        d["Tým"] === zkratka ||
        d["Tým"] === plnyNazevTymu ||
        d["Tým"] === nazevPodleZkratky
      );

      function topHrac(sloupec) {
        return detailHraciTymu
          .filter(h => h["Jméno"] && h["Příjmení"])
          .sort((a, b) => cislo(b[sloupec]) - cislo(a[sloupec]))[0];
      }

      function topText(hrac, sloupec) {
        if (!hrac) return "-";
        return `${hrac["Jméno"]} ${hrac["Příjmení"]} (${hrac[sloupec] || 0})`;
      }

      const topBody = topHrac("Body");
      const topGoly = topHrac("Goly");
      const topAsistence = topHrac("Asistence");

      const okno = window.open("", "_blank") || window;

      okno.document.write(`
        <html lang="cs">
        <head>
          <meta charset="UTF-8">
          <title>${nazevPodleZkratky}</title>

          <style>
            body {
              margin: 0;
              min-height: 100vh;
              background:
                linear-gradient(90deg, rgba(150,0,0,0.65), rgba(0,17,71,0.92)),
                #001147;
              color: white;
              font-family: 'Segoe UI', Tahoma, sans-serif;
              padding: 40px;
            }

            .club-page {
              max-width: 1250px;
              margin: 0 auto;
            }

            .club-hero {
              display: grid;
              grid-template-columns: 220px 1fr;
              gap: 35px;
              align-items: center;
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.14);
              border-radius: 24px;
              padding: 30px;
              box-shadow: 0 25px 60px rgba(0,0,0,0.35);
            }

            .club-logo {
              width: 190px;
              height: 190px;
              object-fit: contain;
              background: rgba(255,255,255,0.08);
              border-radius: 22px;
              padding: 18px;
            }

            .club-title {
              font-size: 46px;
              margin: 0 0 18px;
              text-transform: uppercase;
              line-height: 1;
            }

            .club-sub {
              color: rgba(255,255,255,0.7);
              font-size: 18px;
              font-weight: 700;
            }

            .info-grid,
            .top-players-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
              gap: 12px;
              margin-top: 28px;
            }

            .info-card,
            .top-player-card,
            .result-card,
            .player-card {
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 16px;
              padding: 16px 18px;
            }

            .info-card span,
            .top-player-card span,
            .result-card span {
              display: block;
              font-size: 12px;
              text-transform: uppercase;
              color: rgba(255,255,255,0.55);
              font-weight: 800;
              margin-bottom: 8px;
            }

            .info-card strong,
            .top-player-card strong,
            .result-card strong {
              font-size: 19px;
              color: white;
            }

            .section-title {
              margin: 42px 0 18px;
              font-size: 28px;
              text-transform: uppercase;
            }

            .results-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
              gap: 12px;
            }

            .roster-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
              gap: 16px;
              margin-top: 18px;
            }

            .player-card {
              transition: 0.2s ease;
              cursor: pointer;
            }

            .player-card:hover {
              transform: translateY(-4px);
              background: rgba(255,255,255,0.13);
            }

            .player-card h3 {
              margin: 8px 0 6px;
              font-size: 18px;
            }

            .player-card p {
              margin: 4px 0;
              color: rgba(255,255,255,0.72);
              font-size: 14px;
            }
          </style>
        </head>

        <body>
          <div class="club-page">

            <section class="club-hero">
              <img src="${logo}" alt="${nazevPodleZkratky}" class="club-logo">

              <div>
                <h1 class="club-title">${nazevPodleZkratky}</h1>
                <div class="club-sub">${klub["NÁZEV STADIONU"] || "Stadion neuveden"}</div>

                <div class="info-grid">
                  <div class="info-card"><span>Rok založení</span><strong>${klub["ROK ZALOŽENÍ"] || "-"}</strong></div>
                  <div class="info-card"><span>Počet titulů</span><strong>${klub["POČET TITULŮ"] || "-"}</strong></div>
                  <div class="info-card"><span>Poslední titul</span><strong>${klub["POSLEDNÍ TITUL"] || "-"}</strong></div>
                  <div class="info-card"><span>Hlavní trenér</span><strong>${klub["HLAVNÍ TRENÉR"] || "-"}</strong></div>
                  <div class="info-card"><span>Průměrná návštěvnost</span><strong>${klub["PRŮMĚRNÁ NÁVŠTĚVNOST"] || "-"}</strong></div>
                  <div class="info-card"><span>Kapacita stadionu</span><strong>${klub["KAPACITA"] || "-"}</strong></div>
                  <div class="info-card"><span>Zaplněnost</span><strong>${klub["% ZAPLNĚNOST"] || "-"}</strong></div>
                </div>
              </div>
            </section>

            <h2 class="section-title">Týmové průměry</h2>
            <div class="info-grid">
              <div class="info-card"><span>Průměrný věk</span><strong>${klub["Průměrný věk"] || "-"} let</strong></div>
              <div class="info-card"><span>Průměrná výška</span><strong>${klub["Průměrná výška"] || "-"} cm</strong></div>
              <div class="info-card"><span>Průměrná váha</span><strong>${klub["Průměrná váha"] || "-"} kg</strong></div>
            </div>

            <h2 class="section-title">Výsledky umístění</h2>
            <div class="results-grid">
              <div class="result-card"><span>2024/25 ZČ</span><strong>${klub["2024/25 ZČ"] || "-"}</strong></div>
              <div class="result-card"><span>2024/25 Playoff</span><strong>${klub["2024/25 PLAYOFF"] || "-"}</strong></div>
              <div class="result-card"><span>2023/24 ZČ</span><strong>${klub["2023/24 ZČ"] || "-"}</strong></div>
              <div class="result-card"><span>2023/24 Playoff</span><strong>${klub["2023/24 PLAYOFF"] || "-"}</strong></div>
              <div class="result-card"><span>2022/23 ZČ</span><strong>${klub["2022/23 ZČ"] || "-"}</strong></div>
              <div class="result-card"><span>2022/23 Playoff</span><strong>${klub["2022/23 PLAYOFF"] || "-"}</strong></div>
              <div class="result-card"><span>2021/22 ZČ</span><strong>${klub["2021/22 ZČ"] || "-"}</strong></div>
              <div class="result-card"><span>2021/22 Playoff</span><strong>${klub["2021/22 PLAYOFF"] || "-"}</strong></div>
              <div class="result-card"><span>2020/21 ZČ</span><strong>${klub["2020/21 ZČ"] || "-"}</strong></div>
              <div class="result-card"><span>2020/21 Playoff</span><strong>${klub["2020/21 PLAYOFF"] || "-"}</strong></div>
            </div>

            <h2 class="section-title">TOP hráči týmu</h2>
            <div class="top-players-grid">
              <div class="top-player-card">
                <span>Nejvíce bodů</span>
                <strong>${topText(topBody, "Body")}</strong>
              </div>

              <div class="top-player-card">
                <span>Nejvíce gólů</span>
                <strong>${topText(topGoly, "Goly")}</strong>
              </div>

              <div class="top-player-card">
                <span>Nejvíce asistencí</span>
                <strong>${topText(topAsistence, "Asistence")}</strong>
              </div>
            </div>

            <h2 class="section-title">Soupiska týmu</h2>
            <div class="roster-grid">
              ${
  hraciTymu.length
    ? hraciTymu.map((h, index) => `
      <div class="player-card" onclick="openPlayerDetailFromClub(${index})">
        <h3>${h.jmeno} ${h.prijmeni}</h3>
        <p><b>Pozice:</b> ${h.pozice || "-"}</p>
        <p><b>Věk:</b> ${h.vek || "-"}</p>
        <p><b>Národnost:</b> ${h.narodnost || "-"}</p>
        <p><b>Smlouva:</b> ${h.smlouva || "-"}</p>
      </div>
    `).join("")
    : `<div class="info-card"><strong>Soupiska nebyla nalezena.</strong></div>`
}
            </div>

          </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js"><\/script>

<script>
const hraciTymuKlub = ${JSON.stringify(hraciTymu)};
const nazvyTymuKlub = ${JSON.stringify(nazvyTymu)};

function normalizujKlub(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "");
}

function openPlayerDetailFromClub(index) {
  const h = hraciTymuKlub[index];
  if (!h) return;

  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";
  const plnyNazev = nazvyTymuKlub[h.tym] || h.tym;
  const logoUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/" + h.tym + ".png";

  Papa.parse(csvUrl, {
    download: true,
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    complete: function(results) {
      const detail = results.data.find(r =>
        normalizujKlub(r["Jméno"]) === normalizujKlub(h.jmeno) &&
        normalizujKlub(r["Příjmení"]) === normalizujKlub(h.prijmeni)
      );

      let statsHtml = "";

      if (detail) {
        Object.keys(detail).forEach(function(key) {
          const skryt = ["Jméno","Příjmení","Smlouva","Pozice","Tým","Věk","Držení hole","Národnost","Výška (cm)","Váha (kg)"]
            .some(s => normalizujKlub(s) === normalizujKlub(key));

          if (skryt || !detail[key]) return;

          statsHtml +=
            '<div class="stat">' +
              '<span>' + key + '</span>' +
              '<strong>' + detail[key] + '</strong>' +
            '</div>';
        });
      } else {
        statsHtml = "<p>Statistiky nenalezeny.</p>";
      }

      const vyska = detail ? (detail["Výška (cm)"] || "-") : "-";
      const vaha = detail ? (detail["Váha (kg)"] || "-") : "-";

      const detailOkno = window.open("", "_blank");

      detailOkno.document.write(\`
        <html lang="cs">
        <head>
          <meta charset="UTF-8">
          <title>\${h.jmeno} \${h.prijmeni}</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              background: linear-gradient(90deg, rgba(160,0,0,0.75), rgba(0,17,71,0.92)), #001147;
              color: white;
              font-family: 'Segoe UI', Tahoma, sans-serif;
              padding: 40px;
            }

            .player-page {
              max-width: 1200px;
              margin: 0 auto;
            }

            .player-hero {
              display: grid;
              grid-template-columns: 360px 1fr;
              gap: 35px;
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.14);
              border-radius: 22px;
              padding: 24px;
              box-shadow: 0 25px 60px rgba(0,0,0,0.35);
            }

            .foto-hrace {
              width: 100%;
              height: 420px;
              object-fit: cover;
              object-position: top center;
              border-radius: 18px;
            }

            .player-name {
              font-size: 48px;
              margin: 0 0 18px;
              text-transform: uppercase;
            }

            .team-line {
              display: flex;
              align-items: center;
              gap: 12px;
              font-size: 20px;
              font-weight: 800;
              margin-bottom: 25px;
            }

            .tym-logo {
              height: 36px;
            }

            .info-grid,
            .stat-box {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
              gap: 12px;
            }

            .info-box,
            .stat {
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 14px;
              padding: 14px 16px;
            }

            .info-box span,
            .stat span {
              display: block;
              font-size: 12px;
              text-transform: uppercase;
              color: rgba(255,255,255,0.55);
              font-weight: 800;
              margin-bottom: 6px;
            }

            .info-box strong,
            .stat strong {
              font-size: 20px;
              color: white;
            }

            .section-title {
              margin: 38px 0 18px;
              font-size: 28px;
              text-transform: uppercase;
            }
          </style>
        </head>

        <body>
          <div class="player-page">
            <section class="player-hero">
              <img src="\${h.foto}" class="foto-hrace" onerror="this.style.display='none'">

              <div>
                <h1 class="player-name">\${h.jmeno} \${h.prijmeni}</h1>

                <div class="team-line">
                  <span>\${plnyNazev}</span>
                  <img src="\${logoUrl}" class="tym-logo" onerror="this.style.display='none'">
                </div>

                <div class="info-grid">
                  <div class="info-box"><span>Pozice</span><strong>\${h.pozice || "-"}</strong></div>
                  <div class="info-box"><span>Věk</span><strong>\${h.vek || "-"}</strong></div>
                  <div class="info-box"><span>Výška</span><strong>\${vyska} cm</strong></div>
                  <div class="info-box"><span>Váha</span><strong>\${vaha} kg</strong></div>
                  <div class="info-box"><span>Držení hole</span><strong>\${h.drzeni || "-"}</strong></div>
                  <div class="info-box"><span>Národnost</span><strong>\${h.narodnost || "-"}</strong></div>
                  <div class="info-box"><span>Smlouva</span><strong>\${h.smlouva || "-"}</strong></div>
                </div>
              </div>
            </section>

            <h2 class="section-title">Statistiky hráče</h2>
            <div class="stat-box">\${statsHtml}</div>
          </div>
        </body>
        </html>
      \`);
    }
  });
}
<\/script>
          </body>
        </html>
      `);

      okno.document.close();

    }
  });
}

window.otevriKlub = otevriKlub;
function zobrazDetailHrace(h) {
  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";

  // odstraníme diakritiku z příjmení kvůli názvům fotek
  const prijmeniBezDiakritiky = h.prijmeni
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(" ", "_");

  // fotka hráče
  const fotoUrl = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/foto_hrac/${prijmeniBezDiakritiky}.png`;

  // mapa zkratek týmů -> plné názvy
  const nazvyTymu = {
    CBU: "Banes Motor České Budějovice",
    PLZ: "HC Škoda Plzeň",
    SPA: "HC Sparta Praha",
    TRI: "HC Oceláři Třinec",
    KOM: "HC Kometa Brno",
    MBL: "BK Mladá Boleslav",
    LIT: "HC Verva Litvínov",
    KVA: "HC Energie Karlovy Vary",
    OLO: "HC Olomouc",
    LIB: "Bílí Tygři Liberec",
    HRA: "Mountfield HK",
    PCE: "HC Dynamo Pardubice",
    KLA: "Rytíři Kladno"
  };

  const plnyNazev = nazvyTymu[h.tym] || h.tym;
  const logoUrl = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${h.tym}.png`;

  // otevře novou kartu
  const okno = window.open("", "_blank");

okno.document.write(`
    <html lang="cs">
      <head>
        <meta charset="UTF-8">
        <title>${h.jmeno} ${h.prijmeni}</title>
        <link rel="stylesheet" href="style.css">
        <style>
          body {
            background: linear-gradient(to bottom, #001147, #002b80);
            color: white;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            padding: 40px;
            text-align: center;
          }
          .hrac-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 25px;
            margin-bottom: 30px;
          }
          .hrac-header img {
            width: 180px;
            height: auto;
            border-radius: 12px;
            box-shadow: 0 0 15px rgba(0,0,0,0.4);
          }
          .info {
            background: rgba(255,255,255,0.08);
            padding: 20px 35px;
            border-radius: 12px;
            display: inline-block;
            text-align: left;
            margin-top: 20px;
          }
          .info p {
            margin: 6px 0;
            font-size: 16px;
          }
          table {
            width: 90%;
            margin: 40px auto 0 auto;
            border-collapse: collapse;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            overflow: hidden;
          }
          th, td {
            padding: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
          }
          th {
            background: rgba(255,255,255,0.15);
            text-transform: uppercase;
          }
          td {
            font-size: 15px;
          }
          .tym-logo {
            height: 22px;
            vertical-align: middle;
            margin-left: 8px;
          }
        </style>
      </head>
      <body>
        <div class="hrac-header">
          <img src="${fotoUrl}" alt="Foto ${h.jmeno} ${h.prijmeni}" onerror="this.style.display='none'">
        </div>

        <div class="info">
          <p><b>Jméno:</b> ${h.jmeno} ${h.prijmeni}</p>
          <p><b>Tým:</b> 
            ${plnyNazev}
            <img 
  src="${logoUrl}" 
  alt="Logo ${plnyNazev}" 
  class="tym-logo" 
  style="cursor:pointer;"
  onclick="alert('Tým: ${zkratkaProKlik}')"
  onerror="this.style.display='none'"
>
          </p>
          <p><b>Pozice:</b> ${h.pozice}</p>
          <p><b>Věk:</b> ${h.vek}</p>
          <p><b>Výška:</b> ${h["Výška (cm)"] || "-"} cm</p>
          <p><b>Váha:</b> ${h["Váha (kg)"] || "-"} kg</p>
          <p><b>Držení hole:</b> ${h["Držení hole"] || "-"}</p>
          <p><b>Národnost:</b> ${h.narodnost}</p>
          <p><b>Smlouva:</b> ${h.smlouva}</p>
        </div>

        <h2>Statistiky hráče</h2>
        <div id="statistiky">Načítám data...</div>
      <script>
document.querySelector(".tym-logo").style.cursor = "pointer";

document.querySelector(".tym-logo").addEventListener("click", function() {
  window.opener.otevriKlub("${tym}");
});

document.querySelector(".team-line span").style.cursor = "pointer";

document.querySelector(".team-line span").addEventListener("click", function() {
  window.opener.otevriKlub("${tym}");
});
</script>

</body>
</html>
`);

  // načti statistiky z CSV
Papa.parse("${csvUrl}", {
  download: true,
  header: true,
  delimiter: ";",
  skipEmptyLines: true,
  complete: function (results) {
    const data = results.data.filter(r =>
      r["Jméno"] === h.jmeno && r["Příjmení"] === h.prijmeni
    );

    if (data.length === 0) {
      okno.document.getElementById("statistiky").innerHTML = "<p>Statistiky nenalezeny.</p>";
      return;
    }

    const hrac = data[0];
    function normalizeKey(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getHodnota(obj, key) {
  const hledanyKey = normalizeKey(key);
  const realKey = Object.keys(obj).find(k => normalizeKey(k) === hledanyKey);
  return realKey ? obj[realKey] : "";
}
    const statistiky = [
      ["Jméno", "Jméno"],
      ["Příjmení", "Příjmení"],
      ["Smlouva", "Smlouva"],
      ["Pozice", "Pozice"],
      ["Tým", "Tým"],
      ["Věk", "Věk"],
      ["Držení hole", "Držení hole"],
      ["Národnost", "Národnost"],
      ["Výška", "Výška (cm)", " cm"],
      ["Váha", "Váha (kg)", " kg"],
      ["Odehrané zápasy", "Odehrané zápasy"],
      ["Góly", "Goly"],
      ["Asistence", "Asistence"],
      ["Body", "Body"],
      ["Ø času na ledě", "Ø Času na ledě"],
      ["Body z přesilovek", "Body z přesilovek"],
      ["+/-", "+/-"],
      ["Trestné minuty", "Trestné minuty"],
      ["Hity", "Hity"],
      ["Bloky", "Bloky"],
      ["Úspěšnost vhazování", "Úspěšnost vhazování %", " %"],
      ["Úspěšnost střelby", "Úspěšnost střelby %", " %"],
      ["Body na zápas", "Body na zápas"],
      ["Hity na zápas", "Hity na zápas"],
      ["Bloky na zápas", "Bloky na zápas"],
      ["Pořadí podle bodů v týmu", "Pořadí podle bodu v tymu"],
      ["Pořadí podle času na ledě", "Poradi prumerneho casu na lede"],
      ["Podíl na ofenzivě týmu", "Podíl na ofenzivě týmu"],
      ["Profil hráče", "Profil Hráče"],
      ["TOI min", "TOI_min"],
      ["Podíl num", "Podíl_num"],
       ];

    let html = "";

    statistiky.forEach(stat => {
      const label = stat[0];
      const key = stat[1];
      const suffix = stat[2] || "";
      const hodnota = hrac[key];

      html += `
        <div class="stat">
          <span>${label}</span>
          <span>${hodnota ? hodnota + suffix : "-"}</span>
        </div>
      `;
    });

        okno.document.getElementById("statistiky").classList.add("stat-box");
    okno.document.getElementById("statistiky").innerHTML = html;
  }
});
}



/* ===============================
   PŘESTUPY
================================ */

// klik v menu na "Přestupy"
document.addEventListener("DOMContentLoaded", () => {
  const odkazPrestupy = document.getElementById("odkazPrestupy");
  if (odkazPrestupy) {
    odkazPrestupy.addEventListener("click", (e) => {
      e.preventDefault();
      zobrazPrestupy();
    });
  }
});

function zobrazPrestupy() {
  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/prestupy.csv";

  Papa.parse(csvUrl, {
    
    download: true,
    header: true,
    delimiter: ";",
    complete: function (results) {
      const data = results.data.filter(r => r["JMÉNO"]);
      const elhTymy = [
  "HC Dynamo Pardubice",
  "HC Sparta Praha",
  "HC Oceláři Třinec",
  "HC Kometa Brno",
  "HC Škoda Plzeň",
  "Mountfield HK",
  "HC Vítkovice Ridera",
  "HC Olomouc",
  "BK Mladá Boleslav",
  "HC Energie Karlovy Vary",
  "Banes Motor České Budějovice",
  "HC Verva Litvínov",
  "Bílí Tygři Liberec",
  "Rytíři Kladno"
];
      const sezony = [...new Set(data.map(r => r["SEZONA"]))].sort();
      const odkud = [...new Set(data.map(r => r["ODKUD"]?.trim())
    .filter(t => elhTymy.includes(t))
)].sort();

const kam = [...new Set(
  data
    .map(r => r["KAM"]?.trim())
    .filter(t => elhTymy.includes(t))
)].sort();



      const okno = window.open("", "_blank");
      okno.document.write(`
        <html lang="cs">
        <head>
          <meta charset="UTF-8">
          <title>Přestupy ELH</title>
          <style>
            body {
              background: linear-gradient(to bottom, #001147, #002b80);
              color: white;
              font-family: 'Segoe UI', Tahoma, sans-serif;
              padding: 40px;
            }
            h1 {
              text-align: center;
              margin-bottom: 30px;
            }
            .filtry {
              display: flex;
              justify-content: center;
              gap: 15px;
              margin-bottom: 25px;
              flex-wrap: wrap;
            }
            select {
              padding: 8px 12px;
              border-radius: 8px;
              border: none;
              font-size: 14px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: rgba(255,255,255,0.08);
              border-radius: 12px;
              overflow: hidden;
            }
            th, td {
              padding: 10px 12px;
              text-align: left;
            }
            th {
              background: rgba(255,255,255,0.15);
              text-transform: uppercase;
              font-size: 13px;
            }
            tr:nth-child(even) {
              background: rgba(255,255,255,0.05);
            }
          </style>
        </head>
        <body>

        <h1>Přestupy ELH</h1>

        <div class="filtry">
          <select id="filtrSezona">
            <option value="">Všechny sezony</option>
            ${sezony.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>

          <select id="filtrOdkud">
            <option value="">Odkud</option>
            ${odkud.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>

          <select id="filtrKam">
            <option value="">Kam</option>
            ${kam.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
        </div>

        <div id="tabulka"></div>

        <script>
          const data = ${JSON.stringify(data)};

          const filtrSezona = document.getElementById("filtrSezona");
          const filtrOdkud = document.getElementById("filtrOdkud");
          const filtrKam = document.getElementById("filtrKam");

          function vykresli(radky) {
            document.getElementById("tabulka").innerHTML = \`
              <table>
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
                  \${radky.map(r => \`
                    <tr>
                      <td>\${r["JMÉNO"]}</td>
                      <td>\${r["PŘÍJMENÍ"]}</td>
                      <td>\${r["ODKUD"]}</td>
                      <td>\${r["KAM"]}</td>
                      <td>\${r["POZICE"]}</td>
                      <td>\${r["SEZONA"]}</td>
                    </tr>
                  \`).join("")}
                </tbody>
              </table>
            \`;
          }

          function filtruj() {
            let f = data.filter(r =>
              (!filtrSezona.value || r["SEZONA"] === filtrSezona.value) &&
              (!filtrOdkud.value || r["ODKUD"] === filtrOdkud.value) &&
              (!filtrKam.value || r["KAM"] === filtrKam.value)
            );
            vykresli(f);
          }

          filtrSezona.onchange = filtrOdkud.onchange = filtrKam.onchange = filtruj;
          vykresli(data);
        </script>

        </body>
        </html>
      `);
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const btnHraci = document.getElementById("btnHraci");
  const zpetMenu = document.getElementById("zpetMenu");
  const gameMenu = document.querySelector(".game-menu");
  const strankaHraci = document.getElementById("strankaHraci");

  if (btnHraci && gameMenu && strankaHraci) {
    btnHraci.addEventListener("click", (e) => {
      e.preventDefault();

      gameMenu.style.display = "none";
      strankaHraci.style.display = "block";
      document.body.style.overflow = "auto";

      if (hraciData.length === 0) {
        nactiData();
      } else {
        zobrazHrace(hraciData);
      }

      window.scrollTo(0, 0);
    });
  }

  if (zpetMenu && gameMenu && strankaHraci) {
    zpetMenu.addEventListener("click", () => {
      strankaHraci.style.display = "none";
      gameMenu.style.display = "block";
      document.body.style.overflow = "hidden";
      window.scrollTo(0, 0);
    });
  }
});
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const klubParam = params.get("klub");

  if (!klubParam) return;

  const gameMenu = document.querySelector(".game-menu");
  const strankaHraci = document.getElementById("strankaHraci");
  const sekceKluby = document.getElementById("kluby");

  if (gameMenu) gameMenu.style.display = "none";
  if (strankaHraci) strankaHraci.style.display = "none";
  if (sekceKluby) sekceKluby.style.display = "block";

  if (hraciData.length === 0) {
    await nactiData();
  }

  let pokusy = 0;

  const cekej = setInterval(() => {
    pokusy++;

    if (dataKluby.length > 0) {
      clearInterval(cekej);
      otevriKlub(klubParam);
    }

    if (pokusy > 50) {
      clearInterval(cekej);
      alert("Klubová data se nenačetla.");
    }
  }, 100);
});
async function nactiLiveStatistiky() {

  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";

  Papa.parse(csvUrl, {
    download: true,
    header: true,
    delimiter: ";",

    complete: function(results) {

      const data = results.data.filter(h => h["Jméno"]);

      // TOP BODY
      const topBody = [...data]
        .sort((a, b) => Number(b["Body"]) - Number(a["Body"]))
        .slice(0, 5);

      // TOP GOLY
      const topGoly = [...data]
        .sort((a, b) => Number(b["Goly"]) - Number(a["Goly"]))
        .slice(0, 5);

      const bodyContainer = document.querySelector("#topBody .live-stats");
      const golyContainer = document.querySelector("#topGoly .live-stats");

      bodyContainer.innerHTML = topBody.map(h => `
        <div class="live-row">
          <span class="live-name">${h["Jméno"]} ${h["Příjmení"]}</span>
          <span class="live-value">${h["Body"]}</span>
        </div>
      `).join("");

      golyContainer.innerHTML = topGoly.map(h => `
        <div class="live-row">
          <span class="live-name">${h["Jméno"]} ${h["Příjmení"]}</span>
          <span class="live-value">${h["Goly"]}</span>
        </div>
      `).join("");

    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  nactiLiveStatistiky();
});
function nactiPosledniPrestupy() {
  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/prestupy.csv";

  Papa.parse(csvUrl, {
    download: true,
    header: true,
    delimiter: ";",
    skipEmptyLines: true,

    complete: function(results) {
      const data = results.data
        .filter(r => r["JMÉNO"] && r["PŘÍJMENÍ"])
        .slice(-8)
        .reverse();

      const container = document.querySelector("#posledniPrestupy .live-stats");

      if (!container) return;

      container.innerHTML = `
  <div class="transfer-slider">
    ${data.map((r, index) => `
      <div class="transfer-slide ${index === 0 ? "active" : ""}">
        <div class="transfer-label">Nový přestup</div>

        <div class="transfer-player">
          ${r["JMÉNO"]} ${r["PŘÍJMENÍ"]}
        </div>

        <div class="transfer-position">
          ${r["POZICE"] || "-"}
        </div>

        <div class="transfer-route">
          <span>${r["ODKUD"] || "-"}</span>
          <strong>→</strong>
          <span>${r["KAM"] || "-"}</span>
        </div>

        <div class="transfer-season">
          ${r["SEZONA"] || ""}
        </div>
      </div>
    `).join("")}

    <div class="transfer-controls">
      <button id="prevTransfer">‹</button>
      <button id="nextTransfer">›</button>
    </div>
  </div>
`;

      let aktualniPrestup = 0;
      const slides = container.querySelectorAll(".transfer-slide");

      function zobrazPrestup(index) {
        slides.forEach(slide => slide.classList.remove("active"));
        slides[index].classList.add("active");
      }

      container.querySelector("#nextTransfer").addEventListener("click", () => {
        aktualniPrestup = (aktualniPrestup + 1) % slides.length;
        zobrazPrestup(aktualniPrestup);
      });

      container.querySelector("#prevTransfer").addEventListener("click", () => {
        aktualniPrestup = (aktualniPrestup - 1 + slides.length) % slides.length;
        zobrazPrestup(aktualniPrestup);
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  nactiPosledniPrestupy();
});
async function nactiTabulkuELH() {
  const container = document.getElementById("tabulkaELH");
  if (!container) return;

  const response = await fetch("TabulkaELH.csv");
  const text = await response.text();

  const radky = text
    .trim()
    .split(/\r?\n/)
    .filter(r => r.trim() !== "");

  const oddelovac = radky[0].includes(";") ? ";" : radky[0].includes("\t") ? "\t" : ",";

  const hlavickaIndex = radky.findIndex(r => r.includes("TÝM"));
  const hlavicka = radky[hlavickaIndex]
    .split(oddelovac)
    .map(h => h.trim().replace(/^\uFEFF/, ""));

  const dataRadky = radky.slice(hlavickaIndex + 1);

  const data = dataRadky.map(radek => {
    const hodnoty = radek.split(oddelovac).map(h => h.trim());
    const obj = {};

    hlavicka.forEach((sloupec, i) => {
      obj[sloupec] = hodnoty[i] || "";
    });

    return obj;
  }).filter(r => r["TÝM"]);

  container.innerHTML = `
    <div class="elh-tabulka">

      <div class="elh-hlavicka">
        <div>Pořadí</div>
        <div>Tým</div>
        <div>Zápasy</div>
        <div>V</div>
        <div>VP</div>
        <div>PP</div>
        <div>P</div>
        <div>Skóre</div>
        <div>Body</div>
        <div>Forma</div>
      </div>

      ${data.map(radek => `
        <div class="elh-radek">
          <div>${radek["POŘADÍ"] || "-"}</div>
          <div class="tym-nazev">${radek["TÝM"] || "-"}</div>
          <div>${radek["ZÁPASY"] || "-"}</div>
          <div>${radek["V"] || "-"}</div>
          <div>${radek["VP"] || "-"}</div>
          <div>${radek["PP"] || "-"}</div>
          <div>${radek["P"] || "-"}</div>
          <div>${radek["SKÓRE"] || "-"}</div>
          <div class="body-cell">${radek["BODY"] || "-"}</div>
          <div class="forma-cell">${radek["FORMA"] || "-"}</div>
        </div>
      `).join("")}

    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  const odkazTabulka = document.getElementById("odkazTabulka");
  const zpetZTabulky = document.getElementById("zpetZTabulky");

  const gameMenu = document.querySelector(".game-menu");
  const strankaHraci = document.getElementById("strankaHraci");
  const strankaTabulka = document.getElementById("strankaTabulka");
  const kluby = document.getElementById("kluby");

  if (odkazTabulka) {
    odkazTabulka.addEventListener("click", (e) => {
      e.preventDefault();

      if (gameMenu) gameMenu.style.display = "none";
      if (strankaHraci) strankaHraci.style.display = "none";
      if (kluby) kluby.style.display = "none";

      if (strankaTabulka) strankaTabulka.style.display = "block";

      nactiTabulkuELH();
      window.scrollTo(0, 0);
    });
  }

  if (zpetZTabulky) {
    zpetZTabulky.addEventListener("click", () => {
      if (strankaTabulka) strankaTabulka.style.display = "none";
      if (gameMenu) gameMenu.style.display = "block";

      window.scrollTo(0, 0);
    });
  }
});