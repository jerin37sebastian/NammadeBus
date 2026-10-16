/* Shared by every page except index.html (home.js still has its own copy; we can merge later). */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var SITE = "https://jerin37sebastian.github.io/Nammadebus/";
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  var INLINE_CONFIG = {
  apiKey: "AIzaSyAnS-2c7UOEUwaH8caIuLp2QfwSOe_T7uU",
  authDomain: "nammade-bus.firebaseapp.com",
  databaseURL: "https://nammade-bus-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nammade-bus",
  storageBucket: "nammade-bus.firebasestorage.app",
  messagingSenderId: "485767107104",
  appId: "1:485767107104:web:e1994769da457ca40f6245",
  measurementId: "G-DNTP66ERPZ"
};

  var NB = window.NB = { SITE: SITE, store: store, today: today, db: null, uid: null };

  var toastEl = $("#toast"), toastT;
  NB.toast = function (m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); };

  /* theme */
  $("#themeBtn").addEventListener("click", function () {
    var n = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = n; store.set("nb-theme", n);
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
  $("#supportLink").addEventListener("click", function (e) { e.preventDefault(); NB.toast("Support page coming soon"); setDrawer(false); });

  /* share */
  function share() {
    var d = { title: "Nammade Bus", text: "Thodupuzha bus timings, made by the community", url: SITE };
    if (navigator.share) navigator.share(d).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(SITE).then(function () { NB.toast("Link copied"); });
    else NB.toast(SITE);
  }
  $("#shareBtn").addEventListener("click", share);
  $("#shareMenu").addEventListener("click", function () { setDrawer(false); share(); });

  /* like: once per day */
  var likeBtn = $("#likeBtn"), likeCount = $("#likeCount");
  function showLiked() { likeBtn.setAttribute("aria-pressed", store.get("nb-liked", "") === today()); }
  function loadLikes() {
    NB.db.collection("stats").doc("site").get().then(function (s) {
      var n = s.exists && s.data().likeCount; if (n) { likeCount.textContent = n > 999 ? (n / 1000).toFixed(1) + "k" : n; likeCount.hidden = false; }
    }).catch(function () {});
  }
  showLiked();
  likeBtn.addEventListener("click", function () {
    if (store.get("nb-liked", "") === today()) { NB.toast("Thanks! You can like again tomorrow."); return; }
    store.set("nb-liked", today()); showLiked(); NB.toast("Thanks for the like!");
    if (NB.db && NB.uid) {
      var ref = NB.db.collection("stats").doc("site");
      NB.db.runTransaction(function (tx) { return tx.get(ref).then(function (s) { tx.set(ref, { likeCount: ((s.exists && s.data().likeCount) || 0) + 1 }, { merge: true }); }); })
        .then(function () { return NB.db.collection("users").doc(NB.uid).set({ lastLiked: today() }, { merge: true }); })
        .then(loadLikes).catch(function () {});
    }
  });

  /* firebase: NB.ready resolves once (db is null if no config) */
  NB.ready = new Promise(function (resolve) {
    var cfg = INLINE_CONFIG || window.FIREBASE_CONFIG || (typeof firebaseConfig !== "undefined" ? firebaseConfig : null);
    if (!cfg) { NB.error = "no-config"; resolve(null); return; }
    if (!window.firebase) { NB.error = "no-sdk"; resolve(null); return; }
    try {
      firebase.initializeApp(cfg); NB.db = firebase.firestore();
      firebase.auth().signInAnonymously().then(function (r) { NB.uid = r.user.uid; resolve(NB.db); loadLikes(); })
        .catch(function () { resolve(NB.db); });
    } catch (e) { NB.error = "init-failed"; resolve(null); }
  });
})();
