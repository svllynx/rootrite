/*
  RootRite: downloadable PDF reports, built in the browser with jsPDF.
  The site report is for proposals and permit applications; the impact report is for CSR and annual reports.
  jsPDF loads only when someone asks for a report.
*/
const Reports = (() => {
  const GREEN = [59, 73, 54], INK = [31, 38, 28], SOFT = [78, 88, 72], SAGE = [228, 231, 216], SAGE2 = [215, 220, 198];
  const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 48, INNER = WIDTH - MARGIN * 2;
  const KIND_WORDS = { lgu: "LGU or barangay", school: "School or university", ngo: "NGO", company: "Company", other: "Organization" };
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  let loading = null;

  function loadLibrary() {
    if (window.jspdf) return Promise.resolve();
    return loading ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = JSPDF;
      s.onload = resolve;
      s.onerror = () => { loading = null; reject(new Error("The PDF tool didn't load. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
  }

  // The built-in PDF font covers Western characters only (so ñ is fine, but not the peso sign or other scripts).
  const clean = t => String(t ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/₱/g, "PHP ").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
  const today = () => new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
  const longDate = d => new Date(d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
  const fileName = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  // The logo, scaled down so it adds kilobytes to the report rather than most of a megabyte.
  function smallLogo() {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const canvas = Object.assign(document.createElement("canvas"), { width: 96, height: 140 });
        canvas.getContext("2d").drawImage(img, 0, 0, 96, 140);
        res(canvas.toDataURL("image/png"));
      };
      img.onerror = rej;
      img.src = "assets/logo-mark.png";
    });
  }

  /* ---------- A small page layout helper ---------- */

  function makeDoc(footer) {
    const pdf = new window.jspdf.jsPDF({ unit: "pt", format: "a4", compress: true });
    let y = MARGIN;
    const room = h => { if (y + h > HEIGHT - 58) { pdf.addPage(); y = MARGIN; } };
    const text = (t, x, opts = {}) => {
      pdf.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
      pdf.setFontSize(opts.size || 10);
      pdf.setTextColor(...(opts.color || INK));
      const lines = pdf.splitTextToSize(clean(t), opts.width || INNER);
      pdf.text(lines, x, y, { lineHeightFactor: opts.line || 1.35 });
      return lines.length * (opts.size || 10) * (opts.line || 1.35);
    };
    return {
      pdf,
      gap(h) { y += h; },
      header(title, subtitle, logo) {
        if (logo) pdf.addImage(logo, "PNG", MARGIN, y - 4, 24, 35);
        const x = logo ? MARGIN + 34 : MARGIN;
        y += 10;
        text("RootRite", x, { bold: true, size: 11, color: GREEN });
        y += 22;
        text(title, x, { bold: true, size: 20 });
        y += 18;
        text(subtitle, x, { size: 10, color: SOFT, width: INNER - 34 });
        y += 20;
      },
      // needs: room for what follows, so a heading never sits alone at the foot of a page
      h2(t, needs = 90) {
        room(needs);
        y += 14;
        text(t, MARGIN, { bold: true, size: 13, color: GREEN });
        y += 16;
      },
      para(t, opts = {}) {
        pdf.setFontSize(opts.size || 10);
        const lines = pdf.splitTextToSize(clean(t), INNER);
        room(lines.length * (opts.size || 10) * 1.35 + 4);
        y += text(t, MARGIN, opts) + 4;
      },
      bullets(list, opts = {}) {
        for (const t of list) {
          pdf.setFontSize(opts.size || 9);
          const lines = pdf.splitTextToSize(clean(t), INNER - 12);
          room(lines.length * (opts.size || 9) * 1.35 + 3);
          text("-", MARGIN, { size: opts.size || 9, color: SOFT });
          y += text(t, MARGIN + 12, { size: opts.size || 9, color: opts.color || SOFT, width: INNER - 12 }) + 3;
        }
      },
      // columns: fractions of the page width; rows: arrays of strings
      table(head, rows, columns, opts = {}) {
        const size = opts.size || 9, pad = opts.pad ?? 5, lh = size * 1.3;
        const widths = columns.map(c => c * INNER);
        const measure = row => Math.max(...row.map((c, i) => {
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(size);
          return pdf.splitTextToSize(clean(c), widths[i] - pad * 2).length;
        })) * lh + pad * 2 - 2;
        const drawRow = (row, h, fill, bold, color) => {
          if (fill) { pdf.setFillColor(...fill); pdf.rect(MARGIN, y - size - pad + 2, INNER, h, "F"); }
          let x = MARGIN;
          row.forEach((c, i) => {
            pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(...(color || INK));
            pdf.text(pdf.splitTextToSize(clean(c), widths[i] - pad * 2), x + pad, y, { lineHeightFactor: 1.3 });
            x += widths[i];
          });
          y += h;
        };
        const drawHead = () => { if (head) drawRow(head, lh + pad * 2 - 2, GREEN, true, [251, 247, 240]); };
        y += size + 2;
        room(rows.slice(0, 3).reduce((a, r) => a + measure(r), head ? lh + pad * 2 : 0) + 8);
        drawHead();
        rows.forEach((row, i) => {
          const h = measure(row);
          if (y + h > HEIGHT - 58) { pdf.addPage(); y = MARGIN + size + 2; drawHead(); }
          drawRow(row, h, i % 2 ? SAGE2 : SAGE);
        });
        y += 6 - size;
      },
      image(data, w, h, caption) {
        room(h + 22);
        pdf.addImage(data, "JPEG", MARGIN, y, w, h);
        y += h + 10;
        if (caption) y += text(caption, MARGIN, { size: 8, color: SOFT });
      },
      finish() {
        const pages = pdf.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
          pdf.setPage(i);
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...SOFT);
          pdf.text(clean(footer), MARGIN, HEIGHT - 28);
          pdf.text(`Page ${i} of ${pages}`, WIDTH - MARGIN, HEIGHT - 28, { align: "right" });
        }
        return pdf;
      }
    };
  }

  /* ---------- Site report ---------- */

  // A location map from OpenStreetMap tiles; a report without one is still useful, so failures are quiet.
  async function mapImage(lat, lon) {
    try {
      const zoom = 13, w = 998, h = 400, n = 2 ** zoom;
      const cx = (lon + 180) / 360 * n * 256;
      const rad = lat * Math.PI / 180;
      const cy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * 256;
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      const g = canvas.getContext("2d");
      const jobs = [];
      for (let tx = Math.floor((cx - w / 2) / 256); tx <= Math.floor((cx + w / 2) / 256); tx++) {
        for (let ty = Math.floor((cy - h / 2) / 256); ty <= Math.floor((cy + h / 2) / 256); ty++) {
          jobs.push(new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => { g.drawImage(img, tx * 256 - cx + w / 2, ty * 256 - cy + h / 2); res(); };
            img.onerror = rej;
            img.src = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          }));
        }
      }
      await Promise.race([Promise.all(jobs), new Promise((_, rej) => setTimeout(rej, 12000))]);
      g.beginPath(); g.arc(w / 2, h / 2, 11, 0, 7); g.fillStyle = "#4A2E1A"; g.fill();
      g.lineWidth = 4; g.strokeStyle = "#FBF7F0"; g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 4, 0, 7); g.fillStyle = "#80C8F0"; g.fill();
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (e) {
      return null;
    }
  }

  function km(a, b) {
    const R = 6371, r = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Nearest places to ask for seedlings: RootRite-approved nurseries and mapped forest nurseries come first.
  async function nearbyNurseries(lat, lon) {
    const here = { lat, lon }, list = [];
    const WORDS = { g: "Forest tree nursery", o: "DENR office", n: "Plant nursery" }, WEIGHT = { g: 1, o: 1.3, n: 2 };
    try {
      const { rows } = await (await fetch("assets/osm-nurseries.json")).json();
      for (const [name, a, b, kind, phone] of rows) {
        if (WORDS[kind]) list.push({ name, lat: a, lon: b, type: `${WORDS[kind]} (OpenStreetMap)`, phone, weight: WEIGHT[kind] });
      }
    } catch (e) { /* the directory below may still answer */ }
    try {
      const { data } = await rrClient().from("nurseries").select("name, kind, lat, lon, phone, status");
      for (const n of data || []) if (n.status === "approved") list.push({ name: n.name, lat: n.lat, lon: n.lon, type: "RootRite-listed nursery", phone: n.phone, weight: 0.8 });
    } catch (e) { /* OpenStreetMap's list is enough */ }
    return list.map(n => ({ ...n, km: km(here, n) })).filter(n => n.km <= 60)
      .sort((a, b) => (a.km + 2) * a.weight - (b.km + 2) * b.weight).slice(0, 5).sort((a, b) => a.km - b.km);
  }

  const SUN = { full: "Full sun", partial: "Part shade", shade: "Mostly shade" };
  const SPACE = { S: "House lot", M: "Large yard", L: "Open land" };
  const SHORT_STATUS = { best: "Best", ok: "Can plant", heavy: "Very wet", late: "Dry ahead", dry: "Too dry" };

  // Conditions and recommended trees; `who` is whoever set the choices, for example "the team".
  function conditionSections(doc, s, r, who) {
    if (s.elev == null || !s.soil) return doc.h2("Site conditions");
    doc.h2("Site conditions");
    {
      const type = r.monthly?.length === 12 ? PlantCal.TYPES[PlantCal.calendar(r.monthly).type] : null;
      const auto = `Map pin estimate; ${who} can correct it`;
      doc.table(["Condition", "Value", "Basis"], [
        ["Elevation", `${fmt(s.elev)} m`, `Copernicus terrain, via Open-Meteo. ${auto}`],
        ["Average temperature", `${tempAt(s.elev)} °C`, "Estimated from elevation"],
        ["Rainfall", `About ${fmt(s.rain)} mm a year`, r.years ? `ERA5 records ${r.years}, via Open-Meteo` : auto],
        ["Soil", cap(SOIL_WORDS[s.soil]), r.texture ? `SoilGrids (ISRIC): ${Math.round(r.texture.clay)}% clay, ${Math.round(r.texture.sand)}% sand${r.texture.awayKm ? `, nearest mapped soil ${r.texture.awayKm} km away` : ""}` : auto],
        ["Slope", ["Flat", "Gentle", "Steep"][s.slope], r.slopeDeg != null ? `About ${Math.round(r.slopeDeg)} degrees, from terrain data` : auto],
        ["Drainage", s.soil === "tidal" ? "Tidal" : cap(MOIST_WORDS[s.moist]), "Estimated from soil, slope and rain"],
        ["Sunlight", SUN[s.sun], `Set by ${who}`],
        ["Space", SPACE[s.space], `Set by ${who}`],
        ["Planting purpose", s.purpose === "any" ? "Any" : cap(USE_WORDS[s.purpose] || ""), `Set by ${who}`],
        ...(type ? [["Climate type", `Closest to PAGASA ${type.name}`, "Estimated from this site's rainfall pattern, not PAGASA's map"]] : [])
      ], [0.2, 0.28, 0.52]);

      doc.h2("Recommended native trees", 170);
      const ranked = rank(s).filter(x => x.fit >= 45).slice(0, 10);
      if (ranked.length) {
        doc.table(["Tree", "Scientific name", "Status", "Mature height", "Growth", "Fit"],
          ranked.map(x => [x.sp.name, x.sp.sci, x.sp.status ? `${x.sp.native}, ${x.sp.status}` : x.sp.native, x.sp.height, x.sp.growth, `${x.fit}%`]),
          [0.2, 0.28, 0.17, 0.15, 0.11, 0.09]);
        doc.para("Fit compares this site with general guidance for each tree. Status codes follow the species list: CR critically endangered, EN endangered, VU vulnerable, NT near threatened.", { size: 8, color: SOFT });
      } else {
        doc.para("No tree in RootRite's list fits these conditions well. Ask the local CENRO what grows nearby.");
      }
    }
  }

  function whenSection(doc, r) {
    if (r.monthly?.length === 12) {
      const cal = PlantCal.calendar(r.monthly);
      doc.h2("When to plant");
      doc.para(`Best months: ${PlantCal.monthRange(cal.best)}.`, { bold: true, size: 11 });
      doc.para(cal.noWindow ? "No stretch of the year here suits seedlings on rain alone, so plan to water or shelter them."
        : cal.seasonal ? `The rains usually settle in by ${PlantCal.MONTHS[cal.start]}. Seedlings need time to root before any dry spell, so RootRite looks for about three wet months in a row.`
        : "There is no dry season here, so planting is possible most of the year. These months are safest, as the rain picks up again.");
      doc.table(PlantCal.MONTHS.map(m => m.slice(0, 3)),
        [cal.monthly.map(v => `${fmt(Math.round(v))} mm`), cal.status.map(x => SHORT_STATUS[x])],
        Array(12).fill(1 / 12), { size: 7, pad: 3 });
      doc.para(`Average rainfall each month, ${r.years}. ERA5 records, via Open-Meteo.`, { size: 8, color: SOFT });
    }
  }

  function nurserySection(doc, nurseries) {
    if (nurseries.length) {
      doc.h2("Where to ask for seedlings", 150);
      doc.table(["Place", "Type", "Distance", "Phone"],
        nurseries.map(n => [n.name, n.type, `${n.km < 1 ? "Under 1" : fmt(Math.round(n.km))} km`, n.phone || "-"]), [0.4, 0.3, 0.12, 0.18]);
      doc.para("Straight-line distance. Stock is not confirmed, so call before you travel.", { size: 8, color: SOFT });
    }
  }

  function plantedSection(doc, site, plantings, checks, who) {
    if (plantings.length) {
      doc.h2("Planted so far");
      const summary = Impact.summarise({ sites: [site], plantings, checks });
      doc.table(["Tree", "Planted on", "Trees", "Last check", "Alive", "Survival"],
        plantings.map(p => {
          const c = checks.filter(x => x.planting_id === p.id).sort((a, b) => b.checked_on.localeCompare(a.checked_on))[0];
          const sp = SPECIES.find(x => x.id === p.species_id);
          return [sp?.name || p.species_id, longDate(p.planted_on), fmt(p.count), c ? longDate(c.checked_on) : "Not yet", c ? fmt(c.alive) : "-", c ? `${Math.round(c.alive / p.count * 100)}%` : "-"];
        }), [0.28, 0.17, 0.11, 0.17, 0.12, 0.15]);
      doc.para(`${fmt(summary.planted)} trees logged by ${who}. Survival covers ${fmt(summary.checkedPlanted)} trees with a survival check.`, { size: 8, color: SOFT });
    }
  }

  function aboutSection(doc) {
    doc.h2("About this report");
    doc.bullets([
      "This report supports planning and proposals. It is not a DENR assessment or a permit, and it does not replace a site visit.",
      "Check with the local CENRO which clearances and permits apply before planting, especially on public land, in protected areas or in mangroves.",
      "Site conditions are estimates from open data: Copernicus terrain and ERA5 rainfall via Open-Meteo, SoilGrids (ISRIC) and OpenStreetMap. Soil and drainage are the least certain, so check them on the ground.",
      "Tree heights, care notes and fit scores are general guidance, not survey data."
    ]);
  }

  async function buildSite({ org, project, site, plantings, checks }) {
    await loadLibrary();
    const s = site.site || {}, r = s.readings || {};
    const [logo, map, nurseries] = await Promise.all([smallLogo().catch(() => null), mapImage(site.lat, site.lon), nearbyNurseries(site.lat, site.lon)]);
    const doc = makeDoc(`Prepared for ${org.name} on ${today()}. Estimates for planning; check with the local CENRO.`);
    doc.header(`Site report: ${site.name}`, `${org.name}  |  Project: ${project.name}  |  ${today()}`, logo);

    doc.table(null, [
      ["Prepared for", `${org.name} (${KIND_WORDS[org.kind] || "Organization"})`],
      ["Location", site.location || s.location || "Not named"],
      ["Coordinates", `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`],
      ["Area", +site.area_ha ? `${fmt(+site.area_ha)} hectares` : "Not recorded"]
    ], [0.24, 0.76]);
    doc.gap(10);
    if (map) doc.image(map, INNER, INNER * 400 / 998, "Site location. Map data (c) OpenStreetMap contributors.");

    conditionSections(doc, s, r, "the team");
    whenSection(doc, r);
    nurserySection(doc, nurseries);
    plantedSection(doc, site, plantings, checks, "the team");
    aboutSection(doc);
    return doc.finish();
  }

  /* ---------- A person's own site report and planting plan ---------- */

  async function buildMine({ owner, site, plan, plantings = [], checks = [], withNurseries = false }) {
    await loadLibrary();
    const s = site.site || {}, r = s.readings || {};
    const [logo, map, nurseries] = await Promise.all([smallLogo().catch(() => null), mapImage(site.lat, site.lon), withNurseries ? nearbyNurseries(site.lat, site.lon) : []]);
    const doc = makeDoc(`Prepared for ${owner} on ${today()}. Estimates for planning; check with the local CENRO.`);
    doc.header(`Planting plan: ${site.name}`, `${owner}  |  ${today()}`, logo);

    const count = plan.count;
    doc.table(null, [
      ["Prepared for", owner],
      ["Location", site.location || s.location || "Not named"],
      ["Coordinates", `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`],
      ...(count.total ? [["Seedlings", `${fmt(count.buy)} to buy: ${fmt(count.total)} to plant, ${fmt(count.spare)} spare`]] : [])
    ], [0.24, 0.76]);
    doc.gap(10);
    if (map) doc.image(map, INNER, INNER * 400 / 998, "Site location. Map data (c) OpenStreetMap contributors.");

    doc.h2("Your planting plan");
    if (count.total) {
      doc.table(["Tree", "Scientific name", "To plant", "To buy"],
        count.rows.filter(x => x.plant > 0).map(x => [x.sp.name, x.sp.sci, fmt(x.plant), fmt(x.buy)]), [0.32, 0.4, 0.14, 0.14]);
      doc.para(`Spacing: ${plan.spacing} m between trees. Spare seedlings replace early losses.${count.cost != null ? ` Rough cost of seedlings: PHP ${fmt(count.cost)}, at the price entered.` : ""}`, { size: 9, color: SOFT });
    } else {
      doc.para(`Chosen trees: ${count.rows.map(x => x.sp.name).join(", ")}. Land size not entered yet, so there is no seedling count. Spacing: ${plan.spacing} m.`);
    }
    if (plan.plan) {
      doc.h2("Month by month", 150);
      doc.table(["When", "What to do"], plan.plan.map(m => [m.when, m.items.map(i => `${i.title}: ${i.detail}`).join("\n")]), [0.2, 0.8]);
    }
    doc.h2("Caring for your trees", 130);
    doc.table(["Tree", "Planting and care"], count.rows.map(x => [x.sp.name, `${x.sp.plant} ${x.sp.care}`]), [0.2, 0.8]);

    conditionSections(doc, s, r, "the owner");
    whenSection(doc, r);
    nurserySection(doc, nurseries);
    plantedSection(doc, site, plantings, checks, "the owner");
    aboutSection(doc);
    return doc.finish();
  }

  /* ---------- Impact report ---------- */

  async function buildImpact({ org, scopeName, projects, sites, plantings, checks }) {
    await loadLibrary();
    const logo = await smallLogo().catch(() => null);
    const doc = makeDoc(`Prepared for ${org.name} on ${today()}. Self-reported; not independently verified.`);
    const all = Impact.summarise({ sites, plantings, checks });
    doc.header("Impact report", `${org.name}  |  ${scopeName}  |  ${today()}`, logo);

    doc.h2("At a glance");
    doc.table(["Measure", "Figure", "What it covers"], [
      ["Trees planted", fmt(all.planted), `Logged by the team across ${all.sites} ${all.sites === 1 ? "site" : "sites"}`],
      ["Survival rate", Impact.percent(all.survival), all.checkedPlanted ? `${fmt(all.alive)} alive of ${fmt(all.checkedPlanted)} trees checked; ${fmt(all.planted - all.checkedPlanted)} not checked yet` : "No survival checks logged yet"],
      ["Area covered", `${fmt(Math.round(all.areaHa * 100) / 100)} hectares`, "Site areas entered by the team"],
      ["Carbon so far (rough)", `${Impact.tonnesRange(all.co2Now)} t CO2`, "Living trees only, since planting"],
      [`Carbon in ${Impact.HORIZON} years (rough)`, `${Impact.tonnesRange(all.co2Horizon)} t CO2`, "If today's living trees all survive"]
    ], [0.27, 0.23, 0.5]);

    if (projects.length > 1) {
      doc.h2("By project");
      doc.table(["Project", "Sites", "Trees", "Survival", "Hectares", "Carbon so far, t CO2"], projects.map(p => {
        const inP = sites.filter(s => s.project_id === p.id);
        const x = Impact.summarise({ sites: inP, plantings, checks });
        return [p.name, String(inP.length), fmt(x.planted), Impact.percent(x.survival), fmt(Math.round(x.areaHa * 100) / 100), Impact.tonnesRange(x.co2Now)];
      }), [0.34, 0.09, 0.12, 0.12, 0.12, 0.21]);
    }

    const species = Object.entries(all.species).sort((a, b) => b[1].planted - a[1].planted);
    if (species.length) {
      doc.h2("By tree");
      doc.table(["Tree", "Scientific name", "Status", "Trees", "Survival"], species.map(([id, v]) => {
        const sp = SPECIES.find(x => x.id === id);
        return [sp?.name || id, sp?.sci || "", sp ? (sp.status ? `${sp.native}, ${sp.status}` : sp.native) : "", fmt(v.planted), v.checkedPlanted ? `${Math.round(v.alive / v.checkedPlanted * 100)}%` : "Not yet"];
      }), [0.26, 0.32, 0.18, 0.12, 0.12]);
    }

    doc.h2("How these figures are worked out");
    doc.bullets(Impact.METHOD);
    return doc.finish();
  }

  const site = async ctx => (await buildSite(ctx)).save(`rootrite-site-report-${fileName(ctx.site.name)}.pdf`);
  const impact = async ctx => (await buildImpact(ctx)).save(`rootrite-impact-report-${fileName(ctx.org.name)}.pdf`);
  const mine = async ctx => (await buildMine(ctx)).save(`rootrite-planting-plan-${fileName(ctx.site.name)}.pdf`);

  return { site, impact, mine, buildSite, buildImpact, buildMine, nearbyNurseries };
})();
