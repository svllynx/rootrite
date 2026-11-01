/* RootRite app: account gate, plan rules, the matcher, comparison and demo checkout. */
document.documentElement.classList.add("js");

const FREE_LIMIT = 3;       // Free: top 3 native species
const PREMIUM_MIN = 10;     // Premium: at least the top 10 that can grow there
const PREMIUM_FLOOR = 40;   // ...and any further species scoring 40% or more
const PREMIUM_MAX = 20;     // ...up to 20, so the list stays readable
const COMPARE_MAX = 3;

const state = { account: null, plan: "free", compare: [], orgs: [] };
const $ = id => document.getElementById(id);
const isPremium = () => state.plan === "premium";

/* ---------- Account gate ---------- */
async function boot() {
  if (!rrClient()) {
    $("gate-text").innerHTML = `Accounts aren't connected yet. Add your Supabase details to <b>js/config.js</b>.`;
    return;
  }
  const account = await rrCurrentAccount();
  if (!account) {
    location.replace(`auth.html?mode=login&next=app.html`);
    return;
  }
  state.account = account;
  $("user-name").textContent = account.name;
  // someone who confirmed their email after following an invite link goes back to it
  try {
    const join = localStorage.getItem("rootrite-join");
    if (join) { location.replace(`org.html?join=${join}`); return; }
  } catch (e) { /* storage unavailable */ }
  state.orgs = await rrMyOrganisations();
  applyPlan(account.plan);
  const saved = restoreSite();
  document.body.classList.remove("is-checking");
  // the pin must be back before the first render, because rendering saves the site
  SiteMap.init(saved);
  TreeCheck.init();
  render(true);
  Nurseries.init();
  initSaveSite();
  MyPlan.init();

  rrClient().auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") location.replace("auth.html?mode=login");
  });
}

function applyPlan(plan) {
  const viaOrg = state.orgs.length > 0 && plan !== "premium"; // an Organisation plan includes Premium
  state.plan = plan === "premium" || viaOrg ? "premium" : "free";
  document.body.dataset.plan = state.plan;
  $("plan-badge").textContent = state.orgs.length ? "Organization" : isPremium() ? "Premium" : "Free";
  document.querySelectorAll("[data-free-only]").forEach(n => { n.hidden = isPremium(); });
  document.querySelectorAll("[data-premium-only]").forEach(n => { n.hidden = !isPremium() || (viaOrg && n.matches("#downgrade, .plan-current")); });
  document.querySelectorAll("[data-org-only]").forEach(n => { n.hidden = !state.orgs.length; });
  document.querySelectorAll("[data-no-org]").forEach(n => { n.hidden = state.orgs.length > 0; });
  const since = state.account?.premiumSince ? new Date(state.account.premiumSince).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : null;
  $("plan-status").textContent = isPremium()
    ? `You're on Premium${since ? ` since ${since}` : ""}. Thank you for supporting RootRite.`
    : `You're on the Free plan. Premium is ${RR_CONFIG.premiumPrice} a month.`;
  if (viaOrg) $("plan-status").textContent = `You get Premium features through ${state.orgs[0].name}.`;
  if (!isPremium()) state.compare = [];
}

/* ---------- Site form ---------- */
function readSite() {
  const f = new FormData($("site"));
  return {
    location: (f.get("location") || "").toString().trim(),
    elev: +f.get("elev"), soil: f.get("soil"), moist: f.get("moist"), rain: +f.get("rain"),
    slope: +f.get("slope"), sun: f.get("sun"), space: f.get("space"), purpose: f.get("purpose")
  };
}

const siteKey = () => `rootrite-site-${state.account?.user.id || "guest"}`;

function saveSite(s) {
  try { localStorage.setItem(siteKey(), JSON.stringify({ ...s, ...SiteMap.snapshot() })); } catch (e) { /* storage unavailable */ }
}

function restoreSite() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(siteKey()) || "null"); } catch (e) { s = null; }
  if (!s) return null;
  const form = $("site");
  if (s.rain && ![1200, 2000, 3200].includes(s.rain)) SiteMap.setRain(s.rain);
  form.location.value = s.location || "";
  form.elev.value = s.elev ?? 150;
  ["soil", "moist", "rain", "slope", "sun", "space", "purpose"].forEach(k => {
    const input = form.querySelector(`input[name="${k}"][value="${s[k]}"]`);
    if (input) input.checked = true;
  });
  return s;
}

/* ---------- Results ---------- */
const PHOTO_KIND = { p: "Photo", i: "Illustration", s: "Pressed specimen" };
const photoSite = url => /inaturalist/.test(url) ? "iNaturalist" : /gbif/.test(url) ? "GBIF" : "Wikimedia Commons";

