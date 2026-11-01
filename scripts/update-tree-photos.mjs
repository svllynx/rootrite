// Downloads RootRite's tree photos from Wikimedia Commons, iNaturalist and herbaria listed on GBIF into
// assets/trees/ and writes js/tree-photos.js with each photo's author and licence. Needs ffmpeg and curl.
//   node scripts/update-tree-photos.mjs             all of them
//   node scripts/update-tree-photos.mjs --missing   only species not in js/tree-photos.js yet
// Every pick was checked by eye against the species: right tree, freely licensed for commercial use
// (CC0, public domain, CC BY or CC BY-SA). Herbarium specimens are used only when filed under the exact
// species name, and from the Philippines when a collection has one. Species without a trustworthy free
// image are left out on purpose.
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UA = { "User-Agent": "RootRite/1.0 (https://rootrite.vercel.app; tree photos)" };
const WIDTH = 720;
const AGENT = UA["User-Agent"];
const CC0 = ["CC0", "https://creativecommons.org/publicdomain/zero/1.0/"];
const BY = ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"];
const NATURALIS = "Naturalis Biodiversity Center", KEW = "Royal Botanic Gardens, Kew", NYBG = "New York Botanical Garden", BRIT = "Botanical Research Institute of Texas";
const GBIF = "https://www.gbif.org/occurrence/", INAT = "https://www.inaturalist.org/observations/";
const NL = id => `https://medialib.naturalis.nl/file/id/${id}/format/large`;
const KW = hash => `https://d2jcv3kl45hlgi.cloudfront.net/${hash}.jpg`;
const NY = path => `https://sweetgum.nybg.org/images3/${path}.jpg`;
const CROP_NL = [0, 0, 1, 0.94], CROP_NY = [0.05, 0.06, 0.95, 0.985]; // leave out the colour bars and scale rulers

// species id: [Commons file name, kind]; kind p photo, i botanical illustration, s pressed herbarium specimen
const PICKS = {
  "narra": ["Pterocarpus indicus Blanco1.205.png", "i"],
  "molave": ["Starr-091104-9126-Vitex parviflora-flowers and leaves-Kahanu Gardens NTBG Kaeleku Hana-Maui (24895355111).jpg", "p"],
  "apitong": ["Dipterocarpus grandiflorus Blanco2.263-cropped.jpg", "i"],
  "dao": ["Sulawesi trsr DSCN0315.JPG", "p"],
  "banaba": ["Flowers & leaves I IMG 1864.jpg", "p"],
  "pili": ["Starr-110330-4032-Canarium ovatum-habit-Garden of Eden Keanae-Maui (24454268623).jpg", "p"],
  "mabolo": ["Diospyros blancoi 304743369.jpg", "p"],
  "bignay": ["Bignay01 Kampong Asit.jpg", "p"],
  "kamuning": ["Starr 070906-8477 Murraya paniculata.jpg", "p"],
  "calamansi": ["Calamondin-01.jpg", "p"],
  "kalantas": ["Toona calantas (Philippine mahogany) seeds - 6.jpeg", "p"],
  "bagras": ["Eucalyptus deglupta 4zz.jpg", "p"],
  "almaciga": ["Agathis philippinensis - young tree.JPG", "p"],
  "benguet-pine": ["Pinus kesiya MtUgo.jpg", "p"],
  "igem": ["Dacrycarpus imbricatus.JPG", "p"],
  "ipil": ["Intsia bijuga.jpg", "p"],
  "talisay": ["01423jfCapalangan Sulipan Apalit Pampanga Peters Trees Shrinesfvf 20.JPG", "p"],
  "bitaog": ["Starr 010309-0546 Calophyllum inophyllum.jpg", "p"],
  "agoho": ["Casuarina equesitifolia tree.jpg", "p"],
  "bani": ["Millettia pinnata aka Pongamia pinnata 02.JPG", "p"],
  "bakauan": ["Rhizophora mucronata Propagules.jpg", "p"],
  "api-api": ["Semporna Sabah Mangroves-between-Kg-Bubul-and-Kg-Air-Sri-Jaya-01.jpg", "p"],
  "yakal": ["Shorea astylosa.jpg", "p"],
  "tanguile": ["Shorea polysperma.jpg", "p"],
  "white-lauan": ["Shorea contorta.jpg", "p"],
  "red-lauan": ["Red Lauan Shorea negrosensis.jpg", "p"],
  "mangkono": ["Xanthostemon verdugonianus Blanco2.300-cropped.jpg", "i"],
  "katmon": ["Dillenia philippinensis.jpg", "p"],
  "philippine-teak": ["Philippine Teak (Tectona philippinensis)--an endangered and endemic tree 02.jpg", "p"],
  "amugis": ["Koordersiodendron pinnatum34.jpg", "p"],
  "tindalo": ["Afzelia rhomboidea Blanco2.281.png", "i"],
  "akle": ["Albizia acle1.jpg", "p"],
  "supa": ["Sindora supa55.jpg", "p"],
  "anubing": ["Artocarpus ovatus Blanco2.450-cropped.jpg", "i"],
  "bakan": ["Litsea philippinensis Merr nmnhbotany 2125810 NMNH-00099363-000001.jpg", "s"],
  "nato": ["IPalaquium luzoniense8.jpg", "p"],
  "malak-malak": ["Palaquium philippense Blanco2.423-cropped.jpg", "i"],
  "betis": ["Madhuca betis1.jpg", "p"],
  "kaburo": ["Phoebe glabrifolia Merr nmnhbotany 2077394 NMNH-00099176.jpg", "s"],
  "kalingag": ["Cinnamomum mercadoi33.jpg", "p"],
  "balobo": ["Diplodiscus paniculatus33.jpg", "p"],
  "toog": ["Petersianthus quadrialatus (Merr.) Merr. (NMNH-03042592).jpg", "s"],
  "niog-niogan": ["Starr 010820-0015 Ficus pseudopalma.jpg", "p"],
  "manila-palm": ["Adonidia merrillii (Becc.) Becc. - 2013 002.jpg", "p"],
  "areca-ipot": ["Areca ipot.jpg", "p"],
  "vatica-pachyphylla": ["Vatica pachyphylla4.jpg", "p"],
  "dalindingan": ["Tree species (10.3897-BDJ.8.e55790) Figure 6.jpg", "p", [0.275, 0.005, 0.498, 0.305], "Aureo, Reyes, Mutia, Jose & Sarnowski"], // panel B of a figure of several trees
  "pinanga-insignis": ["Pinanga insignis Becc nmnhbotany 2096952 NMNH-00087681.jpg", "s", [0.085, 0.02, 0.97, 0.97]],
};

