'use strict';
/* ---------- View state (remembered between sessions) ---------- */
const UI = {
  visits: { route: 'all', sort: 'overdue', openToday: false, status: 'all', tag: '', rep: '' },
  accounts: { q: '', route: '', tag: '', type: '', tier: '', rep: '', brand: '', product: '', placement: '', status: '', prio: false, archived: 'active', sort: 'name', showFilters: false },
  prios: { show: 'open', imp: '', route: '', sort: 'importance' },
  products: { q: '' },
  acct: { showDone: false, notesAll: false, oppsClosed: false, visitsAll: false },
  load() {
    try { const s = JSON.parse(localStorage.getItem('rounds-ui') || '{}'); for (const k of ['visits', 'accounts', 'prios']) Object.assign(this[k], s[k] || {}); } catch {}
    this.accounts.q = '';
  },
  save() { try { localStorage.setItem('rounds-ui', JSON.stringify({ visits: this.visits, accounts: this.accounts, prios: this.prios })); } catch {} },
};

const ACCT_FILTER_KEYS = ['route', 'tag', 'type', 'tier', 'rep', 'brand', 'product', 'placement', 'status', 'prio'];

function routeChip(r, on, act, extra = '') {
  return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-val="${r.id}" ${extra}><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</button>`;
}
function emptyStart() {
  return `<div class="card empty">
    <h3 style="margin-top:0;color:var(--text)">Welcome to Rounds</h3>
    <p>Add your first account, or import your accounts and product list from a spreadsheet.</p>
    <div class="chips" style="justify-content:center">
      <button class="btn primary" data-act="newAccount">${icon('plus')} New account</button>
      <button class="btn" data-act="importFile">${icon('upload')} Import spreadsheet</button>
    </div></div>`;
}
function backupBanner() {
  if (Sync.on && Sync.state === 'error') return `<div class="banner" data-act="go" data-href="#/more">${icon('route')}<div><b>Sync isn't working</b><div class="small muted">${esc(Sync.error)} Tap to fix.</div></div></div>`;
  if (Sync.on) return ''; // synced data is already backed up in your private repository
  const s = Data.s;
  if (!s.accounts.length) return '';
  const lb = s.settings.lastBackup;
  const d = lb ? daysBetween(lb) : null;
  if (d !== null && d < 7) return '';
  return `<div class="banner" data-act="backupNow">${icon('download')}<div><b>Back up your data</b><div class="small muted">${lb ? 'Last backup ' + relDays(d) : 'No backup yet'}. Tap to save a copy to Google Drive.</div></div></div>`;
}
function statusDot(st) { return `<span class="dot st-${st.status}"></span>`; }

