/* RootRite: species data, the site matcher, the zone list and the motion layer. */
document.documentElement.classList.add("js");

/*
  Each species: elevation range (m), yearly rainfall range (mm), soils it accepts,
  steepest slope it suits (0 flat, 1 gentle, 2 steep), light, mature size
  (S fits a house lot, M a large yard, L open land), purposes, zone, care.
  Ranges are general guidance for the Philippines, not survey data.
*/
const SPECIES = [
  { id: "narra", name: "Narra", sci: "Pterocarpus indicus", zone: "lowland", elev: [0, 600], rain: [1300, 4000], soils: ["clay", "loam", "sandy", "rocky"], slope: 2, sun: ["full"], size: "L", height: "25 to 35 m",
    uses: ["shade", "timber", "restore", "ornamental"], care: "Give it 8 m from walls and pipes; its buttress roots spread wide. Prune low branches in the first three years." },
  { id: "molave", name: "Molave", sci: "Vitex parviflora", zone: "lowland", elev: [0, 900], rain: [900, 2500], soils: ["rocky", "loam", "clay"], slope: 2, sun: ["full"], size: "L", height: "20 to 30 m",
    uses: ["timber", "erosion", "restore"], care: "Thrives on dry limestone hills where little else will. Slow to start; protect seedlings from goats and fire." },
  { id: "apitong", name: "Apitong", sci: "Dipterocarpus grandiflorus", zone: "lowland", elev: [0, 700], rain: [2000, 4500], soils: ["loam", "clay"], slope: 1, sun: ["partial", "full"], size: "L", height: "30 to 40 m",
    uses: ["timber", "restore"], care: "Plant under light shade at first. It needs a wet climate without a long dry season." },
  { id: "dao", name: "Dao", sci: "Dracontomelon dao", zone: "lowland", elev: [0, 600], rain: [1800, 4000], soils: ["loam", "clay"], slope: 1, sun: ["full"], size: "L", height: "30 to 40 m",
    uses: ["shade", "timber", "restore"], care: "Wants deep, moist soil, best near streams. Far too big for a house lot." },
  { id: "banaba", name: "Banaba", sci: "Lagerstroemia speciosa", zone: "lowland", elev: [0, 800], rain: [1000, 3500], soils: ["clay", "loam"], slope: 1, sun: ["full"], size: "M", height: "8 to 15 m",
    uses: ["ornamental", "shade"], care: "Handles heavy, seasonally wet clay. Flowers best in full sun; prune lightly after flowering." },
  { id: "pili", name: "Pili", sci: "Canarium ovatum", zone: "lowland", elev: [0, 400], rain: [1900, 3800], soils: ["loam", "sandy"], slope: 1, sun: ["full"], size: "L", height: "15 to 20 m",
    uses: ["fruit", "shade", "timber"], care: "Needs warm lowlands and steady rain. Male and female trees are separate, so plant several." },
  { id: "mabolo", name: "Mabolo", sci: "Diospyros blancoi", zone: "lowland", elev: [0, 800], rain: [1500, 3500], soils: ["loam", "clay"], slope: 1, sun: ["full", "partial"], size: "M", height: "10 to 20 m",
    uses: ["fruit", "ornamental", "timber"], care: "Slow growing; the black kamagong heartwood takes decades. Fruiting needs a male tree nearby." },
  { id: "bignay", name: "Bignay", sci: "Antidesma bunius", zone: "lowland", elev: [0, 1000], rain: [1200, 3500], soils: ["loam", "clay"], slope: 1, sun: ["partial", "full", "shade"], size: "S", height: "5 to 10 m",
    uses: ["fruit", "ornamental"], care: "A small native fruit tree that copes with part shade and fits a house lot." },
  { id: "kamuning", name: "Kamuning", sci: "Murraya paniculata", zone: "lowland", elev: [0, 900], rain: [1000, 3000], soils: ["loam", "sandy", "rocky"], slope: 1, sun: ["partial", "full", "shade"], size: "S", height: "3 to 7 m",
    uses: ["ornamental"], care: "Fragrant, takes pruning well and grows in part shade. Good as a small tree or a hedge." },
  { id: "calamansi", name: "Calamansi", sci: "Citrus × microcarpa", zone: "lowland", elev: [0, 1000], rain: [1000, 2500], soils: ["loam", "sandy"], slope: 1, sun: ["full", "partial"], size: "S", height: "2 to 5 m",
    uses: ["fruit"], care: "Grows in a large pot or a corner of the yard. Feed lightly every two months and keep the soil drained." },
  { id: "kalantas", name: "Kalantas", sci: "Toona calantas", zone: "upland", elev: [300, 1500], rain: [1500, 3500], soils: ["loam", "clay"], slope: 2, sun: ["full"], size: "L", height: "25 to 35 m",
    uses: ["timber", "restore", "erosion"], care: "A native upland timber tree for moist, well-drained slopes. Mix with other species to limit shoot borers." },
  { id: "bagras", name: "Bagras", sci: "Eucalyptus deglupta", zone: "upland", elev: [0, 1800], rain: [2500, 5000], soils: ["loam", "clay"], slope: 1, sun: ["full"], size: "L", height: "35 to 60 m",
    uses: ["timber", "restore"], care: "Fast and thirsty: only where rain falls through most of the year. Native to Mindanao." },
  { id: "almaciga", name: "Almaciga", sci: "Agathis philippinensis", zone: "highland", elev: [300, 2000], rain: [2000, 4500], soils: ["loam", "rocky"], slope: 2, sun: ["partial", "full"], size: "L", height: "30 to 50 m",
    uses: ["restore", "timber"], care: "A slow native conifer whose resin is tapped without felling. Keep young trees in part shade." },
  { id: "benguet-pine", name: "Benguet pine", sci: "Pinus kesiya", zone: "highland", elev: [700, 2700], rain: [1000, 3500], soils: ["rocky", "sandy", "loam"], slope: 2, sun: ["full"], size: "L", height: "20 to 35 m",
    uses: ["restore", "erosion", "timber"], care: "Belongs to cool uplands; below about 700 m heat and pests weaken it. Keep a cleared fire line around stands." },
  { id: "igem", name: "Igem", sci: "Dacrycarpus imbricatus", zone: "highland", elev: [1000, 2500], rain: [2000, 4500], soils: ["loam", "rocky"], slope: 2, sun: ["partial", "full"], size: "L", height: "20 to 40 m",
    uses: ["restore", "erosion"], care: "A native conifer of cool, misty mountain forest. Protects watersheds; grows slowly." },
  { id: "ipil", name: "Ipil", sci: "Intsia bijuga", zone: "coastal", elev: [0, 450], rain: [1500, 3500], soils: ["sandy", "loam", "rocky"], slope: 1, sun: ["full"], size: "L", height: "20 to 30 m",
    uses: ["timber", "coast", "restore"], care: "Grows behind beaches and mangroves and tolerates brief flooding. Very slow, very durable wood." },
  { id: "talisay", name: "Talisay", sci: "Terminalia catappa", zone: "coastal", elev: [0, 300], rain: [1000, 3500], soils: ["sandy", "loam"], slope: 0, sun: ["full"], size: "L", height: "15 to 25 m",
    uses: ["shade", "coast", "ornamental"], care: "Takes salt and wind. Its crown spreads wide, so plant 10 m from roofs; it drops its leaves twice a year." },
  { id: "bitaog", name: "Bitaog", sci: "Calophyllum inophyllum", zone: "coastal", elev: [0, 200], rain: [1000, 5000], soils: ["sandy", "rocky"], slope: 1, sun: ["full"], size: "M", height: "8 to 20 m",
    uses: ["coast", "shade", "ornamental"], care: "A beach tree with fragrant flowers that leans into the sea wind and holds the dune behind it." },
  { id: "agoho", name: "Agoho", sci: "Casuarina equisetifolia", zone: "coastal", elev: [0, 800], rain: [700, 3000], soils: ["sandy", "rocky"], slope: 2, sun: ["full"], size: "L", height: "15 to 30 m",
    uses: ["coast", "erosion", "restore"], care: "Fixes nitrogen and grips loose sand: a classic windbreak. Needs full sun and drains well." },
  { id: "bani", name: "Bani", sci: "Pongamia pinnata", zone: "coastal", elev: [0, 800], rain: [500, 2500], soils: ["sandy", "clay", "loam", "rocky"], slope: 2, sun: ["full", "partial"], size: "M", height: "10 to 15 m",
    uses: ["shade", "erosion", "coast"], care: "Drought-hardy and nitrogen-fixing. A good first tree for poor or degraded ground." },
  { id: "bakauan", name: "Bakauan", sci: "Rhizophora mucronata", zone: "coastal", elev: [0, 5], rain: [1000, 5000], soils: ["tidal"], slope: 0, sun: ["full"], size: "M", height: "5 to 20 m",
    uses: ["coast", "restore"], care: "Only for mud the tide covers every day. Plant propagules from nearby mangroves, at the right tide level." },
  { id: "api-api", name: "Api-api", sci: "Avicennia marina", zone: "coastal", elev: [0, 5], rain: [500, 5000], soils: ["tidal"], slope: 0, sun: ["full"], size: "M", height: "3 to 10 m",
    uses: ["coast", "restore"], care: "The seaward mangrove, first to colonise open mudflats. Tolerates the saltiest water of any mangrove." }
];

