(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var q = new URLSearchParams(location.search);
  var ID = q.get("route") || "", FROM = q.get("from") || "", TO = q.get("to") || "";
  var MAX_PINS = 3, GRACE = 10;               // GRACE = minutes a finished pinned journey stays
  /* Which schedule runs which way. ASSUMPTION: moving forward along routeOrder = towards Thodupuzha = schedule_to.
     If your buses show on the wrong direction, swap these two words. */
  var FWD = "schedule_to", BACK = "schedule_from";
  var route, off = {}, seg = [], buses = [], cards = {};
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var clock = function (d) { var h = d.getHours(), m = d.getMinutes(); return ((h % 12) || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM"); };

  /* placeholder data, used only when Firebase is not configured (coordinates are rough guesses) */
  function demo() {
    var order = ["Thodupuzha Stand", "Pannimattom", "Injikatt Kavala", "Muttom", "Poomala"];
    var offs = { "Thodupuzha Stand": 0, "Pannimattom": 8, "Injikatt Kavala": 20, "Muttom": 30, "Poomala": 40 };
    var n = new Date(), nm = n.getHours() * 60 + n.getMinutes(), base = offs[FROM] || 0;
    var mk = function (k, name) { var t = (nm + k - base + 1440) % 1440; return { time: Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2), period: "", busName: name, regNum: name === "Mariya" ? "KL 06 A 1234" : "" }; };
    var list = [mk(6, "Mariya"), mk(18, "Sree Devi"), mk(33, "Anjali"), mk(52, "Mariya"), mk(80, "Holy Mary")];
    return { status: "live", routeOrder: order, stopOffsets: offs, schedule_to: list, schedule_from: list,
      stopCoordinates: { "Thodupuzha Stand": { lat: 9.8951, lng: 76.7186 }, "Pannimattom": { lat: 9.8858, lng: 76.728 }, "Injikatt Kavala": { lat: 9.87, lng: 76.745 }, "Muttom": { lat: 9.85, lng: 76.78 }, "Poomala": { lat: 9.84, lng: 76.82 } },
      stopAds: { "Injikatt Kavala": { name: "Kavala Store", tagline: "Fresh groceries daily." } } };
  }

  function parseT(b) {
    var m = /(\d{1,2})[:.](\d{2})\s*([ap]m)?/i.exec((b.time || "") + " " + (b.period || "")); if (!m) return null;
    var h = +m[1], p = (m[3] || b.period || "").toLowerCase();
    if (p === "pm" && h < 12) h += 12; if (p === "am" && h === 12) h = 0; return h * 60 + +m[2];
  }
  function build() {
    var order = route.routeOrder, fi = order.indexOf(FROM), ti = order.indexOf(TO);
    seg = fi < ti ? order.slice(fi, ti + 1) : order.slice(ti, fi + 1).reverse();
    off = route.stopOffsets || {};
    var arr = route[fi < ti ? FWD : BACK] || [], d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var dur = Math.abs((off[TO] || 0) - (off[FROM] || 0));
    buses = arr.map(function (b) {
      var m = parseT(b); if (m == null) return null;
      var dep = new Date(d0.getTime() + (m + (off[FROM] || 0)) * 60000);
      return { key: ID + "|" + FROM + "|" + TO + "|" + dep.getTime(), name: b.busName || "Bus", reg: b.regNum || "", dep: dep, arr: new Date(dep.getTime() + dur * 60000) };
    }).filter(Boolean).sort(function (a, b) { return a.dep - b.dep; });
  }
  var stopT = function (b, s) { return b.dep.getTime() + Math.abs((off[s] || 0) - (off[FROM] || 0)) * 60000; };

  /* live numbers for one bus at time `now` (all schedule maths, no GPS) */
  function stat(b, now) {
    var t = now.getTime(), done = t >= b.arr, run = t >= b.dep, passed = 0;
    if (run) seg.forEach(function (s, i) { if (i > 0 && stopT(b, s) <= t) passed = i; });
    return {
      state: done ? "done" : run ? "run" : "wait",
      wait: Math.max(1, Math.ceil((b.dep - t) / 60000)),
      rem: done ? 0 : seg.length - 1 - passed,
      left: done ? 0 : Math.max(0, Math.round((b.arr - (run ? t : b.dep)) / 60000)),
      prog: done ? 1 : run ? (t - b.dep) / (b.arr - b.dep || 1) : 0
    };
  }
  var cls = function (m) { return m <= 4 ? "c-red" : m <= 6 ? "c-orange" : m <= 8 ? "c-yellow" : "c-green"; };

  /* pins (max 3, shared across routes) */
  var pins = NB.store.get("nb-journeys", []);
  var savePins = function () { NB.store.set("nb-journeys", pins); };
  var isPinned = function (k) { return pins.some(function (p) { return p.key === k; }); };
  function purge(now) { var n = pins.length; pins = pins.filter(function (p) { return now.getTime() < p.arr + GRACE * 60000; }); if (pins.length !== n) savePins(); }

  /* carousel */
  var car = $("#carousel"), dots = $("#dots");
  function cardHtml(b) {
    var reg = b.reg ? '<p class="b-reg">' + esc(b.reg) + "</p>" : '<button class="b-reg missing" data-a="reg">&#128652; Help us add reg. number</button>';
    return '<p class="b-label"></p><h2 class="b-name">' + esc(b.name) + "</h2>" + reg +
      '<p class="b-time">' + clock(b.dep) + '</p><p class="b-count"></p>' +
      '<button class="go jbtn" data-a="status" aria-expanded="false">&#128202; Journey status</button>' +
      '<div class="jpanel" hidden><dl>' +
      '<div><dt>&#128655; Stops remaining</dt><dd data-f="rem"></dd></div>' +
      '<div><dt>&#9201;&#65039; Journey time</dt><dd data-f="left"></dd></div>' +
      '<div><dt>&#128205; Arrival time</dt><dd data-f="arr">' + clock(b.arr) + '</dd></div></dl>' +
      '<p class="p-label">Journey progress</p><div class="bar"><i data-f="bar"></i></div></div>' +
      '<button class="pinj" data-a="pin" aria-pressed="false"></button><p class="b-note" hidden></p>';
  }
  function add(b) {
    var el = document.createElement("article"); el.className = "card bus"; el.dataset.key = b.key; el.innerHTML = cardHtml(b);
    car.appendChild(el); cards[b.key] = { el: el, b: b }; return el;
  }
  function upd(c, now) {
    var b = c.b, s = stat(b, now), el = c.el, pinned = isPinned(b.key), cnt = el.querySelector(".b-count");
    cnt.textContent = s.state === "wait" ? "In " + s.wait + (s.wait === 1 ? " min" : " mins") : s.state === "run" ? "Departed" : "Journey completed";
    cnt.className = "b-count " + (s.state === "wait" ? cls(s.wait) : "c-grey");
    el.querySelector('[data-f="rem"]').textContent = s.rem;
    el.querySelector('[data-f="left"]').textContent = s.left + (s.left === 1 ? " min" : " mins");
    el.querySelector('[data-f="bar"]').style.width = Math.round(s.prog * 100) + "%";
    var pb = el.querySelector(".pinj"); pb.setAttribute("aria-pressed", pinned); pb.textContent = pinned ? "\uD83D\uDCCC Pinned - tap to unpin" : "\uD83D\uDCCC Pin this journey";
    var note = el.querySelector(".b-note");
    if (pinned && s.state === "done") {
      var p = pins.filter(function (x) { return x.key === b.key; })[0], left = Math.max(0, Math.ceil((p.arr + GRACE * 60000 - now.getTime()) / 60000));
      note.hidden = false; note.textContent = "This journey has ended. Unpin this card to see the next bus. It will unpin itself in " + left + " min.";
    } else note.hidden = true;
  }
  function relabel() {
    var list = [].slice.call(car.children), first = true;
    list.forEach(function (el) {
      var c = cards[el.dataset.key], st = stat(c.b, new Date()).state, l = el.querySelector(".b-label");
      if (st === "wait" && first) { l.textContent = "Next bus arriving"; first = false; } else l.textContent = st === "wait" ? "Upcoming bus" : "Pinned journey";
    });
    $("#hint").hidden = list.length < 2; $("#noBus").hidden = list.length > 0;
    dots.innerHTML = list.length > 1 ? list.map(function (_, i) { return "<i" + (i === 0 ? ' class="on"' : "") + "></i>"; }).join("") : "";
  }
  car.addEventListener("scroll", function () {
    var i = Math.round(car.scrollLeft / (car.clientWidth || 1));
    [].forEach.call(dots.children, function (d, j) { d.classList.toggle("on", j === i); });
  }, { passive: true });

  car.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-a]"); if (!btn) return;
    var el = btn.closest(".bus"), c = cards[el.dataset.key], a = btn.dataset.a;
    if (a === "status") { var p = el.querySelector(".jpanel"); p.hidden = !p.hidden; btn.setAttribute("aria-expanded", !p.hidden); }
    else if (a === "reg") NB.toast("Reg. number form is coming soon");
    else if (a === "pin") {
      if (isPinned(c.b.key)) { pins = pins.filter(function (x) { return x.key !== c.b.key; }); savePins(); }
      else if (pins.length >= MAX_PINS) { NB.toast("You can pin up to 3 journeys. Unpin one to add another."); return; }
      else { pins.push({ key: c.b.key, arr: c.b.arr.getTime() }); savePins(); startLoc(); }
      upd(c, new Date());
    }
  });

  function tick() {
    var now = new Date(); purge(now);
    Object.keys(cards).forEach(function (k) {
      var c = cards[k];
      if (!isPinned(k) && now >= c.b.dep) { c.el.remove(); delete cards[k]; } else upd(c, now);
    });
    relabel(); markPast(now);
  }

  /* full schedule */
  var sPanel = $("#schedPanel"), sIn = $("#schedSearch");
  function renderSched() {
    $("#schedList").innerHTML = buses.map(function (b) {
      return '<li data-t="' + esc((b.name + " " + clock(b.dep)).toLowerCase()) + '" data-dep="' + b.dep.getTime() + '"><b>' + clock(b.dep) + "</b><span>" + esc(b.name) + (b.reg ? " <small>" + esc(b.reg) + "</small>" : "") + "</span></li>";
    }).join("") || "<li>No buses listed.</li>";
  }
  function markPast(now) { [].forEach.call(document.querySelectorAll("#schedList li[data-dep]"), function (li) { li.classList.toggle("past", +li.dataset.dep < now.getTime()); }); }
  function toggleSched(open) { sPanel.hidden = !open; $("#schedBtn").setAttribute("aria-expanded", open); }
  $("#schedBtn").addEventListener("click", function () { toggleSched(sPanel.hidden); });
  $("#schedSearchBtn").addEventListener("click", function () { toggleSched(true); sIn.focus(); });
  sIn.addEventListener("input", function () {
    var v = sIn.value.trim().toLowerCase();
    [].forEach.call(document.querySelectorAll("#schedList li[data-t]"), function (li) { li.hidden = li.dataset.t.indexOf(v) < 0; });
  });

  /* ads along the trip */
  function ads() {
    var list = seg.map(function (s) { return (route.stopAds || {})[s]; }).filter(function (a) { return a && a.name; }).slice(0, 5);
    if (!list.length) return;
    var row = $("#adRow"); row.hidden = false;
    row.innerHTML = list.map(function (a) {
      var ini = a.initials || a.name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
      return '<aside class="card ad"><div class="ad-logo">' + esc(ini) + '</div><div><p class="ad-tag">Partner shop</p><p class="ad-name">' + esc(a.name) + '</p><p class="ad-text">' + esc(a.tagline || a.description || "") + "</p></div></aside>";
    }).join("");
  }

  /* map: Leaflet + OpenStreetMap tiles + OSRM public server (all free, no key) */
  var map, line, fromM, userM, watchId = null, userPos = null, lastO = null, lastAt = 0, fitted = false, seq = 0;
  var dot = function (c) { return L.divIcon({ className: "", iconSize: [18, 18], html: '<div style="width:18px;height:18px;border-radius:50%;background:' + c + ';border:3px solid #fff;box-shadow:0 0 0 2px ' + c + '"></div>' }); };
  function km(a, b) { var r = Math.PI / 180, dx = (b.lat - a.lat) * r, dy = (b.lng - a.lng) * r * Math.cos(a.lat * r); return Math.sqrt(dx * dx + dy * dy) * 6371000; }
  function initMap() {
    var c = route.stopCoordinates || {}, a = c[FROM], b = c[TO];
    if (!a || !b || !window.L) { $("#mapCard").hidden = true; return; }
    map = L.map("map").setView([a.lat, a.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    fromM = L.marker([a.lat, a.lng], { icon: dot("#16a34a") }).addTo(map).bindPopup(FROM);
    L.marker([b.lat, b.lng], { icon: dot("#dc2626") }).addTo(map).bindPopup(TO);
    drawRoute(a);
  }
  function drawRoute(o) {
    var b = route.stopCoordinates[TO], my = ++seq; lastO = o; lastAt = Date.now();
    fetch("https://router.project-osrm.org/route/v1/driving/" + o.lng + "," + o.lat + ";" + b.lng + "," + b.lat + "?overview=full&geometries=geojson")
      .then(function (r) { return r.json(); }).then(function (d) {
        if (my !== seq || !d.routes || !d.routes[0]) throw 0;
        var pts = d.routes[0].geometry.coordinates.map(function (p) { return [p[1], p[0]]; });
        draw(pts, Math.round(d.routes[0].duration / 60) + " min by road, " + (d.routes[0].distance / 1000).toFixed(1) + " km");
      }).catch(function () { if (my === seq) draw([[o.lat, o.lng], [b.lat, b.lng]], "Straight-line view (road route unavailable)"); });
  }
  function draw(pts, info) {
    if (line) map.removeLayer(line);
    line = L.polyline(pts, { color: "#2f7bff", weight: 5, opacity: .85 }).addTo(map);
    if (!fitted) { map.fitBounds(line.getBounds(), { padding: [30, 30] }); fitted = true; }
    $("#mapInfo").textContent = (userPos ? "From your location: " : FROM + " to " + TO + ": ") + info;
  }
  function onPos(p) {
    userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (!map) return;
    if (fromM) { map.removeLayer(fromM); fromM = null; }
    if (!userM) { userM = L.marker([userPos.lat, userPos.lng], { icon: dot("#2f7bff") }).addTo(map).bindPopup("You are here"); fitted = false; }
    else userM.setLatLng([userPos.lat, userPos.lng]);
    if (!lastO || (km(lastO, userPos) > 60 && Date.now() - lastAt > 15000) || !fitted) drawRoute(userPos);
  }
  function startLoc() {
    if (watchId !== null) return;
    if (!navigator.geolocation) { NB.toast("Location is not supported on this device"); return; }
    watchId = navigator.geolocation.watchPosition(onPos, function () { watchId = null; NB.toast("Location permission denied or unavailable."); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    $("#locBtn").textContent = "Using your location";
  }
  $("#locBtn").addEventListener("click", startLoc);

  /* SEO: per-trip title, description, canonical and BusTrip data */
  function seo() {
    var n = new Date(), nxt = buses.filter(function (b) { return b.dep > n; })[0];
    document.title = FROM + " to " + TO + " Bus Timings | Nammade Bus";
    document.querySelector('meta[name="description"]').content = "Bus timings from " + FROM + " to " + TO + "." + (nxt ? " Next bus " + nxt.name + " at " + clock(nxt.dep) + "." : "") + " See the full schedule on Nammade Bus.";
    var c = document.querySelector('link[rel="canonical"]'); if (c) c.href = NB.SITE + "timing.html?route=" + encodeURIComponent(ID) + "&from=" + encodeURIComponent(FROM) + "&to=" + encodeURIComponent(TO);
    var s = document.createElement("script"); s.type = "application/ld+json";
    s.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": buses.slice(0, 8).map(function (b) {
      return { "@type": "BusTrip", "provider": { "@type": "Organization", "name": b.name }, "departureBusStop": { "@type": "BusStop", "name": FROM }, "arrivalBusStop": { "@type": "BusStop", "name": TO }, "departureTime": b.dep.toISOString(), "arrivalTime": b.arr.toISOString() }; }) });
    document.head.appendChild(s);
  }

  function fail(msg) { $("#carousel").hidden = true; $("#mapCard").hidden = true; $("#noBus").hidden = false; $("#noBus").textContent = msg; }
  function init(r) {
    route = r;
    var order = r && r.routeOrder;
    if (!order || order.indexOf(FROM) < 0 || order.indexOf(TO) < 0 || FROM === TO) { fail("We could not load this trip. Go back and choose your stops again."); return; }
    build(); ads(); renderSched();
    var now = new Date(); purge(now);
    var up = buses.filter(function (b) { return b.dep > now; }).slice(0, 10).map(function (b) { return b.key; });
    pins.forEach(function (p) { if (cards[p.key] === undefined && up.indexOf(p.key) < 0 && buses.some(function (b) { return b.key === p.key; })) up.push(p.key); });
    buses.forEach(function (b) { if (up.indexOf(b.key) > -1) add(b); });
    Object.keys(cards).forEach(function (k) { upd(cards[k], now); });
    relabel(); markPast(now); seo(); initMap();
    setInterval(tick, 20000);
  }

  $("#fromName").textContent = FROM || "-"; $("#toName").textContent = TO || "-";
  $("#backLink").href = "select-stops.html?route=" + encodeURIComponent(ID);
  if (!ID || !FROM || !TO) { fail("No trip selected. Go back and choose your stops."); return; }
  NB.ready.then(function (db) {
    if (!db) { init(demo()); return; }
    db.collection("routes").doc(ID).get().then(function (d) { init(d.exists ? d.data() : null); }).catch(function () { init(null); });
  });
})();