const Pages = {
  /* ====================== VISITS ====================== */
  visits() {
    const u = UI.visits, lm = Data.lastVisitMap();
    const all = Data.active();
    const res = { title: 'Visits', tab: 'visits', actions: `<a class="btn small ghost" href="#/visits/log">${icon('clock')} History</a>` };
    if (!all.length) return { ...res, html: emptyStart() };
    let items = all.map((a) => ({ a, st: Data.status(a, lm) }));
    if (u.route !== 'all' && u.route !== 'none' && !Data.route(u.route)) u.route = 'all';
    if (u.route !== 'all') items = items.filter((x) => (u.route === 'none' ? !Data.route(x.a.routeId) : x.a.routeId === u.route));
    if (u.tag && u.tag !== 'none' && !Data.tag(u.tag)) u.tag = '';
    if (u.tag) items = items.filter((x) => (u.tag === 'none' ? !(x.a.tags || []).length : (x.a.tags || []).includes(u.tag)));
    if (u.rep && u.rep !== 'none' && !Data.rep(u.rep)) u.rep = '';
    if (u.rep) items = items.filter((x) => (u.rep === 'none' ? !Data.rep(x.a.repId) : x.a.repId === u.rep));
    if (u.openToday) items = items.filter((x) => Data.todayHours(x.a)?.open !== false);
    const counts = { never: 0, overdue: 0, due: 0, ok: 0 };
    items.forEach((x) => counts[x.st.status]++);
    if (u.status !== 'all') items = items.filter((x) => x.st.status === u.status);

    const byName = (x) => norm(x.a.name);
    const sorters = {
      overdue: (a, b) => b.st.ratio - a.st.ratio || (b.st.days ?? 0) - (a.st.days ?? 0) || byName(a).localeCompare(byName(b)),
      oldest: (a, b) => (a.st.last?.at || '').localeCompare(b.st.last?.at || '') || byName(a).localeCompare(byName(b)),
      name: (a, b) => byName(a).localeCompare(byName(b)),
    };
    sorters.route = sorters.overdue;
    items.sort(sorters[u.sort] || sorters.overdue);

    const tile = (k, label) => `<button class="tile ${u.status === k ? 'on' : ''}" data-act="visitStatus" data-val="${k}"><b>${counts[k]}</b><span><span class="dot st-${k}"></span>${label}</span></button>`;
    const routes = Data.routesSorted();
    const hasUnrouted = all.some((a) => !Data.route(a.routeId));
    let h = backupBanner();
    h += `<div class="tiles">${tile('overdue', 'Overdue')}${tile('due', 'Due soon')}${tile('never', 'Not visited')}${tile('ok', 'On track')}</div>`;
    if (routes.length) {
      h += `<div class="scroll-x"><button class="chip ${u.route === 'all' ? 'on' : ''}" data-act="visitRoute" data-val="all">All routes</button>${routes.map((r) => routeChip(r, u.route === r.id, 'visitRoute')).join('')}${hasUnrouted ? `<button class="chip ${u.route === 'none' ? 'on' : ''}" data-act="visitRoute" data-val="none">No route</button>` : ''}</div>`;
    }
    const tagSel = Data.tags().length ? `<select class="mini ${u.tag ? 'on' : ''}" data-chg="visitTag" aria-label="Tag"><option value="">All tags</option>${Data.tags().map((t) => `<option value="${t.id}" ${u.tag === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="none" ${u.tag === 'none' ? 'selected' : ''}>Untagged</option></select>` : '';
    const repSel = Data.reps().length ? `<select class="mini ${u.rep ? 'on' : ''}" data-chg="visitRep" aria-label="Breakthru rep"><option value="">All reps</option>${Data.reps().map((r) => `<option value="${r.id}" ${u.rep === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="none" ${u.rep === 'none' ? 'selected' : ''}>No rep</option></select>` : '';
    h += `<div class="scroll-x mini-row">
      <select class="mini" data-chg="visitSort" aria-label="Sort">
        ${[['overdue', 'Most overdue'], ['oldest', 'Least recent'], ['route', 'By route'], ['name', 'A–Z']].map(([v, l]) => `<option value="${v}" ${u.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${tagSel}${repSel}
      <button class="chip mini-chip ${u.openToday ? 'on' : ''}" data-act="toggleOpenToday">Open today</button>
      ${u.status !== 'all' ? `<button class="chip mini-chip" data-act="visitStatus" data-val="${u.status}">Show all ✕</button>` : ''}
    </div>`;
    if (!items.length) return { ...res, html: h + '<div class="empty">Nothing here. Nice work!</div>' };

    if (u.sort === 'route') {
      const groups = new Map();
      for (const x of items) { const k = Data.route(x.a.routeId)?.id || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      const order = [...routes.map((r) => r.id), ''];
      h += order.filter((k) => groups.has(k)).map((k) => `<div class="list"><div class="group-head"><span class="dot" style="background:${k ? Data.routeColor(k) : 'var(--muted)'}"></span>${esc(k ? Data.routeName(k) : 'No route')} · ${groups.get(k).length}</div>${groups.get(k).map((x) => this.visitRow(x.a, x.st, true)).join('')}</div>`).join('');
    } else {
      h += `<div class="list">${items.map((x) => this.visitRow(x.a, x.st)).join('')}</div>`;
    }
    return { ...res, html: h };
  },
  visitRow(a, st, hideRoute) {
    const th = Data.todayHours(a), best = Data.bestToday(a), slot = currentSlot();
    const extra = [];
    if (!hideRoute && Data.route(a.routeId)) extra.push(esc(Data.routeName(a.routeId)));
    if (a.type) extra.push(esc(a.type));
    if (th) extra.push(th.open ? esc(th.text) : `<span class="red">${esc(th.text)}</span>`);
    if (best.length) extra.push(best.includes(slot) ? '<span class="good">★ Good time now</span>' : 'Best ' + best.map((b) => SLOT_LABEL[b].toLowerCase()).join('/'));
    else if (a.lunch === 'no' && slot !== 'evening') extra.push('No lunch service');
    const tagHtml = Data.tagPills(a);
    const prio = Data.openPriorities(a.id).length;
    return `<div class="row" data-act="openAccount" data-id="${a.id}">
      ${statusDot(st)}
      <div class="row-main">
        <div class="row-title">${esc(a.name)} ${prio ? `<span class="pill flag-pill">${icon('flag')}${prio}</span>` : ''}</div>
        <div class="row-sub">${esc(Data.statusText(st))} · every ${st.freq}d</div>
        ${extra.length ? `<div class="row-sub">${extra.join(' · ')}</div>` : ''}
        ${tagHtml ? `<div class="row-tags">${tagHtml}</div>` : ''}
      </div>
      <button class="check-btn ${st.days === 0 ? 'done' : ''}" data-act="checkIn" data-id="${a.id}" aria-label="Check in">${icon('check')}</button>
    </div>`;
  },

  visitLog() {
    const visits = sortBy(Data.s.visits, (v) => v.at).reverse();
    const res = { title: 'Visit history', tab: 'visits', back: true, actions: `<button class="btn small" data-act="logVisit">${icon('plus')} Log visit</button>` };
    if (!visits.length) return { ...res, html: '<div class="empty">No visits logged yet.</div>' };
    const groups = new Map();
    for (const v of visits) { const k = toLocalDate(v.at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
    let h = `<div class="list-meta">${plural(visits.length, 'visit')} logged</div>`;
    for (const [day, vs] of groups) {
      h += `<div class="list"><div class="group-head">${esc(fmtDayHeading(day))} · ${vs.length}</div>${vs.map((v) => {
        const a = Data.account(v.accountId);
        return `<div class="row" data-act="editVisit" data-id="${v.id}"><div class="row-main"><div class="row-title">${esc(a?.name || 'Deleted account')}</div><div class="row-sub">${fmtTime(v.at)}${a ? ' · ' + esc(Data.routeName(a.routeId)) : ''}</div>${v.note ? `<div class="row-sub pre">${esc(v.note)}</div>` : ''}</div></div>`;
      }).join('')}</div>`;
    }
    return { ...res, html: h };
  },

  /* ====================== ACCOUNTS ====================== */
  accounts() {
    const u = UI.accounts;
    const active = ACCT_FILTER_KEYS.filter((k) => u[k]).length + (u.archived !== 'active' ? 1 : 0);
    const res = { title: 'Accounts', tab: 'accounts', actions: `<button class="btn small primary" data-act="newAccount">${icon('plus')} New</button>` };
    if (!Data.s.accounts.length) return { ...res, html: emptyStart() };
    let h = `<div class="toolbar">
      <div class="search">${icon('search')}<input type="search" placeholder="Search names, contacts, notes, products…" value="${esc(u.q)}" data-input="acctSearch"></div>
      <button class="icon-btn ${u.showFilters || active ? 'on' : ''}" data-act="toggleFilters" aria-label="Filters">${icon('filter')}${active ? `<span class="badge-num">${active}</span>` : ''}</button>
    </div>`;
    if (u.showFilters) h += this.filterPanel();
    h += `<div id="acctList">${this.accountsList()}</div>`;
    return { ...res, html: h };
  },
  filterPanel() {
    const u = UI.accounts;
    const sel = (key, label, opts, full) => `<label class="field ${full ? 'full' : ''}"><span>${label}</span><select data-chg="acctFilter" data-key="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(u[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const routes = [['', 'Any route'], ...Data.routesSorted().map((r) => [r.id, r.name]), ['none', 'No route']];
    const types = [['', 'Any type'], ...Data.types().map((t) => [t, t])];
    const tiers = [['', 'Any tier'], ['A', 'Tier A'], ['B', 'Tier B'], ['C', 'Tier C'], ['none', 'No tier']];
    const reps = [['', 'Any rep'], ...Data.reps().map((r) => [r.id, r.name]), ['none', 'No rep']];
    const brands = [['', 'Any brand'], ...Data.brands().map((b) => [b, b])];
    const prods = [['', u.brand ? 'Any product' : 'Pick a brand first'], ...(u.brand ? Data.productNames(u.brand).map((p) => [p, p]) : [])];
    return `<div class="card"><div class="filters">
      ${sel('route', 'Route', routes)}${sel('tag', 'Tag', [['', 'Any tag'], ...Data.tags().map((t) => [t.id, t.name]), ['none', 'Untagged']])}
      ${sel('type', 'Account type', types)}
      ${sel('tier', 'Tier', tiers)}${sel('rep', 'Breakthru rep', reps)}
      ${sel('brand', 'Carries brand', brands)}${sel('product', 'Carries product', prods)}
      ${sel('placement', 'Placement', [['', 'Any placement'], ['well', 'In the well'], ['backBar', 'On the back bar'], ['cocktail', 'In a cocktail']])}
      ${sel('status', 'Visit status', [['', 'Any'], ['overdue', 'Overdue'], ['due', 'Due soon'], ['never', 'Never visited'], ['ok', 'On track']])}
      ${sel('archived', 'Show', [['active', 'Active accounts'], ['archived', 'Archived only'], ['all', 'Active + archived']])}
      ${sel('sort', 'Sort by', [['name', 'Name A–Z'], ['route', 'Route'], ['oldest', 'Least recently visited'], ['overdue', 'Most overdue']])}
      <label class="checkline full"><input type="checkbox" data-chg="acctFilter" data-key="prio" ${u.prio ? 'checked' : ''}> Only accounts with open priorities</label>
    </div><div class="toolbar" style="margin:6px 0 0"><button class="btn small" data-act="clearFilters">Clear filters</button><span class="spacer"></span><button class="btn small ghost" data-act="toggleFilters">Hide</button></div></div>`;
  },
  filteredAccounts() {
    const u = UI.accounts, lm = Data.lastVisitMap();
    let list = Data.s.accounts.filter((a) => (u.archived === 'all' ? true : u.archived === 'archived' ? a.archived : !a.archived));
    if (u.route) list = list.filter((a) => (u.route === 'none' ? !Data.route(a.routeId) : a.routeId === u.route));
    if (u.tag) list = list.filter((a) => (u.tag === 'none' ? !(a.tags || []).length : (a.tags || []).includes(u.tag)));
    if (u.type) list = list.filter((a) => norm(a.type) === norm(u.type));
    if (u.tier) list = list.filter((a) => (u.tier === 'none' ? !a.tier : a.tier === u.tier));
    if (u.rep && u.rep !== 'none' && !Data.rep(u.rep)) u.rep = '';
    if (u.rep) list = list.filter((a) => (u.rep === 'none' ? !Data.rep(a.repId) : a.repId === u.rep));
    if (u.brand || u.product || u.placement) {
      list = list.filter((a) => a.placements.some((pl) => {
        const p = Data.product(pl.productId);
        if ((u.brand || u.product) && !p) return false;
        if (u.brand && p.brand !== u.brand) return false;
        if (u.product && p.name !== u.product) return false;
        if (u.placement && !pl[u.placement]) return false;
        return true;
      }));
    }
    const withSt = list.map((a) => ({ a, st: Data.status(a, lm) }));
    let out = u.status ? withSt.filter((x) => x.st.status === u.status) : withSt;
    if (u.prio) out = out.filter((x) => Data.openPriorities(x.a.id).length);
    if (u.q) { const ws = words(u.q); out = out.filter((x) => matchesAll(Data.searchText(x.a), ws)); }
    const byName = (x) => norm(x.a.name);
    const sorts = {
      name: (a, b) => byName(a).localeCompare(byName(b)),
      route: (a, b) => (Data.route(a.a.routeId)?.order ?? 999) - (Data.route(b.a.routeId)?.order ?? 999) || byName(a).localeCompare(byName(b)),
      oldest: (a, b) => (a.st.last?.at || '').localeCompare(b.st.last?.at || ''),
      overdue: (a, b) => b.st.ratio - a.st.ratio,
    };
    return out.sort(sorts[u.sort] || sorts.name);
  },
  accountsList() {
    const list = this.filteredAccounts();
    const u = UI.accounts;
    const filtered = u.q || ACCT_FILTER_KEYS.some((k) => u[k]) || u.archived !== 'active';
    let h = `<div class="list-meta"><span>${plural(list.length, 'account')}</span>${filtered ? '<button class="link-btn" data-act="clearFilters">Clear search & filters</button>' : ''}</div>`;
    if (!list.length) return h + '<div class="empty">No accounts match.</div>';
    return h + `<div class="list">${list.map(({ a, st }) => {
      const op = Data.openPriorities(a.id).length;
      const sub = [a.type, Data.route(a.routeId)?.name, a.tier ? 'Tier ' + a.tier : ''].filter(Boolean).map(esc).join(' · ');
      return `<div class="row" data-act="openAccount" data-id="${a.id}">${statusDot(st)}
        <div class="row-main"><div class="row-title">${esc(a.name)} ${a.archived ? '<span class="pill">Archived</span>' : ''}</div>
        ${sub ? `<div class="row-sub">${sub}</div>` : ''}<div class="row-sub">${esc(Data.statusText(st))}</div>${Data.tagPills(a) ? `<div class="row-tags">${Data.tagPills(a)}</div>` : ''}</div>
        ${op ? `<span class="pill flag-pill">${icon('flag')}${op}</span>` : ''}</div>`;
    }).join('')}</div>`;
  },

  /* ====================== ACCOUNT DETAIL ====================== */
  account(id) {
    const a = Data.account(id);
    if (!a) return { title: 'Not found', back: true, tab: 'accounts', html: '<div class="empty">This account no longer exists.</div>' };
    const s = Data.s, st = Data.status(a), ua = UI.acct;
    const route = Data.route(a.routeId);

    const head = `<div class="card acct-head">
      <div class="meta">
        ${a.archived ? '<span class="pill">Archived</span>' : ''}
        ${a.type ? `<span class="pill">${esc(a.type)}</span>` : ''}
        ${route ? `<span class="pill"><span class="dot" style="background:${route.color};width:8px;height:8px"></span>${esc(route.name)}</span>` : '<span class="pill">No route</span>'}
        ${a.tier ? `<span class="pill">Tier ${esc(a.tier)}</span>` : ''}
        ${Data.tagPills(a)}
      </div>
      ${a.address ? `<a class="addr" href="${mapHref(a.address)}" target="_blank" rel="noopener">${icon('map')}<span>${esc(a.address)}</span></a>` : ''}
      <div class="line">${statusDot(st)} ${esc(Data.statusText(st))}${st.last ? ` (${fmtDate(st.last.at)})` : ''} · every ${st.freq} days</div>
      ${Data.repName(a) ? `<div class="line">${icon('user')} Breakthru rep:&nbsp;<a href="#/rep/${a.repId}">${esc(Data.repName(a))}</a></div>` : `<div class="line">${icon('user')} Breakthru rep:&nbsp;<button class="link-btn" style="padding:0" data-act="editAccount" data-id="${a.id}">+ Add</button></div>`}
      <div class="action-row">
        <button class="btn primary" data-act="checkIn" data-id="${a.id}">${icon('check')}Check in</button>
        <button class="btn" data-act="addNote" data-acc="${a.id}">${icon('note')}Note</button>
        <button class="btn" data-act="addPriority" data-acc="${a.id}">${icon('flag')}Priority</button>
        ${a.address ? `<a class="btn" href="${mapHref(a.address)}" target="_blank" rel="noopener">${icon('map')}Directions</a>` : `<button class="btn" data-act="editAccount" data-id="${a.id}">${icon('map')}Add address</button>`}
      </div>
    </div>`;

    // Contacts
    const contacts = `<div class="card"><h2>Contacts <span class="spacer"></span><button class="btn small" data-act="addContact" data-acc="${a.id}">${icon('plus')} Add</button></h2>
      ${a.contacts.length ? a.contacts.map((c) => `<div class="contact">
        <div class="contact-main" data-act="editContact" data-acc="${a.id}" data-id="${c.id}">
          <div class="row-title">${esc(c.name || 'Unnamed')}</div>
          <div class="row-sub">${[esc(c.role), c.phone ? `<span style="white-space:nowrap">${esc(c.phone)}</span>` : ''].filter(Boolean).join(' · ')}</div>
          ${c.email ? `<div class="row-sub">${esc(c.email)}</div>` : ''}
          ${c.instagram ? `<div class="row-sub">@${esc(c.instagram)}</div>` : ''}
        </div>
        <div class="contact-actions">
          ${c.phone ? `<a class="icon-btn" href="${telHref(c.phone)}" aria-label="Call">${icon('phone')}</a><a class="icon-btn" href="${smsHref(c.phone)}" aria-label="Text">${icon('msg')}</a>` : ''}
          ${c.email ? `<a class="icon-btn" ${mailAttrs(c.email)} aria-label="Email">${icon('mail')}</a>` : ''}
          ${c.instagram ? `<a class="icon-btn" href="${esc(igHref(c.instagram))}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>` : ''}
          ${c.social ? `<a class="icon-btn" href="${esc(socialHref(c.social))}" target="_blank" rel="noopener" aria-label="Other social">${icon('link')}</a>` : ''}
        </div></div>`).join('') : '<div class="muted small">No contacts yet.</div>'}
    </div>`;

    // Priorities
    const allP = s.priorities.filter((p) => p.accountId === a.id);
    const openP = Data.sortPriorities(allP.filter((p) => !p.done));
    const doneP = Data.sortPriorities(allP.filter((p) => p.done), 'done');
    const prios = `<div class="card"><h2>Priorities ${openP.length ? `<span class="count">${openP.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="addPriority" data-acc="${a.id}">${icon('plus')} Add</button></h2>
      ${openP.length ? openP.map((p) => this.prioRow(p)).join('') : '<div class="muted small">No open priorities.</div>'}
      ${doneP.length ? `<button class="link-btn" data-act="acctToggle" data-key="showDone">${ua.showDone ? 'Hide' : 'Show'} ${plural(doneP.length, 'completed priority', 'completed priorities')}</button>${ua.showDone ? doneP.map((p) => this.prioRow(p)).join('') : ''}` : ''}
    </div>`;

    // Notes
    const notesAll = sortBy(s.notes.filter((n) => n.accountId === a.id), (n) => n.createdAt).reverse();
    const notesShown = ua.notesAll ? notesAll : notesAll.slice(0, 4);
    const notes = `<div class="card"><h2>Notes ${notesAll.length ? `<span class="count">${notesAll.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="addNote" data-acc="${a.id}">${icon('plus')} Add</button></h2>
      ${notesShown.length ? notesShown.map((n) => `<div class="item" data-act="editNote" data-id="${n.id}"><div class="item-head">${fmtDateTime(n.createdAt)}${n.updatedAt && n.updatedAt !== n.createdAt ? ` · edited ${fmtDate(n.updatedAt)}` : ''}</div><div class="pre">${esc(n.text)}</div></div>`).join('') : '<div class="muted small">No notes yet.</div>'}
      ${notesAll.length > 4 ? `<button class="link-btn" data-act="acctToggle" data-key="notesAll">${ua.notesAll ? 'Show fewer' : `Show all ${notesAll.length} notes`}</button>` : ''}
    </div>`;

    // Products carried
    const pls = a.placements.map((pl) => ({ pl, p: Data.product(pl.productId) }));
    const groups = new Map();
    for (const x of sortBy(pls, (x) => `${x.p?.category || '~'}|${x.p?.brand || '~'}|${x.p?.name || ''}|${String(sizeValue(x.p?.size)).padStart(8, '0')}`)) {
      const k = x.p ? x.p.brand : 'Unknown';
      if (!groups.has(k)) groups.set(k, { cat: x.p?.category, items: [] });
      groups.get(k).items.push(x);
    }
    const flags = (pl) => {
      const f = [];
      if (pl.well) f.push('<span class="pill flag-pill">Well</span>');
      if (pl.backBar) f.push('<span class="pill flag-pill">Back bar</span>');
      if (pl.cocktail) f.push(`<span class="pill flag-pill">Cocktail${pl.cocktailName ? ': ' + esc(pl.cocktailName) : ''}</span>`);
      if (pl.since) f.push(`<span class="pill">Placed ${fmtDate(pl.since)}</span>`);
      if (Data.product(pl.productId)?.discontinued) f.push('<span class="pill imp-high">Discontinued</span>');
      return f.join('');
    };
    const products = `<div class="card"><h2>Products carried ${pls.length ? `<span class="count">${pls.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="addPlacements" data-acc="${a.id}">${icon('plus')} Add</button></h2>
      ${pls.length ? Array.from(groups).map(([brand, g]) => `<div class="pl-group"><div class="pl-brand">${esc(brand)} <span class="pl-cat">${esc(g.cat || '')}</span></div>${g.items.map(({ pl, p }) => `<div class="pl" data-act="editPlacement" data-acc="${a.id}" data-id="${pl.id}"><div class="pl-name">${esc(p ? p.name : 'Unknown product')} <span class="size">${esc(p?.size || '')}</span></div><div class="flags">${flags(pl)}</div></div>`).join('')}</div>`).join('') : `<div class="muted small">${s.products.length ? 'No products recorded yet.' : 'Import your product list (More tab) to start tracking products.'}</div>`}
    </div>`;

    // Opportunities
    const opps = s.opportunities.filter((o) => o.accountId === a.id);
    const openO = sortBy(opps.filter((o) => o.status === 'open'), (o) => o.createdAt);
    const closedO = sortBy(opps.filter((o) => o.status !== 'open'), (o) => o.closedAt || '').reverse();
    const oppRow = (o) => {
      const p = Data.product(o.productId);
      const meta = o.status === 'open' ? `Pitching since ${fmtDate(o.createdAt)}` : `${o.status === 'won' ? 'Won' : 'Lost'} ${fmtDate(o.closedAt)}`;
      return `<div class="opp"><div class="row-main" data-act="editOpp" data-id="${o.id}"><div class="row-title">${esc(Data.productLabel(p, true))}</div><div class="row-sub">${meta}${o.note ? ' · ' + esc(o.note) : ''}</div></div>
        ${o.status === 'open' ? `<button class="btn small" data-act="oppWon" data-id="${o.id}">Won</button><button class="btn small ghost" data-act="oppLost" data-id="${o.id}">Lost</button>` : `<span class="pill ${o.status === 'won' ? 'flag-pill' : ''}">${o.status === 'won' ? 'Won' : 'Lost'}</span>`}
      </div>`;
    };
    const oppsCard = `<div class="card"><h2>Opportunities ${openO.length ? `<span class="count">${openO.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="addOpps" data-acc="${a.id}">${icon('plus')} Add</button></h2>
      ${openO.length ? openO.map(oppRow).join('') : '<div class="muted small">Products you\'re pitching here will show up here. When one gets placed, tap Won.</div>'}
      ${closedO.length ? `<button class="link-btn" data-act="acctToggle" data-key="oppsClosed">${ua.oppsClosed ? 'Hide' : 'Show'} ${closedO.length} closed</button>${ua.oppsClosed ? closedO.map(oppRow).join('') : ''}` : ''}
    </div>`;

    // Hours & best times
    const tk = todayKey();
    const hasHours = DAY_ORDER.some((d) => a.hours[d] || (a.best[d] || []).length) || a.lunch;
    const hours = `<div class="card"><h2>Hours & best visit times <span class="spacer"></span><button class="btn small" data-act="editHours" data-id="${a.id}">${icon('edit')} Edit</button></h2>
      ${hasHours ? `<table class="hours">${DAY_ORDER.map((d) => {
        const h = a.hours[d]; const b = a.best[d] || [];
        const txt = !h ? '<span class="muted">—</span>' : h.closed ? '<span class="muted">Closed</span>' : `${fmtHM(h.from)} – ${fmtHM(h.to)}`;
        return `<tr class="${d === tk ? 'today' : ''}"><td>${DAY_LABEL[d]}</td><td>${txt}</td><td style="text-align:right"><span class="best">${b.map((x) => `<span class="pill flag-pill">${SLOT_LABEL[x]}</span>`).join('')}</span></td></tr>`;
      }).join('')}</table>${a.lunch ? `<div class="small" style="margin-top:8px">Open for lunch: <b>${a.lunch === 'yes' ? 'Yes' : 'No'}</b></div>` : ''}` : `<div class="muted small">Not set yet. Add open hours and the best days/times to stop by.</div>`}
    </div>`;

    // Visits
    const vAll = sortBy(s.visits.filter((v) => v.accountId === a.id), (v) => v.at).reverse();
    const vShown = ua.visitsAll ? vAll : vAll.slice(0, 5);
    const visits = `<div class="card"><h2>Visits ${vAll.length ? `<span class="count">${vAll.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="logVisit" data-acc="${a.id}">${icon('plus')} Past visit</button></h2>
      ${vShown.length ? vShown.map((v) => `<div class="item" data-act="editVisit" data-id="${v.id}"><div class="item-head">${fmtWeekdayDate(v.at)} · ${fmtTime(v.at)}</div>${v.note ? `<div class="pre">${esc(v.note)}</div>` : ''}</div>`).join('') : '<div class="muted small">No visits yet. Tap Check in when you stop by.</div>'}
      ${vAll.length > 5 ? `<button class="link-btn" data-act="acctToggle" data-key="visitsAll">${ua.visitsAll ? 'Show fewer' : `Show all ${vAll.length} visits`}</button>` : ''}
    </div>`;

    const danger = `<div class="danger-zone">
      <button class="btn" data-act="archiveAccount" data-id="${a.id}">${icon('archive')} ${a.archived ? 'Restore from archive' : 'Archive account'}</button>
      <button class="btn danger" data-act="deleteAccount" data-id="${a.id}">${icon('trash')} Delete</button>
    </div>`;

    return {
      title: a.name, back: true, tab: 'accounts',
      actions: `<button class="btn small" data-act="editAccount" data-id="${a.id}">${icon('edit')} Edit</button>`,
      html: head + `<div class="acct-grid"><div>${prios}${contacts}${notes}${visits}</div><div>${products}${oppsCard}${hours}</div></div>` + danger,
    };
  },
  prioRow(p, showAccount) {
    const acc = p.accountId && Data.account(p.accountId);
    const overdue = !p.done && p.due && p.due < toLocalDate();
    const meta = [`<span class="pill imp-${p.importance}">${IMPORTANCE[p.importance]?.label || 'Medium'}</span>`];
    if (showAccount) meta.push(acc ? `<a href="#/account/${acc.id}">${esc(acc.name)}</a>` : 'General');
    meta.push(`Added ${fmtDate(p.createdAt)}`);
    if (p.due) meta.push(`<span class="${overdue ? 'red' : ''}">Due ${fmtDate(p.due)}</span>`);
    if (p.done) meta.push(`Done ${fmtDate(p.doneAt)}`);
    return `<div class="prio ${p.done ? 'done' : ''}">
      <button class="checkbox ${p.done ? 'on' : ''}" data-act="togglePriority" data-id="${p.id}" aria-label="${p.done ? 'Mark not done' : 'Mark done'}">${p.done ? icon('check') : ''}</button>
      <div class="row-main" data-act="editPriority" data-id="${p.id}"><div class="prio-text">${esc(p.text)}</div><div class="row-sub">${meta.join(' · ')}</div></div>
    </div>`;
  },

  /* ====================== PRIORITIES ====================== */
  priorities() {
    const u = UI.prios, s = Data.s;
    let list = s.priorities.slice();
    const nOpen = list.filter((p) => !p.done).length, nDone = list.length - nOpen;
    if (u.show === 'open') list = list.filter((p) => !p.done);
    if (u.show === 'done') list = list.filter((p) => p.done);
    if (u.imp) list = list.filter((p) => p.importance === u.imp);
    if (u.route) list = list.filter((p) => { const a = Data.account(p.accountId); return u.route === 'none' ? !a : a && a.routeId === u.route; });
    list = Data.sortPriorities(list, u.show === 'done' && u.sort === 'importance' ? 'done' : u.sort);
    const segBtn = (v, l) => `<button class="${u.show === v ? 'on' : ''}" data-act="prioShow" data-val="${v}">${l}</button>`;
    let h = `<div class="seg" style="margin-bottom:10px">${segBtn('open', `Open (${nOpen})`)}${segBtn('done', `Done (${nDone})`)}${segBtn('all', 'All')}</div>
      <div class="scroll-x">${[['', 'Any importance'], ['high', 'High'], ['med', 'Medium'], ['low', 'Low']].map(([v, l]) => `<button class="chip ${u.imp === v ? 'on' : ''}" data-act="prioImp" data-val="${v}">${l}</button>`).join('')}</div>
      <div class="scroll-x mini-row">
        <select class="mini ${u.route ? 'on' : ''}" data-chg="prioFilter" data-key="route"><option value="">All routes</option>${Data.routesSorted().map((r) => `<option value="${r.id}" ${u.route === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="none" ${u.route === 'none' ? 'selected' : ''}>General (no account)</option></select>
        <select class="mini" data-chg="prioFilter" data-key="sort">${[['importance', 'Sort: Importance'], ['due', 'Sort: Due date'], ['newest', 'Sort: Newest'], ['oldest', 'Sort: Oldest'], ['account', 'Sort: Account']].map(([v, l]) => `<option value="${v}" ${u.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>`;
    h += list.length ? `<div class="list">${list.map((p) => this.prioRow(p, true)).join('')}</div>` : `<div class="empty">${u.show === 'open' ? 'No open priorities. Add one with the + button.' : 'Nothing here.'}</div>`;
    return { title: 'Priorities', tab: 'priorities', html: h, actions: `<button class="btn small primary" data-act="addPriority">${icon('plus')} New</button>` };
  },

  /* ====================== PRODUCTS ====================== */
  products() {
    const s = Data.s;
    const res = { title: 'Products', tab: 'products', actions: `<button class="btn small" data-act="addProduct">${icon('plus')} Add</button>` };
    if (!Data.liveProducts().length) {
      return { ...res, html: `<div class="card empty"><h3 style="margin-top:0;color:var(--text)">No products yet</h3><p>Import your Suntory Global Spirits list from a spreadsheet (columns: Category, Subcategory, Brand, Product, Size).</p><button class="btn primary" data-act="importFile">${icon('upload')} Import spreadsheet</button></div>` };
    }
    const h = `<div class="toolbar"><div class="search">${icon('search')}<input type="search" placeholder="Search products" value="${esc(UI.products.q)}" data-input="prodSearch"></div></div>
      <div class="list-meta"><span>${plural(Data.liveProducts().length, 'product')} · numbers show how many accounts carry each</span></div>
      <div class="card" id="prodTree">${this.productTree()}</div>`;
    return { ...res, html: h };
  },
  productTree() {
    const ws = words(UI.products.q);
    const carried = {};
    for (const a of Data.active()) for (const pl of a.placements) carried[pl.productId] = (carried[pl.productId] || 0) + 1;
    let list = Data.liveProducts(new Set(Object.keys(carried)));
    if (ws.length) list = list.filter((p) => matchesAll([p.category, p.subcategory, p.brand, p.name, p.size].join(' '), ws));
    if (!list.length) return '<div class="empty">No matching products</div>';
    return renderTree(list, (p) => `<button class="size-chip" data-act="productInfo" data-id="${p.id}">${esc(p.size || 'Any size')}${p.discontinued ? ' <small>disc.</small>' : ''}<span class="n ${carried[p.id] ? 'has' : ''}">${carried[p.id] || 0}</span></button>`,
      { open: ws.length > 0 && list.length <= 60, countFn: (ps) => ps.reduce((n, p) => n + (carried[p.id] ? 1 : 0), 0) });
  },

  /* ====================== MORE ====================== */
  more() {
    const s = Data.s, set = s.settings;
    const now = new Date(), monthKey = toLocalDate(now).slice(0, 7);
    const v7 = s.visits.filter((v) => daysBetween(v.at) < 7).length;
    const v30 = s.visits.filter((v) => daysBetween(v.at) < 30).length;
    const placedMonth = s.accounts.reduce((n, a) => n + a.placements.filter((pl) => pl.since && pl.since.slice(0, 7) === monthKey).length, 0);
    const wonMonth = s.opportunities.filter((o) => o.status === 'won' && o.closedAt && toLocalDate(o.closedAt).slice(0, 7) === monthKey).length;
    const openOpps = s.opportunities.filter((o) => o.status === 'open').length;
    const lm = Data.lastVisitMap();
    const overdue = Data.active().filter((a) => ['overdue', 'never'].includes(Data.status(a, lm).status)).length;
    const archived = s.accounts.filter((a) => a.archived).length;
    const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
    const lb = set.lastBackup;

    const h = `
    <div class="card"><h2>At a glance</h2><div class="stats">
      ${stat(v7, 'Visits, last 7 days')}${stat(v30, 'Visits, last 30 days')}${stat(overdue, 'Overdue / unvisited')}
      ${stat(placedMonth, 'New placements this month')}${stat(wonMonth, 'Opportunities won this month')}${stat(openOpps, 'Open opportunities')}
    </div></div>

    ${this.syncCard()}
    <div class="card"><h2>Organize</h2>
      <div class="setting"><div class="row-main"><div class="row-title">Routes</div><div class="row-sub">${plural(s.routes.length, 'route')}. Group accounts by part of town and move them around.</div></div><a class="btn small" href="#/routes">Manage</a></div>
      <div class="setting"><div class="row-main"><div class="row-title">Tags</div><div class="row-sub">${plural(Data.tags().length, 'tag')}. Labels like "My connection" or "Chopping Block".</div></div><a class="btn small" href="#/tags">Manage</a></div>
      <div class="setting"><div class="row-main"><div class="row-title">Default visit frequency</div><div class="row-sub">Used for accounts without their own target</div></div>
        <select style="width:auto" data-chg="defaultFreq">${FREQ_PRESETS.map(([d, l]) => `<option value="${d}" ${Number(set.defaultFreq) === d ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="setting"><div class="row-main"><div class="row-title">Email with</div><div class="row-sub">What the email buttons open</div></div>
        <select style="width:auto;max-width:55%" data-chg="emailApp">${[['outlook', 'Outlook (app on phone, web on computer)'], ['outlookweb', 'Outlook on the web'], ['default', "Device's default email app"]].map(([v, l]) => `<option value="${v}" ${(set.emailApp || 'outlook') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="setting"><div class="row-main"><div class="row-title">Account types & contact roles</div><div class="row-sub">Edit the suggestion lists</div></div><button class="btn small" data-act="editTypes">Edit</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Archived accounts</div><div class="row-sub">${plural(archived, 'account')} archived</div></div><button class="btn small" data-act="showArchived">View</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Visit history</div><div class="row-sub">Every check-in, newest first</div></div><a class="btn small" href="#/visits/log">Open</a></div>
    </div>

    <div class="card"><h2>Theme</h2><div class="themes">${THEMES.map(([k, l, bg, ac]) => `<button class="theme ${set.theme === k ? 'on' : ''}" data-act="setTheme" data-val="${k}" style="background:${bg};color:${k === 'light' ? '#16202a' : '#e7edf3'}"><i style="background:${ac}"></i>${l}</button>`).join('')}</div></div>

    <div class="card"><h2>Your data</h2>
      <div class="setting"><div class="row-main"><div class="row-title">Back up now</div><div class="row-sub">${lb ? 'Last backup ' + relDays(daysBetween(lb)) + ' (' + fmtDate(lb) + ')' : 'Never backed up'}. Choose Google Drive from the share menu.</div></div><button class="btn small primary" data-act="backupNow">${icon('download')} Back up</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Restore from backup</div><div class="row-sub">Replaces everything on this device with a backup file</div></div><button class="btn small" data-act="restoreFile">${icon('upload')} Restore</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Export to spreadsheet</div><div class="row-sub">All accounts in an editable .xlsx. Edit it, then import it back; renames and changes update the same accounts.</div></div><button class="btn small" data-act="exportSheet">${icon('download')} Export</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Import spreadsheet</div><div class="row-sub">Add products and/or accounts from your .xlsx or .csv template</div></div><button class="btn small" data-act="importFile">${icon('upload')} Import</button></div>
      <div class="setting"><div class="row-main"><div class="row-title">Download import template</div><div class="row-sub">Blank spreadsheet with the right columns</div></div><button class="btn small" data-act="downloadTemplate">${icon('download')} Template</button></div>
      <p class="small muted" style="margin:10px 0 0">Your data is saved on this device and works offline${Store.persisted ? ', and the browser won\'t clear it to save space' : ''}. Your phone and computer each keep their own copy. To move data from one to the other, back up on one and restore on the other.</p>
    </div>

    <div class="danger-zone"><button class="btn danger" data-act="eraseAll">${icon('trash')} Erase all data on this device</button></div>
    <p class="small muted" style="text-align:center">Rounds · ${s.accounts.length} accounts · ${Data.liveProducts().length} products · product list v${s.catalogVersion || 0}</p>`;
    return { title: 'More', tab: 'more', html: h };
  },

  syncCard() {
    if (!Sync.on) {
      return `<div class="card"><h2>Sync across devices</h2>
        <p class="small muted" style="margin:0 0 12px">Keep your phone and computer in step automatically, using your private GitHub repository. Set it up once on each device.</p>
        <button class="btn primary block" data-act="syncSetup">${icon('route')} Set up sync on this device</button></div>`;
    }
    const c = Sync.cfg;
    const when = c.lastAt ? (daysBetween(c.lastAt) === 0 ? 'today at ' + fmtTime(c.lastAt) : fmtDateTime(c.lastAt)) : 'not yet';
    const status = {
      syncing: '<span class="good">Syncing…</span>',
      offline: 'Offline. Changes will sync when you\'re back online.',
      error: `<span class="red">Sync problem: ${esc(Sync.error)}</span>`,
      idle: `Last synced ${when}`,
    }[Sync.state] || `Last synced ${when}`;
    return `<div class="card"><h2>Sync across devices</h2>
      <div class="setting"><div class="row-main"><div class="row-title">${status}</div><div class="row-sub">This device: ${esc(c.device)} · ${esc(c.repo)}</div></div>
        <button class="btn small primary" data-act="syncNow" ${Sync.state === 'syncing' ? 'disabled' : ''}>Sync now</button></div>
      <div class="setting"><div class="row-main"><div class="row-sub">Changes sync automatically a few seconds after you make them, and when you open the app.</div></div></div>
      <div class="toolbar" style="margin:8px 0 0">${Sync.state === 'error' ? `<button class="btn small" data-act="syncSetup">Update access key</button>` : ''}<span class="spacer"></span><button class="btn small ghost danger" data-act="syncDisconnect">Turn off on this device</button></div></div>`;
  },
  /* ====================== ROUTES ====================== */
  routes() {
    const routes = Data.routesSorted();
    const count = (id) => Data.active().filter((a) => a.routeId === id).length;
    const unrouted = Data.active().filter((a) => !Data.route(a.routeId)).length;
    let h = `<p class="small muted" style="margin:0 4px 10px">Routes group your accounts by part of town. Use the arrows to set their order. Tap a route to rename it or move accounts in or out.</p>`;
    h += routes.length ? `<div class="list">${routes.map((r, i) => `<div class="row" data-act="go" data-href="#/route/${r.id}">
        <span class="dot" style="background:${r.color}"></span>
        <div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${plural(count(r.id), 'account')}</div></div>
        <button class="icon-btn ghost" data-act="routeMove" data-id="${r.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button>
        <button class="icon-btn ghost" data-act="routeMove" data-id="${r.id}" data-dir="1" ${i === routes.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button>
      </div>`).join('')}</div>` : '<div class="empty">No routes yet.</div>';
    if (unrouted) h += `<div class="list"><div class="row" data-act="go" data-href="#/route/none"><span class="dot st-never"></span><div class="row-main"><div class="row-title">No route</div><div class="row-sub">${plural(unrouted, 'account')} not assigned</div></div></div></div>`;
    return { title: 'Routes', tab: 'more', back: true, html: h, actions: `<button class="btn small primary" data-act="newRoute">${icon('plus')} New</button>` };
  },
  tags() {
    const tags = Data.tags();
    const count = (id) => Data.active().filter((a) => (a.tags || []).includes(id)).length;
    let h = `<p class="small muted" style="margin:0 4px 10px">Tags are labels you can put on any account and filter by. An account can have several tags. Tap a tag to rename it, recolor it or see its accounts.</p>`;
    h += tags.length ? `<div class="list">${tags.map((t, i) => `<div class="row" data-act="editTag" data-id="${t.id}">
        <span class="dot" style="background:${t.color}"></span>
        <div class="row-main"><div class="row-title">${esc(t.name)}</div><div class="row-sub">${plural(count(t.id), 'account')}</div></div>
        <button class="btn small" data-act="tagAccounts" data-id="${t.id}">View</button>
        <button class="icon-btn ghost" data-act="tagMove" data-id="${t.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button>
      </div>`).join('')}</div>` : '<div class="empty">No tags yet.</div>';
    return { title: 'Tags', tab: 'more', back: true, html: h, actions: `<button class="btn small primary" data-act="newTag">${icon('plus')} New</button>` };
  },
  reps() {
    const reps = Data.reps();
    const count = (id) => Data.s.accounts.filter((a) => a.repId === id).length;
    let h = `<p class="small muted" style="margin:0 4px 10px">Each rep is saved once and picked from a list on each account, so spellings stay consistent. Tap a rep for their contact info, accounts, priorities and notes.</p>`;
    const prios = (id) => Data.s.priorities.filter((p) => !p.done && Data.account(p.accountId)?.repId === id).length;
    h += reps.length ? `<div class="list">${reps.map((r) => `<div class="row" data-act="go" data-href="#/rep/${r.id}">
        <span class="icon-btn ghost" style="width:28px;height:28px">${icon('user')}</span>
        <div class="row-main"><div class="row-title">${esc(r.name)} ${prios(r.id) ? `<span class="pill flag-pill">${icon('flag')}${prios(r.id)}</span>` : ''}</div><div class="row-sub">${esc([r.title, plural(count(r.id), 'account')].filter(Boolean).join(' · '))}</div></div>
        ${r.phone ? `<a class="icon-btn" href="${telHref(r.phone)}" aria-label="Call">${icon('phone')}</a>` : ''}
      </div>`).join('')}</div>` : '<div class="empty">No reps yet.</div>';
    return { title: 'Breakthru reps', tab: 'reps', html: h, actions: `<button class="btn small primary" data-act="newRep">${icon('plus')} New</button>` };
  },
  rep(id) {
    const r = Data.rep(id);
    if (!r) return { title: 'Not found', back: true, tab: 'reps', html: '<div class="empty">This rep no longer exists.</div>' };
    const s = Data.s, ua = UI.acct, lm = Data.lastVisitMap();
    const accts = sortBy(s.accounts.filter((a) => a.repId === r.id && !a.archived), (a) => norm(a.name));
    const archived = s.accounts.filter((a) => a.repId === r.id && a.archived).length;
    const head = `<div class="card">
      <div class="contact" style="border-top:0;padding-top:0">
        <div class="contact-main" data-act="editRep" data-id="${r.id}">
          <div class="row-title" style="font-size:18px">${esc(r.name)}</div>
          <div class="row-sub">${esc(['Breakthru', r.title].filter(Boolean).join(' · '))}</div>
          ${r.phone ? `<div class="row-sub">${esc(r.phone)}</div>` : ''}
          ${r.email ? `<div class="row-sub">${esc(r.email)}</div>` : ''}
          ${!r.phone && !r.email ? `<div class="row-sub"><button class="link-btn" style="padding:4px 0" data-act="editRep" data-id="${r.id}">+ Add phone and email</button></div>` : ''}
        </div>
        <div class="contact-actions">
          ${r.phone ? `<a class="icon-btn" href="${telHref(r.phone)}" aria-label="Call">${icon('phone')}</a><a class="icon-btn" href="${smsHref(r.phone)}" aria-label="Text">${icon('msg')}</a>` : ''}
          ${r.email ? `<a class="icon-btn" ${mailAttrs(r.email)} aria-label="Email">${icon('mail')}</a>` : ''}
        </div>
      </div></div>`;
    // priorities on this rep's accounts
    const openP = Data.sortPriorities(s.priorities.filter((p) => !p.done && accts.some((a) => a.id === p.accountId)));
    const prios = `<div class="card"><h2>Priorities on their accounts ${openP.length ? `<span class="count">${openP.length}</span>` : ''}</h2>
      ${openP.length ? openP.map((p) => this.prioRow(p, true)).join('') : '<div class="muted small">No open priorities on these accounts.</div>'}</div>`;
    // notes about the rep
    const notesAll = sortBy(s.notes.filter((n) => n.repId === r.id), (n) => n.createdAt).reverse();
    const shown = ua.notesAll ? notesAll : notesAll.slice(0, 5);
    const notes = `<div class="card"><h2>Notes ${notesAll.length ? `<span class="count">${notesAll.length}</span>` : ''}<span class="spacer"></span><button class="btn small" data-act="addRepNote" data-id="${r.id}">${icon('plus')} Add</button></h2>
      ${shown.length ? shown.map((n) => `<div class="item" data-act="editNote" data-id="${n.id}"><div class="item-head">${fmtDateTime(n.createdAt)}${n.updatedAt && n.updatedAt !== n.createdAt ? ` · edited ${fmtDate(n.updatedAt)}` : ''}</div><div class="pre">${esc(n.text)}</div></div>`).join('') : '<div class="muted small">No notes yet.</div>'}
      ${notesAll.length > 5 ? `<button class="link-btn" data-act="acctToggle" data-key="notesAll">${ua.notesAll ? 'Show fewer' : `Show all ${notesAll.length} notes`}</button>` : ''}</div>`;
    // accounts
    const list = `<div class="card" style="padding-bottom:4px"><h2>Accounts <span class="count">${accts.length}</span><span class="spacer"></span><button class="btn small" data-act="repAddAccounts" data-id="${r.id}">${icon('plus')} Assign</button></h2>
      ${accts.length ? accts.map((a) => { const st = Data.status(a, lm); const op = Data.openPriorities(a.id).length;
        return `<div class="contact" data-act="openAccount" data-id="${a.id}" style="cursor:pointer">${statusDot(st)}<div class="contact-main"><div class="row-title">${esc(a.name)} ${op ? `<span class="pill flag-pill">${icon('flag')}${op}</span>` : ''}</div><div class="row-sub">${esc([Data.route(a.routeId)?.name, Data.statusText(st)].filter(Boolean).join(' · '))}</div></div></div>`; }).join('') : '<div class="muted small" style="padding-bottom:10px">No accounts assigned yet.</div>'}
      ${archived ? `<div class="small muted" style="padding:6px 0 10px">+ ${plural(archived, 'archived account')}</div>` : ''}</div>`;
    return {
      title: r.name, back: true, tab: 'reps',
      actions: `<button class="btn small" data-act="editRep" data-id="${r.id}">${icon('edit')} Edit</button>`,
      html: head + `<div class="acct-grid"><div>${prios}${notes}</div><div>${list}</div></div>
        <div class="danger-zone"><button class="btn danger" data-act="deleteRep" data-id="${r.id}">${icon('trash')} Remove rep</button></div>`,
    };
  },
  route(id) {
    const r = id === 'none' ? null : Data.route(id);
    if (id !== 'none' && !r) return { title: 'Not found', back: true, tab: 'more', html: '<div class="empty">Route not found.</div>' };
    const list = sortBy(Data.active().filter((a) => (r ? a.routeId === r.id : !Data.route(a.routeId))), (a) => norm(a.name));
    const routes = Data.routesSorted();
    const opts = (a) => `<option value="">No route</option>` + routes.map((x) => `<option value="${x.id}" ${a.routeId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    let h = r ? `<div class="toolbar"><span class="pill"><span class="dot" style="background:${r.color}"></span>${plural(list.length, 'account')}</span><span class="spacer"></span><button class="btn small" data-act="routeAddAccounts" data-id="${r.id}">${icon('plus')} Add accounts</button></div>` : `<p class="small muted" style="margin:0 4px 10px">These accounts aren't in a route yet. Pick one for each.</p>`;
    h += list.length ? `<div class="list">${list.map((a) => `<div class="row"><div class="row-main" data-act="openAccount" data-id="${a.id}"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${esc(a.address || a.type || '')}</div></div>
      <select style="width:auto;max-width:44%" data-chg="moveRoute" data-id="${a.id}" aria-label="Route">${opts(a)}</select></div>`).join('')}</div>` : '<div class="empty">No accounts in this route yet.</div>';
    return { title: r ? r.name : 'No route', tab: 'more', back: true, html: h, actions: r ? `<button class="btn small" data-act="editRoute" data-id="${r.id}">${icon('edit')} Edit</button>` : '' };
  },
};

function fmtWeekdayDate(iso) { return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: new Date(iso).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); }