const USE_WORDS = { shade: "shade", timber: "timber", fruit: "fruit", erosion: "slope cover", coast: "coastal protection", restore: "reforestation", ornamental: "ornamental" };
const SOIL_WORDS = { clay: "clay", loam: "loam", sandy: "sandy", rocky: "rocky", tidal: "tidal mud" };
const SIZE_RANK = { S: 0, M: 1, L: 2 };
const fmt = n => n.toLocaleString("en-US");

function readSite(form) {
  const f = new FormData(form);
  return {
    elev: +f.get("elev"), soil: f.get("soil"), rain: +f.get("rain"),
    slope: +f.get("slope"), sun: f.get("sun"), space: f.get("space"), purpose: f.get("purpose")
  };
}

/* Weighted fit: each condition scores 0 to 1, purpose counts only when one is chosen. */
function score(sp, s) {
  const why = [], miss = [];
  const parts = [];

  const tidalSite = s.soil === "tidal", tidalTree = sp.soils.includes("tidal");
  if (tidalSite !== tidalTree) return null; // mangroves and dry-land trees never cross over

  // elevation, weight 3, soft edge of 200 m
  let e = 1;
  if (s.elev < sp.elev[0]) e = Math.max(0, 1 - (sp.elev[0] - s.elev) / 200);
  else if (s.elev > sp.elev[1]) e = Math.max(0, 1 - (s.elev - sp.elev[1]) / 200);
  if (tidalSite) e = 1;
  parts.push([e, 3]);
  if (e === 1 && !tidalSite) why.push(`Grows at ${fmt(s.elev)} m`); else if (e < 1) miss.push(`Out of its range at ${fmt(s.elev)} m`);
  if (e === 0) return null;

  // soil, weight 2
  const so = sp.soils.includes(s.soil) ? 1 : 0.25;
  parts.push([so, 2]);
  if (so === 1) why.push(`Takes ${SOIL_WORDS[s.soil]} soil`); else miss.push(`Prefers ${sp.soils.map(x => SOIL_WORDS[x]).join(" or ")}`);

  // rainfall, weight 2
  let r = 1;
  if (s.rain < sp.rain[0]) r = Math.max(0, 1 - (sp.rain[0] - s.rain) / 1200);
  else if (s.rain > sp.rain[1]) r = Math.max(0, 1 - (s.rain - sp.rain[1]) / 1500);
  parts.push([r, 2]);
  if (r === 1) why.push("Suits your rainfall"); else miss.push(s.rain < sp.rain[0] ? "Wants more rain" : "Prefers a drier climate");

  // slope, weight 1
  const sl = s.slope <= sp.slope ? 1 : 0.3;
  parts.push([sl, 1]);
  if (sl === 1 && s.slope === 2) why.push("Holds a steep slope"); else if (sl < 1) miss.push("Not for steep ground");

  // light, weight 1.5
  const li = sp.sun.includes(s.sun) ? 1 : 0.2;
  parts.push([li, 1.5]);
  if (li < 1) miss.push(sp.sun.includes("full") ? "Needs more sun" : "Needs some shade");

  // space, weight 1.5
  const sz = SIZE_RANK[sp.size] <= SIZE_RANK[s.space] ? 1 : SIZE_RANK[sp.size] - SIZE_RANK[s.space] === 1 ? 0.35 : 0.05;
  parts.push([sz, 1.5]);
  if (sz < 1) miss.push(`Grows ${sp.height} tall`);
  else if (s.space === "S") why.push("Fits a house lot");

  // purpose, weight 2
  if (s.purpose !== "any") {
    const pu = sp.uses.includes(s.purpose) ? 1 : 0;
    parts.push([pu, 2]);
    if (pu) why.unshift(`Good for ${USE_WORDS[s.purpose]}`); else miss.push(`Not grown for ${USE_WORDS[s.purpose]}`);
  }

  const total = parts.reduce((a, [v, w]) => a + v * w, 0);
  const max = parts.reduce((a, [, w]) => a + w, 0);
  // tie-break: how centrally the site sits in the tree's elevation and rainfall ranges
  const mid = (v, [a, b]) => b > a ? 1 - Math.abs((v - (a + b) / 2) / ((b - a) / 2)) : 1;
  const centre = tidalSite ? 1 : (Math.max(0, mid(s.elev, sp.elev)) + Math.max(0, mid(s.rain, sp.rain))) / 2;
  return { sp, fit: Math.round((total / max) * 100), centre, why, miss };
}

