/*
  RootRite: the planting plan. Works out how many seedlings to buy, and what to do each month until
  a year after planting. Spacing and timings are starting guidelines for a forester to review, and
  the person can change the spacing. Seedling prices are never assumed: only a price they enter is used.
*/
const Planner = (() => {
  const SPARE = 0.1;         // buy 10% extra to replace seedlings that die in the first months
  const SPACINGS = [1, 2, 3, 4, 5, 6, 8, 10];
  const FOREST = ["restore", "erosion", "conserve"]; // planted close, as a stand, to shade out weeds
  const SIZE_SPACING = { S: 4, M: 6, L: 8 };
  const MAX_TREES = 3;

  // Metres between trees: a stand for restoring land, the tree's own guidance if it has some, otherwise by size.
  function spacingFor(sp, site) {
    if (site.soil === "tidal" || sp.soils.includes("tidal")) return 2;
    if (FOREST.includes(site.purpose)) return 3;
    const said = (sp.plant || "").match(/(\d+) to (\d+) m apart/);
    if (said) {
      const middle = (+said[1] + +said[2]) / 2;
      return SPACINGS.reduce((a, b) => Math.abs(b - middle) < Math.abs(a - middle) || (Math.abs(b - middle) === Math.abs(a - middle) && b < a) ? b : a);
    }
    return SIZE_SPACING[sp.size] || 4;
  }

  const AREA = { sqm: 1, ha: 10000 };

  // amount and unit: square metres, hectares, or simply a number of trees
  function treesFor(amount, unit, spacing) {
    if (!(amount > 0)) return 0;
    if (unit === "trees") return Math.round(amount);
    return Math.max(1, Math.floor(amount * AREA[unit] / (spacing * spacing)));
  }

  // Shares a whole number of trees as evenly as possible, earlier trees taking any extra.
  function shares(total, n) {
    const base = Math.floor(total / n);
    return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
  }

  function seedlings({ trees, amount, unit, spacing, price }) {
    const total = treesFor(amount, unit, spacing);
    const rows = shares(total, trees.length).map((plant, i) => ({ sp: trees[i], plant, buy: plant + Math.ceil(plant * SPARE) }));
    const buy = rows.reduce((a, r) => a + r.buy, 0);
    return { rows, total, buy, spare: buy - total, cost: price > 0 ? Math.round(buy * price * 100) / 100 : null };
  }

  /* ---------- Month by month ---------- */

  const stamp = (y, m) => y * 12 + m;
  const at = n => ({ y: Math.floor(n / 12), m: ((n % 12) + 12) % 12 });
  const label = ({ y, m }) => `${PlantCal.MONTHS[m]} ${y}`;

  // The next best planting month from today, in Manila; today itself if it's a best month.
  function plantingMonth(cal, today = new Date()) {
    const nowY = +today.toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric" });
    const nowM = +today.toLocaleString("en-US", { timeZone: "Asia/Manila", month: "numeric" }) - 1;
    const now = stamp(nowY, nowM);
    const away = Math.min(...cal.best.map(i => (i - nowM + 12) % 12));
    return { now, plant: now + away };
  }

  function carePlan({ cal, rows, tidal, today = new Date() }) {
    const { now, plant } = plantingMonth(cal, today);
    const tasks = new Map();
    const add = (when, title, detail, key) => {
      const n = Math.max(now, when);
      if (!tasks.has(n)) tasks.set(n, []);
      tasks.get(n).push({ title, detail, key });
    };
    const list = rows.filter(r => r.buy > 0).map(r => `${fmt(r.buy)} ${r.sp.name}`).join(", ");
    add(plant - 2, "Reserve your seedlings", `Ask a nursery for ${list || "your seedlings"}. Seedlings are easier to get when reserved about two months ahead.`, "reserve");
    if (tidal) {
      add(plant - 1, "Ask about the site", "Check with the local CENRO or fisherfolk which zone of the shore suits your mangroves, and when the lowest tides fall.", "prepare");
      add(plant, "Plant at low tide", `Plant with the tide out, and avoid the months when typhoons and big waves are likely. Best months by rainfall here: ${PlantCal.monthRange(cal.best)}.`, "plant");
    } else {
      add(plant - 1, "Prepare the ground", "Clear the grass in a circle about 1 m wide, and dig the holes.", "prepare");
      add(plant, "Plant", `Plant after a good rain, and stake seedlings on windy sites. Wait if PAGASA forecasts a storm. Best months here: ${PlantCal.monthRange(cal.best)}.${cal.noWindow ? " No stretch of the year here suits seedlings on rain alone, so plan to water or shelter them." : ""}`, "plant");
    }
    add(plant + 1, "First check", tidal ? "Look for seedlings washed out or buried, and replace them with your spares." : "Replace any seedlings that died, using your spares. Early losses are normal.", "check");
    for (const after of [3, 6, 9]) {
      add(plant + after, after === 6 ? "Six-month count" : "Check and clear", tidal ? "Clear trash caught around the seedlings, and count how many are alive." : "Clear the grass around each seedling, and count how many are alive.", after === 6 ? "count" : "clear");
    }
    if (!tidal) {
      const dry = new Set(cal.dryMonths);
      let started = false;
      for (let n = plant; n <= plant + 12; n++) {
        if (!dry.has(at(n).m)) continue;
        add(n, started ? "Keep watering" : "Start watering", started ? "Water weekly until the rain returns." : "Water weekly until the rain returns. The first dry season is the hardest for a young tree.", "water");
        started = true;
      }
    }
    add(plant + 12, "One-year count", "Count how many trees are alive, and replant any gaps at the next planting season. Keep the grass back through the second year.", "count");
    return [...tasks.entries()].sort((a, b) => a[0] - b[0]).map(([n, items]) => ({ n, ...at(n), when: n === now ? `Now (${label(at(n))})` : label(at(n)), items }));
  }

  /* ---------- A list to take to the nursery ---------- */

  function shoppingList({ siteName, place, rows, total, buy, spacing, cost, nurseries, cal }) {
    const lines = ["RootRite seedling list", siteName ? `Site: ${siteName}` : "", place ? `Near: ${place}` : "", ""];
    for (const r of rows) if (r.buy > 0) lines.push(`${fmt(r.buy)} x ${r.sp.name} (${r.sp.sci})`);
    lines.push("", `${fmt(buy)} seedlings: ${fmt(total)} to plant, ${fmt(buy - total)} spare. Spacing ${spacing} m.`);
    if (cost != null) lines.push(`Rough cost: PHP ${fmt(cost)}`);
    if (cal) lines.push(`Plant in: ${PlantCal.monthRange(cal.best)}`);
    if (nurseries?.length) {
      lines.push("", "Places to ask (stock not confirmed, call first):");
      for (const n of nurseries) lines.push(`- ${n.name}, ${n.km < 1 ? "under 1" : fmt(Math.round(n.km))} km${n.phone ? `, ${n.phone}` : ""}`);
    }
    return lines.filter((l, i) => l || lines[i - 1]).join("\n").trim();
  }

  /* ---------- Reminders, as a calendar file ---------- */

  const icsText = t => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const pad = n => String(n).padStart(2, "0");

  // Lines over 75 bytes must be folded for strict calendar apps; a short limit also keeps multi-byte letters whole.
  const fold = line => {
    const out = [];
    let rest = line;
    while (rest.length > 60) { out.push(rest.slice(0, 60)); rest = rest.slice(60); }
    out.push(rest);
    return out.join("\r\n ");
  };

  function reminders({ siteName, plan, today = new Date() }) {
    const stampNow = today.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const events = [];
    plan.forEach(month => month.items.forEach((item, i) => {
      const start = `${month.y}${pad(month.m + 1)}01`;
      const nextN = month.y * 12 + month.m + 1;
      const end = `${Math.floor(nextN / 12)}${pad(nextN % 12 + 1)}01`;
      events.push([
        "BEGIN:VEVENT",
        `UID:rootrite-${start}-${i}-${item.key}@rootrite.vercel.app`,
        `DTSTAMP:${stampNow}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsText(`${item.title}${siteName ? `: ${siteName}` : ""}`)}`,
        `DESCRIPTION:${icsText(`${item.detail} From your RootRite planting plan.`)}`,
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(item.title)}`, "TRIGGER:PT9H", "END:VALARM",
        "END:VEVENT"
      ].map(fold).join("\r\n"));
    }));
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RootRite//Planting plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR", ""].join("\r\n");
  }

  return { SPACINGS, SPARE, MAX_TREES, spacingFor, treesFor, shares, seedlings, plantingMonth, carePlan, shoppingList, reminders };
})();
