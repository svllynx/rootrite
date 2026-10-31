/* RootRite landing page: the zone list, the cut photo board, entrances and the nav's account state. */
document.documentElement.classList.add("js");

const bandThumb = sp => TREE_PHOTOS[sp.id]
  ? `<img class="band-thumb" src="${TREE_PHOTOS[sp.id].thumb}" alt="" width="160" height="160" loading="lazy" decoding="async">`
  : `<span class="band-thumb" aria-hidden="true"></span>`;

/* Every tree photo's author and licence, listed in the footer. */
function renderTreeCredits() {
  const list = document.getElementById("tree-credits");
  if (!list) return;
  const kind = { p: "photo", i: "illustration", s: "herbarium specimen" };
  list.innerHTML = SPECIES.filter(sp => TREE_PHOTOS[sp.id]).map(sp => {
    const p = TREE_PHOTOS[sp.id];
    return `<li>${esc(sp.name)}: <a href="${esc(p.source)}">${kind[p.kind]}</a> by ${esc(p.author)}, ${p.licenseUrl ? `<a href="${esc(p.licenseUrl)}">${esc(p.license)}</a>` : esc(p.license)}</li>`;
  }).join("");
}

/* Species list by zone, as tabs. Long zones show the first few until "Show all" is pressed. */
const ZONE_PREVIEW = 8;
function renderZone(zone, animate, all) {
  const list = document.getElementById("zone");
  const more = document.getElementById("zone-more");
  const every = SPECIES.filter(sp => sp.zone === zone);
  const items = all ? every : every.slice(0, ZONE_PREVIEW);
  more.hidden = every.length <= ZONE_PREVIEW;
  more.textContent = all ? "Show fewer" : `Show all ${every.length} ${zone} trees`;
  more.onclick = () => renderZone(zone, false, !all);
  list.innerHTML = items.map(sp => `
    <li>
      <span class="band-elev">${sp.elev[1] <= 5 ? "Tidal" : `${fmt(sp.elev[0])}–${fmt(sp.elev[1])} m`}</span>
      ${bandThumb(sp)}
      <span class="band-name">${esc(sp.name)}<i>${sp.sci !== sp.name ? `${esc(sp.sci)} · ` : ""}${esc(sp.height)}</i></span>
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

/* A signed-in visitor sees "Open the app" instead of the sign-up buttons. */
async function initAccountNav() {
  const client = rrClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  document.querySelectorAll("[data-guest]").forEach(n => { n.hidden = true; });
  document.querySelectorAll("[data-member]").forEach(n => { n.hidden = false; });
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  renderTreeCredits();
  initCut();
  initReveal();
  initAccountNav();

  const v = document.querySelector(".mosaic video");
  if (v && matchMedia("(prefers-reduced-motion: reduce)").matches) { v.removeAttribute("autoplay"); v.pause(); }

  const go = () => document.documentElement.classList.add("loaded");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(go)); else go();
  setTimeout(go, 1200);
});
