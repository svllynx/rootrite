/* RootRite organisation workspace: impact, projects, sites, plantings, survival checks and the team. */
document.documentElement.classList.add("js");

const KINDS = { lgu: "LGU or barangay", school: "School or university", ngo: "NGO", company: "Company", other: "Organisation" };
const JOIN_KEY = "rootrite-join";
const ws = {
  account: null, orgs: [], org: null, role: "member",
  projects: [], sites: [], plantings: [], checks: [], members: [], invites: [],
  scope: "", open: new Set()
};
const $ = id => document.getElementById(id);
const db = () => rrClient();
const isOwner = () => ws.role === "owner";
const myId = () => ws.account.user.id;
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const shortDate = d => new Date(d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
const speciesName = id => SPECIES.find(s => s.id === id)?.name || id;
const canRemove = row => isOwner() || row.created_by === myId();

function toast(text) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("p"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 4200);
}
const fail = err => toast(rrErrorText(err));

function show(section) {
  ["join", "start", "workspace"].forEach(id => { $(id).hidden = id !== section; });
  $("ws-nav").hidden = section !== "workspace";
  document.body.classList.remove("is-checking");
}

/* ---------- Start up ---------- */

async function boot() {
  const join = /^[a-f0-9]{32}$/.test(new URLSearchParams(location.search).get("join") || "") ? new URLSearchParams(location.search).get("join") : null;
  if (join) { try { localStorage.setItem(JOIN_KEY, join); } catch (e) { /* the link still works this visit */ } }
  if (!db()) { $("gate-text").textContent = "Accounts aren't connected yet."; return; }

  ws.account = await rrCurrentAccount();
  if (!ws.account) {
    location.replace(`auth.html?mode=login&next=${encodeURIComponent(`org.html${join ? `?join=${join}` : ""}`)}`);
    return;
  }
  $("user-name").textContent = ws.account.name;
  document.querySelectorAll("[data-org-price]").forEach(n => { n.textContent = RR_CONFIG.orgPrice; });
  document.querySelectorAll("[data-org-seats]").forEach(n => { n.textContent = RR_CONFIG.orgSeats; });
  db().auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("auth.html?mode=login"); });

  let pending = join;
  if (!pending) { try { pending = localStorage.getItem(JOIN_KEY); } catch (e) { pending = null; } }
  if (pending) return showJoin(pending);
  await enter();
}

async function enter(orgId) {
  ws.orgs = (await rrMyOrganisations()).sort((a, b) => a.name.localeCompare(b.name));
  if (!ws.orgs.length) { show("start"); $("plan-badge").hidden = true; return; }
  $("plan-badge").hidden = false;
  const remembered = (() => { try { return localStorage.getItem("rootrite-org"); } catch (e) { return null; } })();
  ws.org = ws.orgs.find(o => o.id === orgId) || ws.orgs.find(o => o.id === remembered) || ws.orgs[0];
  ws.role = ws.org.role;
  await loadOrg();
  show("workspace");
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

/* ---------- Joining and starting ---------- */

async function showJoin(code) {
  const forget = () => { try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* nothing to forget */ } };
  const err = text => {
    forget();
    $("join-text").textContent = "";
    $("join-error").textContent = text;
    $("join-error").hidden = false;
    $("join-yes").hidden = true;
    show("join");
  };
  $("join-no").onclick = async () => {
    forget();
    history.replaceState(null, "", "org.html");
    $("join-error").hidden = true;
    await enter();
  };
  try {
    const { data, error } = await db().rpc("invite_details", { invite_code: code });
    if (error) throw error;
    const inv = data?.[0];
    if (!inv) return err("This invite link is not valid. Ask for a new one.");
    if (inv.expired) return err("This invite link has expired. Ask for a new one.");
    $("join-text").textContent = `You've been invited to ${inv.org_name} (${KINDS[inv.org_kind]}). You'll see and add to its projects, and get Premium features.`;
    show("join");
    $("join-yes").onclick = async () => {
      $("join-yes").disabled = true;
      const { data: orgId, error: joinError } = await db().rpc("join_organisation", { invite_code: code });
      if (joinError) { $("join-yes").disabled = false; return err(rrErrorText(joinError)); }
      forget();
      history.replaceState(null, "", "org.html");
      await enter(orgId);
      toast(`Welcome to ${ws.org.name}.`);
    };
  } catch (e) { err(rrErrorText(e)); }
}

