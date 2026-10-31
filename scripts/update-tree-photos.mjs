// Downloads RootRite's tree photos from Wikimedia Commons into assets/trees/ and writes
// js/tree-photos.js with each photo's author and licence. Needs ffmpeg for resizing.
//   node scripts/update-tree-photos.mjs
// Every pick was checked by eye against the species: right tree, freely licensed (CC0, public
// domain, CC BY or CC BY-SA). Species without a trustworthy free photo are left out on purpose.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UA = { "User-Agent": "RootRite/1.0 (https://rootrite.vercel.app; tree photos)" };
const WIDTH = 720;

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

const out = {};
for (const [id, [file, kind]] of Object.entries(PICKS)) {
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
  const dest = join(ROOT, "assets/trees", id + ".jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", `scale='min(${WIDTH},iw)':-2`, "-q:v", "4", dest]);
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", dest]).toString().trim().split(",").map(Number);
  // a small square for result lists, so a page of results stays light on weak signal
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale=160:160:force_original_aspect_ratio=increase,crop=160:160", "-q:v", "5", join(ROOT, "assets/trees/thumbs", id + ".jpg")]);
  out[id] = {
    src: `assets/trees/${id}.jpg`, thumb: `assets/trees/thumbs/${id}.jpg`, w, h, kind,
    author: author(m, ii.user),
    license: m.LicenseShortName?.value || "", licenseUrl: m.LicenseUrl?.value || "",
    source: ii.descriptionurl
  };
  console.log(id, w + "x" + h, out[id].license);
  await sleep(300);
}
rmSync(tmp, { force: true });
writeFileSync(join(ROOT, "js/tree-photos.js"),
  "/* RootRite: tree photos from Wikimedia Commons, with credits. Generated by scripts/update-tree-photos.mjs. */\n" +
  "const TREE_PHOTOS = " + JSON.stringify(out, null, 1) + ";\n");
console.log(Object.keys(out).length, "photos");
