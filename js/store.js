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
  function idbGet(key = KEY) {
    return new Promise((res, rej) => {
      const t = db.transaction(OS, 'readonly').objectStore(OS).get(key);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
  function idbPut(v, key = KEY) {
    return new Promise((res, rej) => {
      const tx = db.transaction(OS, 'readwrite');
      tx.objectStore(OS).put(v, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  /* Change stamps: every record gets _mt (last modified time) whenever its contents change.
     Sync uses these to decide which edit is newer when two devices change the same thing. */
  const RECORD_LISTS = ['accounts', 'notes', 'priorities', 'visits', 'opportunities', 'routes', 'products', 'linkGroups', 'people'];
  let sigs = new Map();
  function eachRecord(s, fn) {
    for (const k of RECORD_LISTS) for (const r of s[k] || []) fn(k, r);
    for (const k of ['tags', 'reps']) for (const r of s.settings?.[k] || []) fn('settings.' + k, r);
  }
  function buildSigs(s) {
    sigs = new Map();
    eachRecord(s, (k, r) => sigs.set(k + ':' + r.id, stableStr(r)));
    if (s.settings) sigs.set('settings', stableStr({ ...s.settings, tags: null, reps: null }));
  }
  function stamp(s) {
    const now = new Date().toISOString(), next = new Map();
    let changed = false;
    eachRecord(s, (k, r) => {
      const key = k + ':' + r.id, sig = stableStr(r);
      if (sigs.get(key) !== sig) { r._mt = now; changed = true; }
      next.set(key, sig);
    });
    const settingsSig = stableStr({ ...s.settings, tags: null, reps: null });
    if (sigs.get('settings') !== settingsSig) { s.settings._mt = now; changed = true; }
    next.set('settings', settingsSig);
    if (next.size !== sigs.size) changed = true; // something was deleted
    sigs = next;
    return changed;
  }
  function defaults() {
    return {
      schema: 1,
      createdAt: new Date().toISOString(),
      settings: {
        theme: 'midnight',
        defaultFreq: 14,
        lastBackup: null,
        accountTypes: ['Bar', 'Restaurant', 'Country Club', 'Hotel', 'Nightclub', 'Event Venue', 'Golf Course', 'Casino', 'Other'],
        tags: [],
        reps: [],
        emailApp: 'outlook',
        roles: ['Owner', 'General Manager', 'Bar Manager', 'Beverage Director', 'Bartender', 'Chef', 'Purchasing', 'F&B Director'],
      },
      routes: [], products: [], accounts: [], notes: [], priorities: [], visits: [], opportunities: [], linkGroups: [], people: [],
    };
  }
  function migrate(s) {
    const d = defaults();
    s = s && typeof s === 'object' ? s : d;
    s.settings = { ...d.settings, ...(s.settings || {}) };
    if (!s.settings.typesV2) { s.settings.accountTypes = s.settings.accountTypes.filter((t) => t !== 'Brewery / Taproom'); s.settings.typesV2 = true; }
    for (const k of ['routes', 'products', 'accounts', 'notes', 'priorities', 'visits', 'opportunities', 'linkGroups', 'people']) if (!Array.isArray(s[k])) s[k] = [];
    // tidy link groups: drop missing accounts, and groups with fewer than 2 accounts
    const ids = new Set(s.accounts.map((a) => a.id));
    s.linkGroups = s.linkGroups.filter((g) => { g.accountIds = (g.accountIds || []).filter((id) => ids.has(id)); return g.accountIds.length > 1; });
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
    migratePeople(s);
    syncCatalog(s);
    // one-time: products added before placements were asked default to the back bar (not canned RTDs)
    if (!s.settings.backBarDefaultV1) {
      const byId = new Map(s.products.map((p) => [p.id, p]));
      for (const a of s.accounts) for (const pl of a.placements) {
        const p = byId.get(pl.productId);
        if (p && !pl.well && !pl.backBar && !pl.cocktail && !/^(rtd|ready to drink)/i.test(String(p.category || '').trim())) pl.backBar = true;
      }
      s.settings.backBarDefaultV1 = true;
    }
    return s;
  }
  /* Contacts are shared "people": each account keeps links { id, personId, role } and the person's
     name/phone/email/socials live once in s.people, so an update shows on every account.
     Older contacts (details stored on the account) are converted here. People with the same name
     AND the same phone or email become one person. IDs are derived from the old contact IDs so
     every device converts the same data the same way. */
  function migratePeople(s) {
    const F = PERSON_FIELDS;
    const byId = new Map(s.people.map((p) => [p.id, p]));
    const fill = (p, c) => { for (const k of F) if (!p[k] && c[k]) p[k] = c[k]; };
    for (const a of s.accounts) {
      a.contacts = a.contacts.map((c) => {
        if (c.personId) {
          let p = byId.get(c.personId);
          if (!p) { p = { id: c.personId }; F.forEach((k) => (p[k] = c[k] || '')); s.people.push(p); byId.set(p.id, p); }
          else fill(p, c); // an older app version may have written details onto the link
          return { id: c.id, personId: c.personId, role: c.role || '' };
        }
        let p = s.people.find((x) => samePerson(x, c));
        if (p) fill(p, c);
        else { p = { id: 'p_' + c.id }; F.forEach((k) => (p[k] = c[k] || '')); s.people.push(p); byId.set(p.id, p); }
        return { id: c.id, personId: p.id, role: c.role || '' };
      });
    }
    const used = new Set(s.accounts.flatMap((a) => a.contacts.map((l) => l.personId)));
    s.people = s.people.filter((p) => used.has(p.id));
    for (const p of s.people) if (p.phone) p.phone = fmtPhone(p.phone);
    for (const r of s.settings.reps || []) if (r.phone) r.phone = fmtPhone(r.phone);
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
    const inUse = new Set([...s.accounts.flatMap((a) => (a.placements || []).map((pl) => pl.productId)), ...s.opportunities.map((o) => o.productId)]);
    s.products = s.products.filter((p) => !(p.builtin && !ids.has(p.id) && !inUse.has(p.id)));
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
    rev: 0,            // bumps on every local change (sync uses it to spot edits made mid-sync)
    async load() {
      try {
        db = await openDB();
        const raw = await idbGet();
        this.state = migrate(raw);
        buildSigs(raw ? raw : {});
        stamp(this.state);
        if (!raw || raw.catalogVersion !== CATALOG_VERSION) await idbPut(this.state);
      } catch (e) {
        console.warn('IndexedDB unavailable, using localStorage', e);
        this.fallback = true;
        let s = null; try { s = JSON.parse(localStorage.getItem(LS_KEY)); } catch {}
        this.state = migrate(s);
        buildSigs(this.state);
      }
      try { if (navigator.storage?.persist) this.persisted = await navigator.storage.persist(); } catch {}
    },
    save() { clearTimeout(timer); timer = setTimeout(() => this.flush(), 120); },
    async flush() {
      clearTimeout(timer);
      const changed = stamp(this.state);
      if (changed) { this.rev++; if (typeof Sync !== 'undefined') Sync.changed(); }
      try {
        if (this.fallback) localStorage.setItem(LS_KEY, JSON.stringify(this.state));
        else await idbPut(this.state);
      } catch (e) { console.error(e); Toast.show('Could not save! ' + e.message); }
    },
    /* local replacement (restore, erase): counts as a change on this device */
    async replace(s) { this.state = migrate(s); await this.flush(); },
    /* data that came from sync: not a local edit, so don't re-stamp it */
    async applySynced(s) {
      this.state = migrate(s);
      buildSigs(this.state);
      stamp(this.state); // migrate may have added catalog changes
      try { if (this.fallback) localStorage.setItem(LS_KEY, JSON.stringify(this.state)); else await idbPut(this.state); } catch (e) { console.error(e); }
    },
    async kvGet(key) { if (this.fallback) { try { return JSON.parse(localStorage.getItem('rounds-kv-' + key)); } catch { return null; } } return idbGet(key); },
    async kvPut(key, v) { if (this.fallback) { localStorage.setItem('rounds-kv-' + key, JSON.stringify(v)); return; } return idbPut(v, key); },
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
  /* "Other Accounts" are places you visit that aren't on your Account List: tracked, but not scheduled */
  isOther(a) { return a?.list === 'other'; },
  listAccounts() { return this.active().filter((a) => !this.isOther(a)); },
  otherAccounts() { return this.active().filter((a) => this.isOther(a)); },
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
  statusText(st, a) {
    if (a && this.isOther(a)) { const n = this.s.visits.filter((v) => v.accountId === a.id).length; return st.last ? `Last visit ${relDays(st.days)} · ${plural(n, 'visit')}` : 'No visits yet'; }
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
  LINK_TYPES: { proximity: 'Same proximity', ownership: 'Same ownership' },
  linkGroups(accId) { return (this.s.linkGroups || []).filter((g) => g.accountIds.includes(accId)); },
  /* other active accounts in the same proximity group(s): offered when checking in */
  nearby(accId) {
    const out = new Set();
    for (const g of this.linkGroups(accId)) if (g.type === 'proximity') g.accountIds.forEach((id) => id !== accId && out.add(id));
    return Array.from(out).map((id) => this.account(id)).filter((a) => a && !a.archived);
  },
  visitSiblings(v) {
    if (!v) return [];
    const near = new Set(this.nearby(v.accountId).map((a) => a.id));
    return this.s.visits.filter((x) => x.id !== v.id && x.at === v.at && near.has(x.accountId));
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
  person(id) { return this.s.people.find((p) => p.id === id); },
  /* an account's contacts with each person's details filled in */
  contactsOf(a) {
    return a.contacts.map((l) => { const p = this.person(l.personId) || {}; return { id: l.id, personId: l.personId, role: l.role || '', name: p.name || '', phone: p.phone || '', email: p.email || '', instagram: p.instagram || '', social: p.social || '' }; });
  },
  accountsOfPerson(pid) { return this.s.accounts.filter((a) => a.contacts.some((l) => l.personId === pid)); },
  /* loose match for "is this someone you already have?" (name, phone or email) */
  similarPeople(info) {
    const n = norm(info.name), d = phoneDigits(info.phone), e = norm(info.email);
    return this.s.people.filter((p) => (n && norm(p.name) === n) || (d.length >= 7 && phoneDigits(p.phone) === d) || (e && norm(p.email) === e));
  },
  /* strict match used by imports: same name + same phone/email, else a new person */
  personFor(info) {
    let p = this.s.people.find((x) => samePerson(x, info));
    if (p) { for (const k of PERSON_FIELDS) if (!p[k] && info[k]) p[k] = info[k]; return p; }
    p = { id: uid() }; PERSON_FIELDS.forEach((k) => (p[k] = info[k] || '')); this.s.people.push(p);
    return p;
  },
  /* remove a contact from one account; the person is deleted only if no account uses them */
  unlinkContact(a, linkId) {
    const l = a.contacts.find((x) => x.id === linkId); if (!l) return;
    a.contacts = a.contacts.filter((x) => x.id !== linkId);
    if (!this.accountsOfPerson(l.personId).length) this.s.people = this.s.people.filter((p) => p.id !== l.personId);
  },
  sortPriorities(list, mode = 'importance') {
    const imp = (p) => IMPORTANCE[p.importance]?.rank ?? 1;
    const copy = list.slice();
    const by = {
      importance: (a, b) => imp(a) - imp(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt.localeCompare(b.createdAt),
      due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || imp(a) - imp(b),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      account: (a, b) => sortName(this.account(a.accountId)?.name || '~').localeCompare(sortName(this.account(b.accountId)?.name || '~')) || imp(a) - imp(b),
      done: (a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''),
    };
    return copy.sort(by[mode] || by.importance);
  },
  searchText(a) {
    const s = this.s;
    const parts = [a.name, a.type, a.address, this.route(a.routeId)?.name, a.tier ? 'tier ' + a.tier : '', this.repName(a), ...this.acctTags(a).map((t) => t.name)];
    this.contactsOf(a).forEach((c) => parts.push(c.name, c.role, c.phone, c.email, c.instagram, c.social));
    a.placements.forEach((pl) => { const p = this.product(pl.productId); if (p) parts.push(p.brand, p.name, p.size); parts.push(pl.cocktailName, pl.competitor, pl.notes); });
    s.notes.forEach((n) => { if (n.accountId === a.id) parts.push(n.text); });
    s.priorities.forEach((p) => { if (p.accountId === a.id) parts.push(p.text); });
    s.opportunities.forEach((o) => { if (o.accountId === a.id) { const p = this.product(o.productId); if (p) parts.push(p.brand, p.name); } });
    return parts.filter(Boolean).join(' ');
  },
};

function commit() { Store.save(); App.refresh(); }

/* JSON with sorted keys, ignoring _mt stamps, so equal data always compares equal */
function stableStr(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => k !== '_mt' && v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

const PERSON_FIELDS = ['name', 'phone', 'email', 'instagram', 'social'];
function phoneDigits(v) { return String(v || '').replace(/\D/g, '').slice(-10); }
/* same name AND same phone or email */
function samePerson(p, c) {
  const n = String(c.name || '').trim().toLowerCase();
  if (!n || String(p.name || '').trim().toLowerCase() !== n) return false;
  const d = phoneDigits(c.phone), e = String(c.email || '').trim().toLowerCase();
  return (d.length >= 7 && phoneDigits(p.phone) === d) || (!!e && String(p.email || '').trim().toLowerCase() === e);
}