// The same idea for images outside Commons: url, kind, author, licence, source record, crop [x0, y0, x1, y1]
const DIRECT = {
  "kalunti": [NL("L.4403615"), "s", NATURALIS, CC0, GBIF + "3353009374", [0, 0, 1, 0.905]],
  "almon": ["https://inaturalist-open-data.s3.amazonaws.com/photos/370479485/large.jpg", "p", "Casey Clark G. Sumalinog", BY, INAT + "209349218"],
  "mapilig": [KW("8f6c4982b3a97ca1d8d82a65a64bc17f"), "s", KEW, BY, GBIF + "4853843699", [0, 0, 0.88, 1]],
  "bagoadlau": ["https://inaturalist-open-data.s3.amazonaws.com/photos/356014796/large.jpg", "p", "Zoltán Stekkelpak", CC0, INAT + "201659419"],
  "malabayabas": [NL("L.2536729"), "s", NATURALIS, CC0, GBIF + "2514437186", CROP_NL],
  "malakatmon": [NL("L.3764805"), "s", NATURALIS, CC0, GBIF + "2517075114", CROP_NL],
  "batikuling": [NY("4127/130/04734268"), "s", NYBG, BY, GBIF + "4093667958", CROP_NY],
  "antipolo": ["https://inaturalist-open-data.s3.amazonaws.com/photos/189190992/large.jpeg", "p", "Greg III Espera", BY, INAT + "112026002"],
  "duguan": [NL("L.3916610"), "s", NATURALIS, CC0, GBIF + "2515111020", CROP_NL],
  "bansalagin": ["https://web.corral.tacc.utexas.edu/brit/BRIT/BRIT0041000/BRIT41121.jpg", "s", BRIT, CC0, GBIF + "4513504701", CROP_NY],
  "yakal-malibato": [NL("L.2422516"), "s", NATURALIS, CC0, GBIF + "2516405221", CROP_NL],
  "yakal-saplungan": [NL("L.2423032"), "s", NATURALIS, CC0, GBIF + "2514397379", CROP_NL],
  "binukaw": ["https://inaturalist-open-data.s3.amazonaws.com/photos/565211226/large.jpg", "p", "Pippo Carmona", CC0, INAT + "313012155"],
  "hancea": [NY("3798/188/04080678"), "s", NYBG, BY, GBIF + "2273862259", CROP_NY],
  "lagerstroemia-piriformis": [NL("L.2479720"), "s", NATURALIS, CC0, GBIF + "2516420094", CROP_NL],
  "livistona-robinsoniana": [KW("f3f756b796528e441a4e6725d294c866"), "s", KEW, BY, GBIF + "912191223", [0, 0, 0.9, 1]],
  "orania-palindan": [NL("L.1413741"), "s", NATURALIS, CC0, GBIF + "2513712949", CROP_NL],
  "pinanga-philippinensis": [KW("4268dbac9c4d7e73b4e96493d7f54974"), "s", KEW, BY, GBIF + "4519397107", [0, 0, 0.895, 1]],
  "heterospathe-philippinensis": [NL("U.1124372"), "s", NATURALIS, CC0, GBIF + "2515218869", CROP_NL],
  "basilan-yakal": [KW("c4da32f3f21988f15d49fba8361100e7"), "s", KEW, BY, GBIF + "4903217843", [0, 0, 0.87, 1]],
  "sandoricum-vidalii": [NY("4276/495/04423067"), "s", NYBG, BY, GBIF + "4058641338", CROP_NY],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const plain = html => (html || "").replace(/<[^>]+>/g, " ").replace(/&(amp|quot|#39|lt|gt|nbsp);/g, e => ENTITIES[e]).replace(/\s+/g, " ").trim();
// "self" means the uploader took it; repeated "Unknown author" collapses to one
function author(m, user) {
  const a = plain(m.Artist?.value).replace(/^(Unknown author)( \1)+$/i, "$1");
  return (!a || /^self$/i.test(a) ? user : a).slice(0, 80) || "Unknown author";
}
mkdirSync(join(ROOT, "assets/trees/thumbs"), { recursive: true });
const tmp = join(ROOT, "assets/trees/_download");

const cropFilter = c => c ? `crop=iw*${c[2] - c[0]}:ih*${c[3] - c[1]}:iw*${c[0]}:ih*${c[1]},` : "";
function saveImages(id, crop) {
  const dest = join(ROOT, "assets/trees", id + ".jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", `${cropFilter(crop)}scale='min(${WIDTH},iw)':-2`, "-q:v", "4", "-frames:v", "1", "-update", "1", dest]);
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", dest]).toString().trim().split(",").map(Number);
  // a small square for result lists, so a page of results stays light on weak signal
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", `${cropFilter(crop)}scale=160:160:force_original_aspect_ratio=increase,crop=160:160`, "-q:v", "5", "-frames:v", "1", "-update", "1", join(ROOT, "assets/trees/thumbs", id + ".jpg")]);
  return [w, h];
}

const onlyMissing = process.argv.includes("--missing");
const generated = join(ROOT, "js/tree-photos.js");
const out = {};
if (onlyMissing) {
  const text = readFileSync(generated, "utf8");
  Object.assign(out, JSON.parse(text.slice(text.indexOf("= ") + 2, text.lastIndexOf(";"))));
}
for (const [id, [file, kind, crop, who]] of Object.entries(PICKS)) {
  if (out[id]) continue;
  const api = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2", prop: "imageinfo", titles: "File:" + file,
    iiprop: "url|extmetadata|user", iiurlwidth: "960"
  });
  const ii = (await (await fetch(api, { headers: UA })).json()).query.pages[0].imageinfo[0];
  // the latest uploader can be a bot that rotated the file; credit whoever uploaded it first
  const history = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", titles: "File:" + file, iiprop: "user", iilimit: "max" });
  const versions = (await (await fetch("https://commons.wikimedia.org/w/api.php?" + history, { headers: UA })).json()).query.pages[0].imageinfo;
  ii.user = versions[versions.length - 1].user;
  const m = ii.extmetadata || {};
  const img = await fetch(ii.thumburl, { headers: UA });
  if (!img.ok) throw new Error(`${id}: download failed (${img.status})`);
  writeFileSync(tmp, Buffer.from(await img.arrayBuffer()));
  const [w, h] = saveImages(id, crop);
  out[id] = {
    src: `assets/trees/${id}.jpg`, thumb: `assets/trees/thumbs/${id}.jpg`, w, h, kind,
    author: (who || author(m, ii.user)) + (crop ? " (cropped)" : ""),
    license: m.LicenseShortName?.value || "", licenseUrl: m.LicenseUrl?.value || "",
    source: ii.descriptionurl
  };
  console.log(id, w + "x" + h, out[id].license);
  await sleep(300);
}
for (const [id, [url, kind, who, [license, licenseUrl], source, crop]] of Object.entries(DIRECT)) {
  if (out[id]) continue;
  // some herbarium servers are slow; curl waits for them
  execFileSync("curl", ["-sSfL", "--max-time", "170", "-A", AGENT, "-o", tmp, url], { stdio: "pipe" });
  const [w, h] = saveImages(id, crop);
  out[id] = {
    src: `assets/trees/${id}.jpg`, thumb: `assets/trees/thumbs/${id}.jpg`, w, h, kind,
    author: who + (crop ? " (cropped)" : ""), license, licenseUrl, source
  };
  console.log(id, w + "x" + h, license);
  await sleep(300);
}
rmSync(tmp, { force: true });
writeFileSync(generated,
  "/* RootRite: tree photos from Wikimedia Commons, iNaturalist and herbaria on GBIF, with credits. Generated by scripts/update-tree-photos.mjs. */\n" +
  "const TREE_PHOTOS = " + JSON.stringify(out, null, 1) + ";\n");
console.log(Object.keys(out).length, "photos");
