/* RootRite: species data and site scoring, shared by the landing page and the app. */

/*
  Each species: elevation range (m), yearly rainfall range (mm), soils it accepts,
  drainage it tolerates (dry, moist, wet), steepest slope it suits (0 flat, 1 gentle, 2 steep),
  light, mature size (S fits a house lot, M a large yard, L open land), purposes, zone,
  growth rate, and the text shown on its species sheet.
  Ranges are general guidance for the Philippines, not survey data.
*/
const SPECIES = [
  { id: "narra", name: "Narra", sci: "Pterocarpus indicus", native: "Native", zone: "lowland", elev: [0, 600], rain: [1300, 4000], soils: ["clay", "loam", "sandy", "rocky"], moist: ["dry", "moist"], slope: 2, sun: ["full"], size: "L", height: "25 to 35 m", growth: "Moderate",
    uses: ["shade", "timber", "restore", "ornamental"],
    traits: "Large deciduous tree with a broad, dome-shaped crown, fragrant yellow flowers in summer and round winged pods. The national tree of the Philippines.",
    habitat: "Lowland forests and riverbanks up to about 600 m.",
    water: "Moderate. Water young trees weekly in the dry season; drought-tolerant once established.",
    care: "Give it 8 m from walls and pipes; its buttress roots spread wide. Prune low branches in the first three years.",
    plant: "Plant at the start of the rainy season. Space trees 4 to 6 m apart for a grove." },
  { id: "molave", name: "Molave", sci: "Vitex parviflora", native: "Native", zone: "lowland", elev: [0, 900], rain: [900, 2500], soils: ["rocky", "loam", "clay"], moist: ["dry", "moist"], slope: 2, sun: ["full"], size: "L", height: "20 to 30 m", growth: "Slow",
    uses: ["timber", "erosion", "restore"],
    traits: "Medium to large tree with a fluted trunk, compound leaves and small blue-violet flowers. One of the hardest Philippine woods.",
    habitat: "Dry lowland and limestone forests, often on rocky hills.",
    water: "Low. Very drought-tolerant; avoid spots where water pools.",
    care: "Thrives on dry limestone hills where little else will. Slow to start; protect seedlings from goats and fire.",
    plant: "Plant at the onset of the rains in a well-drained pit. Keep grass cleared around seedlings for two years." },
  { id: "apitong", name: "Apitong", sci: "Dipterocarpus grandiflorus", native: "Native", zone: "lowland", elev: [0, 700], rain: [2000, 4500], soils: ["loam", "clay"], moist: ["moist"], slope: 1, sun: ["partial", "full"], size: "L", height: "30 to 40 m", growth: "Moderate",
    uses: ["timber", "restore"],
    traits: "Tall dipterocarp with a straight, clear trunk, resinous bark and two-winged fruits.",
    habitat: "Humid lowland dipterocarp forest.",
    water: "High. Needs reliable rain through most of the year.",
    care: "Plant under light shade at first. It needs a wet climate without a long dry season.",
    plant: "Start it under nurse trees or light shade, then open the canopy as it grows." },
  { id: "dao", name: "Dao", sci: "Dracontomelon dao", native: "Native", zone: "lowland", elev: [0, 600], rain: [1800, 4000], soils: ["loam", "clay"], moist: ["moist", "wet"], slope: 1, sun: ["full"], size: "L", height: "30 to 40 m", growth: "Fast",
    uses: ["shade", "timber", "restore"],
    traits: "Very large tree with a buttressed trunk, glossy leaves and small edible fruits.",
    habitat: "Moist lowland forests, especially along rivers and streams.",
    water: "High. Prefers moist soil and tolerates brief flooding.",
    care: "Wants deep, moist soil, best near streams. Far too big for a house lot.",
    plant: "Keep it 10 m or more from buildings. Suits riverbanks and large parks." },
  { id: "banaba", name: "Banaba", sci: "Lagerstroemia speciosa", native: "Native", zone: "lowland", elev: [0, 800], rain: [1000, 3500], soils: ["clay", "loam"], moist: ["moist", "wet"], slope: 1, sun: ["full"], size: "M", height: "8 to 15 m", growth: "Moderate",
    uses: ["ornamental", "shade"],
    traits: "Medium tree with smooth, mottled bark and large clusters of mauve-pink flowers. Its leaves are brewed as a traditional tea.",
    habitat: "Open lowlands, riverbanks and secondary forest.",
    water: "Moderate to high. Copes with seasonally wet ground.",
    care: "Handles heavy, seasonally wet clay. Flowers best in full sun; prune lightly after flowering.",
    plant: "A good street and park tree. Plant 5 m from buildings, in full sun." },
  { id: "pili", name: "Pili", sci: "Canarium ovatum", native: "Endemic", zone: "lowland", elev: [0, 400], rain: [1900, 3800], soils: ["loam", "sandy"], moist: ["moist"], slope: 1, sun: ["full"], size: "L", height: "15 to 20 m", growth: "Moderate",
    uses: ["fruit", "shade", "timber"],
    traits: "Evergreen tree with a dense crown and edible, oil-rich nuts. Trees are either male or female.",
    habitat: "Lowland forests of southern Luzon and the Visayas, especially Bicol.",
    water: "Moderate to high. Needs steady rainfall.",
    care: "Needs warm lowlands and steady rain. Male and female trees are separate, so plant several.",
    plant: "Plant grafted female trees with at least one male nearby. Mulch to keep the roots cool." },
  { id: "mabolo", name: "Mabolo", sci: "Diospyros blancoi", native: "Native", zone: "lowland", elev: [0, 800], rain: [1500, 3500], soils: ["loam", "clay"], moist: ["moist"], slope: 1, sun: ["full", "partial"], size: "M", height: "10 to 20 m", growth: "Slow",
    uses: ["fruit", "ornamental", "timber"],
    traits: "Evergreen tree with dark glossy leaves, velvety red-brown fruit and black heartwood known as kamagong.",
    habitat: "Lowland and mid-elevation forests.",
    water: "Moderate.",
    care: "Slow growing; the black kamagong heartwood takes decades. Fruiting needs a male tree nearby.",
    plant: "Tolerates light shade when young. Plant grafted trees for reliable fruit." },
  { id: "bignay", name: "Bignay", sci: "Antidesma bunius", native: "Native", zone: "lowland", elev: [0, 1000], rain: [1200, 3500], soils: ["loam", "clay"], moist: ["moist"], slope: 1, sun: ["partial", "full", "shade"], size: "S", height: "5 to 10 m", growth: "Moderate",
    uses: ["fruit", "ornamental"],
    traits: "Small evergreen tree with hanging clusters of red to black berries, made into wine and jam.",
    habitat: "Lowland thickets and secondary forest, often near villages.",
    water: "Moderate.",
    care: "A small native fruit tree that copes with part shade and fits a house lot.",
    plant: "Plant 3 m from walls. Grows well in part shade." },
  { id: "kamuning", name: "Kamuning", sci: "Murraya paniculata", native: "Native", zone: "lowland", elev: [0, 900], rain: [1000, 3000], soils: ["loam", "sandy", "rocky"], moist: ["dry", "moist"], slope: 1, sun: ["partial", "full", "shade"], size: "S", height: "3 to 7 m", growth: "Moderate",
    uses: ["ornamental"],
    traits: "Shrub or small tree with glossy leaves, fragrant white flowers and small red berries.",
    habitat: "Thickets and forest edges at low and middle elevations.",
    water: "Low to moderate.",
    care: "Fragrant, takes pruning well and grows in part shade. Good as a small tree or a hedge.",
    plant: "Plant 1 m apart for a hedge. Prune after flowering." },
  { id: "calamansi", name: "Calamansi", sci: "Citrus × microcarpa", native: "Native", zone: "lowland", elev: [0, 1000], rain: [1000, 2500], soils: ["loam", "sandy"], moist: ["moist"], slope: 1, sun: ["full", "partial"], size: "S", height: "2 to 5 m", growth: "Fast",
    uses: ["fruit"],
    traits: "Small citrus tree with sour, round fruit used in everyday Filipino cooking.",
    habitat: "Cultivated across the Philippines, in yards and orchards.",
    water: "Moderate. Water regularly, but never leave the roots standing in water.",
    care: "Grows in a large pot or a corner of the yard. Feed lightly every two months and keep the soil drained.",
    plant: "Choose the sunniest spot with good drainage. Grows well in large containers." },
  { id: "kalantas", name: "Kalantas", sci: "Toona calantas", native: "Native", zone: "upland", elev: [300, 1500], rain: [1500, 3500], soils: ["loam", "clay"], moist: ["moist"], slope: 2, sun: ["full"], size: "L", height: "25 to 35 m", growth: "Fast",
    uses: ["timber", "restore", "erosion"],
    traits: "Tall deciduous tree with fragrant reddish wood, known as Philippine cedar.",
    habitat: "Upland forests on moist, well-drained slopes.",
    water: "Moderate to high.",
    care: "A native upland timber tree for moist, well-drained slopes. Mix with other species to limit shoot borers.",
    plant: "Plant in mixed stands for upland reforestation, not as a single-species block." },
  { id: "bagras", name: "Bagras", sci: "Eucalyptus deglupta", native: "Native", zone: "upland", elev: [0, 1800], rain: [2500, 5000], soils: ["loam", "clay"], moist: ["moist", "wet"], slope: 1, sun: ["full"], size: "L", height: "35 to 60 m", growth: "Fast",
    uses: ["timber", "restore"],
    traits: "Very tall tree whose smooth bark peels to show streaks of green, orange and purple.",
    habitat: "Wet forests of Mindanao, often along rivers.",
    water: "High. Needs rain through most of the year.",
    care: "Fast and thirsty: only where rain falls through most of the year. Native to Mindanao.",
    plant: "Only for high-rainfall areas. Give it wide open space." },
  { id: "almaciga", name: "Almaciga", sci: "Agathis philippinensis", native: "Native", zone: "highland", elev: [300, 2000], rain: [2000, 4500], soils: ["loam", "rocky"], moist: ["moist"], slope: 2, sun: ["partial", "full"], size: "L", height: "30 to 50 m", growth: "Slow",
    uses: ["restore", "timber"],
    traits: "Tall conifer with a straight trunk and broad, leathery leaves. Produces Manila copal resin.",
    habitat: "Mountain and upland forests from about 300 to 2,000 m.",
    water: "High. Prefers cool, humid conditions.",
    care: "A slow native conifer whose resin is tapped without felling. Keep young trees in part shade.",
    plant: "Plant under partial shade. Resin can be tapped sustainably after many years." },
  { id: "benguet-pine", name: "Benguet pine", sci: "Pinus kesiya", native: "Native", zone: "highland", elev: [700, 2700], rain: [1000, 3500], soils: ["rocky", "sandy", "loam"], moist: ["dry", "moist"], slope: 2, sun: ["full"], size: "L", height: "20 to 35 m", growth: "Moderate",
    uses: ["restore", "erosion", "timber"],
    traits: "Pine with long needles in threes, rough plated bark and a tall, open crown.",
    habitat: "Cool mountain grasslands and pine forests of the Cordillera and the Mindanao highlands.",
    water: "Low to moderate. Tolerates a dry season.",
    care: "Belongs to cool uplands; below about 700 m heat and pests weaken it. Keep a cleared fire line around stands.",
    plant: "Plant at the start of the rains, in full sun." },
  { id: "igem", name: "Igem", sci: "Dacrycarpus imbricatus", native: "Native", zone: "highland", elev: [1000, 2500], rain: [2000, 4500], soils: ["loam", "rocky"], moist: ["moist"], slope: 2, sun: ["partial", "full"], size: "L", height: "20 to 40 m", growth: "Slow",
    uses: ["restore", "erosion"],
    traits: "Conifer with small scale and needle leaves and a dense, layered crown.",
    habitat: "Mossy and montane forests above about 1,000 m.",
    water: "High. Thrives in mist and frequent rain.",
    care: "A native conifer of cool, misty mountain forest. Protects watersheds; grows slowly.",
    plant: "Best for watershed restoration in cool highlands, mixed with other natives." },
  { id: "ipil", name: "Ipil", sci: "Intsia bijuga", native: "Native", zone: "coastal", elev: [0, 450], rain: [1500, 3500], soils: ["sandy", "loam", "rocky"], moist: ["dry", "moist", "wet"], slope: 1, sun: ["full"], size: "L", height: "20 to 30 m", growth: "Slow",
    uses: ["timber", "coast", "restore"],
    traits: "Medium to large tree with pinnate leaves and very hard, durable reddish wood.",
    habitat: "Coastal forests behind beaches and mangroves.",
    water: "Moderate. Tolerates brief flooding and dry spells.",
    care: "Grows behind beaches and mangroves and tolerates brief flooding. Very slow, very durable wood.",
    plant: "Plant behind the beach line, and protect seedlings for the first few years." },
  { id: "talisay", name: "Talisay", sci: "Terminalia catappa", native: "Native", zone: "coastal", elev: [0, 300], rain: [1000, 3500], soils: ["sandy", "loam"], moist: ["dry", "moist"], slope: 0, sun: ["full"], size: "L", height: "15 to 25 m", growth: "Fast",
    uses: ["shade", "coast", "ornamental"],
    traits: "Spreading tree with tiered branches and large leaves that turn red before they fall.",
    habitat: "Sandy beaches and coastal plains.",
    water: "Low to moderate. Tolerates salt and wind.",
    care: "Takes salt and wind. Its crown spreads wide, so plant 10 m from roofs; it drops its leaves twice a year.",
    plant: "Keep it 10 m from roofs and paving. A good beach shade tree." },
  { id: "bitaog", name: "Bitaog", sci: "Calophyllum inophyllum", native: "Native", zone: "coastal", elev: [0, 200], rain: [1000, 5000], soils: ["sandy", "rocky"], moist: ["dry", "moist"], slope: 1, sun: ["full"], size: "M", height: "8 to 20 m", growth: "Moderate",
    uses: ["coast", "shade", "ornamental"],
    traits: "Low-branching tree with glossy leaves, fragrant white flowers and round, oil-rich seeds.",
    habitat: "Sandy and rocky shores.",
    water: "Low to moderate.",
    care: "A beach tree with fragrant flowers that leans into the sea wind and holds the dune behind it.",
    plant: "Plant along the shore as a windbreak; it handles salt spray." },
  { id: "agoho", name: "Agoho", sci: "Casuarina equisetifolia", native: "Native", zone: "coastal", elev: [0, 800], rain: [700, 3000], soils: ["sandy", "rocky"], moist: ["dry", "moist"], slope: 2, sun: ["full"], size: "L", height: "15 to 30 m", growth: "Fast",
    uses: ["coast", "erosion", "restore"],
    traits: "Tall tree with drooping, needle-like green twigs. Fixes nitrogen in poor soil.",
    habitat: "Sandy beaches, riverbanks and dry hills.",
    water: "Low.",
    care: "Fixes nitrogen and grips loose sand: a classic windbreak. Needs full sun and drains well.",
    plant: "Plant in rows as a windbreak, in full sun." },
  { id: "bani", name: "Bani", sci: "Pongamia pinnata", native: "Native", zone: "coastal", elev: [0, 800], rain: [500, 2500], soils: ["sandy", "clay", "loam", "rocky"], moist: ["dry", "moist", "wet"], slope: 2, sun: ["full", "partial"], size: "M", height: "10 to 15 m", growth: "Fast",
    uses: ["shade", "erosion", "coast"],
    traits: "Medium tree with a spreading crown and pale pink flowers. Fixes nitrogen.",
    habitat: "Coastal areas, riverbanks and dry lowlands.",
    water: "Low. Drought-hardy.",
    care: "Drought-hardy and nitrogen-fixing. A good first tree for poor or degraded ground.",
    plant: "A good first tree for degraded ground. Its seeds are toxic, so keep it away from play areas." },
  { id: "bakauan", name: "Bakauan", sci: "Rhizophora mucronata", native: "Native", zone: "coastal", elev: [0, 5], rain: [1000, 5000], soils: ["tidal"], moist: ["wet"], slope: 0, sun: ["full"], size: "M", height: "5 to 20 m", growth: "Moderate",
    uses: ["coast", "restore"],
    traits: "Mangrove with arching stilt roots and long, pencil-shaped propagules.",
    habitat: "Intertidal mudflats and river mouths.",
    water: "Grows in seawater, flooded by the tide every day.",
    care: "Only for mud the tide covers every day. Plant propagules from nearby mangroves, at the right tide level.",
    plant: "Plant propagules at the right tide level, guided by your local mangrove programme." },
  { id: "api-api", name: "Api-api", sci: "Avicennia marina", native: "Native", zone: "coastal", elev: [0, 5], rain: [500, 5000], soils: ["tidal"], moist: ["wet"], slope: 0, sun: ["full"], size: "M", height: "3 to 10 m", growth: "Fast",
    uses: ["coast", "restore"],
    traits: "Mangrove with grey-green leaves and pencil-like breathing roots that rise from the mud.",
    habitat: "The seaward edge of mangroves and open mudflats.",
    water: "Grows in seawater and tolerates high salinity.",
    care: "The seaward mangrove, first to colonise open mudflats. Tolerates the saltiest water of any mangrove.",
    plant: "Plant on open mudflats at the seaward edge, with DENR or a local mangrove group." }
];