function treePhoto(sp) {
  const p = TREE_PHOTOS[sp.id];
  if (!p) return `<p class="sheet-nophoto">No free photo of ${esc(sp.name)} yet.</p>`;
  const kind = PHOTO_KIND[p.kind];
  const license = p.licenseUrl ? `<a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license);
  return `
    <figure class="sheet-photo is-${p.kind}">
      <img src="${p.src}" alt="${kind} of ${esc(sp.name)}" width="${p.w}" height="${p.h}" loading="lazy" decoding="async">
      <figcaption>${kind}: <a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.author)}</a>, ${license}, via ${photoSite(p.source)}</figcaption>
    </figure>`;
}

// A small square beside a name in lists; an empty square keeps the rows aligned.
const treeThumb = sp => TREE_PHOTOS[sp.id]
  ? `<img class="tree-thumb" src="${TREE_PHOTOS[sp.id].thumb}" alt="" width="160" height="160" loading="lazy" decoding="async">`
  : `<span class="tree-thumb" aria-hidden="true"></span>`;

const matchWord = fit => fit >= 85 ? "Strong match" : fit >= 70 ? "Good match" : fit >= 55 ? "Fair match" : "Weak match";

function sheetBody(sp) {
  return `
    <div class="sheet-cols">
      <div><h4 class="sheet-h">About this tree</h4>
      ${treePhoto(sp)}
      <dl class="sheet-dl">
        <div><dt>Native status</dt><dd>${esc(nativeText(sp))}</dd></div>
        <div><dt>Characteristics</dt><dd>${esc(sp.traits)}</dd></div>
        <div><dt>Habitat</dt><dd>${esc(sp.habitat)}</dd></div>
        <div><dt>Common uses</dt><dd>${esc(cap(sp.uses.map(u => USE_WORDS[u]).join(", ")))}</dd></div>
      </dl></div>
      <div><h4 class="sheet-h">Planting tips</h4>
      <dl class="sheet-dl">
        <div><dt>Sunlight</dt><dd>${esc(sunText(sp.sun))}</dd></div>
        <div><dt>Water</dt><dd>${esc(sp.water)}</dd></div>
        <div><dt>Basic care</dt><dd>${esc(sp.care)}</dd></div>
        <div><dt>Before you plant</dt><dd>${esc(sp.plant)}</dd></div>
        <div><dt>When to plant</dt><dd data-plantwhen="${sp.id}"></dd></div>
        <div><dt>Where to get seedlings</dt><dd data-seedlings="${sp.id}"></dd></div>
      </dl></div>
    </div>`;
}

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

function factorBars(r) {
  return `<ul class="bars" aria-label="Suitability by factor">${r.factors.map(f => `
    <li><span class="bar-label">${f.label}</span><span class="bar-track"><span class="bar-fill${f.value < 1 ? " is-low" : ""}" style="--v:${Math.round(f.value * 100)}%"></span></span><span class="bar-val">${Math.round(f.value * 100)}%</span></li>`).join("")}
  </ul>`;
}

function compareToggle(r) {
  if (!isPremium()) return "";
  const on = state.compare.includes(r.sp.id);
  return `<label class="cmp"><input type="checkbox" data-compare="${r.sp.id}"${on ? " checked" : ""}><span>Compare</span></label>`;
}

function render(animate) {
  const s = readSite();
  $("elev-out").textContent = `${fmt(s.elev)} m`;
  $("readout").textContent = describe(s);
  $("temp").textContent = tempAt(s.elev);
  $("moist-field").hidden = s.soil === "tidal";
  saveSite(s);
  PlantCal.paint();
  syncSaveName();
  TreeCheck.paint();
  MyPlan.paint();

  const all = rank(s);
  const viable = all.filter(r => r.fit >= 45);
  const shown = isPremium()
    ? all.filter((r, i) => i < PREMIUM_MIN || r.fit >= PREMIUM_FLOOR).filter(r => r.fit >= 30).slice(0, PREMIUM_MAX)
    : viable.slice(0, FREE_LIMIT);
  const box = $("results");

  if (!shown.length) {
    $("count").textContent = "No species in our list fits this site well.";
    box.innerHTML = `<p class="empty">Nothing in our list fits these conditions well. Try a different soil or elevation, or ask your local CENRO nursery what grows nearby.</p>`;
    state.lastShown = [];
    renderCompare();
    return;
  }

  $("count").textContent = isPremium()
    ? `${shown.length} native species ranked for your site.`
    : `Your top ${shown.length} native species.`;

  const [best, ...rest] = shown;
  const bestChips = [...best.why.slice(0, 4).map(w => `<li>${esc(w)}</li>`), ...best.miss.slice(0, 2).map(w => `<li class="miss">${esc(w)}</li>`)].join("");

  const bestHtml = `
    <article class="tag tag-app" aria-label="Best match: ${esc(best.sp.name)}">
      <div>
        <h3 class="tag-name">${esc(best.sp.name)}</h3>
        <p class="tag-sci">${esc(best.sp.sci)} · ${esc(best.sp.height)} · ${best.sp.native}</p>
      </div>
      <div class="tag-score">
        ${isPremium() ? `<p class="tag-fit">${best.fit}%</p><p class="tag-fit-note">site suitability</p>` : `<p class="tag-word">${matchWord(best.fit)}</p><p class="tag-fit-note">best for your site</p>`}
      </div>
      <ul class="tag-why">${bestChips}</ul>
      ${isPremium() ? `<div class="tag-bars">${factorBars(best)}</div>` : ""}
      <div class="tag-sheet">${sheetBody(best.sp)}</div>
      ${isPremium() ? `<div class="tag-foot">${compareToggle(best)}</div>` : ""}
    </article>`;

  const restHtml = rest.length ? `<ol class="sheets">${rest.map(r => `
    <li class="sheet">
      <div class="sheet-head">
        <button class="sheet-toggle" type="button" aria-expanded="false" aria-controls="sheet-${r.sp.id}">
          ${treeThumb(r.sp)}
          <span class="sheet-title">
            <span class="sheet-name">${esc(r.sp.name)}</span>
            <span class="sheet-sci">${esc(r.sp.sci)} · ${r.sp.native}</span>
          </span>
        </button>
        <p class="sheet-why">${esc([...r.why.slice(0, 2), ...r.miss.slice(0, 1)].join(". "))}.</p>
        <p class="sheet-fit">${isPremium() ? `${r.fit}%` : matchWord(r.fit)}</p>
        ${compareToggle(r)}
      </div>
      <div class="sheet-body" id="sheet-${r.sp.id}" hidden>
        ${isPremium() ? factorBars(r) : ""}
        ${sheetBody(r.sp)}
      </div>
    </li>`).join("")}</ol>` : "";

  const more = viable.length - shown.length;
  const upsell = !isPremium() ? `
    <div class="upsell">
      <div>
        <p class="upsell-line">${more > 0 ? `${more} more native species fit this site.` : "See how well each species fits."}</p>
        <p class="upsell-note">Premium shows the top 10+ species and a suitability score for each factor, for ${RR_CONFIG.premiumPrice} a month.</p>
      </div>
      <button class="btn btn-sky" type="button" data-upgrade>Upgrade to Premium</button>
    </div>` : "";

  box.innerHTML = bestHtml + restHtml + upsell;
  if (animate) { box.classList.remove("results-enter"); void box.offsetWidth; box.classList.add("results-enter"); }

  state.lastShown = shown;
  state.compare = state.compare.filter(id => shown.some(r => r.sp.id === id));
  renderCompare();
  if (typeof Nurseries !== "undefined") Nurseries.update();
  PlantCal.fillSheets();
}

/* ---------- Saving the site to an organisation's project ---------- */
async function initSaveSite() {
  if (!state.orgs.length) return;
  const { data, error } = await rrClient().from("projects").select("id, name, org_id").in("org_id", state.orgs.map(o => o.id)).order("created_at");
  if (error) return;
  const box = $("save-site"), select = $("save-project");
  $("save-site-empty").hidden = data.length > 0;
  $("save-site-form").hidden = data.length === 0;
  box.hidden = false;
  const wanted = new URLSearchParams(location.search).get("project");
  select.innerHTML = data.map(p => {
    const org = state.orgs.length > 1 ? `${state.orgs.find(o => o.id === p.org_id)?.name}: ` : "";
    return `<option value="${p.id}"${p.id === wanted ? " selected" : ""}>${esc(org + p.name)}</option>`;
  }).join("");
  $("save-site-form").addEventListener("submit", saveSiteToProject);
  syncSaveName();
}

// Suggest the place name until the person types their own.
function syncSaveName() {
  const input = $("save-name");
  if (input && !input.dataset.edited) input.value = $("site").location.value.trim();
}

async function saveSiteToProject(e) {
  e.preventDefault();
  const f = e.target, btn = f.querySelector("[type=submit]"), snap = SiteMap.snapshot();
  const name = f.sname.value.trim(), area = f.area.value === "" ? 0 : +f.area.value;
  if (!snap.pin) return toast("Drop a pin on the map first, so the site has a location.");
  if (name.length < 2) return toast("Give this site a name.");
  if (!(area >= 0)) return toast("Enter the area in hectares.");
  btn.disabled = true;
  const s = readSite();
  const { error } = await rrClient().from("project_sites").insert({
    project_id: f.project.value, name, location: s.location || null, lat: snap.pin.lat, lon: snap.pin.lon, area_ha: area,
    site: { ...s, readings: snap.readings || null }
  });
  btn.disabled = false;
  if (error) return toast(rrErrorText(error));
  f.area.value = "";
  $("save-name").dataset.edited = "";
  toast("Site saved. Open your organization to log plantings and download its report.");
}

/* ---------- Comparison (Premium) ---------- */
// The Free plan's preview: the person's own top trees, with the details held back until they unlock it.
function lockedCompare(body) {
  const picks = (state.lastShown || []).slice(0, COMPARE_MAX);
  const key = picks.map(r => r.sp.id).join() || "none";
  if (body.dataset.locked === key) return; // the slider redraws often; keep the photos from flickering
  body.dataset.locked = key;
  const names = picks.map(r => r.sp.name);
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : "native species";
  const row = (label, ...widths) => `<tr><th scope="row">${label}</th>${picks.map((r, i) => `<td><span class="cmp-hidden" style="width:${widths[i % widths.length]}%"></span></td>`).join("")}</tr>`;
  const preview = picks.length > 1 ? `
    <div class="cmp-wrap" aria-hidden="true">
      <table class="cmp-table">
        <thead><tr><th scope="col"></th>${picks.map(r => `<th scope="col"><span class="cmp-name">${esc(r.sp.name)}</span><span class="cmp-sci">${esc(r.sp.sci)}</span></th>`).join("")}</tr></thead>
        <tbody>
          <tr><th scope="row">Photo</th>${picks.map(r => `<td>${TREE_PHOTOS[r.sp.id] ? `<img class="cmp-photo" src="${TREE_PHOTOS[r.sp.id].thumb}" alt="" width="160" height="160" loading="lazy">` : `<span class="cmp-nophoto">No free photo yet</span>`}</td>`).join("")}</tr>
          ${row("Site suitability", 30, 26, 34)}
          ${row("Growth", 72, 58, 66)}
          ${row("Soil", 54, 76, 62)}
          ${row("Water", 64, 50, 74)}
        </tbody>
      </table>
    </div>` : "";
  body.innerHTML = `
    <div class="cmp-locked">
      ${preview}
      <div class="locked">
        <div>
          <p class="locked-line">See ${esc(who)} side by side on site suitability, growth, soil, water, sunlight, mature size and intended use.</p>
          <p class="locked-note">Included in Premium, ${RR_CONFIG.premiumPrice} a month.</p>
        </div>
        <button class="btn btn-ink" type="button" data-upgrade data-unlock-compare>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          Unlock to compare
        </button>
      </div>
    </div>`;
}

function renderCompare() {
  const body = $("compare-body");
  if (!isPremium()) return lockedCompare(body);
  delete body.dataset.locked;
  const picks = (state.lastShown || []).filter(r => state.compare.includes(r.sp.id));
  if (picks.length < 2) {
    body.innerHTML = `<p class="empty">${picks.length === 1 ? `${esc(picks[0].sp.name)} is selected. Tick one or two more species to compare.` : "No species selected yet. Tick Compare on two or three species in your results."}</p>`;
    return;
  }
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${picks.map(r => `<td>${fn(r)}</td>`).join("")}</tr>`;
  body.innerHTML = `
    <div class="cmp-wrap">
      <table class="cmp-table">
        <thead><tr><th scope="col"><span class="sr-only">Factor</span></th>${picks.map(r => `<th scope="col"><span class="cmp-name">${esc(r.sp.name)}</span><span class="cmp-sci">${esc(r.sp.sci)}</span></th>`).join("")}</tr></thead>
        <tbody>
          ${row("Photo", r => TREE_PHOTOS[r.sp.id] ? `<img class="cmp-photo" src="${TREE_PHOTOS[r.sp.id].thumb}" alt="${esc(r.sp.name)}" width="160" height="160" loading="lazy">` : `<span class="cmp-nophoto">No free photo yet</span>`)}
          ${row("Site suitability", r => `<b class="cmp-fit">${r.fit}%</b>`)}
          ${row("Growth", r => `${r.sp.growth} growth, ${esc(r.sp.height)} tall`)}
          ${row("Soil", r => esc(cap(r.sp.soils.map(x => SOIL_WORDS[x]).join(", "))))}
          ${row("Water", r => esc(r.sp.water))}
          ${row("Sunlight", r => esc(sunText(r.sp.sun)))}
          ${row("Mature size", r => SIZE_WORDS[r.sp.size])}
          ${row("Intended use", r => esc(cap(r.sp.uses.map(u => USE_WORDS[u]).join(", "))))}
          ${row("Native status", r => esc(nativeText(r.sp)))}
        </tbody>
      </table>
    </div>`;
}

