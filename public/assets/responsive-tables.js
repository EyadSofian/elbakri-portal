/* ═══════════════════════════════════════════════════════════════════════════
   Responsive tables — give every data cell the name of its column.

   On a phone the portal's tables were 720–1015px wide inside a 368px viewport,
   so a booking row showed about a third of itself and the rest had to be
   reached by dragging sideways. The header row scrolls away with the columns,
   so once you have scrolled there is nothing left saying which value is the
   amount and which is the date.

   The fix is a card layout per row (see portal.css, "Phone: tables as cards"),
   which needs each cell to carry its own label. The tables are built in ~44
   places as template literals, so rather than edit every one of them, the
   label is copied from the matching <th> here, at runtime.

   Tables are re-rendered wholesale via innerHTML on every navigation and
   refresh, so a MutationObserver re-labels whatever appears. Work is batched
   into one animation frame: a single page render can replace several tables.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /**
   * Column titles for a table, in visual order.
   * Returns null when the table has no header — skeletons and the small
   * borderless tables inside modals are left exactly as they are.
   */
  function headerLabels(table) {
    var head = table.tHead;
    if (!head || !head.rows.length) return null;

    // The last header row is the one sitting directly above the body; tables
    // with a grouping row above it would otherwise pick up the group titles.
    var cells = head.rows[head.rows.length - 1].cells;
    var labels = [];
    for (var i = 0; i < cells.length; i++) {
      var text = (cells[i].textContent || "").replace(/\s+/g, " ").trim();
      var span = cells[i].colSpan || 1;
      // A cell spanning several columns names each of them.
      for (var s = 0; s < span; s++) labels.push(text);
    }
    return labels;
  }

  /** Does this cell hold the row's action buttons? */
  function isActionsCell(cell) {
    return !!cell.querySelector(".row-actions, .btn-icon");
  }

  /**
   * Is there nothing in this cell worth a line on the card?
   *
   * A cell is often not literally empty — the tables render `<span
   * class="primary-text"></span>` for a value that is absent — so CSS `:empty`
   * does not see it. On a card, a label pointing at nothing is pure noise, so
   * those lines are dropped. Anything interactive counts as content even with
   * no text: an icon-only button still has to be reachable.
   */
  function isBlankCell(cell) {
    if ((cell.textContent || "").trim() !== "") return false;
    return !cell.querySelector("button, a, input, select, textarea, img, svg, i, .badge");
  }

  /** Does this cell hold only a selection checkbox? */
  function isSelectCell(cell) {
    var box = cell.querySelector('input[type="checkbox"]');
    return !!box && (cell.textContent || "").trim() === "";
  }

  function labelTable(table) {
    var labels = headerLabels(table);
    if (!labels) return;

    for (var b = 0; b < table.tBodies.length; b++) {
      var rows = table.tBodies[b].rows;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].cells;
        var column = 0;
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          var span = cell.colSpan || 1;

          // A cell spanning the whole table is an empty state or a skeleton
          // shimmer, not a value — it gets no label and stays full width.
          if (span > 1) {
            cell.removeAttribute("data-label");
            cell.setAttribute("data-cell", "wide");
          } else if (isBlankCell(cell)) {
            cell.removeAttribute("data-label");
            cell.setAttribute("data-cell", "blank");
          } else if (isSelectCell(cell)) {
            cell.removeAttribute("data-label");
            cell.setAttribute("data-cell", "select");
          } else if (isActionsCell(cell)) {
            cell.removeAttribute("data-label");
            cell.setAttribute("data-cell", "actions");
          } else {
            var label = labels[column];
            if (label) cell.setAttribute("data-label", label);
            else cell.removeAttribute("data-label");
            cell.removeAttribute("data-cell");
          }
          column += span;
        }
      }
    }
  }

  function labelAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var tables = scope.querySelectorAll(".data-table");
    for (var i = 0; i < tables.length; i++) labelTable(tables[i]);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    // One pass per frame: a single navigation can swap several tables at once,
    // and each swap would otherwise trigger its own full re-label.
    requestAnimationFrame(function () {
      queued = false;
      labelAll(document);
    });
  }

  function start() {
    labelAll(document);
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes.length) { schedule(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // Exposed so a render path can re-label immediately instead of waiting for
  // the observer, if it ever needs to measure straight after drawing.
  window.PortalResponsiveTables = { refresh: labelAll };
})();
