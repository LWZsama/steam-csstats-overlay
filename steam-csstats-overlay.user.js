// ==UserScript==
// @name         Steam-CSStats-Overlay
// @namespace    https://github.com/LWZsama
// @author       Wenze(Lucas) Luo
// @license      MIT
// @version      2.1.1
// @description  Embed CSStats player info and recent match stats into Steam profile pages.
// @match        https://steamcommunity.com/profiles/*
// @match        https://steamcommunity.com/id/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      csstats.gg
// @connect      xsteamcommunity.com
// @connect      static.csstats.gg
// @downloadURL  https://github.com/LWZsama/steam-csstats-overlay/raw/refs/heads/main/steam-csstats-overlay.user.js
// @updateURL    https://github.com/LWZsama/steam-csstats-overlay/raw/refs/heads/main/steam-csstats-overlay.user.js
// ==/UserScript==

(() => {
  "use strict";

  const BTN_ID = "csstats_btn_jump";
  const LEFT_HOST_ID = "csstats_shadow_host_left";
  const RIGHT_HOST_ID = "csstats_shadow_host_right";
  const STYLE_ID = "csstats_overlay_host_style";

  const GAP = 16;
  const LEFT_W = 280;
  const RIGHT_W = 280;
  const MATCH_ROW_LIMIT = 25;

  const cssCache = new Map();

  function isProfilePage() {
    return /^\/(profiles|id)\/[^/]+\/?/.test(location.pathname);
  }

  function getSteamId64() {
    const m = location.pathname.match(/^\/profiles\/(\d+)(\/|$)/);
    if (m) return m[1];

    try {
      const g = window.g_rgProfileData;
      if (g && typeof g === "object" && g.steamid) return String(g.steamid);
    } catch (_) {}

    try {
      const html = document.documentElement ? document.documentElement.innerHTML : "";
      let mm = html.match(/"steamid"\s*:\s*"(\d{17})"/);
      if (mm) return mm[1];

      mm = html.match(/['"](7656119\d{10})['"]/);
      if (mm) return mm[1];

      mm = html.match(/OpenFriendChat\(\s*'(\d{17})'\s*/);
      if (mm) return mm[1];
    } catch (_) {}

    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function absUrl(base, href) {
    try {
      return new URL(href, base).toString();
    } catch (_) {
      return href;
    }
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 20000,
        headers: { Accept: "text/html,*/*" },
        onload: (res) => resolve(res.responseText || ""),
        onerror: () => reject(new Error("request failed")),
        ontimeout: () => reject(new Error("request timeout")),
      });
    });
  }

  async function fetchCssText(cssUrl) {
    if (cssCache.has(cssUrl)) return cssCache.get(cssUrl);

    const p = gmGet(cssUrl)
      .then((txt) => {
        if (txt && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
        return txt;
      })
      .catch(() => "");

    cssCache.set(cssUrl, p);
    return p;
  }

  function csStatsJumpUrl() {
    const u = new URL(location.href);
    if (u.hostname === "steamcommunity.com") u.hostname = `x${u.hostname}`;
    return u.toString();
  }

  function buildButton() {
    const a = document.createElement("a");
    a.id = BTN_ID;
    a.className = "btn_profile_action btn_medium";
    a.setAttribute("role", "button");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.href = csStatsJumpUrl();
    a.setAttribute("data-panel", '{&quot;focusable&quot;:true,&quot;clickOnActivate&quot;:true}');
    a.innerHTML = `<span>CS Stats</span>`;
    return a;
  }

  function injectButton() {
    if (!isProfilePage() || document.getElementById(BTN_ID)) return;

    const actions = document.querySelector(".profile_header_actions");
    if (!actions) return;

    const moreBtn = actions.querySelector("#profile_action_dropdown_link");
    const btn = buildButton();

    if (moreBtn) moreBtn.insertAdjacentElement("afterend", btn);
    else actions.appendChild(btn);
  }

  function injectHostStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      #${LEFT_HOST_ID}, #${RIGHT_HOST_ID}{
        position:absolute;
        top:${GAP}px;
        z-index:9999;
        background:rgba(0,0,0,0.55);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:8px;
        box-shadow:0 12px 34px rgba(0,0,0,0.55);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        overflow:hidden;
        pointer-events:auto;
      }

      #${LEFT_HOST_ID}{
        left:${GAP}px;
        width:${LEFT_W}px;
      }

      #${RIGHT_HOST_ID}{
        right:${GAP}px;
        width:${RIGHT_W}px;
      }

      #${LEFT_HOST_ID} .csstats_shell,
      #${RIGHT_HOST_ID} .csstats_shell{
        padding:10px 10px 12px 10px;
      }

      #${LEFT_HOST_ID} .csstats_shell_hd,
      #${RIGHT_HOST_ID} .csstats_shell_hd{
        position:relative;
        z-index:5;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:8px 10px;
        margin:-10px -10px 10px -10px;
        background:rgba(0,0,0,0.35);
        border-bottom:1px solid rgba(255,255,255,0.08);
        color:#dcdedf;
        font-family:"Motiva Sans", Arial, Helvetica, sans-serif;
      }

      #${LEFT_HOST_ID} .csstats_shell_actions,
      #${RIGHT_HOST_ID} .csstats_shell_actions{
        font-size:12px;
        white-space:nowrap;
      }

      #${LEFT_HOST_ID} .csstats_shell_link,
      #${RIGHT_HOST_ID} .csstats_shell_link{
        color:#66c0f4;
        text-decoration:none;
        cursor:pointer;
        pointer-events:auto;
      }

      #${LEFT_HOST_ID} .csstats_shell_link:hover,
      #${RIGHT_HOST_ID} .csstats_shell_link:hover{
        text-decoration:underline;
      }

      #${LEFT_HOST_ID} .csstats_shell_loading,
      #${RIGHT_HOST_ID} .csstats_shell_loading{
        padding:10px;
        color:#dcdedf;
        opacity:0.85;
        font-size:12px;
        font-family:"Motiva Sans", Arial, Helvetica, sans-serif;
        line-height:1.4;
      }
    `;
    document.head.appendChild(s);
  }

  function ensureHost(hostId) {
    let host = document.getElementById(hostId);
    if (host) return host;

    injectHostStyleOnce();

    host = document.createElement("div");
    host.id = hostId;
    document.body.appendChild(host);

    return host;
  }

  function csStatsPlayerUrl(steamid64) {
    return `https://csstats.gg/player/${steamid64}`;
  }

  async function fetchPlayerPayload(steamid64) {
    const url = csStatsPlayerUrl(steamid64);
    const html = await gmGet(url);
    const doc = new DOMParser().parseFromString(html, "text/html");

    const links = [...doc.querySelectorAll('link[rel="stylesheet"][href]')]
      .map((x) => absUrl(url, x.getAttribute("href")))
      .filter(Boolean);

    const player = doc.querySelector("#player");
    const profile = doc.querySelector("#player-profile");
    if (!profile) throw new Error("player-profile not found");

    let playerHtml = profile.outerHTML;

    if (player) {
      const cloned = player.cloneNode(true);

      const outer = cloned.querySelector("#player-outer-section");
      if (outer) outer.remove();

      const loading = cloned.querySelector("#player-loading-section");
      if (loading) loading.remove();

      playerHtml = cloned.outerHTML;
    }

    return { links, playerHtml };
  }

  async function buildLeftShadowDoc(payload) {
    const cssList = await Promise.all(payload.links.map(fetchCssText));
    const cssText = cssList.filter(Boolean).join("\n\n");

    const extra = `
      :host{
        display:block;
        color:#dcdedf;
        color-scheme:dark;
        font-family:Arial, Helvetica, sans-serif;
      }

      .csstats_root{
        display:block;
        color:inherit;
        position:relative;
      }

      a{ cursor:pointer; }

      #player-outer-section{ display:none !important; }

      #player{
        display:block !important;
        width:100% !important;
        max-width:100% !important;
      }

      #player-profile{
        width:100% !important;
        max-width:100% !important;
      }

      #player,
      #player-profile,
      #player-data,
      #player-ranks{
        background:transparent !important;
        background-image:none !important;
        box-shadow:none !important;
        backdrop-filter:none !important;
        -webkit-backdrop-filter:none !important;
        border:0 !important;
      }

      #player::before, #player::after,
      #player-profile::before, #player-profile::after,
      #player-data::before, #player-data::after,
      #player-ranks::before, #player-ranks::after{
        content:none !important;
        display:none !important;
      }
    `;

    return `
      <style>${cssText}\n\n${extra}</style>
      <div class="csstats_shell">
        <div class="csstats_shell_hd">
          <div class="csstats_shell_actions">
            <a class="csstats_shell_link" href="javascript:void(0)" id="csstats_reload_left">Reload</a>
          </div>
        </div>
        <div class="csstats_root">
          ${payload.playerHtml}
        </div>
      </div>
    `.trim();
  }

  async function renderLeft(steamid64) {
    const host = ensureHost(LEFT_HOST_ID);
    if (!host) return;

    if (!host.shadowRoot) host.attachShadow({ mode: "open" });

    const shadow = host.shadowRoot;
    shadow.innerHTML = `<div class="csstats_shell_loading">Loading CS Stats…</div>`;

    try {
      const payload = await fetchPlayerPayload(steamid64);
      shadow.innerHTML = await buildLeftShadowDoc(payload);

      const reload = shadow.getElementById("csstats_reload_left");
      if (reload) {
        reload.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          renderLeft(steamid64);
        });
      }
    } catch (e) {
      shadow.innerHTML = `<div class="csstats_shell_loading">Failed: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
    }
  }

  function csStatsStatsUrl(steamid64) {
    return `https://csstats.gg/player/${steamid64}/stats`;
  }

  function xPlayerUrl(steamid64) {
    return `https://xsteamcommunity.com/player/${steamid64}`;
  }

  function normalizeHeader(s) {
    return (s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace("hs %", "hs%")
      .replace(/^hs$/, "hs%");
  }

  function findMatchesTable(doc) {
    const tables = [...doc.querySelectorAll("table")];
    let best = null;
    let bestScore = -1;

    for (const t of tables) {
      const ths = [...t.querySelectorAll("thead th")].map((x) => normalizeHeader(x.textContent));
      if (!ths.length) continue;

      const rows = t.querySelectorAll("tbody tr").length;
      const hasK = ths.includes("k");
      const hasD = ths.includes("d");
      const hasAdr = ths.includes("adr");
      const hasRating = ths.some((x) => x.includes("rating"));

      let score = 0;
      if (hasK) score += 2;
      if (hasD) score += 2;
      if (hasAdr) score += 3;
      if (hasRating) score += 1;
      score += Math.min(10, Math.floor(rows / 10));

      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }

    if (!best) return null;

    const thsBest = [...best.querySelectorAll("thead th")].map((x) => normalizeHeader(x.textContent));
    if (!(thsBest.includes("k") && thsBest.includes("d") && thsBest.includes("adr"))) return null;

    return best;
  }

  function buildKeepIdx(table) {
    const want = new Set(["date", "hs%", "adr", "rating"]);
    const ths = [...table.querySelectorAll("thead th")].map((x) => normalizeHeader(x.textContent));

    const keep = [];
    for (let i = 0; i < ths.length; i++) {
      if (want.has(ths[i])) keep.push(i);
    }

    if (keep.length < 3 && ths.length >= 20) return [0, 9, 10, 19];

    return [...new Set(keep)].sort((a, b) => a - b);
  }

  function slimTable(table, keepIdx, limit) {
    const t = table.cloneNode(true);

    const theadRow = t.querySelector("thead tr");
    if (theadRow) {
      [...theadRow.children].forEach((cell, idx) => {
        if (!keepIdx.includes(idx)) cell.remove();
      });
    }

    const tbody = t.querySelector("tbody");
    if (tbody) {
      const rows = [...tbody.querySelectorAll("tr")];
      rows.forEach((tr, rIdx) => {
        if (rIdx >= limit) {
          tr.remove();
          return;
        }

        [...tr.children].forEach((cell, idx) => {
          if (!keepIdx.includes(idx)) cell.remove();
        });

        tr.removeAttribute("onclick");
        tr.style.cursor = "";
      });
    }

    return t;
  }

  async function fetchMatchesPayload(steamid64) {
    const xBase = xPlayerUrl(steamid64);
    const mainHtml = await gmGet(xBase);
    const mainDoc = new DOMParser().parseFromString(mainHtml, "text/html");

    const cssLinks = [...mainDoc.querySelectorAll('link[rel="stylesheet"][href]')]
      .map((x) => absUrl(xBase, x.getAttribute("href")))
      .filter(Boolean);

    const statsHtml = await gmGet(csStatsStatsUrl(steamid64));
    const statsDoc = new DOMParser().parseFromString(statsHtml, "text/html");

    const table = findMatchesTable(statsDoc);
    if (!table) throw new Error("matches table not found");

    const keepIdx = buildKeepIdx(table);
    const slim = slimTable(table, keepIdx, MATCH_ROW_LIMIT);

    return { cssLinks, tableHtml: slim.outerHTML };
  }

  async function buildRightShadowDoc(payload) {
    const cssList = await Promise.all(payload.cssLinks.map(fetchCssText));
    const cssText = cssList.filter(Boolean).join("\n\n");

    const extra = `
      :host{
        display:block;
        color:#dcdedf;
        color-scheme:dark;
        font-family:Arial, Helvetica, sans-serif;
      }

      .csstats_root{
        display:block;
        color:inherit;
        position:relative;
        overflow:visible !important;
      }

      table{ width:100% !important; }
      thead th, tbody td{ white-space:nowrap; }
      table, thead, tbody, tr, th, td{ font-size:12px !important; }

      th, td, span, div{ color:#dcdedf !important; }

      thead th{ padding-top:6px !important; padding-bottom:6px !important; }
      tbody td{ padding-top:6px !important; padding-bottom:6px !important; }
    `;

    return `
      <style>${cssText}\n\n${extra}</style>
      <div class="csstats_shell">
        <div class="csstats_shell_hd">
          <div class="csstats_shell_actions">
            <a class="csstats_shell_link" href="javascript:void(0)" id="csstats_reload_right">Reload</a>
          </div>
        </div>
        <div class="csstats_root">
          ${payload.tableHtml}
        </div>
      </div>
    `.trim();
  }

  async function renderRight(steamid64) {
    const host = ensureHost(RIGHT_HOST_ID);
    if (!host) return;

    if (!host.shadowRoot) host.attachShadow({ mode: "open" });

    const shadow = host.shadowRoot;
    shadow.innerHTML = `<div class="csstats_shell_loading">Loading matches…</div>`;

    try {
      const payload = await fetchMatchesPayload(steamid64);
      shadow.innerHTML = await buildRightShadowDoc(payload);

      const reload = shadow.getElementById("csstats_reload_right");
      if (reload) {
        reload.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          renderRight(steamid64);
        });
      }
    } catch (e) {
      shadow.innerHTML = `<div class="csstats_shell_loading">Failed: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
    }
  }

  function injectAll() {
    if (!isProfilePage()) return;

    injectButton();

    const steamid64 = getSteamId64();
    if (!steamid64) return;

    const leftHost = ensureHost(LEFT_HOST_ID);
    const rightHost = ensureHost(RIGHT_HOST_ID);
    if (!leftHost || !rightHost) return;

    if (!leftHost.shadowRoot || leftHost.shadowRoot.childNodes.length === 0) {
      renderLeft(steamid64);
    }

    if (!rightHost.shadowRoot || rightHost.shadowRoot.childNodes.length === 0) {
      renderRight(steamid64);
    }
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectAll();
    });
  }

  function boot() {
    injectAll();

    const root = document.querySelector(".profile_header") || document.body;
    const mo = new MutationObserver(() => scheduleInject());
    mo.observe(root, { childList: true, subtree: true });

    window.addEventListener("resize", () => scheduleInject(), { passive: true });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    window.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