/* ---------- Demo checkout ---------- */
function openCheckout() {
  $("checkout-message").hidden = true;
  $("confirm-upgrade").disabled = false;
  $("checkout").showModal();
}

async function confirmUpgrade() {
  const btn = $("confirm-upgrade"), msg = $("checkout-message");
  btn.disabled = true;
  btn.textContent = "Activating…";
  try {
    const profile = await rrSetPlan("premium");
    state.account.premiumSince = profile?.premium_since || new Date().toISOString();
    applyPlan("premium");
    MyPlan.afterPlanChange();
    // Unlocked from the comparison: show what they came for, already filled in
    const unlocked = state.unlockCompare ? (state.lastShown || []).slice(0, COMPARE_MAX).map(r => r.sp.id) : [];
    if (unlocked.length > 1) state.compare = unlocked;
    render(true);
    $("checkout").close();
    if (unlocked.length > 1) {
      $("compare").scrollIntoView({ behavior: "instant" });
      toast(`Premium is active. Here are your top ${unlocked.length} side by side.`);
    } else if (state.upgradeFrom === "tree-check") {
      $("tree-check").scrollIntoView({ behavior: "instant" });
      toast("Premium is active. Here's the full answer for your tree.");
    } else if (["plan", "reminders"].includes(state.upgradeFrom)) {
      $("myplan").scrollIntoView({ behavior: "instant" });
      toast("Premium is active. You can now plan every site and add reminders.");
    } else if (state.upgradeFrom === "sites") {
      $("mysites").scrollIntoView({ behavior: "instant" });
      toast("Premium is active. You can now save up to 20 sites.");
    } else {
      toast("Premium is active. Your results now show scores and 10+ species.");
    }
  } catch (err) {
    msg.textContent = rrErrorText(err);
    msg.className = "notice notice-error";
    msg.hidden = false;
    btn.disabled = false;
  }
  btn.textContent = "Activate Premium";
}

