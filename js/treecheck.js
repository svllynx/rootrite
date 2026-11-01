/*
  RootRite: "Have a tree in mind?" People often arrive already wanting a particular tree.
  Everyone gets the verdict for their site, including any warning that it may fail. Premium adds
  the reasons, factor by factor, and better native alternatives.
*/
const TreeCheck = (() => {
  const $ = id => document.getElementById(id);
  const ALTERNATIVES = 3;

  // Popular trees that aren't native here. RootRite covers native trees only, so it says so plainly.
  const NOT_NATIVE = [
    { names: ["mahogany", "swietenia macrophylla"], name: "Mahogany", sci: "Swietenia macrophylla", from: "tropical America", use: "timber" },
    { names: ["gmelina", "yemane", "gmelina arborea"], name: "Gmelina", sci: "Gmelina arborea", from: "South and Southeast Asia", use: "timber" },
    { names: ["falcata", "moluccan sau", "falcataria moluccana"], name: "Falcata", sci: "Falcataria moluccana", from: "Indonesia and New Guinea", use: "timber" },
    { names: ["mangium", "acacia mangium"], name: "Mangium", sci: "Acacia mangium", from: "Australia and New Guinea", use: "restore" },
    { names: ["auri", "acacia auriculiformis"], name: "Auri", sci: "Acacia auriculiformis", from: "Australia and New Guinea", use: "restore" }
  ];

  const clean = t => t.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();

  // The tree someone typed: an exact name first, then the start of a name when only one tree fits it.
  function find(text) {
    const q = clean(text);
    if (q.length < 2) return null;
    const exact = SPECIES.find(sp => clean(sp.name) === q || clean(sp.sci) === q);
    if (exact) return { sp: exact };
    const foreign = NOT_NATIVE.find(t => t.names.includes(q));
    if (foreign) return { foreign };
    const starts = SPECIES.filter(sp => clean(sp.name).startsWith(q) || clean(sp.sci).startsWith(q) || clean(sp.sci).split(" ").includes(q));
    return starts.length === 1 ? { sp: starts[0] } : starts.length ? { several: starts.slice(0, 6) } : null;
  }

  // Why a tree can't grow here at all. This stays free: it's a warning, not a feature.
  function blocked(sp, s) {
    const tidalTree = sp.soils.includes("tidal");
    if (s.soil === "tidal" && !tidalTree) return `${sp.name} is a dry-land tree. It won't survive tidal mud, flooded by the sea every day.`;
    if (s.soil !== "tidal" && tidalTree) return `${sp.name} is a mangrove. It grows only on tidal mud along the coast.`;
    return `${sp.name} grows from about ${fmt(sp.elev[0])} to ${fmt(sp.elev[1])} m. Your site is at ${fmt(s.elev)} m, too far outside its range.`;
  }

  const LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  const thumb = sp => TREE_PHOTOS[sp.id] ? `<img class="check-thumb" src="${TREE_PHOTOS[sp.id].thumb}" alt="" width="160" height="160" loading="lazy" decoding="async">` : "";

  function altList(list) {
    return `<ul class="check-alts">${list.map(r => `
      <li><button type="button" class="check-alt" data-check-tree="${esc(r.sp.name)}">
        ${thumb(r.sp)}
        <span class="check-alt-name">${esc(r.sp.name)}</span>
        <span class="check-alt-fit">${isPremium() ? `${r.fit}%` : matchWord(r.fit)}</span>
      </button></li>`).join("")}</ul>`;
  }

  function foreignAnswer(t, s) {
    const options = rank({ ...s, purpose: t.use }).filter(r => r.fit >= 45).slice(0, ALTERNATIVES);
    return `
      <div class="check-answer">
        <div class="check-head">
          <div><h3 class="check-name">${esc(t.name)}</h3><p class="check-sci">${esc(t.sci)}</p></div>
          <p class="check-verdict is-no">Not native</p>
        </div>
        <p class="check-line">${esc(t.name)} comes from ${esc(t.from)}, so RootRite doesn't rate it. Native trees support local wildlife and suit the land they evolved on.</p>
        ${options.length ? `<h4 class="check-h">Native trees grown for ${esc(USE_WORDS[t.use])} that fit your site</h4>${altList(options)}` : ""}
      </div>`;
  }

  function lockedReasons(result) {
    return `
      <div class="check-locked">
        <ul class="check-hidden" aria-hidden="true">${result.factors.slice(0, 5).map((f, i) => `
          <li><span>${f.label}</span><span class="cmp-hidden" style="width:${[64, 42, 78, 52, 70][i]}%"></span></li>`).join("")}</ul>
        <div class="check-unlock">
          <p>See what's holding ${esc(result.sp.name)} back or helping it here, and which native trees would do better.</p>
          <button class="btn btn-ink" type="button" data-upgrade data-upgrade-from="tree-check">${LOCK} Unlock the reasons</button>
        </div>
      </div>`;
  }

  function answer(sp, s) {
    const result = score(sp, s);
    if (!result) {
      const options = rank(s).filter(r => r.fit >= 45).slice(0, ALTERNATIVES);
      return `
        <div class="check-answer">
          <div class="check-head">
            ${thumb(sp)}
            <div><h3 class="check-name">${esc(sp.name)}</h3><p class="check-sci">${esc(sp.sci)}</p></div>
            <p class="check-verdict is-no">Won't grow here</p>
          </div>
          <p class="check-line">${esc(blocked(sp, s))}</p>
          ${options.length ? `<h4 class="check-h">Try these instead</h4>${altList(options)}` : ""}
        </div>`;
    }
    const ranked = rank(s), place = ranked.findIndex(r => r.sp.id === sp.id) + 1;
    const weak = result.fit < 55;
    const line = !isPremium()
      ? weak ? `${sp.name} may struggle at this site. Check before you buy seedlings.`
        : place <= FREE_LIMIT ? `${sp.name} is one of your top ${FREE_LIMIT} for this site.`
        : result.fit >= 70 ? `${sp.name} should do well at this site.` : `${sp.name} can grow here, though other native trees suit this site better.`
      : place === 1 ? `${sp.name} is the best match for this site.` : `${sp.name} ranks number ${place} of the ${ranked.length} native trees that can grow here.`;
    if (!isPremium()) {
      return `
        <div class="check-answer">
          <div class="check-head">
            ${thumb(sp)}
            <div><h3 class="check-name">${esc(sp.name)}</h3><p class="check-sci">${esc(sp.sci)}</p></div>
            <p class="check-verdict${weak ? " is-no" : ""}">${matchWord(result.fit)}</p>
          </div>
          <p class="check-line">${esc(line)}</p>
          ${lockedReasons(result)}
        </div>`;
    }
    const better = ranked.filter(r => r.sp.id !== sp.id && r.fit > result.fit).slice(0, ALTERNATIVES);
    return `
      <div class="check-answer">
        <div class="check-head">
          ${thumb(sp)}
          <div><h3 class="check-name">${esc(sp.name)}</h3><p class="check-sci">${esc(sp.sci)}</p></div>
          <p class="check-verdict${weak ? " is-no" : ""}">${result.fit}%<small>${matchWord(result.fit)}</small></p>
        </div>
        <p class="check-line">${esc(line)}</p>
        ${factorBars(result)}
        <div class="check-reasons">
          ${result.miss.length ? `<div><h4 class="check-h">Holding it back</h4><ul>${result.miss.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
          ${result.why.length ? `<div><h4 class="check-h">In its favor</h4><ul>${result.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
        </div>
        ${better.length ? `<h4 class="check-h">Native trees that fit better</h4>${altList(better)}` : ""}
      </div>`;
  }

  function paint() {
    const out = $("check-result"), text = $("check-tree").value.trim();
    if (!out) return;
    if (!text) { out.innerHTML = ""; return; }
    const hit = find(text), s = readSite();
    if (!hit) {
      out.innerHTML = `<p class="check-line check-none">"${esc(text)}" isn't in RootRite's list of ${SPECIES.length} native trees. Check the spelling, or try its scientific name.</p>`;
    } else if (hit.several) {
      out.innerHTML = `<p class="check-line">Which one do you mean?</p>
        <ul class="check-picks">${hit.several.map(sp => `<li><button type="button" class="link-btn" data-check-tree="${esc(sp.name)}">${esc(sp.name)}</button></li>`).join("")}</ul>`;
    } else {
      out.innerHTML = hit.foreign ? foreignAnswer(hit.foreign, s) : answer(hit.sp, s);
    }
  }

  function init() {
    $("check-trees").innerHTML = [...SPECIES].sort((a, b) => a.name.localeCompare(b.name))
      .map(sp => `<option value="${esc(sp.name)}">${sp.name === sp.sci ? "" : esc(sp.sci)}</option>`).join("");
    $("check-form").addEventListener("submit", e => { e.preventDefault(); paint(); });
    document.addEventListener("click", e => {
      const pick = e.target.closest("[data-check-tree]");
      if (!pick) return;
      $("check-tree").value = pick.dataset.checkTree;
      paint();
    });
  }

  return { init, paint, find };
})();