function zoneName(s) {
  if (s.soil === "tidal") return "tidal";
  if (s.elev < 500) return "lowland";
  if (s.elev < 1000) return "upland";
  return "highland";
}

function describe(s) {
  const sun = { full: "sunny", partial: "partly shaded", shade: "shaded" }[s.sun];
  const slope = ["flat", "gently sloping", "steep"][s.slope];
  const rain = s.rain < 1500 ? "under 1,500 mm" : s.rain > 2500 ? "over 2,500 mm" : "about 2,000 mm";
  if (s.soil === "tidal") return `A ${sun} stretch of tidal mud on the coast, flooded by the sea every day.`;
  return `A ${sun}, ${slope} ${zoneName(s)} site at ${fmt(s.elev)} m, with ${SOIL_WORDS[s.soil]} soil and ${rain} of rain a year.`;
}

function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function render(form, animate) {
  const s = readSite(form);
  document.getElementById("elev-out").textContent = `${fmt(s.elev)} m`;
  document.getElementById("readout").textContent = describe(s);
  // lapse rate: about 6.5 °C cooler per 1,000 m, from a 27.5 °C lowland mean
  document.getElementById("temp").textContent = (27.5 - s.elev * 0.0065).toFixed(1);

  const ranked = SPECIES.map(sp => score(sp, s)).filter(Boolean).filter(r => r.fit >= 45).sort((a, b) => b.fit - a.fit || b.centre - a.centre).slice(0, 6);
  const box = document.getElementById("results");
  const count = document.getElementById("count");

  if (!ranked.length) {
    count.textContent = "No species in our list fits this site well.";
    box.innerHTML = `<p class="empty">Nothing in our list fits these conditions well. Try a different soil or elevation, or ask your local CENRO nursery what grows nearby.</p>`;
  } else {
    const [best, ...rest] = ranked;
    count.textContent = ranked.length === 1 ? "One species fits." : `${ranked.length} species fit, best first.`;
    const chips = [...best.why.slice(0, 4).map(w => `<li>${esc(w)}</li>`), ...best.miss.slice(0, 2).map(w => `<li class="miss">${esc(w)}</li>`)].join("");
    box.innerHTML = `
      <article class="tag" aria-label="Best match: ${esc(best.sp.name)}">
        <div>
          <h3 class="tag-name">${esc(best.sp.name)}</h3>
          <p class="tag-sci">${esc(best.sp.sci)} · ${esc(best.sp.height)}</p>
        </div>
        <div class="tag-score"><p class="tag-fit">${best.fit}%</p><p class="tag-fit-note">fit for your site</p></div>
        <ul class="tag-why">${chips}</ul>
        <p class="tag-care">${esc(best.sp.care)}</p>
      </article>
      ${rest.length ? `<ol class="runners">${rest.map(r => `
        <li class="runner">
          <div><p class="runner-name">${esc(r.sp.name)}</p><p class="runner-sci">${esc(r.sp.sci)}</p></div>
          <p class="runner-why">${esc([...r.why.slice(0, 2), ...r.miss.slice(0, 1)].join(". "))}.</p>
          <p class="runner-fit">${r.fit}%</p>
        </li>`).join("")}</ol>` : ""}`;
  }
  if (animate) {
    box.classList.remove("results-enter");
    void box.offsetWidth;
    box.classList.add("results-enter");
  }
}

