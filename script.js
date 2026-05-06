let hraciData = [];
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
  const csvUrl = "https://raw.githubusercontent.com/Adamos1511/ELH_web/main/hraci_detail.csv";
  const logoUrl = `https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${tym}.png`;
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
      const statistiky = [
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
        ["Role TOI", "Role_TOI"]
      ];

      let statsHtml = "";

function cislo(hodnota) {
  return parseFloat(String(hodnota).replace(",", "."));
}

function statTyp(key, hodnota) {
  const val = cislo(hodnota);

  if (key === "Body" || key === "Goly" || key === "Góly") return "stat-star";
  if (key === "TOI_min" || key === "Ø Času na ledě" || key === "Role_TOI") return "stat-toi";
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

  if (key === "Body") return Math.min(val / 80 * 100, 100);
  if (key === "Goly" || key === "Góly") return Math.min(val / 35 * 100, 100);
  if (key === "Asistence") return Math.min(val / 50 * 100, 100);
  if (key === "Hity") return Math.min(val / 120 * 100, 100);
  if (key === "Bloky") return Math.min(val / 90 * 100, 100);
  if (key.includes("Úspěšnost")) return Math.min(val, 100);
  if (key.includes("Body na zápas")) return Math.min(val / 1.2 * 100, 100);

  return 0;
}