async function downgrade() {
  if (!confirm("Switch back to the Free plan? You'll see your top 3 species without scores.")) return;
  try {
    await rrSetPlan("free");
    state.account.premiumSince = null;
    applyPlan("free");
    MyPlan.afterPlanChange();
    render(true);
    toast("You're back on the Free plan.");
  } catch (err) { toast(rrErrorText(err)); }
}

function toast(text) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("p"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 4200);
}

/* ---------- Wiring ---------- */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-price]").forEach(n => { n.textContent = RR_CONFIG.premiumPrice; });

  let typing;
  $("save-name")?.addEventListener("input", e => { e.target.dataset.edited = "1"; });
  $("site").addEventListener("input", e => {
    if (e.target.name === "location") { clearTimeout(typing); typing = setTimeout(() => render(false), 250); return; }
    render(e.target.type !== "range");
  });
  $("site").addEventListener("submit", e => e.preventDefault());

  document.addEventListener("click", e => {
    const upgrade = e.target.closest("[data-upgrade]");
    if (upgrade) {
      state.unlockCompare = upgrade.hasAttribute("data-unlock-compare");
      state.upgradeFrom = upgrade.dataset.upgradeFrom || "";
      openCheckout();
      return;
    }
    const toggle = e.target.closest(".sheet-toggle");
    if (toggle) {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", open);
      $(toggle.getAttribute("aria-controls")).hidden = !open;
    }
  });

  document.addEventListener("change", e => {
    const id = e.target.dataset?.compare;
    if (!id) return;
    if (e.target.checked) {
      if (state.compare.length >= COMPARE_MAX) {
        e.target.checked = false;
        toast(`Compare up to ${COMPARE_MAX} species at a time. Untick one first.`);
        return;
      }
      state.compare.push(id);
    } else {
      state.compare = state.compare.filter(x => x !== id);
    }
    renderCompare();
    if (state.compare.length === 2 && e.target.checked) toast("Two species selected. See them under Compare species.");
  });

  $("confirm-upgrade").addEventListener("click", confirmUpgrade);
  $("downgrade").addEventListener("click", downgrade);
  $("sign-out").addEventListener("click", rrSignOut);

  boot();
});
