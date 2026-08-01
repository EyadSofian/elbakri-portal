/* ═══════════════════════════════════════════════════════════════════════════
   Icon layer — Phosphor, rendered through the existing call sites.

   The portal was drawing Lucide, which is the default icon set of every
   scaffold and reads as such. Phosphor has a distinct hand: a wider stroke
   terminal, rounder joins, and a squarer optical box, so a dense sidebar of
   25 items stays legible instead of turning into a row of hairlines.

   Nothing else in the app changes. Markup stays `<i data-lucide="name">`, the
   `icon()` helper stays, and `refreshIcons()` keeps calling
   `window.lucide.createIcons()` — this file just answers that call with
   Phosphor glyphs. Swapping the set is one file, not 300 edits.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* Lucide name → Phosphor name. Every target was validated against the
     published Phosphor name list; an unmapped name falls back to a dot rather
     than rendering an invisible glyph, so a gap is visible in review. */
  var MAP = {
    "activity": "pulse",
    "alert-circle": "warning-circle",
    "banknote": "money",
    "car": "car",
    "check-circle": "check-circle",
    "link": "link",
    "loader": "spinner",
    "minus-circle": "minus-circle",
    "octagon-x": "x-circle",
    "x-circle": "x-circle",
    "alert-triangle": "warning",
    "arrow-down-circle": "arrow-circle-down",
    "arrow-left": "arrow-left",
    "arrow-left-right": "arrows-left-right",
    "arrow-right": "arrow-right",
    "arrow-right-left": "arrows-left-right",
    "ban": "prohibit",
    "bell": "bell",
    "brand-whatsapp": "whatsapp-logo",
    "briefcase-business": "briefcase",
    "building-2": "buildings",
    "bus": "bus",
    "calculator": "calculator",
    "calendar-check": "calendar-check",
    "chart-column": "chart-bar",
    "check": "check",
    "check-check": "checks",
    "chevron-down": "caret-down",
    "chevron-left": "caret-left",
    "chevron-right": "caret-right",
    "chevron-up": "caret-up",
    "chevrons-up-down": "caret-up-down",
    "circle-check": "check-circle",
    "circle-help": "question",
    "clock": "clock",
    "copy": "copy",
    "credit-card": "credit-card",
    "database": "database",
    "download": "download-simple",
    "edit-2": "pencil-simple",
    "eye": "eye",
    "eye-off": "eye-slash",
    "file-down": "file-arrow-down",
    "file-question": "file-magnifying-glass",
    "file-spreadsheet": "microsoft-excel-logo",
    "file-text": "file-text",
    "grip-vertical": "dots-six-vertical",
    "headphones": "headset",
    "hotel": "buildings",
    "image": "image",
    "image-play": "images-square",
    "images": "images",
    "info": "info",
    "key-round": "key",
    "layers": "stack",
    "layout-dashboard": "squares-four",
    "layout-grid": "grid-four",
    "layout-template": "layout",
    "list": "list",
    "loader-2": "spinner",
    "log-in": "sign-in",
    "log-out": "sign-out",
    "mail-question": "envelope-simple",
    "map": "map-trifold",
    "map-pin": "map-pin",
    "menu": "list",
    "moon": "moon",
    "panel-left": "sidebar-simple",
    "pencil": "pencil-simple",
    "plane": "airplane",
    "plane-landing": "airplane-landing",
    "plane-takeoff": "airplane-takeoff",
    "play": "play",
    "plug-zap": "plugs",
    "plus": "plus",
    "receipt": "receipt",
    "receipt-text": "receipt",
    "refresh-cw": "arrows-clockwise",
    "repeat": "repeat",
    "repeat-2": "repeat-once",
    "rotate-ccw": "arrow-counter-clockwise",
    "save": "floppy-disk",
    "search": "magnifying-glass",
    "send": "paper-plane-tilt",
    "settings-2": "sliders-horizontal",
    "sheet": "table",
    "shield-check": "shield-check",
    "ship": "boat",
    "shopping-cart": "shopping-cart-simple",
    "sliders-horizontal": "faders-horizontal",
    "square": "square",
    "star": "star",
    "sun": "sun",
    "table-2": "table",
    "tag": "tag",
    "text-cursor-input": "cursor-text",
    "ticket": "ticket",
    "trash-2": "trash",
    "upload": "upload-simple",
    "users": "users",
    "wallet": "wallet",
    "wallet-cards": "wallet",
    "x": "x",
    "zap": "lightning",  };

  var FALLBACK = "circle";
  // Anything the map misses is recorded rather than silently swallowed, so a
  // name added later (or built at runtime) shows up instead of shipping blank.
  var missing = Object.create(null);

  function paint(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll("[data-lucide]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute("data-lucide");
      if (!MAP[name] && !missing[name]) {
        missing[name] = true;
        if (window.console) console.warn("[icons] unmapped icon:", name);
      }
      var ph = MAP[name] || FALLBACK;
      // Preserve every other attribute (class, style, title, aria-*) so the
      // element keeps whatever the component put on it.
      el.classList.add("ph", "ph-" + ph);
      el.removeAttribute("data-lucide");
      el.setAttribute("data-icon", name);
      el.setAttribute("aria-hidden", "true");
    }
  }

  // The app calls window.lucide.createIcons() after every render.
  window.lucide = { createIcons: function (opts) { paint(opts && opts.root); } };
  window.PortalIcons = { map: MAP, paint: paint, missing: function () { return Object.keys(missing); } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { paint(); });
  } else {
    paint();
  }
})();