async function startOrganisation(e) {
  e.preventDefault();
  const f = e.target, msg = $("start-error"), btn = f.querySelector("[type=submit]");
  const name = f.orgname.value.trim();
  msg.hidden = true;
  if (name.length < 2) { msg.textContent = "Add the name of your group."; msg.hidden = false; return; }
  btn.disabled = true;
  try {
    const { data, error } = await db().rpc("create_organisation", { org_name: name, org_kind: f.kind.value });
    if (error) throw error;
    await enter(data.id);
    toast("Your Organisation plan is active. Add your first project.");
  } catch (err) {
    msg.textContent = rrErrorText(err);
    msg.hidden = false;
    btn.disabled = false;
  }
}

/* ---------- Loading ---------- */

async function loadOrg() {
  const id = ws.org.id;
  const take = ({ data, error }) => { if (error) throw error; return data || []; };
  ws.projects = take(await db().from("projects").select("*").eq("org_id", id).order("created_at"));
  const projectIds = ws.projects.map(p => p.id);
  ws.sites = projectIds.length ? take(await db().from("project_sites").select("*").in("project_id", projectIds).order("created_at")) : [];
  const siteIds = ws.sites.map(s => s.id);
  ws.plantings = siteIds.length ? take(await db().from("plantings").select("*").in("site_id", siteIds).order("planted_on").order("created_at")) : [];
  const plantingIds = ws.plantings.map(p => p.id);
  ws.checks = plantingIds.length ? take(await db().from("survival_checks").select("*").in("planting_id", plantingIds).order("checked_on")) : [];
  ws.members = take(await db().rpc("list_org_members", { o: id }));
  ws.invites = isOwner() ? take(await db().from("org_invites").select("*").eq("org_id", id).gt("expires_at", new Date().toISOString()).order("created_at")) : [];
  if (ws.scope && !ws.projects.some(p => p.id === ws.scope)) ws.scope = "";
  renderAll();
}

function renderAll() {
  $("ws-title").textContent = ws.org.name;
  $("ws-sub").textContent = `${KINDS[ws.org.kind]} · Organisation plan · You're ${isOwner() ? "the owner" : "a member"}`;
  $("ws-switch").hidden = ws.orgs.length < 2;
  $("ws-org").innerHTML = ws.orgs.map(o => `<option value="${o.id}"${o.id === ws.org.id ? " selected" : ""}>${esc(o.name)}</option>`).join("");
  renderImpact();
  renderProjects();
  renderTeam();
}

/* ---------- Impact ---------- */

function scoped() {
  const projects = ws.scope ? ws.projects.filter(p => p.id === ws.scope) : ws.projects;
  const ids = new Set(projects.map(p => p.id));
  const sites = ws.sites.filter(s => ids.has(s.project_id));
  const siteIds = new Set(sites.map(s => s.id));
  const plantings = ws.plantings.filter(p => siteIds.has(p.site_id));
  const plantingIds = new Set(plantings.map(p => p.id));
  const checks = ws.checks.filter(c => plantingIds.has(c.planting_id));
  return { projects, sites, plantings, checks, scopeName: ws.scope ? projects[0].name : "All projects" };
}

