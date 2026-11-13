'use strict';
/* ---------- Persistence: everything lives in one object in IndexedDB on this device ---------- */
const Store = (() => {
  const DB_NAME = 'rounds-crm', OS = 'kv', KEY = 'state', LS_KEY = 'rounds-crm-state';
  let db = null, timer = null;

  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idbGet() {
    return new Promise((res, rej) => {
      const t = db.transaction(OS, 'readonly').objectStore(OS).get(KEY);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
  function idbPut(v) {
    return new Promise((res, rej) => {
      const tx = db.transaction(OS, 'readwrite');
      tx.objectStore(OS).put(v, KEY);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  function defaults() {
    return {
      schema: 1,
      createdAt: new Date().toISOString(),
      settings: {
        theme: 'midnight',
        defaultFreq: 14,
        lastBackup: null,
        accountTypes: ['Bar', 'Restaurant', 'Country Club', 'Hotel', 'Nightclub', 'Brewery / Taproom', 'Event Venue', 'Golf Course', 'Casino', 'Other'],
        tags: [],
        reps: [],
        emailApp: 'outlook',
        roles: ['Owner', 'General Manager', 'Bar Manager', 'Beverage Director', 'Bartender', 'Chef', 'Purchasing', 'F&B Director'],
      },
      routes: [], products: [], accounts: [], notes: [], priorities: [], visits: [], opportunities: [],
    };
  }
  function migrate(s) {
    const d = defaults();
    s = s && typeof s === 'object' ? s : d;
    s.settings = { ...d.settings, ...(s.settings || {}) };
    for (const k of ['routes', 'products', 'accounts', 'notes', 'priorities', 'visits', 'opportunities']) if (!Array.isArray(s[k])) s[k] = [];
    s.accounts.forEach((a) => { a.contacts ||= []; a.placements ||= []; a.hours ||= {}; a.best ||= {}; a.tags ||= []; });
    // reps used to be free text on each account: turn them into one shared list
    s.settings.reps ||= [];
    for (const a of s.accounts) {
      if (a.rep && !a.repId) {
        let r = s.settings.reps.find((x) => x.name.trim().toLowerCase() === String(a.rep).trim().toLowerCase());
        if (!r) { r = { id: 'r' + Math.random().toString(36).slice(2, 10), name: String(a.rep).trim() }; s.settings.reps.push(r); }
        a.repId = r.id;
      }
      delete a.rep;
    }
    syncCatalog(s);
    return s;
  }
  /* Merge the built-in product list into saved data without losing anything:
     - catalog products are added/updated by their permanent ID
     - a product you added yourself that matches a catalog product is merged into it
     - catalog products that were removed are kept but marked discontinued */
  function syncCatalog(s) {
    if (typeof CATALOG === 'undefined') return;
    const key = (p) => [p.brand, p.name, p.size].map((x) => String(x ?? '').trim().toLowerCase()).join('|');
    const byId = new Map(s.products.map((p) => [p.id, p]));
    const ids = new Set(), remap = {};
    for (const c of CATALOG) {
      ids.add(c.id);
      let p = byId.get(c.id);
      if (!p) {
        const dup = s.products.find((x) => !x.builtin && key(x) === key(c));
        if (dup) { remap[dup.id] = c.id; s.products = s.products.filter((x) => x !== dup); }
        p = { id: c.id };
        s.products.push(p);
      }
      Object.assign(p, { category: c.category, subcategory: c.subcategory || '', brand: c.brand, name: c.name, size: c.size || '', builtin: true, discontinued: !!c.discontinued });
    }
    for (const p of s.products) if (p.builtin && !ids.has(p.id)) p.discontinued = true;
    if (Object.keys(remap).length) {
      for (const a of s.accounts) {
        a.placements.forEach((pl) => { if (remap[pl.productId]) pl.productId = remap[pl.productId]; });
        const seen = new Set();
        a.placements = a.placements.filter((pl) => (seen.has(pl.productId) ? false : seen.add(pl.productId)));
      }
      s.opportunities.forEach((o) => { if (remap[o.productId]) o.productId = remap[o.productId]; });
    }
    s.catalogVersion = CATALOG_VERSION;
  }

  return {
    state: null,
    fallback: false,
    persisted: false,
    async load() {
      try {
        db = await openDB();
        const raw = await idbGet();
        this.state = migrate(raw);
        if (!raw || raw.catalogVersion !== CATALOG_VERSION) await idbPut(this.state);
      } catch (e) {
        console.warn('IndexedDB unavailable, using localStorage', e);
        this.fallback = true;
        let s = null; try { s = JSON.parse(localStorage.getItem(LS_KEY)); } catch {}
        this.state = migrate(s);
      }
      try { if (navigator.storage?.persist) this.persisted = await navigator.storage.persist(); } catch {}
    },
    save() { clearTimeout(timer); timer = setTimeout(() => this.flush(), 120); },
    async flush() {
      clearTimeout(timer);
      try {
        if (this.fallback) localStorage.setItem(LS_KEY, JSON.stringify(this.state));
        else await idbPut(this.state);
      } catch (e) { console.error(e); Toast.show('Could not save! ' + e.message); }
    },
    async replace(s) { this.state = migrate(s); await this.flush(); },
    defaults,
  };
})();

/* ---------- Read helpers ---------- */
const Data = {
  get s() { return Store.state; },
  account(id) { return this.s.accounts.find((a) => a.id === id); },
  route(id) { return id ? this.s.routes.find((r) => r.id === id) : null; },
  product(id) { return this.s.products.find((p) => p.id === id); },
  tags() { return this.s.settings.tags || []; },
  tag(id) { return this.tags().find((t) => t.id === id); },
  acctTags(a) { return (a.tags || []).map((id) => this.tag(id)).filter(Boolean); },
  tagPills(a) { return this.acctTags(a).map((t) => `<span class="pill tag-pill" style="--tc:${t.color}">${esc(t.name)}</span>`).join(' '); },
  routeName(id) { return this.route(id)?.name || 'No route'; },
  routeColor(id) { return this.route(id)?.color || 'var(--muted)'; },
  routesSorted() { return sortBy(this.s.routes, (r) => r.order ?? 0); },
  active() { return this.s.accounts.filter((a) => !a.archived); },
  lastVisitMap() {
    const m = {};
    for (const v of this.s.visits) if (!m[v.accountId] || v.at > m[v.accountId].at) m[v.accountId] = v;
    return m;
  },
  freq(a) { return Number(a.freqDays) || Number(this.s.settings.defaultFreq) || 14; },
  status(a, lm) {
    const last = (lm || this.lastVisitMap())[a.id];
    const freq = this.freq(a);
    if (!last) return { last: null, freq, days: null, dueIn: null, ratio: Infinity, status: 'never' };
    const days = daysBetween(last.at);
    const dueIn = freq - days;
    const status = days > freq ? 'overdue' : dueIn <= Math.max(1, Math.round(freq * 0.2)) ? 'due' : 'ok';
    return { last, freq, days, dueIn, ratio: days / freq, status };
  },
  statusText(st) {
    if (st.status === 'never') return 'Never visited';
    const ago = relDays(st.days);
    if (st.status === 'overdue') return `Visited ${ago} · ${plural(st.days - st.freq, 'day')} overdue`;
    if (st.dueIn === 0) return `Visited ${ago} · due today`;
    if (st.status === 'due') return `Visited ${ago} · due in ${plural(st.dueIn, 'day')}`;
    return `Visited ${ago}`;
  },
  todayHours(a) {
    const h = a.hours?.[todayKey()];
    if (!h) return null;
    if (h.closed) return { open: false, text: 'Closed today' };
    if (h.from || h.to) return { open: true, text: `Open ${fmtHM(h.from)}–${fmtHM(h.to)}` };
    return null;
  },
  bestToday(a) { return a.best?.[todayKey()] || []; },
  productLabel(p, withBrand) {
    if (!p) return 'Unknown product';
    const base = `${p.name}${p.size ? ' ' + p.size : ''}`;
    return withBrand && p.brand && !p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} ${base}` : base;
  },
  openPriorities(accId) { return this.s.priorities.filter((p) => p.accountId === accId && !p.done); },
  /* Products to offer: hides ones you removed, and discontinued ones (unless kept via keepIds) */
  liveProducts(keepIds) { return this.s.products.filter((p) => !p.hidden && (!p.discontinued || keepIds?.has(p.id))); },
  brands() { return uniqSorted(this.s.products.map((p) => p.brand)); },
  productNames(brand) { return uniqSorted(this.s.products.filter((p) => !brand || p.brand === brand).map((p) => p.name)); },
  reps() { return sortBy(this.s.settings.reps || [], (r) => norm(r.name)); },
  rep(id) { return id ? (this.s.settings.reps || []).find((r) => r.id === id) : null; },
  repName(a) { return this.rep(a.repId)?.name || ''; },
  /* find a rep by name (ignoring case/spacing) or add them */
  repFor(name) {
    name = niceName(name);
    if (!name) return '';
    const reps = this.s.settings.reps;
    let r = reps.find((x) => norm(x.name) === norm(name));
    if (!r) { r = { id: uid(), name }; reps.push(r); }
    return r.id;
  },
  types() { return uniqSorted([...this.s.settings.accountTypes, ...this.s.accounts.map((a) => a.type)]); },
  roles() { return uniqSorted([...this.s.settings.roles, ...this.s.accounts.flatMap((a) => a.contacts.map((c) => c.role))]); },
  sortPriorities(list, mode = 'importance') {
    const imp = (p) => IMPORTANCE[p.importance]?.rank ?? 1;
    const copy = list.slice();
    const by = {
      importance: (a, b) => imp(a) - imp(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt.localeCompare(b.createdAt),
      due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || imp(a) - imp(b),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      account: (a, b) => norm(this.account(a.accountId)?.name || '~').localeCompare(norm(this.account(b.accountId)?.name || '~')) || imp(a) - imp(b),
      done: (a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''),
    };
    return copy.sort(by[mode] || by.importance);
  },
  searchText(a) {
    const s = this.s;
    const parts = [a.name, a.type, a.address, this.route(a.routeId)?.name, a.tier ? 'tier ' + a.tier : '', this.repName(a), ...this.acctTags(a).map((t) => t.name)];
    a.contacts.forEach((c) => parts.push(c.name, c.role, c.phone, c.email, c.instagram, c.social));
    a.placements.forEach((pl) => { const p = this.product(pl.productId); if (p) parts.push(p.brand, p.name, p.size); parts.push(pl.cocktailName, pl.competitor, pl.notes); });
    s.notes.forEach((n) => { if (n.accountId === a.id) parts.push(n.text); });
    s.priorities.forEach((p) => { if (p.accountId === a.id) parts.push(p.text); });
    s.opportunities.forEach((o) => { if (o.accountId === a.id) { const p = this.product(o.productId); if (p) parts.push(p.brand, p.name); } });
    return parts.filter(Boolean).join(' ');
  },
};

function commit() { Store.save(); App.refresh(); }