const USE_WORDS = { shade: "shade", timber: "timber", fruit: "fruit", erosion: "slope cover", coast: "coastal protection", restore: "reforestation", ornamental: "ornamental" };
const SOIL_WORDS = { clay: "clay", loam: "loam", sandy: "sandy", rocky: "rocky", tidal: "tidal mud" };
const MOIST_WORDS = { dry: "dry, fast-draining", moist: "moist, well-drained", wet: "wet or poorly drained" };
const sunText = list => ["full", "partial", "shade"].filter(x => list.includes(x)).map(x => SUN_WORDS[x]).join(" or ");
const SUN_WORDS = { full: "Full sun", partial: "Part shade", shade: "Mostly shade" };
const SIZE_WORDS = { S: "Small, fits a house lot", M: "Medium, needs a large yard", L: "Large, needs open land" };
const SIZE_RANK = { S: 0, M: 1, L: 2 };
const fmt = n => n.toLocaleString("en-US");
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/*
  Weighted fit. Each condition scores 0 to 1; purpose counts only when one is chosen,
  drainage only when the site is not tidal. Returns null when a species cannot grow there.
*/
function score(sp, s) {
  const why = [], miss = [], factors = [];
  const add = (key, label, value, weight) => factors.push({ key, label, value, weight });

  const tidalSite = s.soil === "tidal", tidalTree = sp.soils.includes("tidal");
  if (tidalSite !== tidalTree) return null; // mangroves and dry-land trees never cross over

  // elevation, weight 3, soft edge of 200 m
  let e = 1;
  if (!tidalSite) {
    if (s.elev < sp.elev[0]) e = Math.max(0, 1 - (sp.elev[0] - s.elev) / 200);
    else if (s.elev > sp.elev[1]) e = Math.max(0, 1 - (s.elev - sp.elev[1]) / 200);
  }
  if (e === 0) return null;
  add("elev", "Elevation", e, 3);
  if (e === 1 && !tidalSite) why.push(`Grows at ${fmt(s.elev)} m`); else if (e < 1) miss.push(`Out of its range at ${fmt(s.elev)} m`);

  // soil, weight 2
  const so = sp.soils.includes(s.soil) ? 1 : 0.25;
  add("soil", "Soil", so, 2);
  if (so === 1) why.push(`Takes ${SOIL_WORDS[s.soil]} soil`); else miss.push(`Prefers ${sp.soils.map(x => SOIL_WORDS[x]).join(" or ")}`);

  // drainage, weight 1.5
  if (!tidalSite) {
    const mo = sp.moist.includes(s.moist) ? 1 : 0.25;
    add("moist", "Moisture", mo, 1.5);
    if (mo === 1 && s.moist !== "moist") why.push(`Handles ${MOIST_WORDS[s.moist].split(",")[0]} ground`);
    else if (mo < 1) miss.push(`Prefers ${sp.moist.map(x => MOIST_WORDS[x].split(",")[0]).join(" or ")} ground`);
  }

  // rainfall, weight 2
  let r = 1;
  if (s.rain < sp.rain[0]) r = Math.max(0, 1 - (sp.rain[0] - s.rain) / 1200);
  else if (s.rain > sp.rain[1]) r = Math.max(0, 1 - (s.rain - sp.rain[1]) / 1500);
  add("rain", "Rainfall", r, 2);
  if (r === 1) why.push("Suits your rainfall"); else miss.push(s.rain < sp.rain[0] ? "Wants more rain" : "Prefers a drier climate");

  // light, weight 1.5
  const li = sp.sun.includes(s.sun) ? 1 : 0.2;
  add("sun", "Sunlight", li, 1.5);
  if (li < 1) miss.push(sp.sun.includes("full") ? "Needs more sun" : "Needs some shade");

  // slope, weight 1
  const sl = s.slope <= sp.slope ? 1 : 0.3;
  add("slope", "Slope", sl, 1);
  if (sl === 1 && s.slope === 2) why.push("Holds a steep slope"); else if (sl < 1) miss.push(s.slope === 2 ? "Not for steep ground" : "Prefers flat ground");

  // space, weight 1.5
  const sz = SIZE_RANK[sp.size] <= SIZE_RANK[s.space] ? 1 : SIZE_RANK[sp.size] - SIZE_RANK[s.space] === 1 ? 0.35 : 0.05;
  add("space", "Space", sz, 1.5);
  if (sz < 1) miss.push(`Grows ${sp.height} tall`);
  else if (s.space === "S") why.push("Fits a house lot");

  // purpose, weight 2
  if (s.purpose && s.purpose !== "any") {
    const pu = sp.uses.includes(s.purpose) ? 1 : 0;
    add("purpose", "Purpose", pu, 2);
    if (pu) why.unshift(`Good for ${USE_WORDS[s.purpose]}`); else miss.push(`Not grown for ${USE_WORDS[s.purpose]}`);
  }

  const total = factors.reduce((a, f) => a + f.value * f.weight, 0);
  const max = factors.reduce((a, f) => a + f.weight, 0);
  // tie-break: how centrally the site sits in the tree's elevation and rainfall ranges
  const mid = (v, [a, b]) => b > a ? 1 - Math.abs((v - (a + b) / 2) / ((b - a) / 2)) : 1;
  const centre = tidalSite ? 1 : (Math.max(0, mid(s.elev, sp.elev)) + Math.max(0, mid(s.rain, sp.rain))) / 2;
  // a site at the edge of a range scores up to 12% lower than one in its middle
  const fit = Math.round((total / max) * (0.88 + 0.12 * centre) * 100);
  return { sp, fit, centre, why, miss, factors };
}

