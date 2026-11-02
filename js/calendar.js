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

  /* ---------- The section ---------- */

  const WORDS = { best: "Best", ok: "Can plant", heavy: "Very wet", late: "Dry ahead", dry: "Too dry" };
  const SHORT = { best: "Best", ok: "OK", heavy: "Wet", late: "Late", dry: "Dry" };
  const LOCK_TEXT = "Premium shows the best months from ten years of rain at your pin, a chart of the whole year, and what to do before and after planting.";
  const $ = id => document.getElementById(id);
  let current = null;

  function steps(cal) {
    const seedlings = (cal.start + 10) % 12, ground = (cal.start + 11) % 12;
    const dry = longestRun(cal.dryMonths), away = monthsAway(cal);
    return [
      [away <= 2 ? "Now" : `By ${MONTHS[seedlings]}`, "Reserve your seedlings", `Ask about two months ahead. <a href="#nurseries">See nurseries near you</a>.`],
      [away === 0 ? "Before planting" : `In ${MONTHS[ground]}`, "Prepare the ground", "Clear the grass in a circle about 1 m wide, and dig the holes."],
      [monthRange(cal.best), "Plant", "Plant after a good rain, and stake seedlings on windy sites. Wait if PAGASA forecasts a storm."],
      dry.length
        ? [monthRange(dry), "Water young trees", "Water weekly until the rain returns. The first dry season is the hardest for a young tree."]
        : ["First two years", "Keep the grass back", "Rain comes through the year here, so weeds are the bigger threat. Clear them around each seedling."]
    ];
  }

  const stepList = list => `<ol class="cal-steps">${list.map(([when, what, how]) => `
    <li><p class="cal-step-when">${when}</p><h4>${what}</h4><p>${how}</p></li>`).join("")}</ol>`;

  // Twelve columns, the best months in full color. Only the wettest and driest carry a figure; every month has a tooltip.
  function year(monthly, status, now, marked = true) {
    const max = Math.max(...monthly) || 1;
    const wet = monthly.indexOf(Math.max(...monthly)), dry = monthly.indexOf(Math.min(...monthly));
    return `<ol class="cal-cols">${monthly.map((v, i) => {
      const s = status[i], mm = `${fmt(Math.round(v))} mm`;
      return `
      <li class="cal-col is-${s}${i === now ? " is-now" : ""}"${marked ? ' tabindex="0"' : ""}>
        <span class="cal-col-plot">
          <span class="cal-col-value">${marked && (i === wet || i === dry) ? fmt(Math.round(v)) : ""}</span>
          <span class="cal-col-bar" style="height:${Math.max(2, v / max * 86).toFixed(1)}%"></span>
        </span>
        <span class="cal-col-month"><abbr${marked ? ` title="${MONTHS[i]}"` : ""}>${MONTHS[i].slice(0, 3)}</abbr></span>
        ${marked ? `<span class="cal-col-word">${SHORT[s]}</span>
        <span class="cal-col-tip" role="tooltip">${MONTHS[i]}${i === now ? " (now)" : ""}: ${mm}. ${WORDS[s]}.</span>` : ""}
      </li>`;
    }).join("")}</ol>`;
  }

  function numbers(cal, years) {
    const now = nowMonth();
    return `<details class="cal-numbers">
      <summary>See the numbers</summary>
      <table class="cal-table">
        <caption class="sr-only">Average rain each month at your pin, ${years}</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Rain</th><th scope="col">Planting</th></tr></thead>
        <tbody>${cal.monthly.map((v, i) => `<tr class="is-${cal.status[i]}${i === now ? " is-now" : ""}"><th scope="row">${MONTHS[i]}${i === now ? " (now)" : ""}</th><td>${fmt(Math.round(v))} mm</td><td>${WORDS[cal.status[i]]}</td></tr>`).join("")}</tbody>
      </table>
    </details>`;
  }

  const KEY = `<p class="cal-key"><b>Best</b>: the safest time to plant. <b>OK</b>: you can plant. <b>Late</b>: dry months follow too soon. <b>Wet</b>: downpours can wash out seedlings. <b>Dry</b>: seedlings would depend on watering. The dark label marks this month.</p>`;

  function layout({ label, months, soon, count, facts, tidal, chart, title, note, steps: list, type }) {
    return `
      <div class="cal-top">
        <div class="cal-hero">
          <p class="cal-label">${label}</p>
          <p class="cal-months">${months}</p>
          <p class="cal-soon">${soon}</p>
          <p class="cal-count">${count}</p>
          <dl class="cal-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
          ${tidal ? `<p class="cal-tidal">Planting mangroves? They follow the tide more than the rain. Plant at low tide, and avoid the months when typhoons and big waves are likely.</p>` : ""}
        </div>
        <div class="cal-year">
          <h3>${title}</h3>
          <p class="cal-year-note">${note}</p>
          ${chart}
        </div>
      </div>
      <h3 class="cal-steps-title">What to do, and when</h3>
      ${stepList(list)}
      ${type}`;
  }

  // Free: the same shape with made-up rain and no dates, so removing the blur shows nothing about the site.
  function paintLocked(snap) {
    const box = $("planting-body");
    box.inert = true;
    const shape = [120, 90, 70, 60, 130, 210, 260, 280, 240, 190, 160, 140];
    const status = ["ok", "ok", "dry", "dry", "ok", "best", "best", "best", "ok", "ok", "ok", "ok"];
    box.innerHTML = layout({
      label: "Best months to plant near your site", months: "Your best months", soon: "Starts soon",
      count: "When the rains usually settle in at your pin, and how long your seedlings have to root.",
      facts: [["Rain a year", "0,000 mm"], ["Wettest", "000 mm"], ["Driest", "000 mm"]],
      chart: year(shape, status, -1, false), title: "Rain through the year", note: "Average rain each month at your pin",
      steps: [["Month", "Reserve your seedlings", "When to ask a nursery."], ["Month", "Prepare the ground", "When to clear and dig."], ["Months", "Plant", "When to plant, and what to watch for."], ["Months", "Water young trees", "When your seedlings need help."]],
      type: ""
    });
    const place = snap.readings?.place;
    $("planting-lock-title").textContent = place ? `Your best planting months near ${place}` : snap.pin ? "Your best planting months" : "Find out when to plant";
    $("planting-lock-text").textContent = `${LOCK_TEXT} From ${RR_CONFIG.premiumPrice} a month.`;
  }

  function paint() {
    const box = $("planting-body");
    if (!box) return;
    const snap = SiteMap.snapshot();
    current = snap.readings?.monthly?.length === 12 ? calendar(snap.readings.monthly) : null;
    if (!isPremium()) { paintLocked(snap); return; }
    box.inert = false;
    if (!current) {
      box.innerHTML = `<p class="cal-empty">${!snap.pin ? "Drop a pin on the map above, and your planting calendar appears here."
        : SiteMap.isReading() ? "Reading ten years of rainfall at your pin…"
        : "The rainfall records didn't answer this time. Tap your pin's spot on the map again to retry."}</p>`;
      return;
    }
    const type = TYPES[current.type], m = current.monthly;
    const tidal = $("site").querySelector('input[name="soil"]:checked')?.value === "tidal";
    const place = snap.readings.place ? ` near ${esc(snap.readings.place)}` : "";
    const wet = m.indexOf(Math.max(...m)), dry = m.indexOf(Math.min(...m));
    const away = monthsAway(current);
    box.innerHTML = layout({
      label: `Best months to plant${place}`,
      months: monthRange(current.best),
      soon: away === 0 ? "You're in the planting window now" : `Starts in ${away} ${away === 1 ? "month" : "months"}`,
      count: current.noWindow ? "No stretch of the year here suits seedlings on rain alone. This is the least risky time, so plan to water or shelter them."
        : current.seasonal ? `The rains usually settle in by ${MONTHS[current.start]}, giving seedlings time to root before any dry spell.`
        : "There's no dry season here, so you can plant most of the year. These months are safest, as the rain picks up again.",
      facts: [
        ["Rain a year", `About ${fmt(Math.round(m.reduce((a, b) => a + b, 0) / 10) * 10)} mm`],
        ["Wettest", `${MONTHS[wet]}, ${fmt(Math.round(m[wet]))} mm`],
        ["Driest", `${MONTHS[dry]}, ${fmt(Math.round(m[dry]))} mm`]
      ],
      tidal,
      title: "Rain through the year",
      note: `Average rain each month at your pin, in mm, ${snap.readings.years}`,
      chart: `${year(m, current.status, nowMonth())}${KEY}${numbers(current, snap.readings.years)}`,
      steps: steps(current),
      type: `<div class="cal-type">
          <h3>Closest PAGASA climate type: ${type.name}</h3>
          <p>${type.summary}</p>
          <p class="cal-type-note">Estimated from your pin's rainfall pattern, not taken from PAGASA's official map. Rainfall records: ERA5, via Open-Meteo.</p>
        </div>`
    });
  }

  // One line on each species sheet.
  function fillSheets() {
    document.querySelectorAll("[data-plantwhen]").forEach(dd => {
      const sp = SPECIES.find(s => s.id === dd.dataset.plantwhen);
      if (sp?.soils.includes("tidal")) { dd.textContent = "Mangroves follow the tide more than the rain: plant at low tide, outside typhoon months."; return; }
      if (!isPremium()) { dd.innerHTML = `The best months for your site are part of Premium. <button class="link-btn" type="button" data-upgrade data-upgrade-from="planting">Unlock them</button>`; return; }
      dd.innerHTML = current
        ? `${monthRange(current.best)} at your site. <a class="link-btn" href="#planting">See your planting plan</a>`
        : "Drop a pin on the map above to see the best months for your site.";
    });
  }

  return { MONTHS, TYPES, calendar, climateType, monthRange, longestRun, paint, fillSheets };
})();