/* Species list by zone, as tabs */
function renderZone(zone, animate) {
  const list = document.getElementById("zone");
  const items = SPECIES.filter(sp => sp.zone === zone);
  list.innerHTML = items.map(sp => `
    <li>
      <span class="band-elev">${sp.elev[1] <= 5 ? "Tidal" : `${fmt(sp.elev[0])}–${fmt(sp.elev[1])} m`}</span>
      <span class="band-name">${esc(sp.name)}<i>${esc(sp.sci)} · ${esc(sp.height)}</i></span>
      <span class="band-use">${sp.uses.map(u => USE_WORDS[u]).join(", ")}</span>
    </li>`).join("");
  if (animate) { list.classList.remove("swap"); void list.offsetWidth; list.classList.add("swap"); }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (t, focus) => {
    tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; });
    document.getElementById("zone").setAttribute("aria-labelledby", t.id);
    renderZone(t.dataset.zone, true);
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", e => {
      const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true); }
    });
  });
  renderZone("coastal", false);
}

/* One photograph cut across the tile board */
function initCut() {
  const grid = document.getElementById("cut-grid");
  const phone = matchMedia("(max-width: 760px)");
  const build = () => {
    grid.querySelectorAll(".cut-photo").forEach(n => n.remove());
    const frag = [];
    const piece = (c, r, cols, rows) => {
      const t = document.createElement("div");
      t.className = "cut-tile cut-photo";
      t.setAttribute("aria-hidden", "true");
      const p = document.createElement("div");
      p.className = "cut-piece";
      p.style.backgroundPosition = `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
      t.appendChild(p);
      return t;
    };
    if (phone.matches) {
      // head beside one piece, then three rows of pieces, each followed by a fact
      const rows = 4, q = s => grid.querySelector(s);
      frag.push(q(".cut-head"), piece(2, 0, 3, rows));
      [".cut-f1", ".cut-f2", ".cut-f3"].forEach((f, i) => {
        for (let c = 0; c < 3; c++) frag.push(piece(c, i + 1, 3, rows));
        frag.push(q(f));
      });
      frag.push(q(".cut-act"));
    } else {
      const cols = 6, rows = 4;
      // colour tiles sit at fixed cells, never side by side
      const colour = { "0,0": ".cut-head", "3,0": ".cut-f1", "1,2": ".cut-f2", "4,2": ".cut-f3", "5,3": ".cut-act" };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = colour[`${c},${r}`];
        frag.push(k ? grid.querySelector(k) : piece(c, r, cols, rows));
      }
    }
    frag.forEach(n => grid.appendChild(n));
  };
  build();
  phone.addEventListener("change", build);
}

/* Entrances: each section's parts arrive in order, once. */
function initReveal() {
  const items = [...document.querySelectorAll(".rise")];
  if (!("IntersectionObserver" in window)) { items.forEach(n => n.classList.add("in")); return; }
  const groups = new Map();
  items.forEach(n => {
    const sec = n.closest("section") || document.body;
    const i = (groups.get(sec) || 0);
    groups.set(sec, i + 1);
    n.style.setProperty("--d", `${Math.min(i, 6) * 80}ms`);
  });
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(n => io.observe(n));
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("site");
  render(form, false);
  form.addEventListener("input", e => render(form, e.target.type !== "range"));
  form.addEventListener("submit", e => e.preventDefault());
  initTabs();
  initCut();
  initReveal();

  const v = document.querySelector(".mosaic video");
  if (v && matchMedia("(prefers-reduced-motion: reduce)").matches) { v.removeAttribute("autoplay"); v.pause(); }

  const go = () => document.documentElement.classList.add("loaded");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(go)); else go();
  setTimeout(go, 1200);
});
