/* ═══════════════════════════════════════════════════════════════════════════
   Theme controller — light / dark for the Elbakri portal.

   Loaded synchronously in <head>, BEFORE the stylesheet, so the theme attribute
   is on <html> by the time the first frame paints. Deferring this (or doing it
   on DOMContentLoaded) produces the white flash that makes dark mode feel
   bolted on.

   Resolution order:
     1. an explicit choice the user made on this device  (localStorage.theme)
     2. the operating system preference                  (prefers-color-scheme)
     3. light

   Choosing "system" is a real state, not the absence of one: it keeps
   following the OS after the user picks it, including live changes.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var STORAGE_KEY = "theme";
  var DARK = "dark";
  var LIGHT = "light";
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === DARK || v === LIGHT ? v : null;
    } catch (e) {
      // Private mode / blocked storage — fall through to the system preference.
      return null;
    }
  }

  function systemTheme() {
    return media && media.matches ? DARK : LIGHT;
  }

  function resolved() {
    return stored() || systemTheme();
  }

  /** Paints the theme. `animate` adds a short cross-fade on the big planes. */
  function apply(theme, animate) {
    var root = document.documentElement;
    if (animate) {
      root.classList.add("theme-transition");
      window.setTimeout(function () {
        root.classList.remove("theme-transition");
      }, 400);
    }
    if (theme === DARK) root.setAttribute("data-theme", DARK);
    else root.removeAttribute("data-theme");

    // Keep the browser UI (address bar, form controls) in step with the page.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === DARK ? "#070C18" : "#0B1F52");

    syncControls(theme);
  }

  function syncControls(theme) {
    var buttons = document.querySelectorAll("[data-theme-set]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var isCurrent = btn.getAttribute("data-theme-set") === theme;
      btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
      btn.classList.toggle("active", isCurrent);
    }
    var group = document.querySelector(".theme-toggle");
    if (group) group.setAttribute("data-active", theme);
  }

  function set(theme) {
    var next = theme === DARK ? DARK : LIGHT;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* preference just won't persist; the session still switches */
    }
    apply(next, true);
    document.dispatchEvent(new CustomEvent("portal:theme", { detail: { theme: next } }));
  }

  function toggle() {
    set(current() === DARK ? LIGHT : DARK);
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") === DARK ? DARK : LIGHT;
  }

  // ── Paint immediately, before the document body exists ──────────────────
  apply(resolved(), false);

  // Follow the OS only while the user has not made an explicit choice.
  if (media) {
    var onSystemChange = function () {
      if (!stored()) apply(systemTheme(), true);
    };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  // ── Wire the toggle once the DOM is available ───────────────────────────
  function wire() {
    syncControls(current());
    document.addEventListener("click", function (event) {
      var btn = event.target.closest && event.target.closest("[data-theme-set]");
      if (!btn) return;
      event.preventDefault();
      set(btn.getAttribute("data-theme-set"));
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.PortalTheme = { get: current, set: set, toggle: toggle, resolved: resolved };
})();
