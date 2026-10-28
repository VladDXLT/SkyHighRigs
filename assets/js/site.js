/* =========================================================
   SkyHighRigs — site behaviour
   - Rig builder (container -> canopy -> add-ons -> request)
   - Gear for sale grid
   - Request / contact forms
   - Header, nav, altimeter, reveal animations
   Inventory + settings are read from the JSON <script> tags
   at the bottom of index.html (edit them in the editor).
   ========================================================= */
(function () {
  "use strict";

  var SHR = (window.SHR = window.SHR || {});
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function readJSON(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    try { return JSON.parse(el.textContent); } catch (e) { console.warn("Bad JSON in #" + id, e); return fallback; }
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    if (n === "" || n == null || isNaN(Number(n))) return "";
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(s + "T12:00:00");
    return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  SHR.loadData = function () {
    SHR.data = readJSON("inventory-data", { containers: [], canopies: [], accessories: [] });
    SHR.data.containers = SHR.data.containers || [];
    SHR.data.canopies = SHR.data.canopies || [];
    SHR.data.accessories = SHR.data.accessories || [];
    SHR.settings = readJSON("site-settings", {});
  };
  /* Writes current data back into the JSON script tags (used by the editor). */
  SHR.writeData = function () {
    var inv = document.getElementById("inventory-data");
    var set = document.getElementById("site-settings");
    if (inv) inv.textContent = "\n" + JSON.stringify(SHR.data, null, 2) + "\n";
    if (set) set.textContent = "\n" + JSON.stringify(SHR.settings, null, 2) + "\n";
  };

  /* ---------------- Builder state ---------------- */
  var saved = lsGet("shr-fit") || {};
  var S = {
    step: 1,
    fit: { ft: saved.ft || "", inch: saved.inch || "", weight: saved.weight || "", jumps: saved.jumps || "" },
    from: "", to: "",
    cf: { type: "", color: "", model: "", main: "", fits: false },
    mf: { type: "", model: "", min: "", max: "", wl: false },
    container: null, canopy: null, ownContainer: false, ownCanopy: false,
    acc: {},
    delivery: "", address: ""
  };

  function heightIn() { var f = Number(S.fit.ft), i = Number(S.fit.inch); return f ? f * 12 + (i || 0) : 0; }
  function exitWeight() { var w = Number(S.fit.weight); return w ? w + 20 : 0; }
  function maxWL() {
    var j = Number(S.fit.jumps);
    if (!S.fit.jumps && S.fit.jumps !== 0) return null;
    if (j < 100) return 1.0; if (j < 200) return 1.1; if (j < 400) return 1.2;
    if (j < 600) return 1.3; if (j < 1000) return 1.5; return 1.8;
  }
  function wlFor(size) { var e = exitWeight(); return e && size ? e / size : 0; }

  function overlaps(item) {
    if (!S.from || !item.booked || !item.booked.length) return null;
    var a = S.from, b = S.to || S.from;
    for (var i = 0; i < item.booked.length; i++) {
      var bk = item.booked[i];
      if (bk.from <= b && bk.to >= a) return bk;
    }
    return null;
  }
  function nextBooking(item) {
    var today = new Date().toISOString().slice(0, 10);
    var up = (item.booked || []).filter(function (b) { return b.to >= today; }).sort(function (x, y) { return x.from < y.from ? -1 : 1; });
    return up[0] || null;
  }
  function days() {
    if (!S.from) return 0;
    var a = new Date(S.from + "T12:00:00"), b = new Date((S.to || S.from) + "T12:00:00");
    var d = Math.round((b - a) / 86400000) + 1;
    return d > 0 ? d : 0;
  }
  function chargeDays(d) {
    var every = Number(SHR.settings.freeDayEvery) || 0;
    return every ? d - Math.floor(d / every) : d;
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function uniq(list, key) { var o = []; list.forEach(function (x) { if (x[key] && o.indexOf(x[key]) < 0) o.push(x[key]); }); return o.sort(); }
  function opts(values, current, allLabel) {
    return '<option value="">' + esc(allLabel) + "</option>" + values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (String(v) === String(current) ? " selected" : "") + ">" + esc(v) + "</option>";
    }).join("");
  }
  function hasRig() { return !!(S.container || S.canopy); }

  /* ---------------- Builder render ---------------- */
  function minSuggested() { var ex = exitWeight(), mw = maxWL(); return ex && mw ? Math.ceil(ex / mw) : 0; }
  function fitInner() {
    var ex = exitWeight(), mw = maxWL(), minSize = minSuggested();
    return (minSize ? "<b>" + minSize + "+ sq ft</b>" : "<b>Your fit</b>") + "<span>" +
      (ex ? "Exit weight ~" + ex + " lb" + (mw ? " · Max wing loading " + mw.toFixed(1) + " · Smallest suggested canopy <b>" + minSize + " sq ft</b>" : " · Add your jump count for a size suggestion") : "Enter your weight and jump count to see suggested canopy sizes.") + "</span>";
  }
  var STEPS = ["Container", "Canopy", "Add-ons", "Request"];
  /* mode: "full" rebuilds everything, "flow" redraws the current step + summary,
     "grid" only redraws the results + summary (keeps inputs focused while typing). */
  function renderBuilder(mode) {
    var root = document.getElementById("rig-builder");
    if (!root) return;
    if (mode === "full" || !root.querySelector(".b-fit")) {
      root.innerHTML = '<div class="b-main"><div class="b-fit">' +
        '<label>Height (ft)<input type="number" min="4" max="7" data-fit="ft" value="' + esc(S.fit.ft) + '" placeholder="5"></label>' +
        '<label>Height (in)<input type="number" min="0" max="11" data-fit="inch" value="' + esc(S.fit.inch) + '" placeholder="10"></label>' +
        '<label>Weight (lb)<input type="number" min="80" max="350" data-fit="weight" value="' + esc(S.fit.weight) + '" placeholder="175"></label>' +
        '<label>Jumps<input type="number" min="0" data-fit="jumps" value="' + esc(S.fit.jumps) + '" placeholder="250"></label>' +
        '<label>Rental start<input type="date" data-date="from" value="' + esc(S.from) + '"></label>' +
        '<label>Rental end<input type="date" data-date="to" value="' + esc(S.to) + '"></label>' +
        '<div class="wl">' + fitInner() + "</div></div>" +
        '<div class="b-flow"></div></div><aside class="b-summary"></aside>';
      mode = "flow";
    }
    var minSize = minSuggested();
    var results = root.querySelector(".b-results");
    if (mode === "grid" && results && (S.step === 1 || S.step === 2)) {
      results.innerHTML = S.step === 1 ? stepContainer(true) : stepCanopy(minSize, true);
    } else {
      var html = '<div class="b-steps">' + STEPS.map(function (t, i) {
        var n = i + 1, done = (n === 1 && (S.container || S.ownContainer)) || (n === 2 && (S.canopy || S.ownCanopy)) || (n === 3 && Object.keys(S.acc).length);
        return '<button type="button" class="b-step' + (S.step === n ? " is-active" : "") + (done ? " is-done" : "") + '" data-goto="' + n + '"><span class="n">' + (done ? "✓" : n) + "</span>" + t + "</button>";
      }).join("") + "</div>";
      if (S.step === 1) html += stepContainer();
      else if (S.step === 2) html += stepCanopy(minSize);
      else if (S.step === 3) html += stepAccessories();
      else html += stepReview();
      html += '<div class="b-nav">' +
        (S.step > 1 ? '<button type="button" class="btn btn-ghost" data-goto="' + (S.step - 1) + '">← Back</button>' : "<span></span>") +
        (S.step < 4 ? '<button type="button" class="btn btn-dark" data-goto="' + (S.step + 1) + '">Next: ' + STEPS[S.step] + " →</button>" : "") +
        "</div>";
      var q = quote();
      html += '<div class="b-mbar"><span>Total<b>' + money(q.total) + '</b></span><button type="button" class="btn btn-primary btn-sm" data-request-rig' + (q.lines.length && q.total ? "" : " disabled") + ">Request rig</button></div>";
      root.querySelector(".b-flow").innerHTML = html;
    }
    root.querySelector(".b-summary").innerHTML = renderSummary();
  }

  function availBadge(item) {
    var c = overlaps(item);
    if (c) return '<span class="badge busy">Booked ' + fmtDate(c.from) + "–" + fmtDate(c.to) + "</span>";
    if (S.from) return '<span class="badge ok">Available for your dates</span>';
    var nb = nextBooking(item);
    return nb ? '<span class="badge ok">Available · booked ' + fmtDate(nb.from) + "–" + fmtDate(nb.to) + "</span>" : '<span class="badge ok">Available</span>';
  }
  function imgSlot(item, cls) {
    var src = item.images && item.images[0];
    return '<div class="media-slot ' + cls + '" data-item-id="' + esc(item.id) + '" data-view="' + esc(item.id) + '">' + (src ? '<img src="' + esc(src) + '" alt="' + esc(item.name) + '" loading="lazy">' : "") + "</div>";
  }

  function stepContainer(gridOnly) {
    var list = SHR.data.containers, h = heightIn(), w = Number(S.fit.weight), f = S.cf;
    var res = list.filter(function (c) {
      if (f.type && c.type !== f.type) return false;
      if (f.color && c.color !== f.color) return false;
      if (f.model && c.model !== f.model) return false;
      if (f.main && !(Number(f.main) >= c.mainMin && Number(f.main) <= c.mainMax)) return false;
      if (f.fits && h && (h < c.heightMin || h > c.heightMax)) return false;
      if (f.fits && w && (w < c.weightMin || w > c.weightMax)) return false;
      return true;
    });
    var out = '<div class="b-panel-head"><h3>1. Choose a container</h3><button type="button" class="b-skip' + (S.ownContainer ? " is-on" : "") + '" data-own="container">' + (S.ownContainer ? "✓ " : "") + "I have my own container</button></div>";
    out += '<div class="b-filters">' +
      '<select data-cf="model">' + opts(uniq(list, "model"), f.model, "All models") + "</select>" +
      '<select data-cf="type">' + opts(uniq(list, "type"), f.type, "All container types") + "</select>" +
      '<select data-cf="color">' + opts(uniq(list, "color"), f.color, "All colors") + "</select>" +
      '<input type="number" data-cf="main" value="' + esc(f.main) + '" placeholder="Main size (sq ft)" style="width:170px">' +
      '<label class="toggle"><input type="checkbox" data-cf="fits"' + (f.fits ? " checked" : "") + "> Fits my height &amp; weight</label>" +
      "</div>";
    var g = !res.length ? '<div class="b-empty">No containers match those filters. Try widening them, or message us and we\'ll find one.</div>' : '<div class="b-grid">' + res.map(function (c) {
      var fits = h && w ? h >= c.heightMin && h <= c.heightMax && w >= c.weightMin && w <= c.weightMax : null;
      var busy = !!overlaps(c);
      return '<article class="item' + (S.container === c.id ? " is-selected" : "") + (busy ? " is-unavailable" : "") + '">' + imgSlot(c, "item-media") +
        '<div class="item-body"><div class="item-title">' + esc(c.name) + "</div>" + availBadge(c) +
        (fits === true ? '<span class="badge ok">Fits your size</span>' : fits === false ? '<span class="badge warn">Outside listed size range</span>' : "") +
        '<ul class="item-specs"><li>Main range<b>' + c.mainMin + "–" + c.mainMax + " sq ft</b></li><li>Fits<b>" + ftIn(c.heightMin) + "–" + ftIn(c.heightMax) + ", " + c.weightMin + "–" + c.weightMax + " lb</b></li><li>AAD<b>" + esc(c.aad) + "</b></li><li>Reserve<b>" + esc(c.reserve) + "</b></li></ul>" +
        '<div class="item-prices"><span class="rent">' + money(c.rentDay) + "<small>/day</small></span>" + (c.buyPrice ? '<span class="buy">Buy ' + money(c.buyPrice) + "</span>" : "") + "</div>" +
        '<div class="item-actions"><button type="button" class="btn btn-ghost" data-view="' + esc(c.id) + '">Details</button><button type="button" class="btn ' + (S.container === c.id ? "btn-primary" : "btn-dark") + '" data-pick-container="' + esc(c.id) + '"' + (busy ? " disabled" : "") + ">" + (S.container === c.id ? "Selected" : "Select") + "</button></div></div></article>";
    }).join("") + "</div>";
    return gridOnly ? g : out + '<div class="b-results">' + g + "</div>";
  }
  function ftIn(inches) { inches = Number(inches); return inches ? Math.floor(inches / 12) + "'" + (inches % 12) + '"' : "?"; }

  function stepCanopy(minSize, gridOnly) {
    var list = SHR.data.canopies, f = S.mf, cont = S.container ? byId(SHR.data.containers, S.container) : null;
    var res = list.filter(function (m) {
      if (cont && (m.size < cont.mainMin || m.size > cont.mainMax)) return false;
      if (f.type && m.type !== f.type) return false;
      if (f.model && m.model !== f.model) return false;
      if (f.min && m.size < Number(f.min)) return false;
      if (f.max && m.size > Number(f.max)) return false;
      if (f.wl && minSize && m.size < minSize) return false;
      return true;
    });
    var out = '<div class="b-panel-head"><h3>2. Choose a canopy</h3><button type="button" class="b-skip' + (S.ownCanopy ? " is-on" : "") + '" data-own="canopy">' + (S.ownCanopy ? "✓ " : "") + "I have my own canopy</button></div>";
    if (cont) out += '<p class="fine" style="margin:-6px 0 14px">Showing canopies compatible with your <b>' + esc(cont.name) + "</b> (" + cont.mainMin + "–" + cont.mainMax + " sq ft).</p>";
    out += '<div class="b-filters">' +
      '<select data-mf="model">' + opts(uniq(list, "model"), f.model, "All models") + "</select>" +
      '<select data-mf="type">' + opts(uniq(list, "type"), f.type, "All canopy types") + "</select>" +
      '<input type="number" data-mf="min" value="' + esc(f.min) + '" placeholder="Min size" style="width:110px">' +
      '<input type="number" data-mf="max" value="' + esc(f.max) + '" placeholder="Max size" style="width:110px">' +
      '<label class="toggle"><input type="checkbox" data-mf="wl"' + (f.wl ? " checked" : "") + "> Within my suggested wing loading</label>" +
      "</div>";
    var g = !res.length ? '<div class="b-empty">No canopies match. Try another container or widen the filters.</div>' : '<div class="b-grid">' + res.map(function (m) {
      var wl = wlFor(m.size), mw = maxWL(), busy = !!overlaps(m);
      var wlBadge = wl ? (mw && wl > mw ? '<span class="badge warn">WL ' + wl.toFixed(2) + " · above suggestion</span>" : '<span class="badge ok">WL ' + wl.toFixed(2) + "</span>") : "";
      return '<article class="item' + (S.canopy === m.id ? " is-selected" : "") + (busy ? " is-unavailable" : "") + '">' + imgSlot(m, "item-media") +
        '<div class="item-body"><div class="item-title">' + esc(m.name) + "</div>" + availBadge(m) + wlBadge +
        '<ul class="item-specs"><li>Size<b>' + m.size + " sq ft</b></li><li>Type<b>" + esc(m.type) + "</b></li><li>Jumps<b>" + esc(m.jumps) + "</b></li><li>Lines<b>" + esc(m.lines) + "</b></li></ul>" +
        '<div class="item-prices"><span class="rent">' + money(m.rentDay) + "<small>/day</small></span>" + (m.buyPrice ? '<span class="buy">Buy ' + money(m.buyPrice) + "</span>" : "") + "</div>" +
        '<div class="item-actions"><button type="button" class="btn btn-ghost" data-view="' + esc(m.id) + '">Details</button><button type="button" class="btn ' + (S.canopy === m.id ? "btn-primary" : "btn-dark") + '" data-pick-canopy="' + esc(m.id) + '"' + (busy ? " disabled" : "") + ">" + (S.canopy === m.id ? "Selected" : "Select") + "</button></div></div></article>";
    }).join("") + "</div>";
    return gridOnly ? g : out + '<div class="b-results">' + g + "</div>";
  }

  function accPrice(a) { return hasRig() && a.bundleDay ? Number(a.bundleDay) : Number(a.rentDay); }
  function stepAccessories() {
    var out = '<div class="b-panel-head"><h3>3. Add helmet, altimeter &amp; more</h3></div>';
    out += '<p class="fine" style="margin:-6px 0 16px">' + (hasRig() ? "Bundle prices applied because you're renting a rig." : "Add a container or canopy to unlock bundle prices.") + "</p>";
    out += '<div class="b-grid">' + SHR.data.accessories.map(function (a) {
      var on = !!S.acc[a.id];
      return '<article class="item' + (on ? " is-selected" : "") + '">' + imgSlot(a, "item-media") +
        '<div class="item-body"><div class="item-title">' + esc(a.name) + '</div><ul class="item-specs"><li>Type<b>' + esc(a.kind) + "</b></li><li>Size<b>" + esc(a.size) + "</b></li></ul>" +
        '<div class="item-prices"><span class="rent">' + money(accPrice(a)) + "<small>/day</small></span>" + (hasRig() && a.bundleDay && Number(a.bundleDay) < Number(a.rentDay) ? '<span class="buy"><s>' + money(a.rentDay) + "</s> bundle</span>" : a.buyPrice ? '<span class="buy">Buy ' + money(a.buyPrice) + "</span>" : "") + "</div>" +
        '<div class="item-actions"><button type="button" class="btn ' + (on ? "btn-primary" : "btn-dark") + '" data-pick-acc="' + esc(a.id) + '">' + (on ? "✓ Added" : "Add") + "</button></div></div></article>";
    }).join("") + "</div>";
    return out;
  }

  function stepReview() {
    var d = days();
    var opts2 = (SHR.settings.deliveryOptions || []).map(function (o) { return "<option" + (o === S.delivery ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("");
    var out = '<div class="b-panel-head"><h3>4. Dates, delivery &amp; request</h3></div>';
    out += '<p class="fine" style="margin:-6px 0 4px">' + (d ? "Dates: <b>" + fmtDate(S.from) + (S.to && S.to !== S.from ? " – " + fmtDate(S.to) : "") + "</b> (" + d + " day" + (d > 1 ? "s" : "") + "). Change them in the bar above." : "Set your rental dates in the bar above.") + "</p>";
    out += '<div class="b-delivery"><label>Pickup or delivery<select data-deliv="delivery"><option value="">Choose one</option>' + opts2 + "</select></label>" +
      (/ship/i.test(S.delivery) ? '<label>Shipping address<input data-deliv="address" value="' + esc(S.address) + '" placeholder="Street, city, country"></label>' : "") + "</div>";
    var conflicts = [];
    [S.container && byId(SHR.data.containers, S.container), S.canopy && byId(SHR.data.canopies, S.canopy)].forEach(function (it) { if (it && overlaps(it)) conflicts.push(it.name); });
    if (conflicts.length) out += '<p class="b-conflict">Heads up: ' + esc(conflicts.join(", ")) + " is booked during those dates. Pick other dates or another item.</p>";
    return out;
  }

  function quote() {
    var d = days() || 1, cd = chargeDays(d), lines = [], total = 0;
    var c = S.container && byId(SHR.data.containers, S.container);
    var m = S.canopy && byId(SHR.data.canopies, S.canopy);
    if (c) { lines.push(["Container: " + c.name, c.rentDay * cd]); total += c.rentDay * cd; }
    else if (S.ownContainer) lines.push(["Container", "Own"]);
    if (m) { lines.push(["Canopy: " + m.name, m.rentDay * cd]); total += m.rentDay * cd; }
    else if (S.ownCanopy) lines.push(["Canopy", "Own"]);
    Object.keys(S.acc).forEach(function (id) { var a = byId(SHR.data.accessories, id); if (a) { var p = accPrice(a) * cd; lines.push([a.name, p]); total += p; } });
    return { days: d, charge: cd, lines: lines, total: total, free: d - cd };
  }

  function renderSummary() {
    var q = quote(), real = days();
    var out = "<h3>Your rig</h3>";
    if (!q.lines.length) out += '<p class="fine" style="margin:0 0 12px">Nothing selected yet. Start with a container, or skip it if you have your own.</p>';
    q.lines.forEach(function (l) { out += '<div class="sum-line' + (l[1] === "Own" ? " muted" : "") + '"><span>' + esc(l[0]) + "</span><b>" + (l[1] === "Own" ? "Using my own" : money(l[1])) + "</b></div>"; });
    out += '<div class="sum-line"><span>Dates</span><b>' + (real ? fmtDate(S.from) + (S.to && S.to !== S.from ? " – " + fmtDate(S.to) : "") + " · " + real + " day" + (real > 1 ? "s" : "") : "Not set (showing 1 day)") + "</b></div>";
    if (S.delivery) out += '<div class="sum-line"><span>Delivery</span><b>' + esc(S.delivery) + "</b></div>";
    out += '<div class="sum-total"><span>Total</span><b>' + money(q.total) + "</b></div>";
    out += '<div class="sum-note">' + (q.free > 0 ? q.free + " free day" + (q.free > 1 ? "s" : "") + " applied (every " + SHR.settings.freeDayEvery + "th day free)" : SHR.settings.freeDayEvery ? "Rent " + (SHR.settings.freeDayEvery - 1) + " days, get day " + SHR.settings.freeDayEvery + " free" : "") + "</div>";
    out += '<button type="button" class="btn btn-primary btn-block" data-request-rig' + (q.lines.length && q.total ? "" : " disabled") + ">Request this rig</button>";
    out += '<p class="fine" style="text-align:center">No account. No payment yet. We confirm availability and send a payment link.</p>';
    return out;
  }

  /* ---------------- Sale grid ---------------- */
  var saleTab = "all";
  function renderSale() {
    var root = document.getElementById("sale-grid");
    if (!root) return;
    var all = [];
    SHR.data.containers.forEach(function (x) { if (x.buyPrice) all.push({ cat: "containers", label: "Container", it: x }); });
    SHR.data.canopies.forEach(function (x) { if (x.buyPrice) all.push({ cat: "canopies", label: "Canopy", it: x }); });
    SHR.data.accessories.forEach(function (x) { if (x.buyPrice) all.push({ cat: "accessories", label: x.kind || "Accessory", it: x }); });
    var tabs = [["all", "All"], ["containers", "Containers"], ["canopies", "Canopies"], ["accessories", "Helmets, altimeters & more"]];
    var html = '<div class="chip-row">' + tabs.map(function (t) { return '<button type="button" class="chip' + (saleTab === t[0] ? " is-on" : "") + '" data-sale-tab="' + t[0] + '">' + esc(t[1]) + "</button>"; }).join("") + "</div>";
    var list = all.filter(function (x) { return saleTab === "all" || x.cat === saleTab; });
    if (!list.length) html += '<div class="b-empty">Nothing listed here right now. Message us about what you\'re looking for.</div>';
    else html += '<div class="b-grid">' + list.map(function (x) {
      var it = x.it, specs = "";
      if (x.cat === "containers") specs = "<li>Main range<b>" + it.mainMin + "–" + it.mainMax + "</b></li><li>AAD<b>" + esc(it.aad) + "</b></li><li>Reserve<b>" + esc(it.reserve) + "</b></li><li>Jumps<b>" + esc(it.jumps) + "</b></li>";
      else if (x.cat === "canopies") specs = "<li>Size<b>" + it.size + " sq ft</b></li><li>Type<b>" + esc(it.type) + "</b></li><li>Jumps<b>" + esc(it.jumps) + "</b></li><li>Lines<b>" + esc(it.lines) + "</b></li>";
      else specs = "<li>Type<b>" + esc(it.kind) + "</b></li><li>Size<b>" + esc(it.size) + "</b></li>";
      return '<article class="item">' + imgSlot(it, "item-media") + '<div class="item-body"><span class="tag" style="width:fit-content">' + esc(x.label) + '</span><div class="item-title">' + esc(it.name) + '</div><ul class="item-specs">' + specs + "</ul>" +
        '<div class="item-prices"><span class="rent">' + money(it.buyPrice) + "</span>" + (it.rentDay ? '<span class="buy">or rent ' + money(it.rentDay) + "/day</span>" : "") + "</div>" +
        '<div class="item-actions"><button type="button" class="btn btn-ghost" data-view="' + esc(it.id) + '">Details</button><button type="button" class="btn btn-dark" data-buy="' + esc(it.id) + '">Ask to buy</button></div></div></article>';
    }).join("") + "</div>";
    root.innerHTML = html;
  }

  /* ---------------- Modal ---------------- */
  function findAny(id) {
    return byId(SHR.data.containers, id) || byId(SHR.data.canopies, id) || byId(SHR.data.accessories, id);
  }
  function openModal(inner, wide) {
    var m = document.getElementById("request-modal");
    m.innerHTML = '<div class="modal-box' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true"><button type="button" class="modal-close" data-close aria-label="Close">✕</button>' + inner + "</div>";
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    var m = document.getElementById("request-modal");
    m.classList.remove("is-open"); m.setAttribute("aria-hidden", "true"); m.innerHTML = "";
  }
  SHR.closeModal = closeModal;

  function openDetails(id) {
    var it = findAny(id);
    if (!it) return;
    var imgs = it.images || [];
    var rows = [];
    function r(k, v) { if (v !== "" && v != null) rows.push("<li>" + k + "<b>" + esc(v) + "</b></li>"); }
    if (it.mainMin) { r("Model", it.model); r("Type", it.type); r("Color", it.color); r("Main range", it.mainMin + "–" + it.mainMax + " sq ft"); r("Fits height", ftIn(it.heightMin) + " – " + ftIn(it.heightMax)); r("Fits weight", it.weightMin + "–" + it.weightMax + " lb"); r("AAD", it.aad); r("Reserve", it.reserve); r("Reserve pack date", it.reservePack); r("Jumps on rig", it.jumps); }
    else if (it.size && it.model) { r("Model", it.model); r("Size", it.size + " sq ft"); r("Type", it.type); r("Color", it.color); r("Jumps", it.jumps); r("Lines", it.lines); }
    else { r("Type", it.kind); r("Size", it.size); }
    r("Notes", it.notes);
    var bk = (it.booked || []).map(function (b) { return fmtDate(b.from) + "–" + fmtDate(b.to); }).join(", ");
    if (bk) r("Booked", bk);
    var html = '<div class="detail"><div><div class="media-slot" id="detail-main">' + (imgs[0] ? '<img src="' + esc(imgs[0]) + '" alt="">' : "") + "</div>" +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (s, i) { return '<img src="' + esc(s) + '" data-thumb="' + esc(s) + '" class="' + (i ? "" : "is-on") + '" alt="">'; }).join("") + "</div>" : "") + "</div>" +
      '<div><h3 style="font-size:2rem">' + esc(it.name) + "</h3>" + '<ul class="item-specs">' + rows.join("") + "</ul>" +
      '<div class="item-prices" style="margin:14px 0">' + (it.rentDay ? '<span class="rent">' + money(it.rentDay) + "<small>/day</small></span>" : "<span></span>") + (it.buyPrice ? '<span class="buy">Buy ' + money(it.buyPrice) + "</span>" : "") + "</div>" +
      '<div class="item-actions">' + (it.buyPrice ? '<button type="button" class="btn btn-ghost" data-buy="' + esc(it.id) + '">Ask to buy</button>' : "") + '<button type="button" class="btn btn-dark" data-close data-goto-rent>Rent it</button></div></div></div>';
    openModal(html, true);
  }

  function rigSummaryText() {
    var q = quote(), real = days(), t = [];
    q.lines.forEach(function (l) { t.push(l[0] + ": " + (l[1] === "Own" ? "using my own" : money(l[1]))); });
    t.push("Dates: " + (real ? S.from + " to " + (S.to || S.from) + " (" + real + " days)" : "not set"));
    if (S.delivery) t.push("Delivery: " + S.delivery + (S.address ? " · " + S.address : ""));
    t.push("Estimated total: " + money(q.total) + (q.free ? " (" + q.free + " free day" + (q.free > 1 ? "s" : "") + ")" : ""));
    if (S.fit.weight) t.push("Jumper: " + (heightIn() ? ftIn(heightIn()) + ", " : "") + S.fit.weight + " lb, " + (S.fit.jumps || "?") + " jumps");
    return t.join("\n");
  }

  function openRequest(kind, item, summary) {
    var titles = { rig: "Request your rig", course: "Request a spot", rigging: "Request rigging service", buy: "Ask to buy" };
    var html = '<p class="eyebrow">' + esc(kind === "rig" ? "Gear rental" : kind === "buy" ? "Gear sale" : kind === "course" ? "Training" : "Rigging loft") + "</p>" +
      '<h3 style="font-size:2rem">' + esc(titles[kind] || "Send a request") + (item && kind !== "rig" ? ": " + esc(item) : "") + "</h3>" +
      (summary ? '<div class="modal-sum">' + esc(summary) + "</div>" : "") +
      '<form class="req-form" data-req-form data-kind="' + esc(kind) + '" data-item="' + esc(item || "") + '">' +
      '<div class="field-row"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label></div>' +
      '<div class="field-row"><label>Phone<input name="phone" type="tel"></label>' +
      (kind === "rig" || kind === "course" ? '<label>License<select name="license"><option>Student</option><option>A</option><option>B</option><option>C</option><option>D</option><option>Not a skydiver yet</option></select></label>' : '<label>Best way to reach you<select name="contactPref"><option>Text</option><option>Call</option><option>Email</option><option>Instagram DM</option></select></label>') + "</div>" +
      (kind === "rig" ? '<div class="field-row"><label>USPA #<input name="uspa"></label><label>Jump count<input name="jumps" type="number" value="' + esc(S.fit.jumps) + '"></label></div>' : "") +
      (kind === "course" ? '<div class="field-row"><label>Jump count<input name="jumps" type="number"></label><label>Preferred dates<input name="dates" placeholder="e.g. weekends in Dec"></label></div>' : "") +
      (kind === "rigging" ? '<label>What do you need?<select name="service"><option>Reserve repack</option><option>Main line replacement</option><option>Canopy patching / repair</option><option>Container repair</option><option>Rig inspection / assembly</option><option>AAD service</option><option>Something else</option></select></label><label>Drop off or ship<select name="dropoff"><option>Drop off at Skydive Perris</option><option>Drop off at Skydive Elsinore</option><option>Ship to you</option></select></label>' : "") +
      '<label>Message<textarea name="message" rows="3" placeholder="Anything we should know?"></textarea></label>' +
      (kind === "rig" ? '<label class="check"><input type="checkbox" required> I understand a signed rental waiver is required, and that the reserve ride, damage and cleaning policies apply.</label>' : "") +
      '<button class="btn btn-primary btn-block" type="submit">Send request</button><p class="form-note" aria-live="polite"></p></form>';
    openModal(html);
    var f = $("[data-req-form]");
    if (f) f._summary = summary || "";
  }

  function submitForm(form, subject, summary) {
    var data = {};
    $$("input, select, textarea", form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
    data._subject = subject;
    if (summary) data.summary = summary;
    var note = $(".form-note", form);
    var endpoint = (SHR.settings.formEndpoint || "").trim();
    if (endpoint) {
      note.textContent = "Sending…";
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); note.textContent = "Sent! We'll get back to you shortly."; form.reset(); })
        .catch(function () { note.textContent = "Couldn't send. Opening your email app instead…"; mailto(data, subject); });
    } else {
      mailto(data, subject);
      note.textContent = "Your email app should open with everything filled in. Just hit send.";
    }
  }
  function mailto(data, subject) {
    var body = Object.keys(data).filter(function (k) { return k[0] !== "_" && data[k]; }).map(function (k) { return k + ": " + data[k]; }).join("\n");
    window.location.href = "mailto:" + (SHR.settings.requestEmail || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  /* ---------------- Events (delegated, so re-renders never break them) ---------------- */
  function editing() { return document.body.classList.contains("shr-editing"); }
  function rerender() { renderBuilder("flow"); }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var el;
    if ((el = t.closest("[data-close]"))) {
      closeModal();
      if (el.hasAttribute("data-goto-rent")) { var r = document.getElementById("rent"); if (r) r.scrollIntoView(); }
      return;
    }
    if (t.id === "request-modal") { closeModal(); return; }
    if ((el = t.closest("[data-goto]"))) { S.step = Number(el.getAttribute("data-goto")); rerender(); var b = document.getElementById("rig-builder"); if (b && b.getBoundingClientRect().top < 0) b.scrollIntoView({ behavior: "smooth" }); return; }
    if ((el = t.closest("[data-own]"))) {
      var which = el.getAttribute("data-own");
      if (which === "container") { S.ownContainer = !S.ownContainer; if (S.ownContainer) { S.container = null; S.step = 2; } }
      else { S.ownCanopy = !S.ownCanopy; if (S.ownCanopy) { S.canopy = null; S.step = 3; } }
      rerender(); return;
    }
    if ((el = t.closest("[data-pick-container]"))) {
      var id = el.getAttribute("data-pick-container");
      S.container = S.container === id ? null : id; S.ownContainer = false;
      var c = S.container && byId(SHR.data.containers, S.container), m = S.canopy && byId(SHR.data.canopies, S.canopy);
      if (c && m && (m.size < c.mainMin || m.size > c.mainMax)) S.canopy = null;
      if (S.container) S.step = 2;
      rerender(); return;
    }
    if ((el = t.closest("[data-pick-canopy]"))) {
      var mid = el.getAttribute("data-pick-canopy");
      S.canopy = S.canopy === mid ? null : mid; S.ownCanopy = false;
      if (S.canopy) S.step = 3;
      rerender(); return;
    }
    if ((el = t.closest("[data-pick-acc]"))) {
      var aid = el.getAttribute("data-pick-acc");
      if (S.acc[aid]) delete S.acc[aid]; else S.acc[aid] = true;
      rerender(); return;
    }
    if ((el = t.closest("[data-request-rig]"))) { openRequest("rig", "", rigSummaryText()); return; }
    if ((el = t.closest("[data-sale-tab]"))) { saleTab = el.getAttribute("data-sale-tab"); renderSale(); return; }
    if ((el = t.closest("[data-buy]"))) { var it = findAny(el.getAttribute("data-buy")); openRequest("buy", it ? it.name : "", it ? it.name + " · " + money(it.buyPrice) : ""); return; }
    if ((el = t.closest("[data-thumb]"))) { var main = $("#detail-main"); main.innerHTML = '<img src="' + esc(el.getAttribute("data-thumb")) + '" alt="">'; $$(".thumbs img").forEach(function (i) { i.classList.toggle("is-on", i === el); }); return; }
    if ((el = t.closest("[data-view]"))) { if (!editing()) openDetails(el.getAttribute("data-view")); return; }
    if (editing()) return; // the rest are navigation/requests the editor shouldn't trigger
    if ((el = t.closest("[data-request]"))) { e.preventDefault(); openRequest(el.getAttribute("data-request"), el.getAttribute("data-item") || ""); return; }
    if ((el = t.closest("#course-filters [data-filter]"))) {
      var f = el.getAttribute("data-filter");
      $$("#course-filters .chip").forEach(function (c) { c.classList.toggle("is-on", c === el); });
      $$(".course-card").forEach(function (c) { c.classList.toggle("is-hidden", f !== "all" && c.getAttribute("data-cat") !== f); });
      return;
    }
    if ((el = t.closest("#nav-toggle"))) { var h = $("#site-header"); var open = h.classList.toggle("nav-open"); el.setAttribute("aria-expanded", open); return; }
    if (t.closest(".main-nav a")) { $("#site-header").classList.remove("nav-open"); }
  });

  var gridT;
  function gridSoon() { clearTimeout(gridT); gridT = setTimeout(function () { renderBuilder("grid"); }, 300); }
  function onField(e) {
    var t = e.target, k;
    if (!t.getAttribute) return;
    if ((k = t.getAttribute("data-fit"))) {
      if (e.type !== "input") return;
      S.fit[k] = t.value; lsSet("shr-fit", S.fit);
      var box = $(".b-fit .wl"); if (box) box.innerHTML = fitInner();
      gridSoon(); return;
    }
    if ((k = t.getAttribute("data-date"))) {
      if (e.type !== "change") return;
      S[k] = t.value;
      if (S.from && S.to && S.to < S.from) { S.to = S.from; var te = $('.b-fit [data-date="to"]'); if (te) te.value = S.to; }
      renderBuilder("flow"); return;
    }
    if ((k = t.getAttribute("data-cf") || t.getAttribute("data-mf"))) {
      var obj = t.hasAttribute("data-cf") ? S.cf : S.mf;
      if (t.type === "number") { if (e.type !== "input") return; obj[k] = t.value; gridSoon(); return; }
      if (e.type !== "change") return;
      obj[k] = t.type === "checkbox" ? t.checked : t.value; renderBuilder("grid"); return;
    }
    if ((k = t.getAttribute("data-deliv"))) {
      S[k] = t.value;
      if (k === "delivery" && e.type === "change") renderBuilder("flow");
      return;
    }
  }
  document.addEventListener("input", onField);
  document.addEventListener("change", onField);

  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.matches("[data-req-form]")) {
      e.preventDefault();
      var kind = f.getAttribute("data-kind"), item = f.getAttribute("data-item");
      var subj = { rig: "Rig rental request", buy: "Purchase inquiry", course: "Course request", rigging: "Rigging request" }[kind] || "Request";
      submitForm(f, "SkyHighRigs · " + subj + (item ? ": " + item : ""), f._summary);
    } else if (f.id === "contact-form") {
      e.preventDefault();
      if (editing()) return;
      submitForm(f, "SkyHighRigs · Website message", "");
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  /* ---------------- Header, altimeter, reveal ---------------- */
  var header = $("#site-header"), altEl = $("#altimeter"), altVal = $("#alt-val"), altFill = $("#alt-fill");
  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle("is-solid", y > 40);
    if (altEl) {
      var frac = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      var alt = Math.round((13500 * (1 - frac)) / 50) * 50;
      altVal.textContent = alt.toLocaleString("en-US");
      altFill.style.height = (100 - frac * 100) + "%";
      altEl.classList.toggle("is-shown", y > 200);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  var revealSel = ".section-head, .svc-card, .course-card, .team-card, .deal, .event, .review, .policy, .compare, .price-list li, .contact-form";
  function setupReveal() {
    if (!("IntersectionObserver" in window) || editing()) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(revealSel).forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
    SHR._io = io;
  }
  SHR.stopReveal = function () {
    if (SHR._io) SHR._io.disconnect();
    $$(".reveal").forEach(function (el) { el.classList.remove("reveal", "is-visible"); });
  };

  /* Remove everything this script adds at runtime from a cloned document (used when the editor saves). */
  SHR.cleanForSave = function (doc) {
    ["reveal", "is-visible", "is-solid", "nav-open", "is-shown", "is-hidden"].forEach(function (c) {
      $$("." + c, doc).forEach(function (el) { el.classList.remove(c); });
    });
    $$("[data-generated]", doc).forEach(function (el) { el.innerHTML = ""; });
    var modal = $("#request-modal", doc); if (modal) { modal.innerHTML = ""; modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }
    var chips = $$("#course-filters .chip", doc); chips.forEach(function (c, i) { c.classList.toggle("is-on", i === 0); });
    var af = $("#alt-fill", doc); if (af) af.removeAttribute("style");
    var av = $("#alt-val", doc); if (av) av.textContent = "13,500";
    var nt = $("#nav-toggle", doc); if (nt) nt.setAttribute("aria-expanded", "false");
    $$("[class='']", doc).forEach(function (el) { el.removeAttribute("class"); });
  };

  SHR.render = function () { renderBuilder("full"); renderSale(); };

  SHR.loadData();
  renderBuilder();
  renderSale();
  onScroll();
  setupReveal();
})();
