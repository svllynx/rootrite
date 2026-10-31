// Refreshes assets/osm-nurseries.json: plant nurseries, DENR offices and garden shops in the
// Philippines from OpenStreetMap (© OpenStreetMap contributors, ODbL). Run it every few months:
//   node scripts/update-osm-nurseries.mjs --query > overpass-query.txt
//   curl -s -A "RootRite/1.0 (https://rootrite.vercel.app)" --data-urlencode "data@overpass-query.txt" https://maps.mail.ru/osm/tools/overpass/api/interpreter -o overpass.json
//   node scripts/update-osm-nurseries.mjs overpass.json
// Any public Overpass server works (overpass-api.de is the main one); use whichever answers.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../assets/osm-nurseries.json", import.meta.url));
const QUERY = `[out:json][timeout:180];
area["ISO3166-1"="PH"][admin_level=2]->.ph;
(
  nwr["landuse"="plant_nursery"](area.ph);
  nwr["shop"="garden_centre"](area.ph);
  nwr["name"~"nursery|cenro|penro",i](area.ph);
);
out center tags;`;

if (process.argv[2] === "--query") { process.stdout.write(QUERY); process.exit(0); }
if (!process.argv[2]) { console.error("Give the Overpass download as the first argument; see the top of this file."); process.exit(1); }
const { elements } = JSON.parse(readFileSync(process.argv[2], "utf8"));

// Each row: [name, lat, lon, kind, phone, hours, town, province]
// kind: g government or forest-tree nursery, o DENR office (CENRO or PENRO), n nursery,
//       c crop or ornamental nursery (orchids, fruit, coffee…), s garden shop
const rows = [];
for (const el of elements) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (!t.name || lat == null) continue; // an unnamed spot can't be called or found
  if (t["disused:shop"] || t["disused:landuse"]) continue;
  const tagged = t.landuse === "plant_nursery" || t.shop === "garden_centre";
  // the name search also catches "Penrol" stations and "Penro Road"; keep whole words only
  if (!tagged && !/\bnursery\b|\b(cenro|penro)\b/i.test(t.name)) continue;
  if (!tagged && /\b(road|street|gas station|guest ?house)\b/i.test(t.name)) continue;
  const label = `${t.name} ${t.operator || ""}`;
  const denr = /\b(cenro|penro|denr)\b|environment and natural resources/i.test(label);
  const nursery = t.landuse === "plant_nursery" || /nursery/i.test(t.name);
  const forest = denr || /forest|reforest|ngp|clonal|mangrove|native|\btree/i.test(label);
  const crop = /orchid|ornamental|flower|bonsai|succulent|cact|coffee|cacao|cocoa|fruit|vegetable|rice|crops?\b|banana|mango|rambutan|durian|citrus|abaca|rubber|coconut|palm oil|seed/i.test(label);
  const kind = nursery && forest ? "g" : denr ? "o" : nursery ? (crop ? "c" : "n") : "s";
  rows.push([
    t.name.slice(0, 120), +lat.toFixed(5), +lon.toFixed(5), kind,
    (t.phone || t["contact:phone"] || "").slice(0, 40), (t.opening_hours || "").slice(0, 80),
    t["addr:city"] || t["addr:municipality"] || "", t["addr:province"] || t["addr:state"] || ""
  ]);
}
rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
writeFileSync(OUT, JSON.stringify({
  source: "OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
  updated: new Date().toISOString().slice(0, 10),
  fields: ["name", "lat", "lon", "kind", "phone", "hours", "town", "province"],
  rows
}));
const count = k => rows.filter(r => r[3] === k).length;
console.log(`${rows.length} places: ${count("g")} forest nurseries, ${count("o")} DENR offices, ${count("n")} nurseries, ${count("c")} crop or ornamental nurseries, ${count("s")} garden shops`);
