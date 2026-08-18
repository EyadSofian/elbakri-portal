/**
 * Global search for the top-bar box (#globalSearch), shared by the agency and
 * admin portals.
 *
 * The box has always been in the markup with a Ctrl+K shortcut pointed at it,
 * but nothing was ever listening to it — typing did nothing. This wires it to
 * /api/search and drops the hits underneath: bookings, transport, invoices,
 * quotes, clients and hotels, each one a shortcut to the page it lives on.
 *
 * Dependencies are read off `window` rather than closed over, so this file can
 * load after either portal's inline script without caring how it declares them.
 */
(function () {
  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 260;

  let timer = null;
  let results = [];
  let activeIndex = -1;
  let seq = 0; // guards against a slow response overwriting a newer one

  const T = (key, fallback) => (window.PortalI18n?.t ? window.PortalI18n.t(key, fallback) : fallback);
  const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v ?? ''));

  const KIND_META = {
    BOOKING:   { icon: 'calendar-check', group: 'search.bookings',  label: 'Bookings' },
    TRANSPORT: { icon: 'car',            group: 'search.transport', label: 'Transport' },
    INVOICE:   { icon: 'file-text',      group: 'search.invoices',  label: 'Invoices' },
    QUOTE:     { icon: 'message-square',  group: 'search.quotes',    label: 'Quotes' },
    COMPANY:   { icon: 'building-2',     group: 'search.companies', label: 'Clients' },
    HOTEL:     { icon: 'bed',            group: 'search.hotels',    label: 'Hotels' },
  };

  function box() {
    return document.getElementById('globalSearch');
  }

  /** The dropdown is created on first use so neither portal needs new markup. */
  function panel() {
    let el = document.getElementById('gsResults');
    if (el) return el;
    const input = box();
    if (!input) return null;
    el = document.createElement('div');
    el.id = 'gsResults';
    el.className = 'gs-results';
    el.style.display = 'none';
    (input.closest('.quick-search') || input.parentElement).appendChild(el);
    return el;
  }

  function close() {
    const el = document.getElementById('gsResults');
    if (el) el.style.display = 'none';
    activeIndex = -1;
  }

  function render(hits, query) {
    const el = panel();
    if (!el) return;
    results = hits;
    activeIndex = -1;

    if (!hits.length) {
      el.innerHTML = `<div class="gs-empty">${esc(T('search.noResults', 'Nothing matched'))} “${esc(query)}”</div>`;
      el.style.display = '';
      return;
    }

    // Group hits under their kind, preserving the server's ordering.
    const order = [];
    const groups = new Map();
    hits.forEach((hit, index) => {
      if (!groups.has(hit.kind)) { groups.set(hit.kind, []); order.push(hit.kind); }
      groups.get(hit.kind).push({ hit, index });
    });

    el.innerHTML = order.map((kind) => {
      const meta = KIND_META[kind] || { icon: 'search', group: '', label: kind };
      const rows = groups.get(kind).map(({ hit, index }) => `
        <button type="button" class="gs-item" data-index="${index}">
          <i data-lucide="${meta.icon}"></i>
          <span class="gs-item-text">
            <span class="gs-item-title">${esc(hit.title)}</span>
            <span class="gs-item-sub">${esc(hit.subtitle)}</span>
          </span>
        </button>`).join('');
      return `<div class="gs-group">${esc(T(meta.group, meta.label))}</div>${rows}`;
    }).join('');

    el.style.display = '';
    el.querySelectorAll('.gs-item').forEach((btn) => {
      btn.addEventListener('click', () => open(results[Number(btn.dataset.index)]));
    });
    if (window.refreshIcons) window.refreshIcons(el);
    else if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function highlight(index) {
    const el = document.getElementById('gsResults');
    if (!el) return;
    const items = [...el.querySelectorAll('.gs-item')];
    items.forEach((n) => n.classList.remove('active'));
    const node = items.find((n) => Number(n.dataset.index) === index);
    if (node) {
      node.classList.add('active');
      node.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Open a hit: switch to the page that shows it, then do what we can to put the
   * record itself in front of the user — fill that page's own filter when it has
   * one, and flash the matching row either way.
   */
  function open(hit) {
    if (!hit) return;
    close();
    const input = box();
    if (input) input.value = '';

    if (window.setPage) window.setPage(hit.page);

    // Page renderers are async; give the DOM a beat before reaching into it.
    setTimeout(() => {
      const filled = fillPageFilter(hit.filter);
      // A filtered list re-renders, so wait again before hunting for the row.
      setTimeout(() => flashRow(hit.filter), filled ? 420 : 0);
    }, 220);
  }

  /** Copy the term into the page's own search box when it has one. */
  function fillPageFilter(term) {
    const candidates = [...document.querySelectorAll('input')].filter((el) => {
      if (el.id === 'globalSearch' || el.type === 'hidden' || el.offsetParent === null) return false;
      const hint = `${el.id} ${el.getAttribute('data-i18n-placeholder') || ''} ${el.placeholder || ''}`.toLowerCase();
      return hint.includes('search');
    });
    if (!candidates.length) return false;
    const el = candidates[0];
    el.value = term;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Scroll the row carrying the term into view and pulse it. */
  function flashRow(term) {
    if (!term) return;
    const needle = String(term).toLowerCase();
    const row = [...document.querySelectorAll('tr, .card, .list-row')]
      .find((el) => el.textContent && el.textContent.toLowerCase().includes(needle));
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('row-flash');
    setTimeout(() => row.classList.remove('row-flash'), 2000);
  }

  async function run(query) {
    const mine = ++seq;
    if (!window.apiFetch) return;
    const res = await window.apiFetch(`/search?q=${encodeURIComponent(query)}`);
    if (mine !== seq) return; // a newer keystroke already won
    render(res?.data?.results || [], query);
  }

  function onInput(event) {
    const query = event.target.value.trim();
    clearTimeout(timer);
    if (query.length < MIN_CHARS) { close(); return; }
    timer = setTimeout(() => run(query), DEBOUNCE_MS);
  }

  function onKeyDown(event) {
    const el = document.getElementById('gsResults');
    const isOpen = el && el.style.display !== 'none';
    if (event.key === 'Escape') { close(); event.target.blur(); return; }
    if (!isOpen || !results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % results.length;
      highlight(activeIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
      highlight(activeIndex);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(results[activeIndex >= 0 ? activeIndex : 0]);
    }
  }

  function init() {
    const input = box();
    if (!input || input.dataset.gsBound) return;
    input.dataset.gsBound = '1';
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= MIN_CHARS && results.length) {
        const el = panel();
        if (el) el.style.display = '';
      }
    });
    // Click-away closes, but never while the click is landing on a result.
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.quick-search')) close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
