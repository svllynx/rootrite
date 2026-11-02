/*
  RootRite: where to get seedlings.
  Two sources, nearest first from the site pin:
  1. RootRite's own nursery directory (Supabase table "nurseries"), with the species each one stocks.
     Signed-in people can suggest a nursery; it shows to everyone once the team approves it.
  2. Nurseries, DENR offices (CENRO and PENRO) and garden shops mapped on OpenStreetMap, whose stock is unknown.
  This section is a Premium feature. On Free it's blurred, and the page gets placeholders rather than
  the real names, so removing the blur shows nothing.
*/
const Nurseries = (() => {
  const RADIUS_KM = 50;        // how far to look around the pin
  const STOCK_RADIUS_KM = 150; // a directory nursery that lists the tree is worth showing further out
  const LIST_MAX = 12;
  const KINDS = { denr: "DENR or CENRO nursery", lgu: "LGU nursery", school: "School or university nursery", ngo: "NGO nursery", private: "Private nursery" };
  const COLUMNS = "id, name, kind, municipality, province, lat, lon, phone, hours, species, notes, status, featured, verified_at";

  let directory = [], osm = [], osmState = "idle", map, layer, siteMarker, draftMarker;
  let chosen = null;     // species picked in the filter ("" for any tree); null follows the best match
  let adding = false;

  const $ = id => document.getElementById(id);
  const byId = id => SPECIES.find(sp => sp.id === id);
  const pin = () => SiteMap.snapshot().pin || null;

  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const kmText = d => d < 1 ? "under 1 km" : `${fmt(Math.round(d))} km`;
  const tel = p => (p || "").replace(/[^\d+]/g, "");
  const directions = n => `https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lon}`;

  /* ---------- Loading ---------- */

  async function loadDirectory() {
    try {
      const { data, error } = await rrClient().from("nurseries").select(COLUMNS);
      if (error) throw error;
      directory = (data || []).map(n => ({ ...n, source: "rootrite" }));
    } catch (e) {
      console.warn("RootRite: could not load the nursery directory", e?.message || e);
      directory = [];
    }
  }

  // Nurseries, DENR offices and garden shops from OpenStreetMap, exported for the whole country
  // into assets/osm-nurseries.json by scripts/update-osm-nurseries.mjs. Loaded once.
  async function loadOsm() {
    if (osmState !== "idle") return;
    osmState = "loading";
    try {
      const r = await fetch("assets/osm-nurseries.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { rows } = await r.json();
      osm = rows.map(([name, lat, lon, kind, phone, hours, municipality, province], i) => ({
        id: `osm-${i}`, source: "osm", name, lat, lon, kind: `osm-${kind}`, phone, hours, municipality, province, species: []
      }));
      osmState = "ok";
    } catch (e) {
      console.warn("RootRite: could not load the OpenStreetMap nurseries", e?.message || e);
      osmState = "failed";
    }
  }

  /* ---------- Ranking ---------- */

  // A nursery that lists the tree comes first. The rest are ordered by distance, weighted by how
  // likely each kind of place is to have native forest trees: a forest nursery 2 km away beats
  // an orchid nursery 1 km away, and garden shops come last.
  const WEIGHT = { "osm-g": 1, "osm-o": 1.3, "osm-n": 2, "osm-c": 3.5, "osm-s": 4 };
  function ranked(speciesId) {
    const p = pin();
    if (!p) return [];
    const all = [...directory, ...osm].map(n => ({ ...n, km: km(p, n) }));
    const stocks = n => !!speciesId && n.species.includes(speciesId);
    const cost = n => (n.km + 2) * (WEIGHT[n.kind] || 1) * (n.featured ? 0.8 : 1);
    // the same place can be in both lists; keep RootRite's entry
    const seen = directory.map(n => ({ lat: n.lat, lon: n.lon }));
    return all
      .filter(n => n.source === "rootrite" || !seen.some(s => km(s, n) < 0.15))
      .filter(n => n.km <= (stocks(n) ? STOCK_RADIUS_KM : RADIUS_KM))
      .sort((a, b) => stocks(b) - stocks(a) || cost(a) - cost(b));
  }

  /* ---------- Species sheets: one line each ---------- */

  function sheetLine(sp) {
    if (!isPremium()) return `Nurseries near your site are part of Premium. <button class="link-btn" type="button" data-upgrade data-upgrade-from="nurseries">Unlock them</button>`;
    const p = pin();
    const find = `<button class="link-btn" type="button" data-find-seedlings="${sp.id}">See nurseries near you</button>`;
    if (!p) return `Drop a pin on the map above to find nurseries near you.`;
    const list = ranked(sp.id);
    const stocked = list.find(n => n.species.includes(sp.id) && n.status === "approved");
    if (stocked) return `<b>${esc(stocked.name)}</b>, ${kmText(stocked.km)} away, lists ${esc(sp.name)} in stock. ${find}`;
    const near = list.find(n => n.status !== "pending" && !["osm-s", "osm-o", "osm-c"].includes(n.kind));
    if (near) return `No nursery near you has listed ${esc(sp.name)} yet. Nearest tree nursery: <b>${esc(near.name)}</b>, ${kmText(near.km)} away; call ahead to ask. ${find}`;
    const office = list.find(n => n.kind === "osm-o");
    if (office) return `No tree nursery is mapped near you yet. Nearest DENR office: <b>${esc(office.name)}</b>, ${kmText(office.km)} away; CENRO offices run reforestation nurseries, so ask about ${esc(sp.name)}. ${find}`;
    if (osmState === "loading") return `Looking for nurseries near your pin…`;
    return `No nurseries found within ${RADIUS_KM} km yet. Your CENRO office runs reforestation nurseries; ask them about native seedlings. ${find}`;
  }

  function fillSheets() {
    document.querySelectorAll("[data-seedlings]").forEach(dd => {
      const sp = byId(dd.dataset.seedlings);
      if (sp) dd.innerHTML = sheetLine(sp);
    });
  }

  /* ---------- The nurseries section ---------- */

  function currentSpecies() {
    return chosen ?? state.lastShown?.[0]?.sp.id ?? "";
  }

  function paint() {
    fillSheets();
    if (!map) return;
    const p = pin();
    const sid = currentSpecies();
    const select = $("nursery-species");
    if (select.value !== sid) select.value = sid;

    const everywhere = ranked(sid), list = everywhere.slice(0, LIST_MAX);
    layer.clearLayers();
    $("nursery-content").inert = !isPremium();
    if (!isPremium()) {
      if (adding) stopAdding();
      paintLocked(p, everywhere);
      return;
    }
    if (p) {
      if (!siteMarker) siteMarker = L.circleMarker([p.lat, p.lon], { radius: 9, color: "#4A2E1A", weight: 3, fillColor: "#80C8F0", fillOpacity: 1 }).bindTooltip("Your site").addTo(map);
      else siteMarker.setLatLng([p.lat, p.lon]);
    }
    const sp = byId(sid);
    list.forEach((n, i) => {
      const has = sid && n.species.includes(sid);
      L.circleMarker([n.lat, n.lon], {
        radius: has ? 9 : 7, weight: 2, color: "#FBF7F0", fillOpacity: 1,
        fillColor: has ? "#3B4936" : ["osm-s", "osm-c"].includes(n.kind) ? "#A4AD96" : n.kind === "osm-o" ? "#80C8F0" : "#6F8A5E"
      }).bindTooltip(esc(n.name)).on("click", () => focusItem(i)).addTo(layer);
    });

    const box = $("nursery-list");
    if (!p) {
      box.innerHTML = `<li class="nursery-empty">Drop a pin on the map at the top of the page, and the nurseries nearest your site appear here.</li>`;
      map.setView([12.3, 122.6], 5);
      return;
    }
    if (!list.length) {
      box.innerHTML = `<li class="nursery-empty">${osmState === "loading" ? "Looking for nurseries near your pin…"
        : osmState === "failed" ? "The nursery map didn't load, and no RootRite-listed nursery is near this pin. Reload the page, or suggest a nursery you know."
        : `No nurseries found within ${RADIUS_KM} km of your pin. Your CENRO office runs reforestation nurseries; ask them about native seedlings, or suggest a nursery you know.`}</li>`;
      map.setView([p.lat, p.lon], 10);
      return;
    }
    box.innerHTML = list.map((n, i) => item(n, sp, i)).join("");
    map.fitBounds(L.latLngBounds([[p.lat, p.lon], ...list.map(n => [n.lat, n.lon])]).pad(0.15), { maxZoom: 13 });
  }

  // Free: a blurred map of the area with dots only, placeholder rows, and how many places there are.
  function paintLocked(p, list) {
    if (p) {
      if (!siteMarker) siteMarker = L.circleMarker([p.lat, p.lon], { radius: 9, color: "#4A2E1A", weight: 3, fillColor: "#80C8F0", fillOpacity: 1 }).addTo(map);
      else siteMarker.setLatLng([p.lat, p.lon]);
    }
    const shown = list.slice(0, LIST_MAX);
    shown.forEach(n => L.circleMarker([n.lat, n.lon], { radius: 7, weight: 2, color: "#FBF7F0", fillColor: "#6F8A5E", fillOpacity: 1 }).addTo(layer));
    if (p) map.fitBounds(L.latLngBounds([[p.lat, p.lon], ...shown.map(n => [n.lat, n.lon])]).pad(0.15), { maxZoom: 13 });
    else map.setView([12.3, 122.6], 5);
    $("nursery-list").innerHTML = Array.from({ length: 4 }, () => `
      <li class="nursery">
        <div class="nursery-main">
          <h3 class="nursery-name">Nursery near your site</h3>
          <p class="nursery-meta">Type of place and opening hours</p>
          <p class="nursery-stock">Which native trees it lists, and how to ask.</p>
        </div>
        <p class="nursery-km">0 km</p>
        <p class="nursery-actions"><a>Call</a> <a>Directions</a></p>
      </li>`).join("");
    const n = list.length;
    $("nursery-lock-title").textContent = !p ? "Find out where to get seedlings"
      : n ? `${fmt(n)} ${n === 1 ? "place" : "places"} to ask, within ${RADIUS_KM} km of your pin`
      : "Find out where to get seedlings";
    $("nursery-lock-text").textContent = `Premium shows the places near your site, with distance, phone numbers, directions and listed stock. From ${RR_CONFIG.premiumPrice} a month.`;
  }

  function item(n, sp, i) {
    const place = [n.municipality, n.province].filter(Boolean).join(", ");
    const kind = n.source === "osm"
      ? { "osm-g": "Forest tree nursery", "osm-o": "DENR office", "osm-n": "Plant nursery", "osm-c": "Crop or ornamental nursery", "osm-s": "Garden shop" }[n.kind] + ", from OpenStreetMap"
      : KINDS[n.kind];
    const names = n.species.map(byId).filter(Boolean).map(s => s.name);
    let stock;
    if (n.status === "pending") stock = `<span class="nursery-pending">Waiting for review. Only you can see this listing.</span>`;
    else if (sp && n.species.includes(sp.id)) stock = `<b class="nursery-has">Lists ${esc(sp.name)} in stock</b>${names.length > 1 ? `, with ${names.length - 1} other native ${names.length === 2 ? "tree" : "trees"}` : ""}`;
    else if (names.length) stock = `Lists ${esc(names.slice(0, 3).join(", "))}${names.length > 3 ? ` and ${names.length - 3} more` : ""}${sp ? `; not ${esc(sp.name)}` : ""}`;
    else stock = n.kind === "osm-s" ? "Garden shops rarely carry native forest trees. Call ahead."
      : n.kind === "osm-c" ? "Grows mostly crops or ornamentals. Call ahead about native trees."
      : n.kind === "osm-o" ? "CENRO and PENRO offices run reforestation nurseries. Ask about native seedlings."
      : "Stock unknown. Call ahead to ask.";
    return `
      <li class="nursery${n.featured ? " is-featured" : ""}" id="nursery-${i}">
        <div class="nursery-main">
          <h3 class="nursery-name">${esc(n.name)}</h3>
          <p class="nursery-meta">${esc(kind)}${place ? ` · ${esc(place)}` : ""}${n.hours ? ` · ${esc(n.hours)}` : ""}</p>
          <p class="nursery-stock">${stock}</p>
        </div>
        <p class="nursery-km">${kmText(n.km)}</p>
        <p class="nursery-actions">
          ${tel(n.phone) ? `<a href="tel:${tel(n.phone)}">Call ${esc(n.phone)}</a>` : ""}
          <a href="${directions(n)}" target="_blank" rel="noopener">Directions</a>
        </p>
      </li>`;
  }

  function focusItem(i) {
    const li = $(`nursery-${i}`);
    if (!li) return;
    li.scrollIntoView({ behavior: "smooth", block: "nearest" });
    li.classList.remove("is-flash"); void li.offsetWidth; li.classList.add("is-flash");
  }

  /* ---------- Suggesting a nursery ---------- */

  function startAdding() {
    adding = true;
    $("nursery-form").hidden = false;
    $("nursery-add").hidden = true;
    $("nursery-place-hint").textContent = "Tap the nursery's location on the map above.";
    $("nursery-map").scrollIntoView({ behavior: "smooth", block: "center" });
    const p = pin();
    if (p && map.getZoom() < 12) map.setView([p.lat, p.lon], 12);
  }

  function stopAdding() {
    adding = false;
    $("nursery-form").hidden = true;
    $("nursery-form").reset();
    $("nursery-add").hidden = false;
    $("nursery-error").hidden = true;
    if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  }

  function placeDraft(latlng) {
    if (!draftMarker) draftMarker = L.marker(latlng, { draggable: true, icon: L.divIcon({ className: "pin-mark pin-mark-new", html: "<span></span>", iconSize: [30, 42], iconAnchor: [15, 40] }) }).addTo(map);
    else draftMarker.setLatLng(latlng);
    $("nursery-place-hint").textContent = "Placed. Drag the marker to adjust it.";
  }

  async function submit(e) {
    e.preventDefault();
    const f = e.target, err = $("nursery-error"), btn = f.querySelector("button[type=submit]");
    const say = text => { err.textContent = text; err.hidden = false; };
    err.hidden = true;
    if (!draftMarker) return say("Tap the nursery's location on the map first.");
    if (f.nname.value.trim().length < 2) return say("Add the nursery's name.");
    const at = draftMarker.getLatLng();
    if (at.lat < 4 || at.lat > 22 || at.lng < 116 || at.lng > 127) return say("Place the nursery inside the Philippines.");
    const species = [...f.querySelectorAll('input[name="stock"]:checked')].map(x => x.value);
    btn.disabled = true;
    try {
      const { error } = await rrClient().from("nurseries").insert({
        name: f.nname.value.trim(), kind: f.kind.value,
        municipality: f.municipality.value.trim() || null, province: f.province.value.trim() || null,
        lat: +at.lat.toFixed(6), lon: +at.lng.toFixed(6),
        phone: f.phone.value.trim() || null, hours: f.hours.value.trim() || null,
        species, notes: f.notes.value.trim() || null
      });
      if (error) throw error;
      stopAdding();
      await loadDirectory();
      paint();
      toast("Thank you. We'll check the nursery and list it for everyone soon.");
    } catch (x) {
      say(/five suggestions/i.test(x?.message || "") ? "You have five suggestions waiting for review. Please wait for those first." : rrErrorText(x));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Setup ---------- */

  function init() {
    if (!window.L || map) return;
    const select = $("nursery-species");
    select.innerHTML = `<option value="">Any tree</option>` +
      [...SPECIES].sort((a, b) => a.name.localeCompare(b.name)).map(sp => `<option value="${sp.id}">${esc(sp.name)}</option>`).join("");
    select.addEventListener("change", () => { chosen = select.value; paint(); });

    $("nursery-stock").innerHTML = [...SPECIES].sort((a, b) => a.name.localeCompare(b.name))
      .map(sp => `<label><input type="checkbox" name="stock" value="${sp.id}"><span>${esc(sp.name)}</span></label>`).join("");
    $("nursery-stock-filter").addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      $("nursery-stock").querySelectorAll("label").forEach(l => { l.hidden = q && !l.textContent.toLowerCase().includes(q); });
    });

    map = L.map("nursery-map", { scrollWheelZoom: false }).setView([12.3, 122.6], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", e => { if (adding) placeDraft(e.latlng); });
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());

    $("nursery-add").addEventListener("click", startAdding);
    $("nursery-cancel").addEventListener("click", stopAdding);
    $("nursery-form").addEventListener("submit", submit);
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-find-seedlings]");
      if (!b) return;
      chosen = b.dataset.findSeedlings;
      paint();
      $("nurseries").scrollIntoView({ behavior: "smooth" });
    });

    Promise.all([loadDirectory(), loadOsm()]).then(paint);
    requestAnimationFrame(() => map.invalidateSize());
  }

  // Called after every render of the results: refills the sheets, and searches again if the pin moved.
  function update() {
    paint();
  }

  return { init, update };
})();
