/*
  RootRite: fill in the site from a map pin.
  A pin reads elevation and slope (Copernicus 90 m terrain, via Open-Meteo), yearly rainfall
  (ten-year ERA5 average, via Open-Meteo), topsoil texture (SoilGrids, ISRIC) and the place name
  (OpenStreetMap Nominatim). Every reading is an estimate, and the person can change any of them.
*/
const SiteMap = (() => {
  const PH = { center: [12.3, 122.6], zoom: 5 };
  const TIMEOUT = 20000;
  let map, marker, pin = null, readings = null, autoLocation = "", seq = 0, reading = false;

  const $ = id => document.getElementById(id);
  const form = () => $("site");
  const round = (v, step) => Math.round(v / step) * step;
  const getJSON = async url => {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  /* ---------- Readings ---------- */

  // Elevation at the pin, and the slope from four points about 110 m away on each side.
  async function readTerrain(lat, lon) {
    const d = 0.001, kmPerDeg = 111.32;
    const lats = [lat, lat + d, lat - d, lat, lat], lons = [lon, lon, lon, lon + d, lon - d];
    const { elevation: [z, n, s, e, w] } = await getJSON(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`);
    const dy = 2 * d * kmPerDeg * 1000, dx = dy * Math.cos(lat * Math.PI / 180);
    const grade = Math.hypot((n - s) / dy, (e - w) / dx);
    return { elev: z, slopeDeg: Math.atan(grade) * 180 / Math.PI };
  }

  // Average yearly rainfall over the last ten full years.
  async function readRain(lat, lon) {
    const last = new Date().getFullYear() - 1, first = last - 9;
    const data = await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${first}-01-01&end_date=${last}-12-31&daily=precipitation_sum&timezone=Asia%2FManila`);
    const days = data.daily.precipitation_sum.filter(v => v != null);
    if (days.length < 3000) throw new Error("Too little rainfall data");
    const monthly = Array(12).fill(0);
    data.daily.time.forEach((t, i) => { monthly[+t.slice(5, 7) - 1] += data.daily.precipitation_sum[i] || 0; });
    return {
      rain: days.reduce((a, b) => a + b, 0) / (days.length / 365.25),
      monthly: monthly.map(v => Math.round(v / (last - first + 1))),
      years: `${first}–${last}`
    };
  }

  // One SoilGrids value (g/kg, or cm³/dm³ for gravel) from ISRIC's map server; null where there is no soil.
  async function soilValue(prop, depth, lat, lon) {
    const layer = `${prop}_${depth}_mean`, b = 0.001;
    const url = `https://maps.isric.org/mapserv?map=/map/${prop}.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
      `&LAYERS=${layer}&QUERY_LAYERS=${layer}&CRS=EPSG:4326&BBOX=${lat - b},${lon - b},${lat + b},${lon + b}` +
      `&WIDTH=3&HEIGHT=3&I=1&J=1&INFO_FORMAT=text/html&FORMAT=image/png&STYLES=`;
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const m = (await r.text()).match(/id="value">\s*(-?\d+(?:\.\d+)?)/);
    return m ? +m[1] : null;
  }

  // Topsoil (5–30 cm): clay and sand as percentages, gravel as percent of volume.
  async function soilAt(lat, lon) {
    const [c1, c2, s1, s2, g] = await Promise.all([
      soilValue("clay", "5-15cm", lat, lon), soilValue("clay", "15-30cm", lat, lon),
      soilValue("sand", "5-15cm", lat, lon), soilValue("sand", "15-30cm", lat, lon),
      soilValue("cfvo", "5-15cm", lat, lon)
    ]);
    if (c1 == null && c2 == null) return null;
    const avg = (a, b) => (a ?? b) / 2 + (b ?? a) / 2;
    return { clay: avg(c1, c2) / 10, sand: avg(s1, s2) / 10, gravel: (g ?? 0) / 10, awayKm: 0 };
  }

  // Soil maps leave out towns, rivers and lakes, so when the pin has no data,
  // look for the nearest mapped soil in rings about 0.5, 1 and 2 km out.
  async function readSoil(lat, lon) {
    const here = await soilAt(lat, lon);
    if (here) return here;
    for (const d of [0.005, 0.01, 0.02]) {
      const ring = [[d, 0], [-d, 0], [0, d], [0, -d]].map(([a, b]) => [lat + a, lon + b]);
      const hit = (await Promise.all(ring.map(([a, b]) => soilValue("clay", "5-15cm", a, b)))).findIndex(v => v != null);
      if (hit >= 0) {
        const t = await soilAt(...ring[hit]);
        if (t) return { ...t, awayKm: Math.round(d * 111 * 2) / 2 };
      }
    }
    return null;
  }

  // A short place name, such as "Daclan, Tublay, Benguet".
  async function readPlace(lat, lon) {
    const d = await getJSON(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=14&accept-language=en`);
    const a = d.address || {};
    const parts = [a.village || a.suburb || a.hamlet, a.town || a.city || a.municipality, a.province || a.state || a.county];
    return [...new Set(parts.filter(Boolean))].join(", ");
  }

  /* ---------- Turning readings into the form's choices ---------- */

  function soilClass(t) {
    if (t.gravel >= 35) return "rocky";
    if (t.clay >= 40) return "clay";
    if (t.sand >= 70 && t.clay < 15) return "sandy";
    return "loam";
  }
  const slopeClass = deg => deg < 3 ? 0 : deg <= 10 ? 1 : 2; // 10° is about the 18% grade used for forest land
  function moistGuess(soil, slope, rain) {
    if (soil === "sandy" || soil === "rocky") return "dry";
    if (soil === "clay" && slope === 0 && rain >= 2500) return "wet";
    return "moist";
  }

  function check(name, value) {
    const input = form().querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  // The rainfall question gains a fourth choice holding the measured amount.
  function setRain(mm) {
    const input = $("rain-map");
    input.value = String(mm);
    $("rain-map-text").textContent = `${fmt(mm)} mm, from your pin`;
    $("rain-map-chip").hidden = false;
    input.checked = true;
  }

  function apply(r) {
    const f = form();
    if (r.place && (!f.location.value.trim() || f.location.value === autoLocation)) {
      f.location.value = autoLocation = r.place;
    }
    if (r.elev != null) f.elev.value = Math.min(2700, Math.max(0, round(r.elev, 10)));
    if (r.rain != null) setRain(round(r.rain, 50));
    if (r.slope != null) check("slope", r.slope);
    if (r.soil) {
      check("soil", r.soil);
      check("moist", moistGuess(r.soil, r.slope ?? 1, r.rain ?? 2000));
    }
    render(true);
  }

  /* ---------- The readings panel ---------- */

  const ROWS = [
    ["elev", "Elevation"], ["rain", "Rainfall"], ["soil", "Soil"], ["slope", "Slope"], ["moist", "Drainage"]
  ];

  function showReadings(r, pending) {
    const box = $("pin-readings");
    const SOILS = { clay: "Clay", loam: "Loam", sandy: "Sandy", rocky: "Rocky" };
    const text = {
      elev: r.elev != null ? `${fmt(Math.max(0, round(r.elev, 10)))} m above sea level` : null,
      rain: r.rain != null ? `About ${fmt(round(r.rain, 50))} mm a year (${r.years} average)` : null,
      soil: r.soil ? `${SOILS[r.soil]}: ${Math.round(r.texture.clay)}% clay, ${Math.round(r.texture.sand)}% sand` +
        (r.texture.awayKm ? `, from mapped soil about ${r.texture.awayKm} km away` : "") : null,
      slope: r.slope != null ? `${["Flat", "Gentle", "Steep"][r.slope]}, about ${Math.round(r.slopeDeg)}°` : null,
      moist: r.soil ? `${{ dry: "Dry, drains fast", moist: "Moist, drains well", wet: "Wet or waterlogged" }[moistGuess(r.soil, r.slope ?? 1, r.rain ?? 2000)]}, estimated` : null
    };
    const failed = {
      elev: "Couldn't read it. Set it below.", rain: "Couldn't read it. Choose below.",
      soil: !r.noSoil ? "Couldn't read it. Choose below."
        : r.elev != null && r.elev <= 5 ? "No soil data here: it may be water or shoreline. If the tide covers it, choose Tidal mud."
        : "No soil map data near this spot. Choose below.",
      slope: "Couldn't read it. Choose below.", moist: "Choose below."
    };
    box.innerHTML = ROWS.map(([k, label]) => {
      const waiting = pending.has(k);
      const value = waiting ? "Reading…" : text[k] ?? failed[k];
      return `<div class="${waiting ? "is-waiting" : text[k] ? "" : "is-missing"}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
    }).join("");
    box.hidden = false;
    $("pin-note").hidden = pending.size > 0;
  }

  /* ---------- Dropping the pin ---------- */

  async function drop(lat, lon, { fly = false, doneNote = "" } = {}) {
    lat = +lat.toFixed(5); lon = +lon.toFixed(5);
    pin = { lat, lon };
    if (!marker) {
      marker = L.marker([lat, lon], { draggable: true, icon: pinIcon(), keyboard: true, title: "Your planting site" }).addTo(map);
      marker.on("dragend", () => { const p = marker.getLatLng(); drop(p.lat, p.lng); });
    } else marker.setLatLng([lat, lon]);
    if (fly) map.flyTo([lat, lon], Math.max(map.getZoom(), 14), { duration: 0.8 });

    const id = ++seq;
    const r = { lat, lon };
    readings = null; reading = true;
    PlantCal.paint();
    const pending = new Set(["elev", "rain", "soil", "slope", "moist"]);
    $("pin-help").textContent = "Reading your site…";
    showReadings(r, pending);
    const settle = (keys) => { if (id !== seq) return false; keys.forEach(k => pending.delete(k)); showReadings(r, pending); return true; };

    const terrain = readTerrain(lat, lon).then(t => { r.elev = t.elev; r.slopeDeg = t.slopeDeg; r.slope = slopeClass(t.slopeDeg); })
      .catch(() => {}).finally(() => settle(["elev", "slope"]));
    const rain = readRain(lat, lon).then(x => { r.rain = x.rain; r.monthly = x.monthly; r.years = x.years; })
      .catch(() => {}).finally(() => settle(["rain"]));
    const soil = readSoil(lat, lon).then(t => { if (t) { r.texture = t; r.soil = soilClass(t); } else r.noSoil = true; })
      .catch(() => {}).finally(() => settle(["soil"]));
    const place = readPlace(lat, lon).then(p => { r.place = p; }).catch(() => {});

    await Promise.all([terrain, rain, soil, place]);
    if (id !== seq) return;
    settle(["moist"]);
    readings = r; reading = false;
    apply(r);
    const got = ["elev", "rain", "soil", "slope"].filter(k => r[k] != null).length;
    $("pin-help").textContent = got === 4
      ? doneNote || "Filled in from your pin. Drag the pin or tap elsewhere to read another spot."
      : "Some readings didn't come through. Fill those in below, or try the pin again.";
  }

  function pinIcon() {
    return L.divIcon({ className: "pin-mark", html: "<span></span>", iconSize: [30, 42], iconAnchor: [15, 40] });
  }

  /* ---------- Search and "use my location" ---------- */

  async function search() {
    const q = $("pin-q").value.trim();
    const hits = $("pin-hits");
    if (q.length < 2) return;
    hits.hidden = false;
    hits.innerHTML = `<li class="pin-hits-note">Searching…</li>`;
    try {
      const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&countryCode=PH`);
      const list = d.results || [];
      hits.innerHTML = list.length
        ? list.map(p => `<li><button type="button" data-lat="${p.latitude}" data-lon="${p.longitude}">${esc(p.name)}<span>${esc([p.admin3 !== p.name ? p.admin3 : "", (p.admin2 || "").replace(/^Province of /, ""), p.admin1].filter(Boolean).join(", "))}</span></button></li>`).join("")
        : `<li class="pin-hits-note">No place called "${esc(q)}" found. Try the town or province name.</li>`;
    } catch (e) {
      hits.innerHTML = `<li class="pin-hits-note">Search isn't answering. Tap the map instead.</li>`;
    }
  }

  function locate() {
    const btn = $("pin-locate");
    if (!navigator.geolocation) { $("pin-help").textContent = "This browser can't share your location. Search or tap the map instead."; return; }
    btn.disabled = true;
    $("pin-help").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      p => { btn.disabled = false; drop(p.coords.latitude, p.coords.longitude, { fly: true }); },
      () => { btn.disabled = false; $("pin-help").textContent = "Location wasn't shared. Search for your town or tap the map instead."; },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  /* ---------- Setup ---------- */

  function init(saved) {
    if (saved?.pin) { pin = saved.pin; readings = saved.readings || null; autoLocation = readings?.place || ""; }
    if (!window.L || map) return;
    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics"
    });
    map = L.map("pin-map", { layers: [street], scrollWheelZoom: false }).setView(PH.center, PH.zoom);
    L.control.layers({ Map: street, Satellite: satellite }, null, { position: "topright" }).addTo(map);
    map.on("click", e => drop(e.latlng.lat, e.latlng.lng));
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());

    if (saved?.pin) {
      marker = L.marker([pin.lat, pin.lon], { draggable: true, icon: pinIcon(), keyboard: true, title: "Your planting site" }).addTo(map);
      marker.on("dragend", () => { const p = marker.getLatLng(); drop(p.lat, p.lng); });
      map.setView([pin.lat, pin.lon], 14);
      if (readings) showReadings(readings, new Set());
      $("pin-help").textContent = "Your last pin. Drag it or tap elsewhere to read another spot.";
      if (!readings?.monthly) {
        reading = true;
        const id = seq;
        readRain(pin.lat, pin.lon)
          .then(x => { if (id === seq) readings = { ...readings, ...x, rain: readings?.rain ?? x.rain }; })
          .catch(() => {})
          .finally(() => { if (id === seq) { reading = false; render(false); } });
      }
    }

    $("pin-search").addEventListener("click", search);
    $("pin-q").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); search(); } });
    $("pin-hits").addEventListener("click", e => {
      const b = e.target.closest("button[data-lat]");
      if (!b) return;
      $("pin-hits").hidden = true;
      drop(+b.dataset.lat, +b.dataset.lon, { fly: true, doneNote: "Filled in for the town center. Drag the pin onto your exact spot for a closer reading." });
    });
    $("pin-locate").addEventListener("click", locate);
    requestAnimationFrame(() => map.invalidateSize());
  }

  return { init, setRain, isReading: () => reading, snapshot: () => (pin ? { pin, readings } : {}) };
})();
