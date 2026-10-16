(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var MAX_PINS = 3, SITE = "https://jerin37sebastian.github.io/NammadeBus/";
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var db = null, uid = null;

  /* toast */
  var toastEl = $("#toast"), toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }

  /* theme */
  $("#themeBtn").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; store.set("nb-theme", next);
  });

  /* drawer */
  var drawer = $("#drawer"), scrim = $("#scrim"), menuBtn = $("#menuBtn");
  function setDrawer(open) {
    if (open) { drawer.hidden = false; scrim.hidden = false; requestAnimationFrame(function () { drawer.classList.add("open"); }); }
    else { drawer.classList.remove("open"); scrim.hidden = true; setTimeout(function () { if (!drawer.classList.contains("open")) drawer.hidden = true; }, 260); }
    menuBtn.setAttribute("aria-expanded", open);
  }
  menuBtn.addEventListener("click", function () { setDrawer(!drawer.classList.contains("open")); });
  scrim.addEventListener("click", function () { setDrawer(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setDrawer(false); });
  $("#supportLink").addEventListener("click", function (e) { e.preventDefault(); toast("Support page coming soon"); setDrawer(false); });

  /* share */
  function share() {
    var data = { title: "Nammade Bus", text: "Thodupuzha bus timings, made by the community", url: SITE };
    if (navigator.share) { navigator.share(data).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(SITE).then(function () { toast("Link copied"); }); }
    else { toast(SITE); }
  }
  $("#shareBtn").addEventListener("click", share);
  $("#shareMenu").addEventListener("click", function () { setDrawer(false); share(); });

  /* search */
  var sBtn = $("#searchBtn"), sIn = $("#searchInput"), list = $("#routeList"), emptyMsg = $("#emptyMsg");
  sBtn.addEventListener("click", function () {
    sIn.hidden = !sIn.hidden; sBtn.setAttribute("aria-expanded", !sIn.hidden);
    if (!sIn.hidden) sIn.focus(); else { sIn.value = ""; filter(); }
  });
  function filter() {
    var q = sIn.value.trim().toLowerCase(), shown = 0;
    list.querySelectorAll(".route").forEach(function (li) {
      var hit = li.textContent.toLowerCase().indexOf(q) > -1; li.hidden = !hit; if (hit) shown++;
    });
    emptyMsg.hidden = shown > 0;
  }
  sIn.addEventListener("input", filter);

  /* pins: order = the order they were pinned, kept in localStorage (and Firestore when signed in) */
  var cards = [].slice.call(list.querySelectorAll(".route"));
  cards.forEach(function (c, i) { c.dataset.idx = i; });
  var pins = store.get("nb-pins", []).filter(function (id) { return cards.some(function (c) { return c.dataset.id === id; }); });
  function renderPins() {
    var order = pins.map(function (id) { return list.querySelector('[data-id="' + id + '"]'); })
      .concat(cards.filter(function (c) { return pins.indexOf(c.dataset.id) < 0; }));
    order.forEach(function (c) { list.appendChild(c); c.querySelector(".pin").setAttribute("aria-pressed", pins.indexOf(c.dataset.id) > -1); });
  }
  function savePins() {
    store.set("nb-pins", pins);
    if (db && uid) {
      var col = db.collection("users").doc(uid).collection("pinnedRoutes");
      col.get().then(function (snap) {
        var b = db.batch(); snap.forEach(function (d) { b.delete(d.ref); });
        pins.forEach(function (id, i) { b.set(col.doc(id), { order: i + 1 }); });
        return b.commit();
      }).catch(function () {});
    }
  }
  list.addEventListener("click", function (e) {
    var btn = e.target.closest(".pin"); if (!btn) return;
    var id = btn.closest(".route").dataset.id, at = pins.indexOf(id);
    if (at > -1) { pins.splice(at, 1); }
    else if (pins.length >= MAX_PINS) { toast("You can pin up to 3 routes. Unpin one to add another."); return; }
    else { pins.push(id); }
    savePins(); renderPins();
  });
  list.addEventListener("click", function (e) {
    var a = e.target.closest(".route-link");
    if (a && a.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("This route is coming soon"); }
  });
  renderPins();

  /* like: once per day */
  var likeBtn = $("#likeBtn"), likeCount = $("#likeCount");
  function showLiked() { likeBtn.setAttribute("aria-pressed", store.get("nb-liked", "") === today()); }
  showLiked();
  likeBtn.addEventListener("click", function () {
    if (store.get("nb-liked", "") === today()) { toast("Thanks! You can like again tomorrow."); return; }
    store.set("nb-liked", today()); showLiked(); toast("Thanks for the like!");
    if (db && uid) {
      var stats = db.collection("stats").doc("site");
      db.runTransaction(function (tx) {
        return tx.get(stats).then(function (s) { tx.set(stats, { likeCount: ((s.exists && s.data().likeCount) || 0) + 1 }, { merge: true }); });
      }).then(function () { return db.collection("users").doc(uid).set({ lastLiked: today() }, { merge: true }); })
        .then(loadLikes).catch(function () {});
    }
  });
  function loadLikes() {
    db.collection("stats").doc("site").get().then(function (s) {
      var n = s.exists && s.data().likeCount; if (n) { likeCount.textContent = n > 999 ? (n / 1000).toFixed(1) + "k" : n; likeCount.hidden = false; }
    }).catch(function () {});
  }

  /* route status from Firestore (live / coming_soon) */
  function setStatus(card, status) {
    var a = card.querySelector(".route-link"), sub = a.querySelector(".sub");
    card.dataset.status = status;
    if (status === "live") {
      a.href = "select-stops.html?route=" + card.dataset.id; a.removeAttribute("aria-disabled");
      sub.className = "sub live"; sub.textContent = "Live now";
    } else {
      a.removeAttribute("href"); a.setAttribute("aria-disabled", "true");
      sub.className = "sub soon"; sub.textContent = "Coming soon";
    }
  }
  function loadRoutes() {
    db.collection("routes").get().then(function (snap) {
      snap.forEach(function (d) {
        var c = list.querySelector('[data-id="' + d.id + '"]'), s = d.data().status;
        if (c && s && c.dataset.status !== s) setStatus(c, s);
      });
    }).catch(function () {});
  }

  /* firebase (optional until config is pasted) */
  window.addEventListener("load", function () {
    if (!window.FIREBASE_CONFIG || !window.firebase) return;
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG); db = firebase.firestore();
      firebase.auth().onAuthStateChanged(function (u) { if (u) { uid = u.uid; } });
      firebase.auth().signInAnonymously().catch(function () {});
      loadRoutes(); loadLikes();
    } catch (e) {}
  });
})();