function renderImpact() {
  $("impact-scope").innerHTML = `<option value="">All projects</option>` +
    ws.projects.map(p => `<option value="${p.id}"${p.id === ws.scope ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const data = scoped(), s = Impact.summarise(data);
  const tile = (label, value, note) => `<div class="ws-tile"><p class="ws-tile-label">${label}</p><p class="ws-tile-value">${value}</p><p class="ws-tile-note">${note}</p></div>`;
  const unchecked = s.planted - s.checkedPlanted;
  const tiles = `
    <div class="ws-tiles">
      ${tile("Trees planted", fmt(s.planted), `Across ${s.sites} ${s.sites === 1 ? "site" : "sites"}`)}
      ${tile("Survival rate", Impact.percent(s.survival), !s.planted ? "Log a planting to begin" : s.checkedPlanted ? `${fmt(s.alive)} alive of ${fmt(s.checkedPlanted)} checked${unchecked ? `; ${fmt(unchecked)} not checked yet` : ""}` : "No survival checks yet")}
      ${tile("Area covered", `${fmt(Math.round(s.areaHa * 100) / 100)} ha`, "From your site areas")}
      ${tile("Carbon so far (rough)", `${Impact.tonnesRange(s.co2Now)} t CO<sub>2</sub>`, `Living trees only. About ${Impact.tonnesRange(s.co2Horizon)} t in ${Impact.HORIZON} years if they all survive`)}
    </div>`;
  const species = Object.entries(s.species).sort((a, b) => b[1].planted - a[1].planted);
  const table = species.length ? `
    <table class="ws-table">
      <caption>By tree</caption>
      <thead><tr><th scope="col">Tree</th><th scope="col">Planted</th><th scope="col">Alive when checked</th><th scope="col">Survival</th></tr></thead>
      <tbody>${species.map(([id, v]) => `<tr><th scope="row">${esc(speciesName(id))}</th><td>${fmt(v.planted)}</td><td>${v.checkedPlanted ? `${fmt(v.alive)} of ${fmt(v.checkedPlanted)}` : "Not checked"}</td><td>${v.checkedPlanted ? `${Math.round(v.alive / v.checkedPlanted * 100)}%` : "Not yet"}</td></tr>`).join("")}</tbody>
    </table>` : "";
  $("impact-body").innerHTML = tiles + table;
  $("impact-method").innerHTML = Impact.METHOD.map(m => `<li>${esc(m)}</li>`).join("");
}

// Quote every cell, and stop spreadsheets reading a cell as a formula.
const csvCell = v => {
  const t = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

function downloadCsv() {
  const { sites, plantings, checks } = scoped();
  const head = ["Project", "Site", "Location", "Latitude", "Longitude", "Area (ha)", "Tree", "Scientific name", "Planted on", "Trees planted", "Last check", "Alive at last check", "Survival"];
  const rows = plantings.map(p => {
    const site = sites.find(s => s.id === p.site_id);
    const project = ws.projects.find(x => x.id === site.project_id);
    const last = checks.filter(c => c.planting_id === p.id).sort((a, b) => b.checked_on.localeCompare(a.checked_on))[0];
    const sp = SPECIES.find(s => s.id === p.species_id);
    return [project.name, site.name, site.location, site.lat, site.lon, site.area_ha, sp?.name || p.species_id, sp?.sci || "", p.planted_on, p.count, last?.checked_on || "", last?.alive ?? "", last ? `${Math.round(last.alive / p.count * 100)}%` : ""];
  });
  const csv = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
    download: `rootrite-plantings-${ws.org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function withButton(btn, label, work) {
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { await work(); }
  catch (err) { toast(err?.message && !err.code ? err.message : rrErrorText(err)); }
  finally { btn.disabled = false; btn.textContent = was; }
}

/* ---------- Projects and sites ---------- */

function siteSummary(site) {
  const plantings = ws.plantings.filter(p => p.site_id === site.id);
  const ids = new Set(plantings.map(p => p.id));
  return Impact.summarise({ sites: [site], plantings, checks: ws.checks.filter(c => ids.has(c.planting_id)) });
}

function speciesOptions(site) {
  const s = site.site || {};
  const best = s.soil && s.elev != null ? rank(s).filter(r => r.fit >= 45).slice(0, 10).map(r => r.sp) : [];
  const bestIds = new Set(best.map(sp => sp.id));
  const opt = sp => `<option value="${sp.id}">${esc(sp.name)}</option>`;
  const rest = SPECIES.filter(sp => !bestIds.has(sp.id)).sort((a, b) => a.name.localeCompare(b.name));
  return (best.length ? `<optgroup label="Best for this site">${best.map(opt).join("")}</optgroup>` : "") +
    `<optgroup label="All native trees">${rest.map(opt).join("")}</optgroup>`;
}

function plantingRow(p) {
  const checks = ws.checks.filter(c => c.planting_id === p.id).sort((a, b) => b.checked_on.localeCompare(a.checked_on) || b.created_at.localeCompare(a.created_at));
  const last = checks[0];
  return `
    <li class="ws-planting">
      <div class="ws-planting-top">
        <div><p class="ws-planting-name">${fmt(p.count)} ${esc(speciesName(p.species_id))}</p><p class="ws-planting-meta">Planted ${shortDate(p.planted_on)}${p.notes ? ` · ${esc(p.notes)}` : ""}</p></div>
        <p class="ws-planting-survival">${last ? `<b>${Math.round(last.alive / p.count * 100)}%</b> alive: ${fmt(last.alive)} on ${shortDate(last.checked_on)}${checks.length > 1 ? ` (${checks.length} checks)` : ""}` : "Not checked yet"}</p>
        ${canRemove(p) ? `<button class="link-btn" type="button" data-remove-planting="${p.id}">Remove</button>` : ""}
      </div>
      <form class="ws-check" data-check="${p.id}" novalidate>
        <div class="input"><label for="alive-${p.id}">Alive now</label><input id="alive-${p.id}" name="alive" type="number" min="0" max="${p.count}" inputmode="numeric"></div>
        <div class="input"><label for="checked-${p.id}">Counted on</label><input id="checked-${p.id}" name="on" type="date" value="${todayISO()}" min="${p.planted_on}" max="${todayISO()}"></div>
        <button class="btn btn-line btn-sm" type="submit">Add survival check</button>
        ${last && canRemove(last) ? `<button class="link-btn" type="button" data-remove-check="${last.id}">Undo last check</button>` : ""}
      </form>
    </li>`;
}

function siteCard(site) {
  const sum = siteSummary(site), key = `site-${site.id}`;
  const s = site.site || {};
  const plantings = ws.plantings.filter(p => p.site_id === site.id);
  return `
    <details class="ws-site" data-key="${key}"${ws.open.has(key) ? " open" : ""}>
      <summary>
        <span class="ws-site-name">${esc(site.name)}</span>
        <span class="ws-site-meta">${esc(site.location || s.location || `${site.lat.toFixed(3)}, ${site.lon.toFixed(3)}`)}</span>
        <span class="ws-site-stats">${fmt(sum.planted)} trees · ${Impact.percent(sum.survival)} survival · ${fmt(+site.area_ha)} ha</span>
      </summary>
      <div class="ws-site-body">
        ${s.soil && s.elev != null ? `<p class="ws-site-desc">${esc(describe(s))}</p>` : ""}
        <div class="ws-site-actions">
          <button class="btn btn-ink btn-sm" type="button" data-site-pdf="${site.id}">Download site report (PDF)</button>
          <form class="ws-area" data-area="${site.id}" novalidate>
            <label for="area-${site.id}">Area (ha)</label>
            <input id="area-${site.id}" name="area" type="number" min="0" step="0.01" value="${+site.area_ha}">
            <button class="link-btn" type="submit">Save</button>
          </form>
          ${canRemove(site) ? `<button class="link-btn" type="button" data-remove-site="${site.id}">Remove site</button>` : ""}
        </div>
        <form class="ws-log" data-plant="${site.id}" novalidate>
          <h4>Log a planting</h4>
          <div class="ws-log-fields">
            <div class="input"><label for="sp-${site.id}">Tree</label><select id="sp-${site.id}" name="species">${speciesOptions(site)}</select></div>
            <div class="input"><label for="count-${site.id}">How many</label><input id="count-${site.id}" name="count" type="number" min="1" inputmode="numeric"></div>
            <div class="input"><label for="on-${site.id}">Planted on</label><input id="on-${site.id}" name="on" type="date" value="${todayISO()}" max="${todayISO()}"></div>
            <button class="btn btn-ink btn-sm" type="submit">Log planting</button>
          </div>
        </form>
        ${plantings.length ? `<ul class="ws-plantings">${plantings.map(plantingRow).join("")}</ul>` : `<p class="ws-empty">No plantings logged here yet.</p>`}
      </div>
    </details>`;
}

function renderProjects() {
  const box = $("project-list");
  if (!ws.projects.length) {
    box.innerHTML = `<p class="ws-empty">No projects yet. Add your first one above, then save its planting sites from the site matcher.</p>`;
    return;
  }
  box.innerHTML = ws.projects.map(p => {
    const sites = ws.sites.filter(s => s.project_id === p.id);
    return `
      <article class="ws-project">
        <div class="ws-project-head">
          <h3>${esc(p.name)}</h3>
          <div class="ws-project-actions">
            <a class="btn btn-line btn-sm" href="app.html?project=${p.id}#match">Add a site</a>
            ${isOwner() ? `<button class="link-btn" type="button" data-remove-project="${p.id}">Delete project</button>` : ""}
          </div>
        </div>
        ${sites.length ? sites.map(siteCard).join("") : `<p class="ws-empty">No sites yet. Choose <b>Add a site</b>, drop a pin in the matcher, and save it here.</p>`}
      </article>`;
  }).join("");
}

/* ---------- Team ---------- */

function renderTeam() {
  $("people-count").textContent = `${ws.members.length} of ${RR_CONFIG.orgSeats} people`;
  $("member-list").innerHTML = ws.members.map(m => `
    <li class="ws-member">
      <div><p class="ws-member-name">${esc(m.full_name || "Unnamed member")}${m.user_id === myId() ? " (you)" : ""}</p><p class="ws-member-role">${m.role === "owner" ? "Owner" : "Member"} · joined ${shortDate(m.joined_at)}</p></div>
      ${m.role !== "owner" && (isOwner() || m.user_id === myId()) ? `<button class="link-btn" type="button" data-remove-member="${m.user_id}">${m.user_id === myId() ? "Leave team" : "Remove"}</button>` : ""}
    </li>`).join("");
  $("invite-box").hidden = !isOwner();
  $("invite-list").innerHTML = ws.invites.map(i => {
    const link = new URL(`org.html?join=${i.code}`, location.href).href;
    return `<div class="ws-invite">
      <input readonly value="${esc(link)}" aria-label="Invite link">
      <p class="ws-invite-meta">Expires ${shortDate(i.expires_at)} · <button class="link-btn" type="button" data-copy="${esc(link)}">Copy</button> · <button class="link-btn" type="button" data-cancel-invite="${i.id}">Cancel</button></p>
    </div>`;
  }).join("");
}

/* ---------- Actions ---------- */

async function run(promise, done) {
  const { error } = await promise;
  if (error) { fail(error); return false; }
  await loadOrg();
  if (done) toast(done);
  return true;
}

document.addEventListener("submit", async e => {
  const f = e.target;
  if (f.id === "start-form") return startOrganisation(e);
  e.preventDefault();
  // a double tap must not log the same trees twice
  const btn = f.querySelector("[type=submit]");
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try { await handleForm(f); } finally { if (btn) btn.disabled = false; }
});

async function handleForm(f) {

  if (f.id === "project-form") {
    const name = f.pname.value.trim();
    if (name.length < 2) return toast("Give the project a name.");
    if (await run(db().from("projects").insert({ org_id: ws.org.id, name }), "Project added. Now add a site from the matcher.")) f.reset();
    return;
  }
  if (f.dataset.plant) {
    const count = +f.count.value;
    if (!Number.isInteger(count) || count < 1) return toast("Enter how many trees were planted.");
    if (!f.on.value) return toast("Enter the planting date.");
    ws.open.add(`site-${f.dataset.plant}`);
    await run(db().from("plantings").insert({ site_id: f.dataset.plant, species_id: f.species.value, count, planted_on: f.on.value }), "Planting logged.");
    return;
  }
  if (f.dataset.check) {
    const alive = f.alive.value === "" ? NaN : +f.alive.value;
    if (!Number.isInteger(alive) || alive < 0) return toast("Enter how many trees are alive.");
    if (!f.on.value) return toast("Enter the date you counted them.");
    await run(db().from("survival_checks").insert({ planting_id: f.dataset.check, alive, checked_on: f.on.value }), "Survival check added.");
    return;
  }
  if (f.dataset.area) {
    const area = +f.area.value;
    if (!(area >= 0)) return toast("Enter the area in hectares.");
    await run(db().from("project_sites").update({ area_ha: area }).eq("id", f.dataset.area), "Area saved.");
  }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.removePlanting && confirm("Remove this planting and its survival checks?")) return run(db().from("plantings").delete().eq("id", d.removePlanting), "Planting removed.");
  if (d.removeCheck && confirm("Undo the last survival check?")) return run(db().from("survival_checks").delete().eq("id", d.removeCheck), "Check removed.");
  if (d.removeSite && confirm("Remove this site and everything logged on it?")) return run(db().from("project_sites").delete().eq("id", d.removeSite), "Site removed.");
  if (d.removeProject && confirm("Delete this project, with all its sites and plantings? This can't be undone.")) return run(db().from("projects").delete().eq("id", d.removeProject), "Project deleted.");
  if (d.cancelInvite) return run(db().from("org_invites").delete().eq("id", d.cancelInvite), "Invite cancelled.");
  if (d.removeMember) {
    const self = d.removeMember === myId();
    if (!confirm(self ? `Leave ${ws.org.name}?` : "Remove this person from the team?")) return;
    const { error } = await db().rpc("remove_org_member", { o: ws.org.id, member: d.removeMember });
    if (error) return fail(error);
    if (self) { toast("You've left the team."); return enter(); }
    return run(Promise.resolve({}), "Removed from the team.");
  }
  if (d.copy) {
    try { await navigator.clipboard.writeText(d.copy); toast("Link copied."); }
    catch (err) { toast("Copy didn't work. Select the link and copy it by hand."); }
    return;
  }
  if (d.sitePdf) {
    const site = ws.sites.find(s => s.id === d.sitePdf);
    const plantings = ws.plantings.filter(p => p.site_id === site.id);
    const ids = new Set(plantings.map(p => p.id));
    return withButton(t, "Preparing the report…", () => Reports.site({
      org: ws.org, project: ws.projects.find(p => p.id === site.project_id), site, plantings, checks: ws.checks.filter(c => ids.has(c.planting_id))
    }));
  }
  if (t.id === "impact-pdf") return withButton(t, "Preparing the report…", () => Reports.impact({ org: ws.org, ...scoped() }));
  if (t.id === "impact-csv") return downloadCsv();
  if (t.id === "invite-new") return run(db().from("org_invites").insert({ org_id: ws.org.id }), "Invite link created. Copy it below.");
  if (t.id === "sign-out") return rrSignOut();
});

document.addEventListener("change", e => {
  if (e.target.id === "impact-scope") { ws.scope = e.target.value; renderImpact(); }
  if (e.target.id === "ws-org") {
    try { localStorage.setItem("rootrite-org", e.target.value); } catch (err) { /* remembered for this visit only */ }
    ws.scope = "";
    enter(e.target.value);
  }
});

document.addEventListener("toggle", e => {
  const key = e.target.dataset?.key;
  if (key) e.target.open ? ws.open.add(key) : ws.open.delete(key);
}, true);

document.addEventListener("DOMContentLoaded", boot);