if (hrac) {
  Object.keys(hrac).forEach(key => {
    Object.keys(hrac).forEach(key => {
  const preskocit = [
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

  if (preskocit.includes(key.trim())) return;

  let hodnota = getHodnota(hrac, key);

  if (!hodnota) return;

  // zbytek necháš
});
    let hodnota = getHodnota(hrac, key);

    if (!hodnota) return;

    let jednotka = "";
    if (key.includes("Výška")) jednotka = " cm";
    if (key.includes("Váha")) jednotka = " kg";
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
  background: linear-gradient(to right, #4facfe, #00f2fe);
  border-radius: 999px;
}
  .info-box span,
  .stat span:first-child {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.58);
    font-weight: 800;
    margin-bottom: 6px;
  }
    .stat-star {
  background: rgba(255, 215, 0, 0.10);
  border: 1px solid rgba(255, 215, 0, 0.25);
}

.stat-elite {
  background: rgba(0, 255, 140, 0.08);
  border: 1px solid rgba(0, 255, 140, 0.18);
}

.stat-bad {
  background: rgba(255, 80, 80, 0.08);
  border: 1px solid rgba(255, 80, 80, 0.18);
}

.stat-physical {
  background: rgba(0, 170, 255, 0.08);
  border: 1px solid rgba(0, 170, 255, 0.18);
}

.stat-toi {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
}
  .info-box strong,
  .stat span:last-child {
    font-size: 18px;
    font-weight: 900;
    color: white;
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
          <img src="${logoUrl}" alt="Logo ${plnyNazev}" class="tym-logo" onerror="this.style.display='none'">
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
</body>
        </html>
      `);
    }
  });
}


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
function otevriKlub(zkratka) {
  // Najdeme klub podle názvu týmu
  const klub = dataKluby.find(k => k["NÁZEV TÝMU"] === zkratka);
  if (!klub) {
    alert("⚠️ Klub nebyl nalezen v CSV souboru.");
    console.log("Hledaná hodnota:", zkratka);
    console.log("Dostupné hodnoty:", dataKluby.map(k => k["NÁZEV TÝMU"]));
    return;
  }

  // Najdeme hráče podle týmu
  const hraciTymu = hraciData.filter(h => h.tym === zkratka);

  // Otevře novou kartu
  const okno = window.open("", "_blank");
  okno.document.write(`
    <html lang="cs">
      <head>
        <meta charset="UTF-8">
        <title>${klub["NÁZEV TÝMU"]}</title>
        <link rel="stylesheet" href="style.css">
        <style>
          body {
            background: linear-gradient(to bottom, #001147, #002b80);
            color: white;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            padding: 40px;
          }
          .klub-detail {
            text-align: center;
            margin-bottom: 40px;
          }
          .klub-detail img {
            height: 120px;
            margin-bottom: 10px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px 25px;
            max-width: 950px;
            margin: 0 auto 40px auto;
            text-align: left;
            background: rgba(255,255,255,0.08);
            padding: 20px 40px;
            border-radius: 15px;
          }
          .info-grid p {
            margin: 4px 0;
            font-size: 15px;
          }
          h1 {
            font-size: 30px;
            margin-bottom: 15px;
          }
          h2 {
            text-align: center;
            margin-top: 50px;
            margin-bottom: 10px;
            font-size: 24px;
          }
          .hraci-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 20px;
            margin-top: 30px;
          }
          .hrac-karta {
            background: #fff;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
            color: black;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            transition: transform 0.2s;
          }
          .hrac-karta:hover {
            transform: scale(1.04);
          }
        </style>
      </head>

      <body>

  <!-- HLAVIČKA KLUBU -->
  <div class="klub-detail">
    <img src="https://raw.githubusercontent.com/Adamos1511/ELH_web/main/loga_tymu/${zkratka}.png" alt="${klub["NÁZEV TÝMU"]}">
    <h1>${klub["NÁZEV TÝMU"]}</h1>
  </div>

  <!-- ZÁKLADNÍ INFO O KLUBU -->
  <div class="info-grid">
    <p><b>Rok založení:</b> ${klub["ROK ZALOŽENÍ"] || "-"}</p>
    <p><b>Počet titulů:</b> ${klub["POČET TITULŮ"] || "-"}</p>

    <p><b>Hlavní trenér:</b> ${klub["HLAVNÍ TRENÉR"] || "-"}</p>
    <p><b>Sezona kdy nastoupil:</b> ${klub["SEZONA KDY NASTOUPIL"] || "-"}</p>

    <p><b>Dní jako hl. trenér:</b> ${klub["DNÍ JAKO HL.TRENÉR"] || "-"}</p>
    <p><b>Poslední titul:</b> ${klub["POSLEDNÍ TITUL"] || "-"}</p>

    <p><b>Průměrná návštěvnost:</b> ${klub["PRŮMĚRNÁ NÁVŠTĚVNOST"] || "-"}</p>
    <p><b>Kapacita stadionu:</b> ${klub["KAPACITA"] || "-"}</p>

    <p><b>% zaplněnost:</b> ${klub["% ZAPLNĚNOST"] || "-"}</p>
    <p><b>Název stadionu:</b> ${klub["NÁZEV STADIONU"] || "-"}</p>
  </div>

  <!-- 🆕 TÝMOVÉ PRŮMĚRY -->
  <h2>Týmové průměry</h2>
  <div class="info-grid">
    <p><b>Průměrný věk:</b> ${klub["Průměrný věk"] || "-"} let</p>
    <p><b>Průměrná výška:</b> ${klub["Průměrná výška"] || "-"} cm</p>

    <p><b>Průměrná váha:</b> ${klub["Průměrná váha"] || "-"} kg</p>
  </div>

  <!-- VÝSLEDKY UMÍSTĚNÍ -->
  <h2>Výsledky umístění</h2>
  <div class="info-grid">
    <p><b>2024/25 ZČ:</b> ${klub["2024/25 ZČ"] || "-"}</p>
    <p><b>2024/25 Playoff:</b> ${klub["2024/25 PLAYOFF"] || "-"}</p>

    <p><b>2023/24 ZČ:</b> ${klub["2023/24 ZČ"] || "-"}</p>
    <p><b>2023/24 Playoff:</b> ${klub["2023/24 PLAYOFF"] || "-"}</p>

    <p><b>2022/23 ZČ:</b> ${klub["2022/23 ZČ"] || "-"}</p>
    <p><b>2022/23 Playoff:</b> ${klub["2022/23 PLAYOFF"] || "-"}</p>

    <p><b>2021/22 ZČ:</b> ${klub["2021/22 ZČ"] || "-"}</p>
    <p><b>2021/22 Playoff:</b> ${klub["2021/22 PLAYOFF"] || "-"}</p>

    <p><b>2020/21 ZČ:</b> ${klub["2020/21 ZČ"] || "-"}</p>
    <p><b>2020/21 Playoff:</b> ${klub["2020/21 PLAYOFF"] || "-"}</p>
  </div>

</body>

      
        <h2>Soupiska týmu</h2>
        <div class="hraci-grid">
          ${hraciTymu.map(h => `
            <div class="hrac-karta">
              ${h.foto ? `<img src="${h.foto}" style="width:100%;border-radius:8px;">` : ""}
              <h3>${h.jmeno} ${h.prijmeni}</h3>
              <p><b>Pozice:</b> ${h.pozice}</p>
              <p><b>Věk:</b> ${h.vek}</p>
              <p><b>Národnost:</b> ${h.narodnost}</p>
              <p><b>Smlouva:</b> ${h.smlouva}</p>
            </div>
          `).join("")}
        </div>
      </body>
    </html>
  `);
}
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
            <img src="${logoUrl}" alt="Logo ${plnyNazev}" class="tym-logo" onerror="this.style.display='none'">
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
      ["Role TOI", "Role_TOI"]
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