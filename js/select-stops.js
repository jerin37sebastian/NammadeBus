(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var id = new URLSearchParams(location.search).get("route") || "";
  var fromSel = $("#fromSel"), toSel = $("#toSel"), stops = [], ads = {};

  /* Placeholder data used ONLY when Firebase is not configured yet, so you can test the layout. */
  var DEMO = { status: "live", routeOrder: ["Thodupuzha Stand", "Pannimattom", "Injikatt Kavala", "Muttom", "Poomala"],
    stopAds: { "Injikatt Kavala": { name: "Kavala Store", tagline: "Fresh groceries daily." } } };

  var title = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var places = id.split("-").map(title);
  var A = places[0] || "Route", B = places[1] || "Thodupuzha";

  function setSeo() {
    var t = B + " to " + A + " Bus Timings | Nammade Bus";
    document.title = t;
    var d = "Bus timings between " + B + " and " + A + ". Pick your boarding stop and destination to see the next bus and full schedule.";
    document.querySelector('meta[name="description"]').content = d;
    var c = document.querySelector('link[rel="canonical"]'); if (c) c.href = NB.SITE + "select-stops.html?route=" + encodeURIComponent(id);
  }

  function fail(msg) { $("#selector").hidden = true; $("#ad").hidden = true; $("#routeNote").textContent = msg; }

  function fill(sel, keep) {
    sel.innerHTML = "";
    stops.forEach(function (s) { var o = document.createElement("option"); o.value = o.textContent = s; sel.appendChild(o); });
    if (keep) sel.value = keep;
  }
  function lockSame() {
    [].forEach.call(toSel.options, function (o) { o.disabled = o.value === fromSel.value; });
    [].forEach.call(fromSel.options, function (o) { o.disabled = o.value === toSel.value; });
  }
  function showAd() {
    var a = ads[fromSel.value], box = $("#ad");
    if (!a || !a.name) { box.hidden = true; return; }
    box.hidden = false;
    $("#adName").textContent = a.name;
    $("#adText").textContent = a.tagline || a.description || "";
    $("#adLogo").textContent = a.initials || a.name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  /* Use routeOrder, or the stops in stopOffsets (sorted by minutes) if that list is longer. */
  function stopList(r) {
    var a = Array.isArray(r.routeOrder) ? r.routeOrder.slice() : [], b = [];
    if (r.stopOffsets && typeof r.stopOffsets === "object") {
      b = Object.keys(r.stopOffsets).sort(function (x, y) { return r.stopOffsets[x] - r.stopOffsets[y]; });
    }
    return b.length > a.length ? b : a;
  }

  function init(r, demo) {
    if (r) r.routeOrder = stopList(r);
    if (!r || !r.routeOrder || r.routeOrder.length < 2) { fail("We could not load the stops for this route. Please go back and try again."); return; }
    if (r.status && r.status !== "live") { fail("This route is coming soon. Check back later."); return; }
    stops = r.routeOrder; ads = r.stopAds || {};
    $("#routeNote").textContent = (demo ? "Demo stops (Firebase is not connected yet). " : "") + "This route consist of " + stops.join(", ") + ".";
    var saved = NB.store.get("nb-sel-" + id, {});
    fill(fromSel, stops.indexOf(saved.from) > -1 ? saved.from : stops[0]);
    fill(toSel, stops.indexOf(saved.to) > -1 ? saved.to : stops[stops.length - 1]);
    if (fromSel.value === toSel.value) toSel.value = stops[stops.length - 1] !== fromSel.value ? stops[stops.length - 1] : stops[0];
    lockSame(); showAd();
  }

  fromSel.addEventListener("change", function () { lockSame(); showAd(); });
  toSel.addEventListener("change", lockSame);
  $("#swapBtn").addEventListener("click", function () {
    var f = fromSel.value; fromSel.value = toSel.value; toSel.value = f; lockSame(); showAd();
  });
  $("#startBtn").addEventListener("click", function () {
    if (!fromSel.value || fromSel.value === toSel.value) { NB.toast("Pick two different stops"); return; }
    NB.store.set("nb-sel-" + id, { from: fromSel.value, to: toSel.value });
    location.href = "timing.html?route=" + encodeURIComponent(id) + "&from=" + encodeURIComponent(fromSel.value) + "&to=" + encodeURIComponent(toSel.value);
  });

  $("#routeLabel").innerHTML = A + ' <b>&#8644;</b> ' + B;
  setSeo();
  if (!id) { fail("No route selected. Go back to Home and choose a route."); return; }
  $("#routeNote").textContent = "Loading stops...";
  NB.ready.then(function (db) {
    if (!db) { init(DEMO, true); return; }
    db.collection("routes").doc(id).get().then(function (d) { init(d.exists ? d.data() : null); }).catch(function () { init(null); });
  });
})();
