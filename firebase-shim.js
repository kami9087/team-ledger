/* Connects the ledger to Firebase: Google sign-in, email allowlist (Firestore "allowed" collection) and shared data. */
(function () {
  "use strict";
  var gate = document.getElementById("gate");
  var cfg = window.FIREBASE_CONFIG || {};
  var AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#0B7A63"/><circle cx="14" cy="11" r="5" fill="#fff"/><path d="M4 25c1-6 6-8 10-8s9 2 10 8z" fill="#fff"/></svg>');

  function show(html) { gate.hidden = false; gate.innerHTML = '<div class="gate-box">' + html + "</div>"; }
  function hide() { gate.hidden = true; gate.innerHTML = ""; }
  var LOGO = '<div class="gate-mark"><svg viewBox="0 0 24 24" fill="none" width="30" height="30"><circle cx="12" cy="12" r="8.5" stroke="#F3F5F7" stroke-width="1.8"/><path d="M12 3.5V12l7.4 4.2M12 12l-7.4 4.2" stroke="#2FC59F" stroke-width="1.8" stroke-linecap="round"/></svg></div>';

  if (!window.firebase || !cfg.apiKey || /PASTE|YOUR_PROJECT/.test(cfg.apiKey + cfg.projectId)) {
    show(LOGO + "<h2>Setup needed</h2><p>Open <b>firebase-config.js</b> and paste your Firebase settings, then upload again.</p>");
    window.claude = { use: function () { return new Promise(function () {}); } };
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}

  function signIn() {
    var p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    auth.signInWithPopup(p).catch(function (e) {
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment" || e.code === "auth/cancelled-popup-request")) {
        auth.signInWithRedirect(p);
      } else if (e && e.code !== "auth/popup-closed-by-user") {
        var m = gate.querySelector(".gate-err"); if (m) m.textContent = "Sign-in failed. Check your connection and try again.";
      }
    });
  }
  window.tslSignOut = function () { auth.signOut().then(function () { location.reload(); }); };
  function loginScreen() {
    show(LOGO + "<h2>Team Split Ledger</h2><p>Sign in with the Google account your team owner added.</p><button class=\"gate-btn\" id=\"gbtn\">Sign in with Google</button><div class=\"gate-err\"></div>");
    document.getElementById("gbtn").onclick = signIn;
  }

  auth.getRedirectResult().catch(function () {});

  var session = new Promise(function (resolve) {
    show(LOGO + "<h2>Team Split Ledger</h2><p>Loading…</p>");
    auth.onAuthStateChanged(function (user) {
      if (!user) { loginScreen(); return; }
      var email = (user.email || "").toLowerCase();
      show(LOGO + "<h2>Checking access…</h2>");
      db.collection("allowed").doc(email).get().then(function (d) {
        if (d.exists) {
          var role = d.data() && d.data().role === "viewer" ? "viewer" : "editor";
          hide(); resolve({ user: user, email: email, role: role });
        } else { denied(email); }
      }).catch(function (e) {
        if (e && (e.code === "unavailable" || e.code === "failed-precondition")) show(LOGO + "<h2>You are offline</h2><p>Connect to the internet and open the app again.</p>");
        else denied(email);
      });
    });
  });
  function denied(email) {
    show(LOGO + "<h2>No access</h2><p><b>" + email.replace(/[<>&]/g, "") + "</b> is not on the team list. Ask the owner to add this email.</p><button class=\"gate-btn\" onclick=\"tslSignOut()\">Use another account</button>");
  }

  var api = {
    db: function (s) { return db; },
    user: function (s) {
      return {
        id: function () { return Promise.resolve(s.email); },
        me: function () { return Promise.resolve({ name: s.user.displayName || s.email, avatarUrl: s.user.photoURL || AVATAR }); },
        can: function () { return Promise.resolve(s.role === "editor"); },
        profiles: function (ids) {
          var o = {};
          ids.forEach(function (id) {
            var n = String(id).split("@")[0].replace(/[._-]+/g, " ");
            n = n.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
            o[id] = { name: n, isMe: id === s.email };
          });
          return Promise.resolve(o);
        }
      };
    },
    downloads: function () {
      return {
        save: function (o) {
          var type = /\.csv$/.test(o.filename) ? "text/csv;charset=utf-8" : "application/json";
          var blob = new Blob(["﻿" + o.data], { type: type });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = o.filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
          return Promise.resolve();
        }
      };
    }
  };
  window.claude = { use: function (name) { return session.then(function (s) { return api[name] ? api[name](s) : null; }); } };
})();
