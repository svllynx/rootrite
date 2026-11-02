/*
  RootRite: the planting plan and My sites.
  Free accounts get one plan and a shorter report, for one saved site, so they can see what Premium does.
  Premium plans any site and saves up to 20. The database enforces the limits on saved sites.
*/
const MyPlan = (() => {
  const $ = id => document.getElementById(id);
  const db = () => rrClient();
  const my = { sites: [], plantings: [], checks: [], viewing: null, drafts: {}, loaded: false, openDiaries: new Set() };
  const LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  const speciesById = id => SPECIES.find(s => s.id === id);

  const freeSite = () => my.sites[0] || null; // the oldest; a downgraded account keeps this one working
  const usable = row => isPremium() || row?.id === freeSite()?.id;
  const freeUsed = () => !!state.account?.freeSiteUsed || my.sites.length > 0;

  /* ---------- What the plan is for ---------- */

  function source() {
    if (!isPremium() && !my.viewing && freeSite()) my.viewing = freeSite().id;
    const row = my.viewing ? my.sites.find(r => r.id === my.viewing) : null;
    if (row) return { row, site: row.site, readings: row.site.readings || null, pin: { lat: row.lat, lon: row.lon }, name: row.name, location: row.location };
    const snap = SiteMap.snapshot(), site = readSite();
    return { row: null, site, readings: snap.readings || null, pin: snap.pin || null, name: site.location, location: site.location };
  }

  function draft(src) {
    const key = src.row?.id || "current", p = src.row?.plan || {};
    // auto: nobody has chosen trees yet, so the plan follows the site's best match
    return my.drafts[key] ||= { trees: p.trees || [], auto: !p.trees?.length, amount: p.amount ?? "", unit: p.unit || "sqm", spacing: p.spacing ?? null, price: p.price ?? "" };
  }

  // The trees to choose from, and the ones chosen. Only trees that can grow on the site stay chosen.
  function treeChoices(src, d) {
    const fits = rank(src.site).filter(r => r.fit >= 45);
    const offered = fits.slice(0, isPremium() ? 8 : FREE_LIMIT);
    const scored = id => { const sp = speciesById(id); return sp ? score(sp, src.site) : null; };
    if (d.auto) d.trees = offered.length ? [offered[0].sp.id] : [];
    d.trees = d.trees.filter(id => scored(id) && (isPremium() || offered.some(r => r.sp.id === id))).slice(0, Planner.MAX_TREES);
    if (!d.trees.length && offered.length) d.trees = [offered[0].sp.id];
    const extra = d.trees.filter(id => !offered.some(r => r.sp.id === id)).map(scored);
    return [...offered, ...extra];
  }

  function workOut(src, d) {
    const trees = d.trees.map(speciesById);
    const spacing = d.spacing || (trees[0] ? Planner.spacingFor(trees[0], src.site) : 3);
    const count = Planner.seedlings({ trees, amount: +d.amount, unit: d.unit, spacing, price: +d.price });
    const monthly = src.readings?.monthly;
    const cal = monthly?.length === 12 ? PlantCal.calendar(monthly) : null;
    const plan = cal ? Planner.carePlan({ cal, rows: count.rows, tidal: src.site.soil === "tidal" }) : null;
    return { spacing, count, cal, plan, advised: trees[0] ? Planner.spacingFor(trees[0], src.site) : 3 };
  }

  /* ---------- Nearby places to ask, fetched once per site ---------- */

  const nearby = {};
  function nurseriesNear(pin) {
    const key = `${pin.lat},${pin.lon}`;
    if (nearby[key]) return nearby[key];
    nearby[key] = { list: null };
    Reports.nearbyNurseries(pin.lat, pin.lon).then(list => {
      nearby[key].list = list.slice(0, 3);
      paintResult();
    }).catch(() => { nearby[key].list = []; });
    return nearby[key];
  }

  /* ---------- The plan ---------- */

  function paint() {
    const box = $("myplan-body");
    if (!box || !state.account) return;
    const src = source();
    if (!my.loaded) { box.innerHTML = `<p class="pp-empty">Loading your plan…</p>`; return; }
    if (!src.pin) { box.innerHTML = startHere(); return; }
    if (!isPremium() && !src.row) { box.innerHTML = freeUsed() ? usedUp() : freeOffer(src); bindClaim(); return; }
    const d = draft(src), choices = treeChoices(src, d);
    if (!choices.length) { box.innerHTML = `<p class="pp-empty">Nothing in our list fits ${src.row ? "this site" : "these conditions"} well, so there's no plan to make. Ask your local CENRO what grows nearby.</p>`; return; }
    box.innerHTML = `
      ${banner(src)}
      <div class="pp-board">
        <form class="pp-form" id="pp-form" novalidate>
          <fieldset class="pp-trees">
            <legend><span class="pp-no">1</span> Choose up to ${Planner.MAX_TREES} trees</legend>
            <p class="pp-hint">Mixing native trees is usually healthier than planting one.</p>
            <div class="pp-chips">${choices.map(r => `
              <label class="pp-chip"><input type="checkbox" name="tree" value="${r.sp.id}"${d.trees.includes(r.sp.id) ? " checked" : ""}><span>
                ${TREE_PHOTOS[r.sp.id] ? `<img src="${TREE_PHOTOS[r.sp.id].thumb}" alt="" width="160" height="160" loading="lazy" decoding="async">` : ""}
                <span class="pp-chip-text"><b>${esc(r.sp.name)}</b><small>${isPremium() ? `${r.fit}% fit` : matchWord(r.fit)}</small></span>
              </span></label>`).join("")}
            </div>
          </fieldset>
          <div class="pp-group">
            <p class="pp-group-title"><span class="pp-no">2</span> Tell us about your land</p>
            <div class="pp-fields">
              <div class="input"><label for="pp-amount">How much land?</label><input id="pp-amount" name="amount" type="number" min="0" step="any" inputmode="decimal" placeholder="500" value="${esc(d.amount)}"></div>
              <div class="input"><label for="pp-unit">Measured in</label>
                <select id="pp-unit" name="unit">
                  <option value="sqm"${d.unit === "sqm" ? " selected" : ""}>Square meters</option>
                  <option value="ha"${d.unit === "ha" ? " selected" : ""}>Hectares</option>
                  <option value="trees"${d.unit === "trees" ? " selected" : ""}>Number of trees</option>
                </select></div>
            </div>
          </div>
          <div class="pp-group">
            <p class="pp-group-title"><span class="pp-no">3</span> Fine-tune it</p>
            <div class="pp-fields">
              <div class="input"><label for="pp-spacing">Space between trees</label><select id="pp-spacing" name="spacing"></select></div>
              <div class="input"><label for="pp-price">Price per seedling (optional)</label><input id="pp-price" name="price" type="number" min="0" step="any" inputmode="decimal" placeholder="Ask your nursery" value="${esc(d.price)}"></div>
            </div>
          </div>
        </form>
        <div class="pp-summary" id="pp-summary" aria-live="polite"></div>
      </div>
      <div id="pp-result"></div>`;
    $("pp-form").addEventListener("input", onFormChange);
    $("pp-form").addEventListener("submit", e => e.preventDefault());
    paintResult();
  }

  // A saved plan keeps the site it was made for. Is that still the site described above?
  const CONDITIONS = ["elev", "soil", "moist", "rain", "slope", "sun", "space", "purpose"];
  function differsFromAbove(row) {
    const pin = SiteMap.snapshot().pin, now = readSite(), saved = row.site || {};
    if (!pin || Math.abs(pin.lat - row.lat) > 1e-4 || Math.abs(pin.lon - row.lon) > 1e-4) return true;
    return CONDITIONS.some(k => !(k === "moist" && now.soil === "tidal") && String(now[k]) !== String(saved[k]));
  }

  // For the results above: is a Free account's only plan for some other site?
  const siteDiffers = () => !isPremium() && my.loaded && !!freeSite() && differsFromAbove(freeSite());

  function siteWords(s) {
    const space = { S: "house lot", M: "large yard", L: "open land" }[s.space];
    const ground = s.soil === "tidal" ? "tidal mud" : `${fmt(s.elev)} m, ${SOIL_WORDS[s.soil]} soil, ${["flat", "gently sloping", "steep"][s.slope]}`;
    const purpose = s.purpose && s.purpose !== "any" ? `, for ${USE_WORDS[s.purpose]}` : "";
    return `${ground}, ${space}, about ${fmt(s.rain)} mm of rain${purpose}`;
  }

  function banner(src) {
    if (!src.row) return "";
    const differs = differsFromAbove(src.row), words = esc(siteWords(src.row.site));
    const note = "The trees in your results and in Compare are for the site described above, so they can be different.";
    if (!isPremium()) {
      return differs
        ? `<div class="pp-banner pp-banner-differs">
            <p><b>This plan is for ${esc(src.row.name)}, not the site above.</b> ${words}. ${note} Your free plan stays with this one site.</p>
            <button class="btn btn-sky btn-sm" type="button" data-upgrade data-upgrade-from="plan" data-plan-map>${LOCK} Plan the site above</button>
          </div>`
        : `<div class="pp-banner">
            <p><b>This is your free plan, for ${esc(src.row.name)}.</b> ${words}. Premium plans every site you have, and adds reminders and a tree diary.</p>
            <button class="btn btn-ink btn-sm" type="button" data-upgrade data-upgrade-from="plan">${LOCK} Plan every site</button>
          </div>`;
    }
    return `<div class="pp-banner ${differs ? "pp-banner-differs" : "pp-banner-quiet"}">
      <p>Viewing <b>${esc(src.row.name)}</b>, from My sites. ${words}.${differs ? ` ${note}` : ""}</p>
      <button class="${differs ? "btn btn-sky btn-sm" : "link-btn"}" type="button" data-plan-current>Back to the site above</button>
    </div>`;
  }

  // The dots of the planting map: one per tree, colored by species. A very large plan shows a corner of itself.
  function plot(layout, label) {
    const pitch = 200 / Math.max(layout.cols, layout.lines);
    const radius = Math.min(pitch * 0.34, 7);
    const left = (200 - pitch * (layout.cols - 1)) / 2, top = (200 - pitch * (layout.lines - 1)) / 2;
    const dots = layout.points.map((tree, i) => `<circle class="pp-dot-${tree}" cx="${(left + (i % layout.cols) * pitch).toFixed(1)}" cy="${(top + Math.floor(i / layout.cols) * pitch).toFixed(1)}" r="${radius.toFixed(1)}"/>`).join("");
    return `<svg class="pp-plot-map" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}">${dots}</svg>`;
  }

  const SAMPLE_PLOT = { cols: 7, lines: 7, points: Array.from({ length: 49 }, () => 0) };

  function startHere() {
    return `
      <div class="pp-start">
        <figure class="pp-start-plot">${plot(SAMPLE_PLOT, "A sample planting map")}</figure>
        <div>
          <h3>Start with a pin</h3>
          <p>Drop a pin on the map above, and your planting plan starts here.</p>
          <ol class="pp-start-steps"><li>Pin your site</li><li>Choose your trees</li><li>See how many to buy</li></ol>
          <a class="btn btn-ink" href="#match">Go to the map</a>
        </div>
      </div>`;
  }

  function freeOffer(src) {
    const top = rank(src.site).filter(r => r.fit >= 45)[0];
    const name = top ? top.sp.name : "your trees";
    const CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
    return `
      <div class="pp-offer">
        <form class="pp-claim" id="pp-claim" novalidate>
          <h3>Your first plan is free</h3>
          <p>Every account gets one planting plan and PDF report, for one site. Use it on the site you'll actually plant, because it can't be moved or given back.</p>
          <div class="input"><label for="pp-claim-name">Name this site</label><input id="pp-claim-name" maxlength="120" value="${esc(src.name || "")}" placeholder="For example, North hillside"></div>
          <button class="btn btn-ink" type="submit">Get my free plan</button>
        </form>
        <div class="pp-get">
          <figure class="pp-start-plot">${plot(SAMPLE_PLOT, "A sample planting map")}</figure>
          <div>
            <h3>What you'll get</h3>
            <ul class="pp-get-list">
              <li>${CHECK} How many ${esc(name)} seedlings to buy</li>
              <li>${CHECK} A map of how to space them</li>
              <li>${CHECK} A rough cost, at your nursery's price</li>
              <li>${CHECK} Care tips for your trees</li>
              <li>${CHECK} A list to take to the nursery</li>
              <li>${CHECK} A PDF report</li>
            </ul>
          </div>
        </div>
      </div>`;
  }

  function usedUp() {
    return `
      <div class="pp-offer pp-offer-used">
        <div class="pp-claim">
          <h3>You've used your free plan</h3>
          <p>Premium plans every site, with seedling counts, care by the month, reminders and a PDF report for each.</p>
          <button class="btn btn-ink" type="button" data-upgrade data-upgrade-from="plan">${LOCK} Plan this site</button>
        </div>
      </div>`;
  }

  function bindClaim() {
    $("pp-claim")?.addEventListener("submit", claim);
  }

  function onFormChange(e) {
    const src = source(), d = draft(src), f = e.currentTarget;
    if (e.target.name === "tree") {
      const picked = [...f.querySelectorAll('input[name="tree"]:checked')].map(x => x.value);
      if (picked.length > Planner.MAX_TREES) { e.target.checked = false; toast(`Choose up to ${Planner.MAX_TREES} trees. Untick one first.`); return; }
      if (!picked.length) { e.target.checked = true; toast("A plan needs at least one tree."); return; }
      d.auto = false;
      // keep the order they were chosen in, so the spacing follows the first tree
      d.trees = [...d.trees.filter(id => picked.includes(id)), ...picked.filter(id => !d.trees.includes(id))];
    } else if (e.target.name === "spacing") {
      d.spacing = +e.target.value;
    } else if (e.target.name === "amount" || e.target.name === "price") {
      d[e.target.name] = e.target.value === "" ? "" : Math.min(Math.max(0, +e.target.value), 1e7);
    } else if (e.target.name === "unit") {
      d.unit = e.target.value;
    }
    paintResult();
    queueSave(src, d);
  }

  let saving;
  function queueSave(src, d) {
    if (!src.row) return;
    clearTimeout(saving);
    saving = setTimeout(async () => {
      const plan = { trees: d.trees, amount: d.amount === "" ? null : d.amount, unit: d.unit, spacing: d.spacing, price: d.price === "" ? null : d.price };
      const { error } = await db().from("my_sites").update({ plan }).eq("id", src.row.id);
      if (error) return toast(rrErrorText(error));
      src.row.plan = plan;
      paintSites();
    }, 500);
  }

  const peso = n => `₱${fmt(n)}`;

  function paintResult() {
    const out = $("pp-result"), summary = $("pp-summary");
    if (!out || !summary) return;
    const src = source(), d = draft(src), w = workOut(src, d);
    const select = $("pp-spacing");
    if (select) {
      select.innerHTML = Planner.SPACINGS.map(m => `<option value="${m}"${m === w.spacing ? " selected" : ""}>${m} m${m === w.advised ? " (suggested)" : ""}</option>`).join("");
    }
    const near = src.pin && isPremium() ? nurseriesNear(src.pin) : { list: [] }; // nursery names are Premium only
    const hasAmount = w.count.total > 0;
    const rows = w.count.rows.filter(r => r.plant > 0);
    const list = hasAmount ? Planner.shoppingList({
      siteName: src.row?.name || src.name, place: src.readings?.place, rows: w.count.rows, total: w.count.total, buy: w.count.buy,
      spacing: w.spacing, cost: w.count.cost, cal: isPremium() ? w.cal : null, nurseries: near.list || []
    }) : "";

    /* the headline panel, beside the form */
    const layout = hasAmount ? Planner.layout(rows.map(r => r.plant)) : SAMPLE_PLOT;
    const planted = hasAmount ? `${fmt(w.count.total)} ${w.count.total === 1 ? "tree" : "trees"}, ${w.spacing} m apart` : "";
    summary.innerHTML = hasAmount ? `
      <div class="pp-summary-main">
        <dl class="pp-tiles">
          <div class="pp-tile-main"><dt>Seedlings to buy</dt><dd>${fmt(w.count.buy)}</dd><dd class="pp-tile-note">${fmt(w.count.total)} to plant, ${fmt(w.count.spare)} spare to replace early losses</dd></div>
          <div><dt>Rough cost</dt><dd>${w.count.cost != null ? peso(w.count.cost) : "-"}</dd><dd class="pp-tile-note">${w.count.cost != null ? "Seedlings only, at your price" : "Enter a price per seedling to see this"}</dd></div>
          ${isPremium()
            ? `<div><dt>Plant in</dt><dd>${w.cal ? PlantCal.monthRange(w.cal.best) : "-"}</dd><dd class="pp-tile-note">${w.cal ? "From ten years of rain records at your pin" : "Rainfall records didn't load for this pin"}</dd></div>`
            : `<div><dt>Plant in</dt><dd>Premium only</dd><dd class="pp-tile-note">Your best months, from ten years of rain records at your pin</dd></div>`}
        </dl>
      </div>
      <figure class="pp-plot">
        ${plot(layout, `Planting map: ${planted}`)}
        <figcaption>
          ${rows.length > 1 ? `<table class="pp-split"><thead><tr><th scope="col">Tree</th><th scope="col">Plant</th><th scope="col">Buy</th></tr></thead><tbody>${rows.map((r, i) => `<tr><th scope="row"><span class="pp-swatch pp-swatch-${i}"></span>${esc(r.sp.name)}</th><td>${fmt(r.plant)}</td><td>${fmt(r.buy)}</td></tr>`).join("")}</tbody></table>` : ""}
          <p><b>${planted}.</b> ${layout.sampled ? `Showing a ${layout.cols} by ${layout.lines} corner of your plan.` : "Each dot is one tree."} Drawn as a square; your land's shape will differ.</p>
        </figcaption>
      </figure>` : `
      <div class="pp-summary-main">
        <p class="pp-prompt-label">Seedlings to buy</p>
        <p class="pp-prompt-big">?</p>
        <p class="pp-prompt">Enter your land size to see how many seedlings to buy, and a map of how to space them.</p>
      </div>
      <figure class="pp-plot pp-plot-idle">${plot(layout, "A sample planting map")}</figure>`;

    /* everything below */
    const steps = w.plan ? w.plan.reduce((a, m) => a + m.items.length, 0) : 0;
    const reminders = isPremium()
      ? `<button class="btn btn-sky btn-sm" type="button" data-plan-reminders${w.plan ? "" : " disabled"}>Add reminders to my calendar</button>`
      : `<button class="btn btn-line btn-sm" type="button" data-upgrade data-upgrade-from="reminders">${LOCK} Add reminders to my calendar</button>`;
    const months = !isPremium() ? lockedMonths() : w.plan ? `
      <section class="pp-year">
        <div class="pp-year-head">
          <h3 class="pp-h">Month by month</h3>
          <p>${steps} steps, from now until a year after planting. Add them to your phone so nothing gets missed.</p>
          ${reminders}
        </div>
        <ol class="pp-months">${w.plan.map(m => `
          <li${m.items.some(i => i.key === "plant") ? ` class="is-plant"` : ""}><p class="pp-when">${esc(m.when)}</p><div>${m.items.map(i => `<h4>${esc(i.title)}</h4><p>${esc(i.detail)}</p>`).join("")}</div></li>`).join("")}
        </ol>
      </section>` : `<p class="pp-empty pp-empty-gap">The month-by-month plan needs your pin's rainfall records. ${src.row ? "" : "Tap your spot on the map again to retry."}</p>`;
    const careAndList = `
      <div class="pp-lower${hasAmount ? "" : " pp-lower-one"}">
        <section>
          <h3 class="pp-h">Care for ${w.count.rows.length > 1 ? "these trees" : esc(w.count.rows[0]?.sp.name || "this tree")}</h3>
          <dl class="pp-care">${w.count.rows.map(r => `
            <div>${TREE_PHOTOS[r.sp.id] ? `<img src="${TREE_PHOTOS[r.sp.id].thumb}" alt="" width="160" height="160" loading="lazy" decoding="async">` : ""}
              <div><dt>${esc(r.sp.name)}</dt><dd>${esc(r.sp.plant)} ${esc(r.sp.care)}</dd></div></div>`).join("")}</dl>
        </section>
        ${hasAmount ? `
        <section class="pp-ticket">
          <h3 class="pp-h">Your list for the nursery</h3>
          <pre class="pp-list" id="pp-list">${esc(list)}</pre>
          <div class="pp-ticket-actions">
            <button class="btn btn-line btn-sm" type="button" data-plan-copy>Copy the list</button>
            ${navigator.share ? `<button class="btn btn-line btn-sm" type="button" data-plan-share>Share the list</button>` : ""}
          </div>
          ${isPremium() ? "" : `<div class="pp-places-locked">
            <p>Want to know which nurseries near you to ask?</p>
            <button class="btn btn-ink btn-sm" type="button" data-upgrade data-upgrade-from="nurseries">${LOCK} Avail Premium to see them</button>
          </div>`}
        </section>` : ""}
      </div>`;
    out.innerHTML = `
      ${months}
      ${careAndList}
      <div class="pp-actions">
        <button class="btn btn-ink" type="button" data-plan-pdf>Download PDF report</button>
        ${isPremium() && w.plan ? "" : reminders}
        ${!src.row && isPremium() ? saveForm(src) : ""}
      </div>
      <div class="pp-notes">
        ${isPremium() ? "" : `<p class="pp-note">Your free plan and PDF have your seedling count, care tips, site conditions and top ${FREE_LIMIT} trees. Premium adds the planting months, care by the month, nearby nurseries, reminders and the top 10 with scores.</p>`}
        <p class="pp-note">Spacing, timings and care are starting guidelines, not a site survey. Check with your local CENRO which clearances apply before planting, especially on public land or in mangroves.</p>
      </div>`;
  }

  // Free: the shape of the month-by-month plan, with no dates in it.
  function lockedMonths() {
    const rows = ["Reserve your seedlings", "Prepare the ground", "Plant", "First check", "Water young trees", "Count your trees"];
    return `
      <section class="pp-year pp-year-locked">
        <h3 class="pp-h">Month by month</h3>
        <div class="pp-months-gate">
          <ol class="pp-fake" aria-hidden="true">${rows.map(r => `<li><p class="pp-when">Month</p><div><h4>${r}</h4><p>What to do, and how.</p></div></li>`).join("")}</ol>
          <div class="pp-months-lock">
            <div class="nursery-lock-panel">
              <h3>Your care plan, month by month</h3>
              <p>Premium shows when to reserve, plant, water and count your trees, with reminders for your phone's calendar. From ${RR_CONFIG.premiumPrice} a month.</p>
              <button class="btn btn-sky" type="button" data-upgrade data-upgrade-from="plan">${LOCK} Avail Premium to unlock this feature</button>
            </div>
          </div>
        </div>
      </section>`;
  }

  function saveForm(src) {
    return `
      <form class="pp-save" data-plan-save novalidate>
        <div class="input"><label for="pp-save-name">Save this site and plan to My sites</label><input id="pp-save-name" maxlength="120" value="${esc(src.name || "")}" placeholder="Name this site"></div>
        <button class="btn btn-ink btn-sm" type="submit">Save</button>
      </form>`;
  }

  /* ---------- Saving ---------- */

  async function insertSite(src, name) {
    const snap = SiteMap.snapshot(), d = draft(src);
    const { data, error } = await db().from("my_sites").insert({
      name, location: src.site.location || null, lat: snap.pin.lat, lon: snap.pin.lon,
      site: { ...src.site, readings: snap.readings || null },
      plan: { trees: d.trees, amount: d.amount === "" ? null : d.amount, unit: d.unit, spacing: d.spacing, price: d.price === "" ? null : d.price }
    }).select().single();
    if (error) throw error;
    my.sites.push(data);
    my.drafts[data.id] = { ...d, auto: false };
    return data;
  }

  async function claim(e) {
    e.preventDefault();
    const name = $("pp-claim-name").value.trim(), btn = e.target.querySelector("[type=submit]");
    if (name.length < 2) { toast("Give this site a name."); return; }
    if (SiteMap.isReading()) { toast("Still reading your pin. Try again in a moment."); return; }
    const src = source();
    treeChoices(src, draft(src));
    btn.disabled = true;
    try {
      const row = await insertSite(src, name);
      state.account.freeSiteUsed = true;
      my.viewing = row.id;
      render(false);
      paintSites();
      toast("Your free plan is ready. Enter your land size to see how many seedlings to buy.");
    } catch (err) {
      toast(rrErrorText(err));
      btn.disabled = false;
    }
  }

  async function saveCurrent(f) {
    const name = f.querySelector("input").value.trim(), btn = f.querySelector("[type=submit]");
    if (name.length < 2) { toast("Give this site a name."); return; }
    if (SiteMap.isReading()) { toast("Still reading your pin. Try again in a moment."); return; }
    btn.disabled = true;
    try {
      const row = await insertSite(source(), name);
      my.viewing = row.id;
      paint();
      paintSites();
      toast(`${row.name} is saved to My sites.`);
    } catch (err) {
      toast(rrErrorText(err));
      btn.disabled = false;
    }
  }

  /* ---------- My sites ---------- */

  function siteLine(row) {
    const p = row.plan || {}, trees = (p.trees || []).map(speciesById).filter(Boolean);
    const spacing = p.spacing || (trees[0] ? Planner.spacingFor(trees[0], row.site) : 3);
    const n = p.amount > 0 ? Planner.treesFor(+p.amount, p.unit || "sqm", spacing) : 0;
    const names = trees.map(t => t.name).join(", ");
    return `${n ? `${fmt(n)} trees` : "Land size not set"}${names ? `: ${esc(names)}` : ""}`;
  }

  function paintSites() {
    const box = $("mysites-body");
    if (!box || !state.account) return;
    if (!my.loaded) { box.innerHTML = ""; return; }
    const count = my.sites.length;
    $("mysites-count").textContent = isPremium()
      ? `${count} of 20 saved. Open one to see its plan, or save the site above from your planting plan.`
      : "Free accounts save one site. Premium saves up to 20, and adds reminders and a tree diary.";
    const cards = my.sites.map(row => {
      const open = usable(row);
      return `
        <li class="ms-site${row.id === my.viewing ? " is-open" : ""}">
          <div class="ms-head">
            <div><h3 class="ms-name">${esc(row.name)}</h3><p class="ms-meta">${esc(row.location || `${row.lat.toFixed(3)}, ${row.lon.toFixed(3)}`)}</p></div>
            <p class="ms-line">${siteLine(row)}</p>
          </div>
          <div class="ms-actions">
            ${open ? `<button class="btn btn-line btn-sm" type="button" data-site-open="${row.id}">Open plan</button>
            <button class="btn btn-line btn-sm" type="button" data-site-pdf="${row.id}">PDF report</button>`
            : `<button class="btn btn-line btn-sm" type="button" data-upgrade data-upgrade-from="sites">${LOCK} Part of Premium</button>`}
            <button class="link-btn" type="button" data-site-delete="${row.id}">Delete</button>
          </div>
          ${diary(row)}
        </li>`;
    }).join("");
    const more = !isPremium() && count > 0 ? `
      <div class="locked ms-more">
        <p class="locked-line">Planting more than one spot? Premium saves up to 20 sites, each with its own plan and report.</p>
        <button class="btn btn-ink" type="button" data-upgrade data-upgrade-from="sites">${LOCK} Save more sites</button>
      </div>` : "";
    box.innerHTML = count
      ? `<ul class="ms-list">${cards}</ul>${more}`
      : `<p class="pp-empty">${isPremium() ? "Nothing saved yet. Drop a pin, build a plan above, and save it here." : freeUsed() ? "You deleted your free site, so nothing is saved here. Premium saves up to 20 sites." : "Nothing saved yet. Your first plan above saves the site here."}</p>`;
  }

  /* ---------- The tree diary ---------- */

  const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const shortDate = d => new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
  const monthYear = d => new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long" });
  const nameOf = id => speciesById(id)?.name || id;
  const COUNT_NAMES = { 1: "One-month", 3: "Three-month", 6: "Six-month", 12: "One-year", 24: "Two-year" };

  function diary(row) {
    if (!isPremium()) {
      return `<div class="ms-diary-locked">
        <p>Keep a tree diary: log what you plant, count survivors, and see when the next count is due.</p>
        <button class="btn btn-ink btn-sm" type="button" data-upgrade data-upgrade-from="diary">${LOCK} Unlock the diary</button>
      </div>`;
    }
    const plantings = my.plantings.filter(p => p.site_id === row.id);
    const ids = new Set(plantings.map(p => p.id));
    const checks = my.checks.filter(c => ids.has(c.planting_id));
    const sum = Impact.summarise({ sites: [row], plantings, checks });
    const planned = (row.plan?.trees || []).map(speciesById).filter(Boolean);
    const others = [...SPECIES].filter(sp => !planned.includes(sp)).sort((a, b) => a.name.localeCompare(b.name));
    const opts = list => list.map(sp => `<option value="${sp.id}">${esc(sp.name)}</option>`).join("");
    return `
      <details class="ms-diary" data-diary="${row.id}"${my.openDiaries.has(row.id) ? " open" : ""}>
        <summary>Tree diary<span>${plantings.length ? `${fmt(sum.planted)} planted${sum.survival != null ? `, ${Impact.percent(sum.survival)} alive at last count` : ", not counted yet"}` : "Nothing logged yet"}</span></summary>
        <div class="ms-diary-body">
          <form class="ms-log" data-log="${row.id}" novalidate>
            <div class="input"><label for="log-tree-${row.id}">Tree</label><select id="log-tree-${row.id}" name="species">
              ${planned.length ? `<optgroup label="In your plan">${opts(planned)}</optgroup><optgroup label="All trees">${opts(others)}</optgroup>` : opts(others)}
            </select></div>
            <div class="input"><label for="log-count-${row.id}">How many</label><input id="log-count-${row.id}" name="count" type="number" min="1" inputmode="numeric"></div>
            <div class="input"><label for="log-on-${row.id}">Planted on</label><input id="log-on-${row.id}" name="on" type="date" value="${todayISO()}" max="${todayISO()}"></div>
            <button class="btn btn-ink" type="submit">Log planting</button>
          </form>
          ${plantings.length ? `<ul class="ms-plantings">${plantings.map(plantingRow).join("")}</ul>` : ""}
        </div>
      </details>`;
  }

  function plantingRow(p) {
    const checks = my.checks.filter(c => c.planting_id === p.id).sort((a, b) => b.checked_on.localeCompare(a.checked_on) || b.created_at.localeCompare(a.created_at));
    const last = checks[0];
    const next = Planner.nextCount(p.planted_on, checks.map(c => c.checked_on), todayISO());
    return `
      <li class="ms-planting">
        <div class="ms-planting-top">
          <div><p class="ms-planting-name">${fmt(p.count)} ${esc(nameOf(p.species_id))}</p><p class="ms-planting-meta">Planted ${shortDate(p.planted_on)}</p></div>
          <p class="ms-planting-alive">${last ? `<b>${Math.round(last.alive / p.count * 100)}%</b> alive: ${fmt(last.alive)} on ${shortDate(last.checked_on)}` : "Not counted yet"}</p>
          <p class="ms-planting-next${next?.overdue ? " is-due" : ""}">${next ? `${COUNT_NAMES[next.months]} count ${next.overdue ? "was due" : "due"} ${monthYear(next.due)}` : "All counts done. Well kept."}</p>
          <button class="link-btn" type="button" data-remove-planting="${p.id}">Remove</button>
        </div>
        <form class="ms-check" data-check="${p.id}" novalidate>
          <div class="input"><label for="alive-${p.id}">Alive now</label><input id="alive-${p.id}" name="alive" type="number" min="0" max="${p.count}" inputmode="numeric"></div>
          <div class="input"><label for="counted-${p.id}">Counted on</label><input id="counted-${p.id}" name="on" type="date" value="${todayISO()}" min="${p.planted_on}" max="${todayISO()}"></div>
          <button class="btn btn-line btn-sm" type="submit">Add count</button>
          ${last ? `<button class="link-btn" type="button" data-remove-check="${last.id}">Undo last count</button>` : ""}
        </form>
      </li>`;
  }

  async function logPlanting(f) {
    const count = +f.count.value, on = f.on.value;
    if (!Number.isInteger(count) || count < 1) return toast("Enter how many trees you planted.");
    if (!on) return toast("Enter the planting date.");
    if (on > todayISO()) return toast("The planting date can't be in the future. Your plan has the dates ahead.");
    const { data, error } = await db().from("my_plantings").insert({ site_id: f.dataset.log, species_id: f.species.value, count, planted_on: on }).select().single();
    if (error) return toast(rrErrorText(error));
    my.plantings.push(data);
    my.openDiaries.add(f.dataset.log);
    paintSites();
    toast(`Logged ${fmt(count)} ${nameOf(data.species_id)}. The next count is shown below.`);
  }

  async function addCount(f) {
    const planting = my.plantings.find(p => p.id === f.dataset.check);
    const alive = f.alive.value === "" ? NaN : +f.alive.value, on = f.on.value;
    if (!Number.isInteger(alive) || alive < 0) return toast("Enter how many trees are alive.");
    if (alive > planting.count) return toast(`You planted ${fmt(planting.count)}, so no more than that can be alive.`);
    if (!on || on < planting.planted_on || on > todayISO()) return toast("Choose a date between planting and today.");
    const { data, error } = await db().from("my_checks").insert({ planting_id: planting.id, checked_on: on, alive }).select().single();
    if (error) return toast(rrErrorText(error));
    my.checks.push(data);
    paintSites();
    toast(`${Math.round(alive / planting.count * 100)}% alive. Count saved.`);
  }

  async function removePlanting(id) {
    const p = my.plantings.find(x => x.id === id);
    if (!p || !confirm(`Remove ${fmt(p.count)} ${nameOf(p.species_id)} and its counts?`)) return;
    const { error } = await db().from("my_plantings").delete().eq("id", id);
    if (error) return toast(rrErrorText(error));
    my.plantings = my.plantings.filter(x => x.id !== id);
    my.checks = my.checks.filter(c => c.planting_id !== id);
    paintSites();
  }

  async function removeCheck(id) {
    const { error } = await db().from("my_checks").delete().eq("id", id);
    if (error) return toast(rrErrorText(error));
    my.checks = my.checks.filter(c => c.id !== id);
    paintSites();
  }

  async function deleteSite(id) {
    const row = my.sites.find(r => r.id === id);
    if (!row) return;
    const warning = isPremium() ? "" : " Your free plan won't come back: Free accounts get one saved site, once.";
    if (!confirm(`Delete ${row.name} and its plan?${warning}`)) return;
    const { error } = await db().from("my_sites").delete().eq("id", id);
    if (error) return toast(rrErrorText(error));
    my.sites = my.sites.filter(r => r.id !== id);
    const gone = new Set(my.plantings.filter(p => p.site_id === id).map(p => p.id));
    my.plantings = my.plantings.filter(p => p.site_id !== id);
    my.checks = my.checks.filter(c => !gone.has(c.planting_id));
    delete my.drafts[id];
    if (my.viewing === id) my.viewing = null;
    paint();
    paintSites();
    toast(`${row.name} is deleted.`);
  }

  /* ---------- Report, list and reminders ---------- */

  async function withButton(btn, label, job) {
    const before = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await job(); } catch (err) { toast(rrErrorText(err)); }
    btn.disabled = false;
    btn.textContent = before;
  }

  function reportContext(src) {
    const d = draft(src);
    treeChoices(src, d);
    const w = workOut(src, d);
    const plantings = src.row ? my.plantings.filter(p => p.site_id === src.row.id) : [];
    const ids = new Set(plantings.map(p => p.id));
    return {
      owner: state.account.name,
      premium: isPremium(),
      plantings,
      checks: my.checks.filter(c => ids.has(c.planting_id)),
      site: { id: src.row?.id || "current", name: src.row?.name || src.name || "Your site", location: src.location || src.site.location, lat: src.pin.lat, lon: src.pin.lon, site: { ...src.site, readings: src.readings } },
      plan: { ...w, tidal: src.site.soil === "tidal" }
    };
  }

  async function copyList() {
    const text = $("pp-list")?.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("List copied. Paste it into a message to your nursery.");
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($("pp-list"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast("Your browser blocked copying. The list is selected, so copy it from there.");
    }
  }

  function downloadReminders() {
    const src = source(), w = workOut(src, draft(src));
    if (!w.plan) return;
    const text = Planner.reminders({ siteName: src.row?.name || src.name, plan: w.plan });
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "rootrite-planting-reminders.ics" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Open the downloaded file to add these dates to your phone's calendar.");
  }

  function onClick(e) {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-upgrade")) my.wantMapSite = t.hasAttribute("data-plan-map");
    if (t.hasAttribute("data-plan-current")) { my.viewing = null; paint(); paintSites(); return; }
    if (t.hasAttribute("data-plan-pdf")) return withButton(t, "Making your PDF…", () => Reports.mine(reportContext(source())));
    if (t.hasAttribute("data-plan-copy")) return copyList();
    if (t.hasAttribute("data-plan-share")) return navigator.share({ title: "RootRite seedling list", text: $("pp-list")?.textContent || "" }).catch(() => {});
    if (t.hasAttribute("data-plan-reminders")) return downloadReminders();
    if (t.dataset.siteOpen) { my.viewing = t.dataset.siteOpen; paint(); paintSites(); $("myplan").scrollIntoView(); return; }
    if (t.dataset.siteDelete) return deleteSite(t.dataset.siteDelete);
    if (t.dataset.removePlanting) return removePlanting(t.dataset.removePlanting);
    if (t.dataset.removeCheck) return removeCheck(t.dataset.removeCheck);
    if (t.dataset.sitePdf) {
      const row = my.sites.find(r => r.id === t.dataset.sitePdf);
      const src = { row, site: row.site, readings: row.site.readings || null, pin: { lat: row.lat, lon: row.lon }, name: row.name, location: row.location };
      return withButton(t, "Making your PDF…", () => Reports.mine(reportContext(src)));
    }
  }

  async function load() {
    const [sites, plantings, checks] = await Promise.all([
      db().from("my_sites").select("*").order("created_at"),
      db().from("my_plantings").select("*").order("planted_on").order("created_at"),
      db().from("my_checks").select("*")
    ]);
    if (sites.error) console.warn("RootRite: could not load saved sites", sites.error.message);
    my.sites = sites.data || [];
    my.plantings = plantings.data || [];
    my.checks = checks.data || [];
    my.loaded = true;
    render(false); // the results above depend on whether a Free account's plan is for this site
    paintSites();
  }

  function init() {
    document.addEventListener("click", onClick);
    document.addEventListener("submit", async e => {
      const f = e.target;
      if (f.matches("[data-plan-save]")) { e.preventDefault(); saveCurrent(f); return; }
      if (!f.matches("[data-log], [data-check]")) return;
      e.preventDefault();
      // a double tap must not log the same trees twice
      const btn = f.querySelector("[type=submit]");
      if (btn.disabled) return;
      btn.disabled = true;
      try { await (f.dataset.log ? logPlanting(f) : addCount(f)); } finally { btn.disabled = false; }
    });
    // remember which diaries are open when the list redraws
    document.addEventListener("toggle", e => {
      const id = e.target.dataset?.diary;
      if (id) e.target.open ? my.openDiaries.add(id) : my.openDiaries.delete(id);
    }, true);
    load();
  }

  // After a plan change, or a Free account going Premium: show the site they were working on.
  function afterPlanChange() {
    if (!isPremium() && my.viewing !== freeSite()?.id) my.viewing = null;
    if (isPremium() && my.wantMapSite) my.viewing = null; // they upgraded to plan the site on the map
    my.wantMapSite = false;
    paint();
    paintSites();
  }

  // From the tree check: put a tree into the plan for the site above.
  function addTree(id) {
    if (!SiteMap.snapshot().pin) { toast("Drop a pin on the map first, so the plan can use your site's rainfall."); return; }
    my.viewing = null;
    const src = source(), d = draft(src);
    treeChoices(src, d);
    d.auto = false;
    if (!d.trees.includes(id)) {
      if (d.trees.length >= Planner.MAX_TREES) { toast(`Your plan already has ${Planner.MAX_TREES} trees. Untick one first.`); $("myplan").scrollIntoView(); return; }
      d.trees.push(id);
    }
    paint();
    paintSites();
    $("myplan").scrollIntoView();
    toast(`${nameOf(id)} is in your planting plan.`);
  }

  return { init, paint, paintSites, afterPlanChange, addTree, siteDiffers, my };
})();