/* Every species that can grow on the site, best first. */
function rank(s) {
  return SPECIES.map(sp => score(sp, s)).filter(Boolean).sort((a, b) => b.fit - a.fit || b.centre - a.centre);
}

function zoneName(s) {
  if (s.soil === "tidal") return "tidal";
  if (s.elev < 500) return "lowland";
  if (s.elev < 1000) return "upland";
  return "highland";
}

function describe(s) {
  const sun = { full: "sunny", partial: "partly shaded", shade: "shaded" }[s.sun];
  const slope = ["flat", "gently sloping", "steep"][s.slope];
  const rain = s.rain < 1500 ? "under 1,500 mm" : s.rain > 2500 ? "over 2,500 mm" : "about 2,000 mm";
  const where = s.location ? ` in ${s.location}` : "";
  if (s.soil === "tidal") return `A ${sun} stretch of tidal mud${where}, flooded by the sea every day.`;
  return `A ${sun}, ${slope} ${zoneName(s)} site${where} at ${fmt(s.elev)} m, with ${MOIST_WORDS[s.moist].split(",")[0]} ${SOIL_WORDS[s.soil]} soil and ${rain} of rain a year.`;
}

/* about 6.5 °C cooler per 1,000 m, from a 27.5 °C lowland mean */
const tempAt = elev => (27.5 - elev * 0.0065).toFixed(1);
