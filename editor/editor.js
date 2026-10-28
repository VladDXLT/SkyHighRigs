/* =========================================================
   SkyHighRigs visual editor
   ---------------------------------------------------------
   Open index.html on your computer (Chrome or Edge works best)
   and click "Edit site" in the bottom-left corner.

   - Click anything to select it. Type to change text.
   - Top bar: font, size, bold/italic/underline, color, alignment.
   - Right panel: spacing, colors, links, media, sections,
     inventory (rental gear), settings and theme.
   - Media tab: connect your SkyHighRigs folder once, drop files
     in, then drag them onto any placeholder.
   - Save writes straight back into index.html (Cmd/Ctrl + S).

   The editor only appears when the page is opened from a file,
   from localhost, or with ?edit in the URL. Visitors never see it.
   ========================================================= */
(function () {
  "use strict";
  if (window.__shrEditor) return;
  window.__shrEditor = true;

  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";
  var BASE = SCRIPT_SRC ? SCRIPT_SRC.replace(/[^/]*$/, "") : "editor/";
  var canEdit = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname) || /[?&]edit\b/.test(location.search);
  if (!canEdit) return;

  var SHR = window.SHR || {};
  var FONTS = [
    ["Unbounded", "sans-serif"], ["Archivo", "sans-serif"], ["Manrope", "sans-serif"], ["IBM Plex Mono", "monospace"],
    ["Barlow Condensed", "sans-serif"], ["Inter", "sans-serif"],
    ["Anton", "sans-serif"], ["Archivo", "sans-serif"], ["Archivo Black", "sans-serif"], ["Bebas Neue", "sans-serif"],
    ["DM Sans", "sans-serif"], ["Exo 2", "sans-serif"], ["Montserrat", "sans-serif"], ["Orbitron", "sans-serif"],
    ["Oswald", "sans-serif"], ["Playfair Display", "serif"], ["Poppins", "sans-serif"], ["Roboto", "sans-serif"],
    ["Rubik", "sans-serif"], ["Russo One", "sans-serif"], ["Saira Condensed", "sans-serif"], ["Space Grotesk", "sans-serif"],
    ["Teko", "sans-serif"], ["Georgia", "serif"], ["Arial", "sans-serif"]
  ];
  var SYSTEM_FONTS = ["Georgia", "Arial"];
  var BASE_FONTS = ["Unbounded", "Archivo", "Manrope", "IBM Plex Mono"];
  var MEDIA_RE = /\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i;
  var VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
  var INLINE_TAGS = /^(B|STRONG|I|EM|U|S|SPAN|SMALL|BR|A|SUP|SUB|MARK|CODE|WBR)$/;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }

  /* ---------------- IndexedDB (remembers your project folder) ---------------- */
  function idb() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open("shr-editor", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = res; }); }).catch(function () {}); }

  /* ---------------- State ---------------- */
  var ED = { on: false, sel: null, hover: null, dirty: false, tab: "element", dir: null, media: [], fallbackMedia: [], lastRange: null, undo: [], redo: [], invCat: "containers", invOpen: null, backedUp: false };
  var FS_OK = "showDirectoryPicker" in window;
  var ui = {};

  /* ---------------- Launcher ---------------- */
  var launch = h('<button id="shr-launch" data-shr-ui type="button">✎ Edit site</button>');
  addEditorCSS();
  document.body.appendChild(launch);
  launch.addEventListener("click", enter);
  if (ssGet("shr-editing") === "1") enter();

  function addEditorCSS() {
    if ($("#shr-editor-css")) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = BASE + "editor.css"; l.id = "shr-editor-css"; l.setAttribute("data-shr-ui", "");
    document.head.appendChild(l);
  }
  function addEditFonts() {
    if ($("#shr-edit-fonts")) return;
    // plain family requests: not every font has every weight
    var fam = FONTS.filter(function (f) { return SYSTEM_FONTS.indexOf(f[0]) < 0 && BASE_FONTS.indexOf(f[0]) < 0; }).map(function (f) { return "family=" + f[0].replace(/ /g, "+"); });
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.id = "shr-edit-fonts"; l.setAttribute("data-shr-ui", "");
    l.href = "https://fonts.googleapis.com/css2?" + fam.join("&") + "&display=swap";
    document.head.appendChild(l);
  }

  /* ---------------- Enter / exit ---------------- */
  function enter() {
    if (ED.on) return;
    ED.on = true;
    ssSet("shr-editing", "1");
    launch.style.display = "none";
    document.body.classList.add("shr-editing");
    if (SHR.stopReveal) SHR.stopReveal();
    if (SHR.closeModal) SHR.closeModal();
    addEditFonts();
    $$("details").forEach(function (d) { if (!d.open) { d.open = true; d.setAttribute("data-shr-opened", ""); } });
    buildUI();
    ED.undo = [snapshot()];
    restoreFolder();
    bindContent(true);
    setStatus();
  }
  function exit() {
    if (ED.dirty && !confirm("You have unsaved changes. Exit the editor anyway? (They stay on the page until you reload.)")) return;
    deselect();
    ED.on = false;
    ssSet("shr-editing", null);
    bindContent(false);
    if (ui.root) ui.root.remove();
    document.body.classList.remove("shr-editing", "shr-panel-closed", "shr-preview");
    $$("[data-shr-opened]").forEach(function (d) { d.open = false; d.removeAttribute("data-shr-opened"); });
    launch.style.display = "";
  }

  /* ---------------- UI ---------------- */
  function fontOptions(sel) {
    return '<option value="">Font…</option>' + FONTS.map(function (f) { return '<option value="' + f[0] + '"' + (sel === f[0] ? " selected" : "") + ' style="font-family:\'' + f[0] + '\'">' + f[0] + "</option>"; }).join("");
  }
  function buildUI() {
    ui.root = h('<div id="shr-ui" data-shr-ui></div>');
    ui.bar = h(
      '<div id="shr-bar">' +
      '<div class="shr-logo">✎ SkyHigh<b>Rigs</b> Editor</div>' +
      '<button class="shr-btn" data-act="undo" title="Undo (Cmd/Ctrl+Z)">↶</button>' +
      '<button class="shr-btn" data-act="redo" title="Redo (Cmd/Ctrl+Shift+Z)">↷</button>' +
      '<span class="shr-sep"></span>' +
      '<select data-tb="font" title="Font">' + fontOptions("") + "</select>" +
      '<button class="shr-btn" data-act="size-down" title="Smaller">A−</button>' +
      '<input type="number" data-tb="size" title="Font size (px)" min="6" max="200">' +
      '<button class="shr-btn" data-act="size-up" title="Bigger">A+</button>' +
      '<span class="shr-sep"></span>' +
      '<button class="shr-btn" data-act="bold" title="Bold"><b>B</b></button>' +
      '<button class="shr-btn" data-act="italic" title="Italic"><i>I</i></button>' +
      '<button class="shr-btn" data-act="underline" title="Underline"><u>U</u></button>' +
      '<button class="shr-btn" data-act="upper" title="UPPERCASE on/off">Aa</button>' +
      '<input type="color" data-tb="color" title="Text color">' +
      '<span class="shr-sep"></span>' +
      '<button class="shr-btn" data-act="align" data-v="left" title="Align left">⇤</button>' +
      '<button class="shr-btn" data-act="align" data-v="center" title="Center">≡</button>' +
      '<button class="shr-btn" data-act="align" data-v="right" title="Align right">⇥</button>' +
      '<button class="shr-btn" data-act="link" title="Link">🔗</button>' +
      '<span class="shr-grow"></span>' +
      '<span id="shr-status"></span>' +
      '<button class="shr-btn" data-act="preview" title="Preview without editor">👁 Preview</button>' +
      '<button class="shr-btn primary" data-act="save" title="Save to index.html (Cmd/Ctrl+S)">Save</button>' +
      '<button class="shr-btn ghost" data-act="exit" title="Exit editor">✕</button>' +
      "</div>"
    );
    ui.panel = h(
      '<div id="shr-panel">' +
      '<div class="shr-tabs">' +
      tabBtn("element", "✎", "Element") + tabBtn("media", "🖼", "Media") + tabBtn("sections", "☰", "Sections") +
      tabBtn("inventory", "🪂", "Gear") + tabBtn("settings", "⚙", "Settings") + tabBtn("help", "?", "Help") +
      '</div><div class="shr-body" id="shr-body"></div></div>'
    );
    ui.toggle = h('<button id="shr-panel-toggle" class="shr-btn" title="Show/hide panel">⟩</button>');
    ui.mini = h('<div id="shr-mini"><span class="tag"></span>' +
      '<button data-mini="parent" title="Select parent">⬑</button>' +
      '<button data-mini="drag" class="drag" title="Drag to move">✥</button>' +
      '<button data-mini="up" title="Move up / left">↑</button>' +
      '<button data-mini="down" title="Move down / right">↓</button>' +
      '<button data-mini="dup" title="Duplicate">⧉</button>' +
      '<button data-mini="del" title="Delete">🗑</button></div>');
    ui.dropline = h('<div id="shr-dropline"></div>');
    ui.toast = h('<div id="shr-toast"></div>');
    ui.pill = h('<button id="shr-preview-pill" class="shr-btn primary" data-act="preview">← Back to editing</button>');
    [ui.bar, ui.panel, ui.toggle, ui.mini, ui.dropline, ui.toast, ui.pill].forEach(function (n) { ui.root.appendChild(n); });
    document.body.appendChild(ui.root);
    ui.body = $("#shr-body");
    ui.status = $("#shr-status");

    ui.root.addEventListener("mousedown", function (e) {
      // keep text selection alive when clicking toolbar buttons
      if (e.target.closest("button") && !e.target.closest(".shr-body")) e.preventDefault();
    });
    ui.root.addEventListener("click", onUIClick);
    ui.bar.addEventListener("change", onBarChange);
    ui.bar.addEventListener("input", function (e) { if (e.target.matches('[data-tb="color"]')) applyStyle({ color: e.target.value }, true); });
    ui.toggle.addEventListener("click", function () { document.body.classList.toggle("shr-panel-closed"); ui.toggle.textContent = document.body.classList.contains("shr-panel-closed") ? "⟨" : "⟩"; });
    ui.mini.addEventListener("mousedown", onMiniDown);
    renderPanel();
  }
  function tabBtn(id, icon, label) { return '<button class="shr-tab' + (ED.tab === id ? " on" : "") + '" data-tab="' + id + '"><span>' + icon + "</span>" + label + "</button>"; }

  function toast(msg, err, ms) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.classList.toggle("err", !!err);
    ui.toast.classList.add("show");
    clearTimeout(ui.toastT);
    ui.toastT = setTimeout(function () { ui.toast.classList.remove("show"); }, ms || 2800);
  }
  function setStatus(msg) {
    if (!ui.status) return;
    ui.status.textContent = msg || (ED.dirty ? "● Unsaved changes" : ED.dir ? "✓ Saved · folder connected" : "Folder not connected");
    ui.status.classList.toggle("dirty", ED.dirty && !msg);
  }

  /* ---------------- Content binding ---------------- */
  function bindContent(on) {
    var m = on ? "addEventListener" : "removeEventListener";
    document[m]("mouseover", onHover, true);
    document[m]("mouseout", onOut, true);
    document[m]("click", onContentClick, true);
    document[m]("input", onContentInput, true);
    document[m]("paste", onPaste, true);
    document[m]("keydown", onKey, true);
    document[m]("selectionchange", onSelChange);
    document[m]("dragover", onDragOver, true);
    document[m]("dragleave", onDragLeave, true);
    document[m]("drop", onDrop, true);
    window[m]("scroll", placeMini, true);
    window[m]("resize", placeMini);
    window[m]("beforeunload", onUnload);
  }
  function onUnload(e) { if (ED.dirty) { e.preventDefault(); e.returnValue = ""; } }

  function inUI(el) { return !!(el && el.closest && el.closest("[data-shr-ui]")); }
  function roots() { return [$("#site-header"), $("main"), $(".site-footer")].filter(Boolean); }
  function inContent(el) { return roots().some(function (r) { return r.contains(el); }); }
  function selectable(t) {
    if (!t || t.nodeType !== 1) t = t && t.parentElement;
    if (!t || inUI(t) || !inContent(t)) return null;
    var lock = t.closest("[data-generated], [data-noedit]");
    if (lock) return lock;
    var svg = t.closest("svg"); if (svg) t = svg;
    var slot = t.closest(".media-slot"); if (slot) return slot;
    if (t.tagName === "MAIN") return null;
    return t;
  }
  function isText(el) {
    if (!el || el.matches(".media-slot, svg, img, video, input, select, textarea, form, [data-generated], [data-noedit], main, section, header, footer")) return false;
    if (!el.textContent.trim()) return false;
    var kids = el.querySelectorAll("*");
    for (var i = 0; i < kids.length; i++) if (!INLINE_TAGS.test(kids[i].tagName) && kids[i].tagName !== "svg") return false;
    return true;
  }

  function onHover(e) {
    if (document.body.classList.contains("shr-preview") || ED.dragging) return;
    var el = selectable(e.target);
    if (ED.hover && ED.hover !== el) ED.hover.classList.remove("shr-hover");
    ED.hover = el;
    if (el && el !== ED.sel) el.classList.add("shr-hover");
  }
  function onOut(e) { if (ED.hover && !ED.hover.contains(e.relatedTarget)) { ED.hover.classList.remove("shr-hover"); ED.hover = null; } }

  function onContentClick(e) {
    if (document.body.classList.contains("shr-preview")) return;
    var t = e.target;
    if (inUI(t)) return;
    if (!inContent(t)) {
      if (!t.closest(".modal")) deselect();
      return;
    }
    var gen = t.closest("[data-generated]");
    var a = t.closest("a"); if (a && !gen) e.preventDefault();
    if (t.closest("summary")) e.preventDefault();
    var el = selectable(t);
    if (!el) return;
    if (gen) { if (ED.sel !== gen) select(gen); return; } // let the rig builder keep working
    if (t.closest("[data-noedit]") && t.closest("button, input, select, textarea, label")) e.preventDefault();
    if (el === ED.sel) return; // clicking inside the selected text: place caret
    if (e.target.closest("button") && !gen) e.preventDefault();
    select(el);
  }

  function select(el) {
    if (ED.sel === el) return;
    deselect();
    ED.sel = el;
    ED.lastRange = null;
    el.classList.remove("shr-hover");
    el.classList.add("shr-selected");
    if (isText(el)) {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "true");
      if (!el.matches(":focus")) el.focus({ preventScroll: true });
    }
    placeMini();
    syncBar();
    if (ED.tab !== "element" && !ED.keepTab) switchTab("element"); else if (ED.tab === "element") renderPanel();
  }
  function deselect() {
    var el = ED.sel;
    if (el) {
      el.classList.remove("shr-selected");
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
      if (!el.getAttribute("class")) el.removeAttribute("class");
    }
    ED.sel = null;
    ED.lastRange = null;
    if (ui.mini) ui.mini.classList.remove("show");
    if (ED.tab === "element" && ui.body) renderPanel();
  }

  function placeMini() {
    if (!ED.sel || !ui.mini || !document.contains(ED.sel)) { if (ui.mini) ui.mini.classList.remove("show"); return; }
    var r = ED.sel.getBoundingClientRect();
    var bar = 54, top = r.top - 34;
    if (top < bar + 4) top = Math.min(r.bottom + 4, window.innerHeight - 40);
    if (top < bar + 4) top = bar + 4;
    ui.mini.style.top = top + "px";
    ui.mini.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 380)) + "px";
    $(".tag", ui.mini).textContent = label(ED.sel);
    ui.mini.classList.add("show");
  }
  function label(el) {
    if (!el) return "";
    if (el.hasAttribute("data-section")) return el.getAttribute("data-section");
    if (el.matches(".media-slot")) return "media";
    if (el.matches("[data-generated]")) return el.id === "rig-builder" ? "rig builder" : "gear grid";
    if (el.matches(".btn")) return "button";
    var map = { H1: "title", H2: "heading", H3: "heading", H4: "heading", P: "text", A: "link", LI: "list item", UL: "list", IMG: "image", SPAN: "text", DIV: "box", ARTICLE: "card", NAV: "menu", svg: "icon", FORM: "form" };
    return map[el.tagName] || el.tagName.toLowerCase();
  }

  function onContentInput(e) {
    if (!ED.on || inUI(e.target)) return;
    if (e.target.closest && e.target.closest("[data-generated], form")) return;
    markDirty(true);
  }
  function onPaste(e) {
    var host = e.target.closest && e.target.closest('[contenteditable="true"]');
    if (!host || inUI(host)) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  }
  function onSelChange() {
    if (!ED.sel) return;
    var s = window.getSelection();
    if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    if (ED.sel.contains(r.commonAncestorContainer)) ED.lastRange = r.collapsed ? null : r.cloneRange();
  }
  function onKey(e) {
    if (!ED.on) return;
    var mod = e.metaKey || e.ctrlKey;
    var inField = e.target.matches && e.target.matches("input, textarea, select");
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (mod && e.key.toLowerCase() === "z" && !inField) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y" && !inField) { e.preventDefault(); redo(); return; }
    if (e.key === "Escape" && ED.sel) { deselect(); return; }
    var editing = e.target.isContentEditable;
    if (!editing && !inField && ED.sel && (e.key === "Delete" || e.key === "Backspace") && !inUI(e.target)) { e.preventDefault(); removeSel(); }
  }

  /* ---------------- Styling ---------------- */
  function selRange() {
    var r = ED.lastRange;
    if (r && !r.collapsed && ED.sel && ED.sel.contains(r.commonAncestorContainer) && ED.sel.isContentEditable) return r;
    return null;
  }
  function wrapRange(r, styles) {
    var span = document.createElement("span");
    Object.keys(styles).forEach(function (k) { span.style[k] = styles[k]; });
    span.appendChild(r.extractContents());
    // drop the same property from nested spans so the new value wins
    $$("span", span).forEach(function (s) { Object.keys(styles).forEach(function (k) { s.style[k] = ""; }); if (!s.getAttribute("style")) s.removeAttribute("style"); });
    r.insertNode(span);
    var nr = document.createRange(); nr.selectNodeContents(span);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(nr);
    ED.lastRange = nr.cloneRange();
    return span;
  }
  /* Apply styles to the highlighted text if any, otherwise to the selected element. */
  function applyStyle(styles, live) {
    if (!ED.sel) { toast("Select something on the page first"); return; }
    var r = selRange();
    if (r) wrapRange(r, styles);
    else Object.keys(styles).forEach(function (k) { ED.sel.style[k] = styles[k]; });
    if (styles.fontFamily) ensureFont(styles.fontFamily);
    markDirty(!live);
    placeMini();
    if (!live && ED.tab === "element") renderPanel();
  }
  function applyEl(prop, val, live) {
    if (!ED.sel) return;
    ED.sel.style[prop] = val;
    markDirty(!live);
    placeMini();
  }
  function execText(cmd, val) {
    var r = selRange();
    if (!r) return false;
    ED.sel.focus({ preventScroll: true });
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(cmd, false, val);
    markDirty(true);
    return true;
  }
  function toggleBold() {
    if (execText("bold")) return;
    if (!ED.sel) return;
    var w = parseInt(getComputedStyle(ED.sel).fontWeight, 10);
    ED.sel.style.fontWeight = w >= 600 ? "400" : "800";
    markDirty(true); renderIfElement();
  }
  function toggleItalic() {
    if (execText("italic")) return;
    if (!ED.sel) return;
    ED.sel.style.fontStyle = getComputedStyle(ED.sel).fontStyle === "italic" ? "normal" : "italic";
    markDirty(true);
  }
  function toggleUnderline() {
    if (execText("underline")) return;
    if (!ED.sel) return;
    ED.sel.style.textDecoration = /underline/.test(getComputedStyle(ED.sel).textDecorationLine) ? "none" : "underline";
    markDirty(true);
  }
  function toggleUpper() {
    if (!ED.sel) return;
    ED.sel.style.textTransform = getComputedStyle(ED.sel).textTransform === "uppercase" ? "none" : "uppercase";
    markDirty(true); renderIfElement();
  }
  function bumpSize(d) {
    if (!ED.sel) return;
    var cur = parseFloat(getComputedStyle(ED.sel).fontSize) || 16;
    applyStyle({ fontSize: Math.max(6, Math.round(cur + d)) + "px" });
    syncBar();
  }
  function renderIfElement() { if (ED.tab === "element") renderPanel(); syncBar(); }

  function ensureFont(stack) {
    var name = String(stack).split(",")[0].replace(/["']/g, "").trim();
    if (!name || SYSTEM_FONTS.indexOf(name) >= 0) return;
    // fonts are all loaded while editing; saved page gets them via #shr-fonts (built on save)
  }
  function fontStack(name) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i][0] === name) return '"' + name + '", ' + FONTS[i][1];
    return name;
  }
  function rgbToHex(c) {
    var m = String(c).match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return "#000000";
    if (m.length > 3 && Number(m[3]) === 0) return "";
    return "#" + m.slice(0, 3).map(function (x) { return ("0" + Math.round(Number(x)).toString(16)).slice(-2); }).join("");
  }
  function syncBar() {
    if (!ui.bar) return;
    var el = ED.sel, cs = el ? getComputedStyle(el) : null;
    $('[data-tb="size"]', ui.bar).value = cs ? Math.round(parseFloat(cs.fontSize)) : "";
    if (cs) $('[data-tb="color"]', ui.bar).value = rgbToHex(cs.color) || "#000000";
    var fam = cs ? cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() : "";
    $('[data-tb="font"]', ui.bar).value = FONTS.some(function (f) { return f[0] === fam; }) ? fam : "";
    $$('[data-act="align"]', ui.bar).forEach(function (b) { b.classList.toggle("on", !!cs && (cs.textAlign === b.getAttribute("data-v") || (cs.textAlign === "start" && b.getAttribute("data-v") === "left"))); });
    $('[data-act="bold"]', ui.bar).classList.toggle("on", !!cs && parseInt(cs.fontWeight, 10) >= 600);
    $('[data-act="italic"]', ui.bar).classList.toggle("on", !!cs && cs.fontStyle === "italic");
    $('[data-act="upper"]', ui.bar).classList.toggle("on", !!cs && cs.textTransform === "uppercase");
  }
  function onBarChange(e) {
    var t = e.target, k = t.getAttribute("data-tb");
    if (k === "font" && t.value) applyStyle({ fontFamily: fontStack(t.value) });
    else if (k === "size" && t.value) applyStyle({ fontSize: t.value + "px" });
    else if (k === "color") applyStyle({ color: t.value });
  }

  /* ---------------- Toolbar & panel clicks ---------------- */
  function onUIClick(e) {
    var b = e.target.closest("[data-act], [data-tab]");
    if (!b) return;
    if (b.hasAttribute("data-tab")) { switchTab(b.getAttribute("data-tab")); return; }
    var a = b.getAttribute("data-act"), v = b.getAttribute("data-v");
    switch (a) {
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "save": save(); break;
      case "exit": exit(); break;
      case "preview": togglePreview(); break;
      case "bold": toggleBold(); break;
      case "italic": toggleItalic(); break;
      case "underline": toggleUnderline(); break;
      case "upper": toggleUpper(); break;
      case "size-up": bumpSize(2); break;
      case "size-down": bumpSize(-2); break;
      case "align": if (ED.sel) { applyEl("textAlign", v); syncBar(); renderIfElement(); } break;
      case "link": editLink(); break;
      default: panelAction(a, b, e);
    }
  }
  function togglePreview() {
    var on = document.body.classList.toggle("shr-preview");
    if (on) { deselect(); toast("Preview mode. Click “Back to editing” at the top when done."); }
  }
  function editLink() {
    if (!ED.sel) { toast("Select a button or text first"); return; }
    var a = ED.sel.closest("a") || (ED.sel.tagName === "A" ? ED.sel : null);
    var r = selRange();
    var cur = a ? a.getAttribute("href") : "";
    var url = prompt("Link address (https://…, #section-id, mailto:…, tel:…). Leave empty to remove the link.", cur || "https://");
    if (url === null) return;
    if (a) { if (url) a.setAttribute("href", url); else if (!a.classList.contains("btn")) a.replaceWith.apply(a, Array.prototype.slice.call(a.childNodes)); }
    else if (r && url) { execText("createLink", url); }
    else if (url) { var na = document.createElement("a"); na.href = url; ED.sel.parentNode.insertBefore(na, ED.sel); na.appendChild(ED.sel); }
    markDirty(true); renderIfElement();
  }

  function switchTab(t) {
    ED.tab = t;
    $$(".shr-tab", ui.panel).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === t); });
    if (document.body.classList.contains("shr-panel-closed")) ui.toggle.click();
    renderPanel();
  }
  function renderPanel() {
    if (!ui.body) return;
    var t = ED.tab;
    if (t === "element") renderElementTab();
    else if (t === "media") renderMediaTab();
    else if (t === "sections") renderSectionsTab();
    else if (t === "inventory") renderInventoryTab();
    else if (t === "settings") renderSettingsTab();
    else renderHelpTab();
  }

  /* ---------------- Element tab ---------------- */
  function px(v) { var n = parseFloat(v); return isNaN(n) ? "" : Math.round(n); }
  function renderElementTab() {
    var el = ED.sel;
    if (!el || !document.contains(el)) {
      ui.body.innerHTML = '<div class="shr-empty"><b>Click anything on the page</b>Text, buttons, photos, cards or whole sections. Then style it here or with the top bar.<br><br>Tip: highlight a few words first to style only those words.</div>';
      return;
    }
    var cs = getComputedStyle(el);
    var isSlot = el.matches(".media-slot"), isGen = el.matches("[data-generated]");
    var link = el.tagName === "A" ? el : null;
    var html = '<div class="shr-card"><div class="shr-sel-name"><span>' + esc(label(el)) + '</span><code>&lt;' + el.tagName.toLowerCase() + "&gt;</code></div>" +
      (isGen ? '<p class="shr-muted" style="margin:8px 0 0">This part is built from your gear list. Edit the gear in the <b>Gear</b> tab.</p>' : "") +
      (isText(el) ? '<p class="shr-muted" style="margin:8px 0 0">Type directly on the page to change the text.</p>' : "") + "</div>";

    if (isSlot) html += mediaControls(el);

    if (!isSlot) {
      html += '<div class="shr-h">Text</div>' +
        '<div class="shr-row"><label>Font</label><select data-pf="fontFamily">' + fontOptions(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim()) + "</select></div>" +
        '<div class="shr-row"><label>Size</label><input type="range" min="8" max="140" data-pr="fontSize" data-unit="px" value="' + px(cs.fontSize) + '"><input class="shr-num" type="number" data-pn="fontSize" data-unit="px" value="' + px(cs.fontSize) + '"></div>' +
        '<div class="shr-row"><label>Weight</label><select data-pe="fontWeight">' + [300, 400, 500, 600, 700, 800, 900].map(function (w) { return "<option" + (Number(cs.fontWeight) === w ? " selected" : "") + ">" + w + "</option>"; }).join("") + "</select></div>" +
        '<div class="shr-row"><label>Color</label><input type="color" data-pc="color" value="' + (rgbToHex(cs.color) || "#000000") + '"><button class="shr-btn" data-act="clear-prop" data-v="color">Reset</button></div>' +
        '<div class="shr-row"><label>Align</label><div class="shr-seg">' + ["left", "center", "right", "justify"].map(function (a) { return '<button class="shr-btn' + (cs.textAlign === a || (a === "left" && cs.textAlign === "start") ? " on" : "") + '" data-act="align" data-v="' + a + '">' + { left: "Left", center: "Center", right: "Right", justify: "Justify" }[a] + "</button>"; }).join("") + "</div></div>" +
        '<div class="shr-row"><label>Case</label><select data-pe="textTransform">' + ["none", "uppercase", "lowercase", "capitalize"].map(function (o) { return "<option" + (cs.textTransform === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div>" +
        '<div class="shr-row"><label>Line height</label><input type="range" min="0.8" max="2.6" step="0.05" data-pr="lineHeight" value="' + (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) || 1.4).toFixed(2) + '"></div>' +
        '<div class="shr-row"><label>Letter space</label><input type="range" min="-0.08" max="0.4" step="0.01" data-pr="letterSpacing" data-unit="em" value="' + ((parseFloat(cs.letterSpacing) || 0) / parseFloat(cs.fontSize)).toFixed(2) + '"></div>';
    }

    html += '<div class="shr-h">Spacing</div>' +
      '<div class="shr-grid2">' +
      numField("Space above", "marginTop", cs.marginTop) + numField("Space below", "marginBottom", cs.marginBottom) +
      numField("Padding top/bottom", "paddingBlock", cs.paddingTop) + numField("Padding sides", "paddingInline", cs.paddingLeft) +
      numField("Max width", "maxWidth", el.style.maxWidth || "", "auto") + numField(isSlot ? "Height" : "Min height", isSlot ? "height" : "minHeight", el.style.height || el.style.minHeight || "", "auto") +
      "</div>" +
      '<div class="shr-row"><label>Position</label><div class="shr-seg"><button class="shr-btn" data-act="place" data-v="left">Left</button><button class="shr-btn" data-act="place" data-v="center">Center</button><button class="shr-btn" data-act="place" data-v="right">Right</button></div></div>';

    html += '<div class="shr-h">Look</div>' +
      '<div class="shr-row"><label>Background</label><input type="color" data-pc="backgroundColor" value="' + (rgbToHex(cs.backgroundColor) || "#ffffff") + '"><button class="shr-btn" data-act="clear-prop" data-v="backgroundColor">Reset</button></div>' +
      '<div class="shr-row"><label>Corners</label><input type="range" min="0" max="60" data-pr="borderRadius" data-unit="px" value="' + px(cs.borderTopLeftRadius) + '"></div>' +
      '<div class="shr-row"><label>Opacity</label><input type="range" min="0.1" max="1" step="0.05" data-pr="opacity" value="' + cs.opacity + '"></div>';

    if (link || el.closest("a")) {
      var a = link || el.closest("a");
      html += '<div class="shr-h">Link</div>' +
        '<div class="shr-field"><span>Goes to (https://…, #rent, mailto:…, tel:…)</span><input data-link="href" value="' + esc(a.getAttribute("href") || "") + '"></div>' +
        '<label class="shr-row"><input type="checkbox" data-link="blank"' + (a.target === "_blank" ? " checked" : "") + "> Open in a new tab</label>";
    }

    html += '<div class="shr-h">Arrange</div>' +
      '<div class="shr-seg" style="margin-bottom:8px"><button class="shr-btn" data-act="mv-up">↑ Move up</button><button class="shr-btn" data-act="mv-down">↓ Move down</button></div>' +
      '<div class="shr-seg" style="margin-bottom:8px"><button class="shr-btn" data-act="sel-parent">⬑ Select parent</button><button class="shr-btn" data-act="dup">⧉ Duplicate</button></div>' +
      '<div class="shr-seg"><button class="shr-btn" data-act="clear-styles">Reset styles</button><button class="shr-btn" data-act="del" style="color:#ff8a8a">🗑 Delete</button></div>' +
      '<p class="shr-muted" style="margin-top:8px">Or grab ✥ on the blue tag above the element and drag it anywhere.</p>';

    if (!isGen) {
      html += '<div class="shr-h">Add after this</div><div class="shr-seg">' +
        '<button class="shr-btn" data-act="add" data-v="h2">Heading</button><button class="shr-btn" data-act="add" data-v="p">Text</button>' +
        '<button class="shr-btn" data-act="add" data-v="btn">Button</button><button class="shr-btn" data-act="add" data-v="media">Photo/Video</button>' +
        '<button class="shr-btn" data-act="add" data-v="spacer">Spacer</button></div>';
    }
    ui.body.innerHTML = html;
    bindPanelInputs();
  }
  function numField(lbl, prop, val, ph) {
    return '<label class="shr-field"><span>' + lbl + ' (px)</span><input type="number" data-pn="' + prop + '" data-unit="px" value="' + (val === "" ? "" : px(val)) + '" placeholder="' + (ph || "0") + '"></label>';
  }
  function mediaControls(el) {
    var child = el.querySelector("img, video");
    var src = child ? child.getAttribute("src") : "";
    var fit = child ? (child.style.objectFit || "cover") : "cover";
    var pos = child ? (child.style.objectPosition || "center") : "center";
    var html = '<div class="shr-h">Media</div>';
    html += src ? '<p class="shr-muted">Showing <b>' + esc(src.length > 60 ? src.slice(0, 57) + "…" : src) + "</b></p>" : '<p class="shr-muted">Empty placeholder. Drag a file from the Media tab (or from your computer) onto it, or pick one below.</p>';
    html += '<div class="shr-field"><span>Placeholder label</span><input data-slotlabel value="' + esc(el.getAttribute("data-label") || "") + '"></div>';
    if (child) {
      html += '<div class="shr-row"><label>Fit</label><select data-mfit="objectFit"><option value="cover"' + (fit === "cover" ? " selected" : "") + '>Fill (crop)</option><option value="contain"' + (fit === "contain" ? " selected" : "") + ">Fit whole</option></select></div>" +
        '<div class="shr-row"><label>Focus</label><select data-mfit="objectPosition">' + ["center", "top", "bottom", "left", "right"].map(function (p) { return "<option" + (pos === p ? " selected" : "") + ">" + p + "</option>"; }).join("") + "</select></div>";
      if (child.tagName !== "VIDEO") html += '<div class="shr-field"><span>Alt text (describe the photo)</span><input data-alt value="' + esc(child.getAttribute("alt") || "") + '"></div>';
      html += '<div class="shr-seg" style="margin-bottom:6px"><button class="shr-btn" data-act="media-clear">Remove media</button></div>';
    }
    var lib = libraryItems();
    if (lib.length) html += '<div class="shr-h">Pick from library</div><div class="shr-media-grid small">' + lib.map(function (m) { return thumb(m, true); }).join("") + "</div>";
    return html;
  }

  function bindPanelInputs() {
    $$("[data-pf]", ui.body).forEach(function (s) { s.addEventListener("change", function () { if (s.value) applyStyle({ fontFamily: fontStack(s.value) }); }); });
    $$("[data-pr]", ui.body).forEach(function (r) {
      var prop = r.getAttribute("data-pr"), unit = r.getAttribute("data-unit") || "";
      r.addEventListener("input", function () {
        if (prop === "fontSize" && selRange()) return;
        applyEl(prop, r.value + unit, true);
        var twin = $('[data-pn="' + prop + '"]', ui.body); if (twin) twin.value = r.value;
      });
      r.addEventListener("change", function () { if (prop === "fontSize" && selRange()) applyStyle({ fontSize: r.value + unit }); else markDirty(true); syncBar(); });
    });
    $$("[data-pn]", ui.body).forEach(function (n) {
      var prop = n.getAttribute("data-pn"), unit = n.getAttribute("data-unit") || "";
      n.addEventListener("change", function () {
        var v = n.value === "" ? "" : n.value + unit;
        if (prop === "fontSize") { if (v) applyStyle({ fontSize: v }); syncBar(); return; }
        applyEl(prop, v);
        var twin = $('[data-pr="' + prop + '"]', ui.body); if (twin && n.value !== "") twin.value = n.value;
      });
    });
    $$("[data-pe]", ui.body).forEach(function (s) { s.addEventListener("change", function () { applyStyle(obj(s.getAttribute("data-pe"), s.value)); syncBar(); }); });
    $$("[data-pc]", ui.body).forEach(function (c) {
      var prop = c.getAttribute("data-pc");
      c.addEventListener("input", function () { if (prop === "color" && selRange()) return; applyEl(prop, c.value, true); });
      c.addEventListener("change", function () { if (prop === "color" && selRange()) applyStyle({ color: c.value }); else markDirty(true); syncBar(); });
    });
    $$("[data-link]", ui.body).forEach(function (i) {
      i.addEventListener("change", function () {
        var a = ED.sel.tagName === "A" ? ED.sel : ED.sel.closest("a");
        if (!a) return;
        if (i.getAttribute("data-link") === "href") a.setAttribute("href", i.value);
        else if (i.checked) { a.target = "_blank"; a.rel = "noopener"; } else { a.removeAttribute("target"); a.removeAttribute("rel"); }
        markDirty(true);
      });
    });
    $$("[data-mfit]", ui.body).forEach(function (s) { s.addEventListener("change", function () { var c = ED.sel.querySelector("img, video"); if (c) { c.style[s.getAttribute("data-mfit")] = s.value; markDirty(true); } }); });
    var alt = $("[data-alt]", ui.body); if (alt) alt.addEventListener("change", function () { var c = ED.sel.querySelector("img"); if (c) { c.alt = alt.value; markDirty(true); } });
    var sl = $("[data-slotlabel]", ui.body); if (sl) sl.addEventListener("change", function () { ED.sel.setAttribute("data-label", sl.value); markDirty(true); });
    bindThumbs(ui.body);
  }
  function obj(k, v) { var o = {}; o[k] = v; return o; }

  function panelAction(a, b) {
    var v = b.getAttribute("data-v");
    switch (a) {
      case "clear-prop": if (ED.sel) { ED.sel.style[v] = ""; markDirty(true); renderPanel(); syncBar(); } break;
      case "place": placeBlock(v); break;
      case "mv-up": move(-1); break;
      case "mv-down": move(1); break;
      case "sel-parent": selectParent(); break;
      case "dup": duplicate(); break;
      case "del": removeSel(); break;
      case "clear-styles": if (ED.sel) { ED.sel.removeAttribute("style"); $$("[style]", ED.sel).forEach(function (n) { if (!n.closest("[data-generated]")) n.removeAttribute("style"); }); markDirty(true); renderPanel(); syncBar(); } break;
      case "add": addAfter(v); break;
      case "media-clear": if (ED.sel) { ED.sel.innerHTML = ""; markDirty(true); renderPanel(); } break;
      case "connect": connectFolder(); break;
      case "reconnect": reconnect(); break;
      case "upload": pickFiles(); break;
      case "refresh-media": loadMedia().then(renderPanel); break;
      default: invAction(a, b) || settingsAction(a, b) || sectionAction(a, b);
    }
  }
  function placeBlock(v) {
    var el = ED.sel; if (!el) return;
    var cs = getComputedStyle(el);
    if (cs.display === "inline") el.style.display = "inline-block";
    if (cs.display === "inline" || cs.display === "inline-block" || cs.display === "inline-flex") {
      // inline items (like buttons) are positioned by their parent
      var p = el.parentElement;
      p.style.textAlign = v;
      if (/flex/.test(getComputedStyle(p).display)) p.style.justifyContent = v === "left" ? "flex-start" : v === "right" ? "flex-end" : "center";
    } else {
      if (!el.style.maxWidth && !el.style.width) el.style.width = "fit-content";
      el.style.marginLeft = v === "left" ? "0" : "auto";
      el.style.marginRight = v === "right" ? "0" : "auto";
      if (getComputedStyle(el.parentElement).display.indexOf("flex") >= 0) el.style.alignSelf = v === "left" ? "flex-start" : v === "right" ? "flex-end" : "center";
    }
    markDirty(true); placeMini();
  }

  /* ---------------- Arrange ---------------- */
  function canMove(el) { return el && !el.matches("main, #site-header, .site-footer"); }
  function move(dir) {
    var el = ED.sel; if (!canMove(el)) return;
    var sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    while (sib && (sib.matches("script, [data-shr-ui]"))) sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
    if (!sib) { toast("Already at the " + (dir < 0 ? "top" : "bottom") + " of its group. Use ✥ drag to move it elsewhere."); return; }
    if (dir < 0) sib.before(el); else sib.after(el);
    markDirty(true); placeMini(); el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function selectParent() {
    var el = ED.sel; if (!el) return;
    var p = el.parentElement;
    if (!p || !inContent(p) || p.tagName === "MAIN" || p.tagName === "BODY") { toast("This is already the outermost block"); return; }
    select(p);
  }
  function duplicate() {
    var el = ED.sel; if (!canMove(el) || el.matches("[data-generated]") || el.id === "rig-builder") { toast("This one can't be duplicated"); return; }
    var c = el.cloneNode(true);
    c.classList.remove("shr-selected"); c.removeAttribute("contenteditable"); c.removeAttribute("spellcheck");
    if (c.id) c.removeAttribute("id");
    $$("[id]", c).forEach(function (n) { n.removeAttribute("id"); });
    if (c.hasAttribute("data-section")) c.setAttribute("data-section", c.getAttribute("data-section") + " (copy)");
    el.after(c);
    markDirty(true); select(c);
  }
  function removeSel() {
    var el = ED.sel; if (!el) return;
    if (!canMove(el) || el.matches("[data-generated]")) { toast("This part can't be deleted (use Sections to hide it)"); return; }
    if (el.matches("#contact-form, #request-modal, #altimeter")) { toast("This part can't be deleted"); return; }
    var next = el.nextElementSibling || el.previousElementSibling || el.parentElement;
    deselect();
    el.remove();
    markDirty(true);
    toast("Deleted. Press Cmd/Ctrl+Z to undo.");
    if (next && inContent(next) && next.tagName !== "MAIN") select(next);
  }
  function addAfter(kind) {
    var ref = ED.sel; if (!ref || !canMove(ref)) { toast("Select an element to add after it"); return; }
    var n;
    if (kind === "h2") n = h("<h2>New heading</h2>");
    else if (kind === "p") n = h("<p>New text. Click to edit.</p>");
    else if (kind === "btn") n = h('<a class="btn btn-primary" href="#contact">New button</a>');
    else if (kind === "media") n = h('<div class="media-slot" data-slot="custom-' + Date.now().toString(36) + '" data-label="Drop a photo or video here" style="aspect-ratio:16/9"></div>');
    else n = h('<div class="spacer" style="height:40px"></div>');
    if (ref.matches("section, [data-section]")) { var c = ref.querySelector(".container") || ref; c.appendChild(n); }
    else ref.after(n);
    markDirty(true); select(n);
  }

  /* drag to move (from the ✥ handle) */
  function onMiniDown(e) {
    var b = e.target.closest("button");
    if (!b) return;
    e.preventDefault();
    var m = b.getAttribute("data-mini");
    if (m !== "drag") {
      if (m === "parent") selectParent(); else if (m === "up") move(-1); else if (m === "down") move(1); else if (m === "dup") duplicate(); else if (m === "del") removeSel();
      return;
    }
    var el = ED.sel; if (!canMove(el)) return;
    ED.dragging = { el: el, target: null, before: true };
    document.body.classList.add("shr-dragging");
    el.style.opacity = ".45";
    document.addEventListener("mousemove", onDragMove, true);
    document.addEventListener("mouseup", onDragEnd, true);
  }
  function flowIsRow(parent) {
    var cs = getComputedStyle(parent);
    if (cs.display.indexOf("flex") >= 0) return cs.flexDirection.indexOf("row") === 0;
    if (cs.display.indexOf("grid") >= 0) return cs.gridTemplateColumns.split(" ").length > 1;
    return false;
  }
  function onDragMove(e) {
    var D = ED.dragging; if (!D) return;
    ui.dropline.style.display = "none";
    var t = document.elementFromPoint(e.clientX, e.clientY);
    var tgt = selectable(t);
    // walk up to an element that's not inside the dragged element and has a parent in content
    while (tgt && (D.el.contains(tgt) || tgt.matches("[data-generated] *"))) tgt = null;
    if (!tgt || tgt === D.el || !inContent(tgt) || tgt.matches("#site-header, .site-footer")) { D.target = null; return; }
    if (D.el.matches("section") && !tgt.matches("main > *")) { tgt = tgt.closest("main > *"); if (!tgt || tgt === D.el) { D.target = null; return; } }
    var r = tgt.getBoundingClientRect(), row = flowIsRow(tgt.parentElement);
    var before = row ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    D.target = tgt; D.before = before;
    var L = ui.dropline.style;
    if (row) { L.left = (before ? r.left - 3 : r.right - 1) + "px"; L.top = r.top + "px"; L.width = "4px"; L.height = r.height + "px"; }
    else { L.left = r.left + "px"; L.top = (before ? r.top - 3 : r.bottom - 1) + "px"; L.width = r.width + "px"; L.height = "4px"; }
    L.display = "block";
    if (e.clientY < 90) window.scrollBy(0, -18); else if (e.clientY > window.innerHeight - 40) window.scrollBy(0, 18);
  }
  function onDragEnd() {
    var D = ED.dragging; ED.dragging = null;
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onDragEnd, true);
    document.body.classList.remove("shr-dragging");
    ui.dropline.style.display = "none";
    if (!D) return;
    D.el.style.opacity = "";
    if (!D.el.getAttribute("style")) D.el.removeAttribute("style");
    if (D.target) { if (D.before) D.target.before(D.el); else D.target.after(D.el); markDirty(true); }
    placeMini();
  }

  /* ---------------- Media ---------------- */
  function isVideo(name) { return VIDEO_RE.test(name); }
  function libraryItems() { return ED.dir ? ED.media : ED.fallbackMedia; }
  function thumb(m, pick) {
    return '<div class="shr-thumb' + (pick ? " pick" : "") + '" draggable="true" data-src="' + esc(m.src) + '" title="' + esc(m.name) + (pick ? " (click to use)" : " (drag onto a placeholder)") + '">' +
      (isVideo(m.name) ? '<video src="' + esc(m.preview) + '" muted preload="metadata"></video><span class="vid">VIDEO</span>' : '<img src="' + esc(m.preview) + '" alt="">') +
      '<span class="nm">' + esc(m.name) + "</span></div>";
  }
  function bindThumbs(root) {
    $$(".shr-thumb", root).forEach(function (t) {
      t.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("application/x-shr-media", t.getAttribute("data-src"));
        e.dataTransfer.setData("text/plain", t.getAttribute("data-src"));
        e.dataTransfer.effectAllowed = "copy";
        ED.dragSrc = t.getAttribute("data-src");
      });
      t.addEventListener("dragend", function () { ED.dragSrc = null; });
      if (t.classList.contains("pick")) t.addEventListener("click", function () { if (ED.sel) { setMedia(ED.sel, t.getAttribute("data-src")); renderPanel(); } });
    });
  }
  function renderMediaTab() {
    var html = '<div class="shr-h">Media library</div>';
    if (!FS_OK) {
      html += '<p class="shr-muted">Your browser can\'t save files into folders. For the full experience open index.html in <b>Chrome</b> or <b>Edge</b>. You can still add media here, but it gets embedded inside index.html (fine for a few photos, not for videos).</p>';
    } else if (!ED.dir) {
      html += '<p class="shr-muted">Connect your <b>SkyHighRigs</b> project folder once. Then uploads are saved into its <code>media</code> folder and Save writes straight into index.html.</p>' +
        (ED.pendingHandle ? '<button class="shr-btn primary" style="width:100%;margin-bottom:8px" data-act="reconnect">Reconnect “' + esc(ED.pendingHandle.name) + '”</button>' : "") +
        '<button class="shr-btn' + (ED.pendingHandle ? "" : " primary") + '" style="width:100%;margin-bottom:12px" data-act="connect">Connect project folder…</button>';
    }
    html += '<div class="shr-drop" data-act="upload" id="shr-dropzone">⬆ <b>Drop photos &amp; videos here</b><br>or click to choose files</div>';
    var lib = libraryItems();
    if (lib.length) {
      html += '<div class="shr-h">' + lib.length + " file" + (lib.length > 1 ? "s" : "") + (ED.dir ? ' <button class="shr-btn" data-act="refresh-media" title="Re-scan the media folder">↻</button>' : "") + '</div><p class="shr-muted">Drag a file onto any placeholder or photo on the page, or onto a gear photo in the rig builder.</p>';
      html += '<div class="shr-media-grid">' + lib.map(function (m) { return thumb(m); }).join("") + "</div>";
    } else {
      html += '<p class="shr-muted">No media yet.' + (ED.dir ? " You can also copy files straight into the <b>media</b> folder in Finder, then click ↻." : "") + "</p>";
    }
    html += '<div class="shr-h">Tips</div><p class="shr-muted">Photos: JPG or WebP, around 2000px wide. Videos: MP4 (H.264), short loops, under 30 MB so the site stays fast. iPhone .MOV files may not play in every browser; export as MP4.</p>';
    ui.body.innerHTML = html;
    bindThumbs(ui.body);
    var dz = $("#shr-dropzone");
    dz.addEventListener("dragover", function (e) { if (hasFiles(e)) { e.preventDefault(); dz.classList.add("over"); } });
    dz.addEventListener("dragleave", function () { dz.classList.remove("over"); });
    dz.addEventListener("drop", function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove("over"); addFiles(e.dataTransfer.files); });
  }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0; }
  function hasMedia(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "application/x-shr-media") >= 0; }

  function pickFiles() {
    var i = document.createElement("input");
    i.type = "file"; i.multiple = true; i.accept = "image/*,video/*";
    i.onchange = function () { addFiles(i.files); };
    i.click();
  }
  function cleanName(n) {
    var ext = (n.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    var base = n.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "media";
    return base.slice(0, 60) + ext;
  }
  /* Saves files into media/ (or embeds them in fallback mode). Returns the src paths. */
  function addFiles(files) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return MEDIA_RE.test(f.name) || /^(image|video)\//.test(f.type); });
    if (!files.length) { toast("Those don't look like photos or videos", true); return Promise.resolve([]); }
    if (ED.dir) {
      return ED.dir.getDirectoryHandle("media", { create: true }).then(function (mdir) {
        var out = [];
        return files.reduce(function (p, f) {
          return p.then(function () { return uniqueName(mdir, cleanName(f.name)); }).then(function (nm) {
            if (f.size > 50 * 1024 * 1024) toast(f.name + " is over 50 MB. GitHub and visitors will struggle with that; consider compressing it.", true, 6000);
            return mdir.getFileHandle(nm, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(f).then(function () { return w.close(); }); }).then(function () { out.push("media/" + nm); });
          });
        }, Promise.resolve()).then(function () { return loadMedia(); }).then(function () {
          toast("Added " + out.length + " file" + (out.length > 1 ? "s" : "") + " to the media folder");
          if (ED.tab === "media" || ED.tab === "element" || ED.tab === "inventory") renderPanel();
          return out;
        });
      }).catch(function (err) { toast("Couldn't save to the media folder: " + err.message, true, 6000); return []; });
    }
    return Promise.all(files.map(function (f) {
      return new Promise(function (res) {
        if (f.size > 8 * 1024 * 1024) toast("Large file embedded in the page. Use Chrome + a connected folder for big files.", true, 6000);
        var r = new FileReader();
        r.onload = function () { ED.fallbackMedia.push({ name: cleanName(f.name), src: r.result, preview: r.result }); res(r.result); };
        r.readAsDataURL(f);
      });
    })).then(function (srcs) { renderPanel(); return srcs; });
  }
  function uniqueName(dir, nm) {
    var base = nm.replace(/\.[^.]+$/, ""), ext = (nm.match(/\.[^.]+$/) || [""])[0], i = 1;
    function attempt(n) { return dir.getFileHandle(n).then(function () { i++; return attempt(base + "-" + i + ext); }, function () { return n; }); }
    return attempt(nm);
  }
  function loadMedia() {
    if (!ED.dir) return Promise.resolve();
    ED.media.forEach(function (m) { if (m.preview && m.preview.indexOf("blob:") === 0) URL.revokeObjectURL(m.preview); });
    var list = [];
    return ED.dir.getDirectoryHandle("media", { create: true }).then(function (mdir) {
      var it = mdir.values();
      function next() {
        return it.next().then(function (r) {
          if (r.done) return;
          var fh = r.value;
          if (fh.kind !== "file" || !MEDIA_RE.test(fh.name)) return next();
          return fh.getFile().then(function (file) { list.push({ name: fh.name, src: "media/" + fh.name, preview: URL.createObjectURL(file), t: file.lastModified }); return next(); });
        });
      }
      return next();
    }).then(function () { list.sort(function (a, b) { return b.t - a.t; }); ED.media = list; }).catch(function (e) { console.warn(e); });
  }

  function dropTarget(t) {
    if (!t || t.nodeType !== 1 || inUI(t) || !inContent(t)) return null;
    return t.closest(".media-slot, img");
  }
  function onDragOver(e) {
    if (!ED.on || (!hasMedia(e) && !hasFiles(e))) return;
    var tgt = dropTarget(e.target);
    if (ED.dropOver && ED.dropOver !== tgt) ED.dropOver.classList.remove("shr-dropover");
    ED.dropOver = tgt;
    if (tgt) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; tgt.classList.add("shr-dropover"); }
    else if (!inUI(e.target)) e.preventDefault(); // stop the browser from opening dropped files
  }
  function onDragLeave(e) { if (ED.dropOver && !ED.dropOver.contains(e.relatedTarget)) { ED.dropOver.classList.remove("shr-dropover"); ED.dropOver = null; } }
  function onDrop(e) {
    if (!ED.on || inUI(e.target)) return;
    if (!hasMedia(e) && !hasFiles(e)) return;
    e.preventDefault();
    var tgt = dropTarget(e.target);
    if (ED.dropOver) { ED.dropOver.classList.remove("shr-dropover"); ED.dropOver = null; }
    if (!tgt) { if (hasFiles(e)) addFiles(e.dataTransfer.files); return; }
    if (hasMedia(e)) { setMedia(tgt, e.dataTransfer.getData("application/x-shr-media")); return; }
    addFiles(e.dataTransfer.files).then(function (srcs) { if (srcs[0]) setMedia(tgt, srcs[0]); });
  }
  function setMedia(tgt, src) {
    if (!src) return;
    var vid = isVideo(src) || /^data:video/.test(src);
    var itemId = tgt.getAttribute && tgt.getAttribute("data-item-id");
    if (itemId) { // rig builder / sale photo -> goes into the gear list
      var it = findItem(itemId);
      if (it) { it.item.images = it.item.images || []; it.item.images = [src].concat(it.item.images.filter(function (s) { return s !== src; })); dataChanged(); toast("Photo set for " + it.item.name); }
      return;
    }
    if (tgt.tagName === "IMG") { if (vid) { toast("Drop videos onto a placeholder box, not a photo", true); return; } tgt.setAttribute("src", src); }
    else {
      var old = tgt.querySelector("img, video");
      var keep = old ? old.getAttribute("style") : "";
      tgt.innerHTML = vid ? '<video src="' + esc(src) + '" autoplay muted loop playsinline></video>' : '<img src="' + esc(src) + '" alt="' + esc(tgt.getAttribute("data-label") || "") + '" loading="lazy">';
      if (keep) tgt.firstChild.setAttribute("style", keep);
      if (vid) { var v = tgt.querySelector("video"); v.muted = true; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    }
    markDirty(true);
    if (ED.sel === tgt && ED.tab === "element") renderPanel();
    toast("Media placed");
  }

  /* ---------------- Folder connection & save ---------------- */
  function verifyFolder(handle) {
    return handle.getFileHandle("index.html").then(function () { return true; }, function () { return false; });
  }
  function useFolder(handle) {
    ED.dir = handle; ED.pendingHandle = null;
    idbSet("project", handle);
    return loadMedia().then(function () { setStatus(); renderPanel(); });
  }
  function connectFolder() {
    if (!FS_OK) { toast("Use Chrome or Edge to connect a folder", true); return Promise.resolve(false); }
    return window.showDirectoryPicker({ id: "skyhighrigs", mode: "readwrite" }).then(function (handle) {
      return verifyFolder(handle).then(function (ok) {
        if (!ok) { toast("That folder has no index.html. Pick the SkyHighRigs folder itself.", true, 5000); return false; }
        return useFolder(handle).then(function () { toast("Connected to “" + handle.name + "”"); return true; });
      });
    }).catch(function (e) { if (e.name !== "AbortError") toast(e.message, true); return false; });
  }
  function reconnect() {
    var hd = ED.pendingHandle; if (!hd) return connectFolder();
    return hd.requestPermission({ mode: "readwrite" }).then(function (p) {
      if (p === "granted") return useFolder(hd).then(function () { toast("Reconnected"); return true; });
      return false;
    }).catch(function () { return connectFolder(); });
  }
  function restoreFolder() {
    if (!FS_OK) return;
    idbGet("project").then(function (hd) {
      if (!hd || !hd.queryPermission) return;
      return hd.queryPermission({ mode: "readwrite" }).then(function (p) {
        if (p === "granted") return useFolder(hd);
        ED.pendingHandle = hd; setStatus(); if (ED.tab === "media") renderPanel();
      });
    }).catch(function () {});
  }

  function usedFonts(doc) {
    var used = {};
    var text = $$("[style]", doc).map(function (n) { return n.getAttribute("style"); }).join(";") + ";" + (($("#shr-theme", doc) || {}).textContent || "");
    FONTS.forEach(function (f) { if (SYSTEM_FONTS.indexOf(f[0]) < 0 && BASE_FONTS.indexOf(f[0]) < 0 && text.indexOf(f[0]) >= 0) used[f[0]] = 1; });
    return Object.keys(used);
  }
  function buildHTML() {
    if (SHR.writeData) SHR.writeData();
    var doc = document.documentElement.cloneNode(true);
    $$("[data-shr-ui]", doc).forEach(function (n) { n.remove(); });
    $$("[contenteditable]", doc).forEach(function (n) { n.removeAttribute("contenteditable"); });
    $$("[spellcheck]", doc).forEach(function (n) { n.removeAttribute("spellcheck"); });
    $$("[data-shr-opened]", doc).forEach(function (n) { n.removeAttribute("open"); n.removeAttribute("data-shr-opened"); });
    $$("[class]", doc).forEach(function (n) {
      var c = Array.prototype.slice.call(n.classList).filter(function (x) { return x.indexOf("shr-") === 0; });
      c.forEach(function (x) { n.classList.remove(x); });
      if (!n.getAttribute("class")) n.removeAttribute("class");
    });
    if (SHR.cleanForSave) SHR.cleanForSave(doc);
    var body = $("body", doc); if (body && !body.getAttribute("class")) body.removeAttribute("class");
    // web fonts used by the editor's font picker
    var fonts = usedFonts(doc), link = $("#shr-fonts", doc);
    if (fonts.length) {
      if (!link) { link = doc.ownerDocument.createElement("link"); link.id = "shr-fonts"; link.rel = "stylesheet"; var main = $('link[href*="assets/css/site.css"]', doc); main.parentNode.insertBefore(link, main); }
      link.setAttribute("href", "https://fonts.googleapis.com/css2?" + fonts.map(function (f) { return "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700;800;900"; }).join("&") + "&display=swap");
    } else if (link) link.remove();
    return "<!DOCTYPE html>\n" + doc.outerHTML.replace(/\n{3,}/g, "\n\n") + "\n";
  }
  SHR.buildHTML = buildHTML;

  function save() {
    var html = buildHTML();
    if (!FS_OK) { download(html); return; }
    var go = ED.dir ? Promise.resolve(true) : (ED.pendingHandle ? reconnect() : (toast("Pick your SkyHighRigs project folder to save into"), connectFolder()));
    go.then(function (ok) {
      if (!ok || !ED.dir) { download(html); return; }
      setStatus("Saving…");
      var backup = ED.backedUp ? Promise.resolve() : ED.dir.getFileHandle("index.html").then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).then(function (old) {
        return ED.dir.getDirectoryHandle(".backups", { create: true }).then(function (bd) {
          var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          return bd.getFileHandle("index-" + stamp + ".html", { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(old).then(function () { return w.close(); }); });
        });
      }).then(function () { ED.backedUp = true; }).catch(function () {});
      return backup.then(function () { return ED.dir.getFileHandle("index.html", { create: true }); })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(html).then(function () { return w.close(); }); })
        .then(function () { markDirty(false); setStatus(); toast("Saved to index.html ✓"); })
        .catch(function (e) { toast("Save failed: " + e.message + ". Downloading a copy instead.", true, 6000); download(html); });
    });
  }
  function download(html) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = "index.html";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Downloaded index.html. Replace the one in your SkyHighRigs folder with it.", false, 7000);
    markDirty(false);
  }

  /* ---------------- Undo / redo ---------------- */
  function snapshot() {
    var parts = roots().map(function (r) {
      var c = r.cloneNode(true);
      $$(".shr-selected, .shr-hover, .shr-dropover", c).concat([c]).forEach(function (n) { n.classList.remove("shr-selected", "shr-hover", "shr-dropover"); if (n.getAttribute("class") === "") n.removeAttribute("class"); });
      $$("[contenteditable]", c).forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck"); });
      $$("[data-generated]", c).forEach(function (n) { n.innerHTML = ""; });
      return c.innerHTML;
    });
    return { parts: parts, data: JSON.stringify({ d: SHR.data, s: SHR.settings }) };
  }
  var snapT;
  function markDirty(commit) {
    ED.dirty = true; setStatus();
    clearTimeout(snapT);
    snapT = setTimeout(pushSnap, commit ? 50 : 500);
  }
  function pushSnap() {
    var s = snapshot(), last = ED.undo[ED.undo.length - 1];
    if (last && last.data === s.data && last.parts.join("") === s.parts.join("")) return;
    ED.undo.push(s); if (ED.undo.length > 100) ED.undo.shift();
    ED.redo = [];
  }
  function restore(s) {
    deselect();
    var rs = roots();
    s.parts.forEach(function (html, i) { if (rs[i]) rs[i].innerHTML = html; });
    var d = JSON.parse(s.data); SHR.data = d.d; SHR.settings = d.s;
    if (SHR.writeData) SHR.writeData();
    rerenderGenerated();
    $$("details").forEach(function (dd) { if (!dd.open) { dd.open = true; dd.setAttribute("data-shr-opened", ""); } });
    ED.dirty = true; setStatus(); renderPanel();
  }
  function rerenderGenerated() { if (SHR.writeData) SHR.writeData(); if (SHR.render) SHR.render(); }
  function undo() {
    clearTimeout(snapT); pushSnap();
    if (ED.undo.length < 2) { toast("Nothing to undo"); return; }
    ED.redo.push(ED.undo.pop());
    restore(ED.undo[ED.undo.length - 1]);
  }
  function redo() {
    if (!ED.redo.length) { toast("Nothing to redo"); return; }
    var s = ED.redo.pop(); ED.undo.push(s); restore(s);
  }

  /* ---------------- Sections tab ---------------- */
  function sectionsList() { return $$("#site-header, main > [data-section], .site-footer"); }
  function renderSectionsTab() {
    var html = '<div class="shr-h">Page sections</div><p class="shr-muted">Drag ⠿ to reorder. 👁 hides a section without deleting it. Click a name to jump to it.</p>';
    html += sectionsList().map(function (s, i) {
      var fixed = !s.parentElement || s.parentElement.tagName !== "MAIN";
      return '<div class="shr-sec' + (s.hidden ? " off" : "") + '" data-i="' + i + '"' + (fixed ? "" : ' draggable="true"') + ">" +
        '<span class="grip">' + (fixed ? "•" : "⠿") + '</span><span class="nm" data-act="sec-go" data-v="' + i + '">' + esc(s.getAttribute("data-section") || s.id || "Section") + "</span>" +
        (fixed ? "" : '<button class="shr-btn" data-act="sec-hide" data-v="' + i + '" title="Show / hide">' + (s.hidden ? "🚫" : "👁") + "</button>" +
          '<button class="shr-btn" data-act="sec-dup" data-v="' + i + '" title="Duplicate">⧉</button>' +
          '<button class="shr-btn" data-act="sec-del" data-v="' + i + '" title="Delete">🗑</button>') + "</div>";
    }).join("");
    html += '<p class="shr-muted" style="margin-top:12px">Moved a section? Update the menu links at the top by selecting them and editing the link in the Element tab.</p>';
    ui.body.innerHTML = html;
    var dragI = null;
    $$(".shr-sec[draggable]", ui.body).forEach(function (row) {
      row.addEventListener("dragstart", function (e) { dragI = Number(row.getAttribute("data-i")); row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "sec"); });
      row.addEventListener("dragend", function () { row.classList.remove("dragging"); $$(".shr-sec", ui.body).forEach(function (r) { r.classList.remove("drop-before", "drop-after"); }); });
      row.addEventListener("dragover", function (e) {
        if (dragI == null) return; e.preventDefault();
        var r = row.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
        $$(".shr-sec", ui.body).forEach(function (x) { x.classList.remove("drop-before", "drop-after"); });
        row.classList.add(before ? "drop-before" : "drop-after");
      });
      row.addEventListener("drop", function (e) {
        e.preventDefault(); e.stopPropagation();
        var list = sectionsList(), from = list[dragI], to = list[Number(row.getAttribute("data-i"))];
        var r = row.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
        dragI = null;
        if (!from || !to || from === to) return;
        if (before) to.before(from); else to.after(from);
        markDirty(true); renderSectionsTab();
      });
    });
  }
  function sectionAction(a, b) {
    var list = sectionsList(), s = list[Number(b.getAttribute("data-v"))];
    if (!s) return false;
    if (a === "sec-go") { s.hidden ? toast("That section is hidden") : s.scrollIntoView({ behavior: "smooth" }); ED.keepTab = true; select(s); ED.keepTab = false; }
    else if (a === "sec-hide") { s.hidden = !s.hidden; markDirty(true); renderSectionsTab(); }
    else if (a === "sec-dup") { var c = s.cloneNode(true); c.removeAttribute("id"); $$("[id]", c).forEach(function (n) { n.removeAttribute("id"); }); $$("[data-generated]", c).forEach(function (n) { n.remove(); }); c.setAttribute("data-section", (s.getAttribute("data-section") || "Section") + " (copy)"); c.classList.remove("shr-selected"); s.after(c); markDirty(true); renderSectionsTab(); }
    else if (a === "sec-del") {
      if (s.querySelector("[data-generated], #contact-form")) { toast("This section has the rig builder, gear grid or contact form. Hide it instead.", true, 4500); return true; }
      if (confirm("Delete the “" + (s.getAttribute("data-section") || "") + "” section? (Cmd/Ctrl+Z can undo)")) { if (ED.sel && s.contains(ED.sel)) deselect(); s.remove(); markDirty(true); renderSectionsTab(); }
    } else return false;
    return true;
  }

  /* ---------------- Inventory (Gear) tab ---------------- */
  var SCHEMA = {
    containers: { label: "Containers", fields: [["name", "Listing name"], ["model", "Model (e.g. Vector 3)"], ["type", "Container type (Sport, Freefly, Wingsuit…)"], ["color", "Color"], ["mainMin", "Main size min (sq ft)", "number"], ["mainMax", "Main size max (sq ft)", "number"], ["heightMin", "Fits height min (inches)", "number"], ["heightMax", "Fits height max (inches)", "number"], ["weightMin", "Fits weight min (lb)", "number"], ["weightMax", "Fits weight max (lb)", "number"], ["aad", "AAD (type + year)"], ["reserve", "Reserve (model + size)"], ["reservePack", "Reserve pack date", "date"], ["jumps", "Jumps on rig", "number"], ["rentDay", "Rent price per day ($)", "number"], ["buyPrice", "Sale price ($) · leave empty if not for sale", "number"], ["notes", "Notes (line replacements, patches…)", "textarea"]], booking: true },
    canopies: { label: "Canopies", fields: [["name", "Listing name"], ["model", "Model (e.g. Sabre 3)"], ["size", "Size (sq ft)", "number"], ["type", "Type (Docile, Intermediate, Elliptical…)"], ["color", "Colors"], ["jumps", "Jumps", "number"], ["lines", "Lineset info"], ["rentDay", "Rent price per day ($)", "number"], ["buyPrice", "Sale price ($) · leave empty if not for sale", "number"], ["notes", "Notes", "textarea"]], booking: true },
    accessories: { label: "Helmets, altimeters & more", fields: [["name", "Listing name"], ["kind", "Type (Helmet, Altimeter, Audible, Jumpsuit…)"], ["size", "Sizes"], ["rentDay", "Rent price per day ($)", "number"], ["bundleDay", "Bundle price per day when renting a rig ($)", "number"], ["buyPrice", "Sale price ($) · leave empty if not for sale", "number"]], booking: false }
  };
  function findItem(id) {
    var cats = ["containers", "canopies", "accessories"];
    for (var i = 0; i < cats.length; i++) { var l = SHR.data[cats[i]] || []; for (var j = 0; j < l.length; j++) if (l[j].id === id) return { cat: cats[i], item: l[j], index: j }; }
    return null;
  }
  var dataT;
  function dataChanged(soft) {
    if (SHR.writeData) SHR.writeData();
    clearTimeout(dataT);
    dataT = setTimeout(function () { if (SHR.render) SHR.render(); }, soft ? 350 : 0);
    markDirty(!soft);
  }
  function previewSrc(src) {
    for (var i = 0; i < ED.media.length; i++) if (ED.media[i].src === src) return ED.media[i].preview;
    return src;
  }
  function renderInventoryTab() {
    var cat = ED.invCat, sch = SCHEMA[cat], list = SHR.data[cat] || [];
    var html = '<div class="shr-h">Gear inventory</div><p class="shr-muted">Everything in the rig builder and Gear for Sale comes from this list. Changes show on the page right away.</p>' +
      '<div class="shr-seg" style="margin-bottom:12px">' + Object.keys(SCHEMA).map(function (k) { return '<button class="shr-btn' + (k === cat ? " on" : "") + '" data-act="inv-cat" data-v="' + k + '">' + (k === "accessories" ? "Add-ons" : SCHEMA[k].label) + "</button>"; }).join("") + "</div>";
    html += list.map(function (it, i) {
      var open = ED.invOpen === it.id, img = it.images && it.images[0];
      var out = '<div class="shr-inv-item"><div class="shr-inv-head" data-act="inv-open" data-v="' + esc(it.id) + '">' + (img ? '<img src="' + esc(previewSrc(img)) + '" alt="">' : '<span class="ph"></span>') + '<span class="nm">' + esc(it.name || "(no name)") + '</span><span class="pr">$' + esc(it.rentDay || 0) + "/d</span><span>" + (open ? "▾" : "▸") + "</span></div>";
      if (open) {
        out += '<div class="shr-inv-form" data-id="' + esc(it.id) + '">';
        sch.fields.forEach(function (f) {
          var v = it[f[0]] == null ? "" : it[f[0]];
          out += '<label class="shr-field"><span>' + esc(f[1]) + "</span>" + (f[2] === "textarea" ? '<textarea rows="2" data-inv="' + f[0] + '">' + esc(v) + "</textarea>" : '<input data-inv="' + f[0] + '" type="' + (f[2] || "text") + '" value="' + esc(v) + '">') + "</label>";
        });
        out += '<div class="shr-h">Photos</div><div class="shr-imgs">' + (it.images || []).map(function (s, k) { return '<div class="im"><img src="' + esc(previewSrc(s)) + '" alt=""><button data-act="inv-img-del" data-v="' + k + '" title="Remove">✕</button></div>'; }).join("") + "</div>" +
          '<div class="shr-drop" data-act="inv-img-add" data-invdrop>Drop a photo here (from the Media tab or your computer) or click to upload</div>';
        if (sch.booking) {
          out += '<div class="shr-h">Booked dates <button class="shr-btn" data-act="inv-book-add">+ Add</button></div>';
          out += (it.booked || []).map(function (b, k) { return '<div class="shr-book"><input type="date" data-book="' + k + '" data-bk="from" value="' + esc(b.from) + '"><input type="date" data-book="' + k + '" data-bk="to" value="' + esc(b.to) + '"><button class="shr-btn" data-act="inv-book-del" data-v="' + k + '">✕</button></div>'; }).join("") || '<p class="shr-muted">No bookings. Add dates here when someone books so others see it as taken.</p>';
        }
        out += '<div class="shr-seg" style="margin-top:12px"><button class="shr-btn" data-act="inv-dup">⧉ Duplicate</button><button class="shr-btn" data-act="inv-up">↑</button><button class="shr-btn" data-act="inv-down">↓</button><button class="shr-btn" data-act="inv-del" style="color:#ff8a8a">🗑 Delete</button></div></div>';
      }
      return out + "</div>";
    }).join("");
    html += '<button class="shr-btn primary" style="width:100%;margin-top:8px" data-act="inv-add">+ Add ' + (cat === "containers" ? "container" : cat === "canopies" ? "canopy" : "add-on") + "</button>";
    ui.body.innerHTML = html;

    var form = $(".shr-inv-form", ui.body);
    if (!form) return;
    var cur = findItem(form.getAttribute("data-id"));
    $$("[data-inv]", form).forEach(function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.getAttribute("data-inv"), v = inp.value;
        cur.item[k] = inp.type === "number" ? (v === "" ? "" : Number(v)) : v;
        dataChanged(true);
        if (k === "name" || k === "rentDay") { var hd = $(".shr-inv-head[data-v=\"" + cur.item.id + "\"]", ui.body); if (hd) { $(".nm", hd).textContent = cur.item.name || "(no name)"; $(".pr", hd).textContent = "$" + (cur.item.rentDay || 0) + "/d"; } }
      });
    });
    $$("[data-book]", form).forEach(function (inp) {
      inp.addEventListener("change", function () { cur.item.booked[Number(inp.getAttribute("data-book"))][inp.getAttribute("data-bk")] = inp.value; dataChanged(); });
    });
    var dz = $("[data-invdrop]", form);
    dz.addEventListener("dragover", function (e) { if (hasFiles(e) || hasMedia(e)) { e.preventDefault(); dz.classList.add("over"); } });
    dz.addEventListener("dragleave", function () { dz.classList.remove("over"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove("over");
      if (hasMedia(e)) { addItemImage(cur.item, e.dataTransfer.getData("application/x-shr-media")); return; }
      addFiles(e.dataTransfer.files).then(function (srcs) { srcs.forEach(function (s) { addItemImage(cur.item, s, true); }); renderInventoryTab(); });
    });
  }
  function addItemImage(item, src, quiet) {
    item.images = item.images || [];
    if (item.images.indexOf(src) < 0) item.images.push(src);
    dataChanged();
    if (!quiet) renderInventoryTab();
  }
  function invAction(a, b) {
    if (a.indexOf("inv-") !== 0) return false;
    var cat = ED.invCat, list = SHR.data[cat];
    var form = b.closest(".shr-inv-form"), cur = form ? findItem(form.getAttribute("data-id")) : null;
    var v = b.getAttribute("data-v");
    switch (a) {
      case "inv-cat": ED.invCat = v; ED.invOpen = null; break;
      case "inv-open": ED.invOpen = ED.invOpen === v ? null : v; break;
      case "inv-add":
        var id = cat[0] + Date.now().toString(36);
        var base = cat === "containers" ? { name: "New container", model: "", type: "Sport", color: "", mainMin: 150, mainMax: 190, heightMin: 64, heightMax: 72, weightMin: 130, weightMax: 200, aad: "", reserve: "", reservePack: "", jumps: 0, notes: "", rentDay: 25, buyPrice: "", booked: [] }
          : cat === "canopies" ? { name: "New canopy", model: "", size: 170, type: "Intermediate", color: "", jumps: 0, lines: "", notes: "", rentDay: 20, buyPrice: "", booked: [] }
          : { name: "New add-on", kind: "Helmet", size: "", rentDay: 8, bundleDay: 5, buyPrice: "" };
        base.id = id; base.images = [];
        list.push(base); ED.invOpen = id; dataChanged(); break;
      case "inv-del": if (cur && confirm("Delete “" + cur.item.name + "”?")) { list.splice(cur.index, 1); ED.invOpen = null; dataChanged(); } break;
      case "inv-dup": if (cur) { var c = JSON.parse(JSON.stringify(cur.item)); c.id = cat[0] + Date.now().toString(36); c.name += " (copy)"; c.booked = []; list.splice(cur.index + 1, 0, c); ED.invOpen = c.id; dataChanged(); } break;
      case "inv-up": case "inv-down": if (cur) { var j = cur.index + (a === "inv-up" ? -1 : 1); if (j >= 0 && j < list.length) { list.splice(j, 0, list.splice(cur.index, 1)[0]); dataChanged(); } } break;
      case "inv-img-del": if (cur) { cur.item.images.splice(Number(v), 1); dataChanged(); } break;
      case "inv-img-add": if (cur) { var item = cur.item, i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.multiple = true; i.onchange = function () { addFiles(i.files).then(function (srcs) { srcs.forEach(function (s) { addItemImage(item, s, true); }); renderInventoryTab(); }); }; i.click(); } return true;
      case "inv-book-add": if (cur) { cur.item.booked = cur.item.booked || []; var t = new Date().toISOString().slice(0, 10); cur.item.booked.push({ from: t, to: t }); dataChanged(); } break;
      case "inv-book-del": if (cur) { cur.item.booked.splice(Number(v), 1); dataChanged(); } break;
      default: return false;
    }
    renderInventoryTab();
    return true;
  }

  /* ---------------- Settings tab ---------------- */
  var THEME = [["--accent", "Accent (buttons, highlights)"], ["--accent-ink", "Text on accent buttons"], ["--sky-500", "Primary blue"], ["--sky-600", "Blue labels & links"], ["--sky-800", "Dark blue (buttons, prices)"], ["--sky-900", "Darkest blue"], ["--cloud", "Light background"], ["--mist", "Alternate light background"], ["--ink", "Main text"], ["--muted", "Soft text"]];
  function themeStyle() {
    var s = $("#shr-theme");
    if (!s) { s = document.createElement("style"); s.id = "shr-theme"; document.head.appendChild(s); }
    return s;
  }
  function readTheme() {
    var s = $("#shr-theme"), o = {};
    if (s) s.textContent.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, function (_, k, v) { o[k] = v.trim(); });
    return o;
  }
  function writeTheme(o) {
    var body = Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return "  " + k + ": " + o[k] + ";"; }).join("\n");
    themeStyle().textContent = body ? "\n:root {\n" + body + "\n}\n" : "";
    markDirty(true);
  }
  function renderSettingsTab() {
    var st = SHR.settings || {}, cs = getComputedStyle(document.documentElement), th = readTheme();
    var headFont = (th["--font-head"] || cs.getPropertyValue("--font-head")).split(",")[0].replace(/["']/g, "").trim();
    var bodyFont = (th["--font-body"] || cs.getPropertyValue("--font-body")).split(",")[0].replace(/["']/g, "").trim();
    var brandFont = (th["--font-brand"] || cs.getPropertyValue("--font-brand")).split(",")[0].replace(/["']/g, "").trim();
    var desc = $('meta[name="description"]');
    var html = '<div class="shr-h">Theme colors</div><p class="shr-muted">Changes colors across the whole site.</p>' +
      THEME.map(function (t) { var val = (th[t[0]] || cs.getPropertyValue(t[0])).trim(); return '<div class="shr-row"><label style="width:auto;flex:1">' + t[1] + '</label><input type="color" data-theme="' + t[0] + '" value="' + (/^#/.test(val) ? val.slice(0, 7) : "#000000") + '"></div>'; }).join("") +
      '<div class="shr-h">Fonts</div>' +
      '<div class="shr-field"><span>Headings</span><select data-themefont="--font-head">' + fontOptions(headFont) + "</select></div>" +
      '<div class="shr-field"><span>Body text</span><select data-themefont="--font-body">' + fontOptions(bodyFont) + "</select></div>" +
      '<div class="shr-field"><span>Logo name (SkyHighRigs)</span><select data-themefont="--font-brand">' + fontOptions(brandFont) + "</select></div>" +
      '<button class="shr-btn" style="width:100%" data-act="theme-reset">Reset theme to default</button>' +
      '<div class="shr-h">Booking requests</div>' +
      '<label class="shr-field"><span>Requests are sent to this email</span><input data-set="requestEmail" value="' + esc(st.requestEmail || "") + '"></label>' +
      '<label class="shr-field"><span>Form endpoint (optional). Paste a free Formspree URL (formspree.io) so requests arrive without opening the visitor\'s email app.</span><input data-set="formEndpoint" placeholder="https://formspree.io/f/xxxxxxx" value="' + esc(st.formEndpoint || "") + '"></label>' +
      '<label class="shr-field"><span>Free day every N rental days (0 = off)</span><input type="number" data-set="freeDayEvery" value="' + esc(st.freeDayEvery || 0) + '"></label>' +
      '<label class="shr-field"><span>Pickup / delivery options (one per line)</span><textarea rows="4" data-set="deliveryOptions">' + esc((st.deliveryOptions || []).join("\n")) + "</textarea></label>" +
      '<div class="shr-h">Search engines (SEO)</div>' +
      '<label class="shr-field"><span>Page title</span><input data-meta="title" value="' + esc(document.title) + '"></label>' +
      '<label class="shr-field"><span>Description</span><textarea rows="3" data-meta="description">' + esc(desc ? desc.content : "") + "</textarea></label>";
    ui.body.innerHTML = html;
    $$("[data-theme]", ui.body).forEach(function (i) {
      i.addEventListener("input", function () { var o = readTheme(); o[i.getAttribute("data-theme")] = i.value; writeTheme(o); });
    });
    $$("[data-themefont]", ui.body).forEach(function (s) {
      s.addEventListener("change", function () { if (!s.value) return; var o = readTheme(); o[s.getAttribute("data-themefont")] = fontStack(s.value); writeTheme(o); });
    });
    $$("[data-set]", ui.body).forEach(function (i) {
      i.addEventListener("change", function () {
        var k = i.getAttribute("data-set");
        SHR.settings[k] = k === "deliveryOptions" ? i.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) : k === "freeDayEvery" ? Number(i.value) || 0 : i.value.trim();
        dataChanged();
      });
    });
    $$("[data-meta]", ui.body).forEach(function (i) {
      i.addEventListener("change", function () {
        if (i.getAttribute("data-meta") === "title") document.title = i.value;
        else { var m = $('meta[name="description"]'); if (m) m.content = i.value; }
        markDirty(true);
      });
    });
  }
  function settingsAction(a) {
    if (a === "theme-reset") { var s = $("#shr-theme"); if (s) s.remove(); markDirty(true); renderSettingsTab(); return true; }
    return false;
  }

  /* ---------------- Help tab ---------------- */
  function renderHelpTab() {
    ui.body.innerHTML =
      '<div class="shr-h">How to edit</div>' +
      '<div class="shr-card"><b>Text</b><p class="shr-muted" style="margin:6px 0 0">Click any text and type. Highlight words to style only those words (bold, color, size, font). Without a highlight, styles apply to the whole element.</p></div>' +
      '<div class="shr-card"><b>Move things</b><p class="shr-muted" style="margin:6px 0 0">Select something, then use ↑ ↓ on the blue tag, or hold ✥ and drag it to a new spot (a green line shows where it lands). ⬑ selects the bigger block around it, e.g. a whole card.</p></div>' +
      '<div class="shr-card"><b>Photos &amp; videos</b><p class="shr-muted" style="margin:6px 0 0">Media tab → connect your SkyHighRigs folder → drop files in. Drag any thumbnail onto a placeholder. You can also drag files straight from Finder onto a placeholder.</p></div>' +
      '<div class="shr-card"><b>Gear</b><p class="shr-muted" style="margin:6px 0 0">The Gear tab controls the rig builder and the gear for sale: names, sizes, prices, photos and booked dates.</p></div>' +
      '<div class="shr-card"><b>Save &amp; publish</b><p class="shr-muted" style="margin:6px 0 0">Save (Cmd/Ctrl+S) writes into index.html in your folder. A backup of the previous version goes in the hidden .backups folder. To put changes live, commit and push to GitHub (see README).</p></div>' +
      '<div class="shr-h">Shortcuts</div><p class="shr-muted">Cmd/Ctrl+S save · Cmd/Ctrl+Z undo · Shift+Cmd/Ctrl+Z redo · Esc deselect · Delete removes the selected block (when not typing)</p>';
  }
})();
