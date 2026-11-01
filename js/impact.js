/*
  RootRite: impact figures for an organisation's plantings.
  Trees planted come from what the team logs. Survival and carbon use only trees someone has counted:
  a planting with no survival check adds to "planted", never to "alive".

  Carbon is a rough range, not a measurement and not for carbon credits.
  Basis: Lasco & Pulhin (2003) report reforestation of degraded Philippine land accumulating up to about
  3 t C/ha/yr for slow growers and 10 for fast growers. The low end uses the IPCC 2019 Refinement's
  regrowth rate for young secondary tropical rainforest in Asia (3.4 t biomass/ha/yr x 0.47 = 1.6 t C).
  "Moderate" is RootRite's own midpoint between those. A forester should review these rates.
*/
const Impact = (() => {
  const RATES = { Slow: [1.6, 3], Moderate: [1.6, 6], Fast: [3, 10] }; // t C per hectare per year
  const STOCKING = 1111;     // trees per hectare at 3 x 3 m spacing
  const CO2_PER_C = 44 / 12;
  const HORIZON = 10;        // years, for the look-ahead figure

  const DAY = 864e5;
  const yearsSince = (date, today) => Math.max(0, (today - new Date(date)) / DAY / 365.25);

  // kg CO2 per living tree per year, as [low, high]. Small trees and palms are left out: these
  // rates describe forest stands, and would overstate them.
  function rateFor(speciesId) {
    const sp = SPECIES.find(s => s.id === speciesId);
    if (!sp || sp.size === "S") return null;
    const r = RATES[sp.growth] || RATES.Moderate;
    return r.map(tC => tC * 1000 * CO2_PER_C / STOCKING);
  }

  function latestChecks(checks) {
    const latest = new Map();
    for (const c of checks) {
      const had = latest.get(c.planting_id);
      if (!had || c.checked_on > had.checked_on || (c.checked_on === had.checked_on && c.created_at > had.created_at)) latest.set(c.planting_id, c);
    }
    return latest;
  }

  // sites, plantings and checks are rows from the database; today can be passed in for testing
  function summarise({ sites, plantings, checks }, today = new Date()) {
    const latest = latestChecks(checks);
    const siteIds = new Set(sites.map(s => s.id));
    const out = {
      planted: 0, checkedPlanted: 0, alive: 0, survival: null, areaHa: 0, sites: sites.length,
      co2Now: [0, 0], co2Horizon: [0, 0], excludedFromCarbon: 0, species: {}
    };
    for (const s of sites) out.areaHa += +s.area_ha || 0;
    for (const p of plantings) {
      if (!siteIds.has(p.site_id)) continue;
      const check = latest.get(p.id);
      out.planted += p.count;
      const row = out.species[p.species_id] ||= { planted: 0, checkedPlanted: 0, alive: 0 };
      row.planted += p.count;
      if (!check) continue;
      out.checkedPlanted += p.count;
      out.alive += check.alive;
      row.checkedPlanted += p.count;
      row.alive += check.alive;
      const rate = rateFor(p.species_id);
      if (!rate) { out.excludedFromCarbon += check.alive; continue; }
      const age = yearsSince(p.planted_on, today);
      rate.forEach((kg, i) => {
        out.co2Now[i] += check.alive * kg * age / 1000;
        out.co2Horizon[i] += check.alive * kg * Math.max(age, HORIZON) / 1000;
      });
    }
    if (out.checkedPlanted) out.survival = out.alive / out.checkedPlanted;
    return out;
  }

  // "120" under 1,000 t, one decimal under 10, "under 0.1" near zero; a range collapses when both ends round alike
  function tonnes(n) {
    if (n === 0) return "0";
    if (n < 0.1) return "under 0.1";
    return n < 10 ? n.toFixed(1) : fmt(Math.round(n));
  }
  function tonnesRange([low, high]) {
    const a = tonnes(low), b = tonnes(high);
    return a === b ? a : `${a} to ${b}`;
  }
  const percent = v => v == null ? "Not yet" : `${Math.round(v * 100)}%`;

  const METHOD = [
    "Trees planted are what the team logged. Survival uses only plantings with a survival check, and each planting's latest check.",
    `Carbon counts only trees confirmed alive, multiplied by a yearly rate and by years since planting. Rates are ${RATES.Slow.join(" to ")} t C per hectare per year for slow growers, ${RATES.Moderate.join(" to ")} for moderate and ${RATES.Fast.join(" to ")} for fast, shared across ${fmt(STOCKING)} trees per hectare (3 x 3 m spacing) and converted to CO2 by 44/12.`,
    "Small trees and palms are left out of the carbon figure, because these rates describe forest stands.",
    "Rate sources: Lasco & Pulhin (2003) for the upper values; IPCC 2019 Refinement for the 1.6 t C lower value; moderate is RootRite's own midpoint.",
    `The ${HORIZON}-year figure assumes today's living trees are all still alive then.`,
    "This is a rough estimate from logged data. It is not independently verified, and it is not for carbon credits or offset claims."
  ];

  return { summarise, tonnesRange, percent, rateFor, METHOD, HORIZON };
})();
