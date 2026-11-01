/*
  RootRite: when to plant.
  Reads a site's ten-year average monthly rainfall (from the map pin) and works out two things:
  - the closest PAGASA climate type (Modified Coronas), judged from how the rain falls through the year;
  - the planting window. Seedlings need about three wet months to root before any dry spell,
    so the best months are the first ones after the rains settle in.
  The thresholds were calibrated against towns of known climate type, on ERA5 rainfall, which reads
  somewhat high in dry months. They are estimates, not PAGASA's own classification of the site.
*/
const PlantCal = (() => {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DRY = 100;      // mm a month: below this, a young tree depends on watering
  const SETTLED = 200;  // mm a month: the rains have properly arrived
  const HEAVY = 600;    // mm a month: downpours can wash out seedlings

  const TYPES = {
    1: { name: "Type I", summary: "Two clear seasons: dry from about November to April, wet the rest of the year." },
    2: { name: "Type II", summary: "No dry season, and the most rain from about November to February." },
    3: { name: "Type III", summary: "A short dry season of one to three months, usually around March and April." },
    4: { name: "Type IV", summary: "Rain spread fairly evenly through the year, with no dry season." }
  };

  const at = (list, i) => list[((i % 12) + 12) % 12];
  const share = (m, months) => months.reduce((a, i) => a + m[i], 0) / m.reduce((a, b) => a + b, 0);

  function climateType(m) {
    if (share(m, [10, 11, 0, 1, 2, 3]) < 0.28) return 1;  // little of the year's rain falls November to April
    if (share(m, [10, 11, 0, 1]) >= 0.40) return 2;        // a strong peak from November to February
    if (share(m, [2, 3]) < 0.09) return 3;                 // March and April stand out as dry
    return 4;
  }

  // The month the rains settle in: after the longest dry stretch, or after the driest month if there is none.
  function rainsStart(m) {
    let bestEnd = -1, bestLen = 0;
    for (let i = 0; i < 12; i++) {
      if (at(m, i) >= DRY || at(m, i + 1) < DRY) continue; // i must be the last dry month of a run
      let len = 0;
      while (len < 12 && at(m, i - len) < DRY) len++;
      if (len > bestLen) { bestLen = len; bestEnd = i; }
    }
    if (!bestLen) return (m.indexOf(Math.min(...m)) + 1) % 12; // no dry season: start as rain picks up again, well before its peak
    for (const need of [SETTLED, 150, DRY]) {
      for (let k = 1; k <= 6; k++) if (at(m, bestEnd + k) >= need) return (bestEnd + k) % 12;
    }
    return (bestEnd + 1) % 12;
  }

  // month status: best, ok, heavy (very wet), late (rain now, but dry months follow too soon) or dry
  function calendar(monthly) {
    const m = monthly.map(v => Math.max(0, v));
    const start = rainsStart(m);
    const rootTime = i => at(m, i) >= DRY && at(m, i + 1) >= DRY && at(m, i + 2) >= DRY;
    const status = m.map((v, i) => v >= HEAVY ? "heavy" : rootTime(i) ? "ok" : v >= DRY ? "late" : "dry");
    const best = [];
    for (let k = 0; k < 3; k++) {
      const i = (start + k) % 12;
      if (status[i] === "ok") { status[i] = "best"; best.push(i); }
    }
    // when downpours or a short season rule out the usual months, the next good one takes their place
    if (!best.length) for (let k = 0; k < 12 && !best.length; k++) {
      const i = (start + k) % 12;
      if (status[i] === "ok") { status[i] = "best"; best.push(i); }
    }
    // no month qualifies: name the least risky one, and say seedlings can't rely on rain alone
    const noWindow = !best.length;
    if (noWindow) {
      const candidates = m.map((v, i) => i).filter(i => m[i] < HEAVY);
      const pick = candidates.length ? candidates.reduce((a, i) => m[i] > m[a] ? i : a) : m.indexOf(Math.min(...m));
      status[pick] = "best";
      best.push(pick);
    }
    const dryMonths = m.map((v, i) => v < DRY ? i : -1).filter(i => i >= 0);
    return { monthly: m, type: climateType(m), start: noWindow ? best[0] : start, status, best, dryMonths, seasonal: dryMonths.length > 0, noWindow };
  }

  /* ---------- Wording ---------- */

  // [5, 6, 7] -> "June to August"; [5, 7] -> "June and August"; wraps across December
  function monthRange(list) {
    if (!list.length) return "";
    if (list.length === 1) return MONTHS[list[0]];
    const steps = list.slice(1).every((v, i) => v === (list[i] + 1) % 12);
    if (steps) return `${MONTHS[list[0]]} to ${MONTHS[list[list.length - 1]]}`;
    return `${list.slice(0, -1).map(i => MONTHS[i]).join(", ")} and ${MONTHS[list[list.length - 1]]}`;
  }

  // The longest unbroken dry stretch, in order, even across the new year.
  function longestRun(months) {
    const has = new Set(months);
    let best = [];
    for (const m of months) {
      if (has.has((m + 11) % 12) && months.length < 12) continue;
      const run = [m];
      while (has.has((run[run.length - 1] + 1) % 12) && run.length < months.length) run.push((run[run.length - 1] + 1) % 12);
      if (run.length > best.length) best = run;
    }
    return best;
  }

  const nowMonth = () => +new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "numeric" }) - 1;

  // Months until the next best month; 0 means now.
  const monthsAway = cal => Math.min(...cal.best.map(i => (i - nowMonth() + 12) % 12));

  function countdown(cal) {
    const away = monthsAway(cal);
    return away === 0 ? "You're in the planting window now." : `That starts in ${away} ${away === 1 ? "month" : "months"}.`;
  }

  /* ---------- The section ---------- */

  const WORDS = { best: "Best", ok: "Can plant", heavy: "Very wet", late: "Dry ahead", dry: "Too dry" };
  const $ = id => document.getElementById(id);
  let current = null;

  function steps(cal) {
    const seedlings = (cal.start + 10) % 12, ground = (cal.start + 11) % 12;
    const dry = longestRun(cal.dryMonths), away = monthsAway(cal);
    const list = [
      [away <= 2 ? "Now" : `By ${MONTHS[seedlings]}`, "Reserve your seedlings", `Ask about two months ahead. <a href="#nurseries">See nurseries near you</a>.`],
      [away === 0 ? "Before planting" : `In ${MONTHS[ground]}`, "Prepare the ground", "Clear the grass in a circle about 1 m wide, and dig the holes."],
      [monthRange(cal.best), "Plant", "Plant after a good rain, and stake seedlings on windy sites. Wait if PAGASA forecasts a storm."],
      dry.length
        ? [monthRange(dry), "Water young trees", "Water weekly until the rain returns. The first dry season is the hardest for a young tree."]
        : ["First two years", "Keep the grass back", "Rain comes through the year here, so weeds are the bigger threat. Clear them around each seedling."]
    ];
    return list.map(([when, what, how]) => `<li><p class="cal-step-when">${when}</p><div><h4>${what}</h4><p>${how}</p></div></li>`).join("");
  }

  function table(cal, years) {
    const max = Math.max(...cal.monthly), now = nowMonth();
    const rows = cal.monthly.map((v, i) => {
      const s = cal.status[i];
      return `<tr class="is-${s}${i === now ? " is-now" : ""}">
        <th scope="row"><abbr title="${MONTHS[i]}">${MONTHS[i].slice(0, 3)}</abbr>${i === now ? `<span class="cal-now">Now</span>` : ""}</th>
        <td class="cal-bar-cell"><span class="cal-bar" style="width:${Math.max(1, v / max * 100).toFixed(1)}%"></span></td>
        <td class="cal-mm">${fmt(Math.round(v))} mm</td>
        <td class="cal-status">${WORDS[s]}</td>
      </tr>`;
    }).join("");
    return `<table class="cal-table">
      <caption>Average rain each month at your pin, ${years}</caption>
      <thead><tr><th scope="col">Month</th><th scope="col"><span class="sr-only">Rain, as a bar</span></th><th scope="col">Rain</th><th scope="col">Planting</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function paint() {
    const box = $("planting-body");
    if (!box) return;
    const snap = SiteMap.snapshot();
    current = snap.readings?.monthly?.length === 12 ? calendar(snap.readings.monthly) : null;
    if (!current) {
      box.innerHTML = `<p class="cal-empty">${!snap.pin ? "Drop a pin on the map above, and your planting calendar appears here."
        : SiteMap.isReading() ? "Reading ten years of rainfall at your pin…"
        : "The rainfall records didn't answer this time. Tap your pin's spot on the map again to retry."}</p>`;
      return;
    }
    const type = TYPES[current.type];
    const tidal = $("site").querySelector('input[name="soil"]:checked')?.value === "tidal";
    const place = snap.readings.place ? ` near ${esc(snap.readings.place)}` : "";
    box.innerHTML = `
      <div class="cal-plan">
        <p class="cal-label">Best months to plant${place}</p>
        <p class="cal-months">${monthRange(current.best)}</p>
        <p class="cal-count">${countdown(current)} ${current.noWindow ? "No stretch of the year here suits seedlings on rain alone. This is the least risky time, so plan to water or shelter them." : current.seasonal ? `The rains usually settle in by ${MONTHS[current.start]}.` : "There's no dry season here, so you can plant most of the year. These months are safest, as the rain picks up again."}</p>
        ${tidal ? `<p class="cal-tidal">Planting mangroves? They follow the tide more than the rain. Plant at low tide, and avoid the months when typhoons and big waves are likely.</p>` : ""}
        <ol class="cal-steps">${steps(current)}</ol>
        <div class="cal-type">
          <h3>Closest PAGASA climate type: ${type.name}</h3>
          <p>${type.summary}</p>
          <p class="cal-type-note">Estimated from your pin's rainfall pattern, not taken from PAGASA's official map. Rainfall records: ERA5, via Open-Meteo.</p>
        </div>
      </div>
      <div class="cal-chart">${table(current, snap.readings.years)}</div>`;
  }

  // One line on each species sheet.
  function fillSheets() {
    document.querySelectorAll("[data-plantwhen]").forEach(dd => {
      const sp = SPECIES.find(s => s.id === dd.dataset.plantwhen);
      if (sp?.soils.includes("tidal")) { dd.textContent = "Mangroves follow the tide more than the rain: plant at low tide, outside typhoon months."; return; }
      dd.innerHTML = current
        ? `${monthRange(current.best)} at your site. <a class="link-btn" href="#planting">See your planting plan</a>`
        : "Drop a pin on the map above to see the best months for your site.";
    });
  }

  return { MONTHS, TYPES, calendar, climateType, monthRange, longestRun, paint, fillSheets };
})();
