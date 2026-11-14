'use strict';
/* ---------- Router ---------- */
const ROUTES = [
  [/^#\/visits$/, () => Pages.visits()],
  [/^#\/visits\/log$/, () => Pages.visitLog()],
  [/^#\/accounts$/, () => Pages.accounts()],
  [/^#\/other$/, () => Pages.other()],
  [/^#\/account\/([\w-]+)$/, (id) => Pages.account(id)],
  [/^#\/priorities$/, () => Pages.priorities()],
  [/^#\/products$/, () => Pages.products()],
  [/^#\/more$/, () => Pages.more()],
  [/^#\/routes$/, () => Pages.routes()],
  [/^#\/tags$/, () => Pages.tags()],
  [/^#\/reps$/, () => Pages.reps()],
  [/^#\/rep\/([\w-]+)$/, (id) => Pages.rep(id)],
  [/^#\/route\/([\w-]+)$/, (id) => Pages.route(id)],
];

const App = {
  navDepth: 0,
  scrolls: {},       // scroll position of each page, restored when you come back to it
  lastHash: null,
  fromTab: false,    // set when a bottom/side tab is tapped: those always open at the top
  render(keepScroll) {
    const h = location.hash || '#/visits';
    let r = null;
    for (const [re, fn] of ROUTES) { const m = h.match(re); if (m) { r = fn(...m.slice(1)); break; } }
    if (!r) { location.replace('#/visits'); return; }
    const y = window.scrollY;
    $('#title').textContent = r.title;
    document.title = r.title === 'Visits' ? 'Rounds' : `${r.title} · Rounds`;
    $('#back').hidden = !r.back;
    $('#topActions').innerHTML = r.actions || '';
    $('#view').innerHTML = r.html;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === r.tab));
    let target = 0;
    if (keepScroll) target = y;
    else if (!this.fromTab && this.scrolls[h] != null) target = this.scrolls[h];
    this.fromTab = false;
    window.scrollTo(0, target);
    this.lastHash = h;
  },
  refresh() { this.render(true); },
  currentAccountId() { const m = location.hash.match(/^#\/account\/([\w-]+)$/); return m ? m[1] : ''; },
};

function applyTheme() {
  const t = Data.s.settings.theme || 'midnight';
  document.documentElement.dataset.theme = t;
  const th = THEMES.find((x) => x[0] === t);
  $('meta[name=theme-color]').setAttribute('content', th ? th[2] : '#0e141b');
}

/* ---------- Click actions ---------- */
const findAcc = (el) => Data.account(el.dataset.acc || el.dataset.id);
const ACT = {
  back() { if (App.navDepth > 0) history.back(); else location.hash = '#/accounts'; },
  go(el) { Modal.closeAll().then(() => { location.hash = el.dataset.href; }); },
  openAccount(el) { location.hash = '#/account/' + el.dataset.id; },
  fab() { Forms.quickAdd(); },
  quick(el) {
    const kind = el.dataset.kind, acc = App.currentAccountId();
    Modal.close().then(() => {
      if (kind === 'visit') Forms.visit({ accountId: acc });
      if (kind === 'note') Forms.note({ accountId: acc });
      if (kind === 'priority') Forms.priority({ accountId: acc });
      if (kind === 'account') Forms.account(null, { list: location.hash === '#/other' || Data.isOther(Data.account(acc)) ? 'other' : '' });
      if (kind === 'contact') Forms.contact(acc || '');
      if (kind === 'opp') {
        if (acc) return ACT.addOpps({ dataset: { acc } });
        Picker.account({ title: 'Opportunity for which account?' }).then((id) => { if (id) ACT.addOpps({ dataset: { acc: id } }); });
      }
    });
  },
  modalClose() { Modal.close(); },
  modalResolve(el) { Modal.close(el.dataset.val); },

  async checkIn(el) {
    const a = Data.account(el.dataset.id); if (!a) return;
    const at = new Date().toISOString();
    const v = { id: uid(), accountId: a.id, at, note: '' };
    Data.s.visits.push(v);
    commit();
    const extra = await askLinkedCheckins(a, at);
    const all = [v, ...extra];
    Toast.show(extra.length ? `Checked in at ${a.name} + ${plural(extra.length, 'nearby account')}` : `Checked in at ${a.name}`, [
      { label: 'Add note', fn: () => Forms.visit({ visit: v }) },
      { label: 'Undo', fn: () => { const ids = new Set(all.map((x) => x.id)); Data.s.visits = Data.s.visits.filter((x) => !ids.has(x.id)); commit(); } },
    ], 7000);
  },
  linkCheckinsDone() {
    const box = Modal.top();
    Modal.close($$('input[name=linkedCheckin]:checked', box).map((x) => x.value));
  },
  logVisit(el) { Forms.visit({ accountId: el.dataset.acc || App.currentAccountId() }); },
  editVisit(el) { const v = Data.s.visits.find((x) => x.id === el.dataset.id); if (v) Forms.visit({ visit: v }); },
  async deleteVisit(el) {
    const sibs = Data.visitSiblings(Data.s.visits.find((x) => x.id === el.dataset.id)).map((x) => Data.account(x.accountId)?.name).filter(Boolean);
    if (!(await confirmBox(`Delete this visit?${sibs.length ? ` The visit at ${sibs.join(', ')} stays.` : ''}`, { ok: 'Delete', danger: true }))) return;
    Data.s.visits = Data.s.visits.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },

  addNote(el) { Forms.note({ accountId: el.dataset.acc }); },
  editNote(el) { const n = Data.s.notes.find((x) => x.id === el.dataset.id); if (n) Forms.note({ note: n }); },
  async deleteNote(el) {
    if (!(await confirmBox('Delete this note?', { ok: 'Delete', danger: true }))) return;
    Data.s.notes = Data.s.notes.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },

  addPriority(el) { Forms.priority({ accountId: el.dataset.acc || App.currentAccountId() }); },
  editPriority(el) { const p = Data.s.priorities.find((x) => x.id === el.dataset.id); if (p) Forms.priority({ prio: p }); },
  togglePriority(el) {
    const p = Data.s.priorities.find((x) => x.id === el.dataset.id); if (!p) return;
    p.done = !p.done; p.doneAt = p.done ? new Date().toISOString() : null;
    commit();
    if (p.done) Toast.show('Priority done', [{ label: 'Undo', fn: () => { p.done = false; p.doneAt = null; commit(); } }]);
  },
  async deletePriority(el) {
    if (!(await confirmBox('Delete this priority?', { ok: 'Delete', danger: true }))) return;
    Data.s.priorities = Data.s.priorities.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },

  newAccount(el) { Forms.account(null, { list: el?.dataset?.list || (location.hash === '#/other' ? 'other' : '') }); },
  moveList(el) {
    const a = Data.account(el.dataset.id); if (!a) return;
    a.list = Data.isOther(a) ? '' : 'other';
    commit();
    Toast.show(Data.isOther(a) ? `${a.name} moved to Other Accounts` : `${a.name} moved to your Account List. It's on your visit schedule now.`);
  },
  toggleOtherArchived() { UI.other.archived = !UI.other.archived; $('#otherList').innerHTML = Pages.otherList(); },
  editAccount(el) { const a = Data.account(el.dataset.id); if (a) Forms.account(a); },
  archiveAccount(el) {
    const a = Data.account(el.dataset.id);
    a.archived = !a.archived;
    commit();
    Toast.show(a.archived ? `${a.name} archived. Its history is kept.` : `${a.name} restored`);
  },
  async deleteAccount(el) {
    const a = Data.account(el.dataset.id);
    const ok = await confirmBox(`Permanently delete ${a.name} and all of its notes, visits, priorities and opportunities?\n\nTip: archiving hides the account but keeps its history.`, { ok: 'Delete forever', danger: true, title: 'Delete account?' });
    if (!ok) return;
    const s = Data.s;
    s.accounts = s.accounts.filter((x) => x.id !== a.id);
    for (const k of ['notes', 'visits', 'opportunities']) s[k] = s[k].filter((x) => x.accountId !== a.id);
    s.priorities = s.priorities.filter((x) => x.accountId !== a.id);
    s.linkGroups = s.linkGroups.map((g) => ({ ...g, accountIds: g.accountIds.filter((id) => id !== a.id) })).filter((g) => g.accountIds.length > 1);
    Store.save();
    location.hash = '#/accounts';
    Toast.show('Account deleted');
  },
  showArchived() { Object.assign(UI.accounts, { archived: 'archived', showFilters: true }); UI.save(); location.hash = '#/accounts'; },

  addContact(el) { Forms.contact(el.dataset.acc); },
  editContact(el) { const a = findAcc(el); const c = Data.contactsOf(a).find((x) => x.id === el.dataset.id); if (c) Forms.contact(a.id, c); },
  async addExistingContact(el) {
    const a = findAcc(el);
    const pid = await Picker.person({ exclude: a.contacts.map((l) => l.personId), title: `Add to ${a.name}` });
    if (pid) Forms.contact(a.id, null, { personId: pid });
  },
  async deleteContact(el) {
    const form = el.closest('form'); const a = Data.account(form.dataset.acc || form.accountId.value);
    const c = Data.contactsOf(a).find((x) => x.id === el.dataset.id); if (!c) return;
    const others = Data.accountsOfPerson(c.personId).filter((o) => o.id !== a.id);
    if (!(await confirmBox(`Remove ${c.name || 'this contact'} from ${a.name}?${others.length ? ` They'll stay on ${others.map((o) => o.name).join(', ')}.` : ''}`, { ok: 'Remove', danger: true }))) return;
    Data.unlinkContact(Data.account(a.id), c.id);
    Modal.close(); commit();
  },

  async addPlacements(el) {
    let a = findAcc(el);
    const exclude = new Map(a.placements.map((pl) => [pl.productId, 'carried']));
    const ids = await Picker.products({ title: `Products at ${a.name}`, exclude });
    if (!ids.length) return;
    a = Data.account(a.id); if (!a) return;
    const setup = await Forms.placementSetup(a, ids);
    if (!setup) return;
    a = Data.account(a.id); if (!a) return;
    const now = new Date().toISOString();
    a.placements.push(...setup.items.map((x) => ({ id: uid(), addedAt: now, since: setup.isNew ? toLocalDate() : '', ...x })));
    commit();
    Toast.show(`Added ${plural(ids.length, 'product')}${setup.isNew ? ' as new placements' : ''}`);
  },
  placementSetupDone() {
    const box = Modal.top();
    const items = $$('.ps-item', box).map((el) => {
      const x = { productId: el.dataset.pid };
      if (!el.dataset.rtd) for (const k of ['well', 'backBar', 'cocktail']) x[k] = !!el.querySelector(`input[data-k=${k}]`)?.checked;
      return x;
    });
    Modal.close({ items, isNew: !!box.querySelector('input[name=psNew]')?.checked });
  },
  psAll(el) { // set one option on every product at once
    const box = Modal.top(), k = el.dataset.k;
    const boxes = $$(`input[data-k=${k}]`, box);
    const on = !boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = on));
  },
  editPlacement(el) { const a = findAcc(el); const pl = a.placements.find((x) => x.id === el.dataset.id); if (pl) Forms.placement(a, pl); },
  async deletePlacement(el) {
    const form = el.closest('form'); const a = Data.account(form.dataset.acc);
    if (!(await confirmBox('Remove this product from the account?', { ok: 'Remove', danger: true }))) return;
    a.placements = a.placements.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },

  async addOpps(el) {
    let a = findAcc(el); if (!a) return;
    const exclude = new Map(a.placements.map((pl) => [pl.productId, 'carried']));
    Data.s.opportunities.filter((o) => o.accountId === a.id && o.status === 'open').forEach((o) => exclude.set(o.productId, 'pitching'));
    const ids = await Picker.products({ title: `Pitching at ${a.name}`, exclude });
    if (!ids.length) return;
    a = Data.account(a.id); if (!a) return;
    const now = new Date().toISOString();
    ids.forEach((pid) => Data.s.opportunities.push({ id: uid(), accountId: a.id, productId: pid, status: 'open', note: '', createdAt: now, closedAt: null }));
    commit();
    Toast.show(`${plural(ids.length, 'opportunity', 'opportunities')} added to ${a.name}`);
  },
  oppWon(el) { setOppStatus(Data.s.opportunities.find((o) => o.id === el.dataset.id), 'won'); },
  oppLost(el) { setOppStatus(Data.s.opportunities.find((o) => o.id === el.dataset.id), 'lost'); },
  editOpp(el) { const o = Data.s.opportunities.find((x) => x.id === el.dataset.id); if (o) Forms.opp(o); },
  async deleteOpp(el) {
    if (!(await confirmBox('Delete this opportunity?', { ok: 'Delete', danger: true }))) return;
    Data.s.opportunities = Data.s.opportunities.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },

  editHours(el) { Forms.hours(Data.account(el.dataset.id)); },
  copyMonday(el) {
    const f = el.closest('form');
    const from = f.from_mon.value, to = f.to_mon.value, closed = f.closed_mon.checked;
    const best = $$('input[name=best_mon]', f).filter((x) => x.checked).map((x) => x.value);
    for (const d of DAY_ORDER.slice(1)) {
      f['from_' + d].value = from; f['to_' + d].value = to; f['closed_' + d].checked = closed;
      f['from_' + d].disabled = f['to_' + d].disabled = closed;
      $$(`input[name=best_${d}]`, f).forEach((x) => (x.checked = best.includes(x.value)));
    }
  },
  acctToggle(el) { UI.acct[el.dataset.key] = !UI.acct[el.dataset.key]; App.refresh(); },

  pickAccountField(el) {
    const form = el.closest('form');
    Picker.account({ allowNone: !!el.dataset.allowNone }).then((id) => {
      if (!id) return;
      if (id === '__none') { form.accountId.value = ''; el.textContent = 'No account (general)'; }
      else { form.accountId.value = id; el.textContent = Data.account(id).name; }
    });
  },
  pickProdDone() { Modal.close(Array.from(Picker._prod.sel)); },
  pickAcctDone() { Modal.close(Array.from(Picker._acct.sel)); },

  toggleOpenToday() { UI.visits.openToday = !UI.visits.openToday; UI.save(); App.refresh(); },
  visitStatus(el) { UI.visits.status = UI.visits.status === el.dataset.val ? 'all' : el.dataset.val; UI.save(); App.refresh(); },
  visitRoute(el) { UI.visits.route = el.dataset.val; UI.save(); App.refresh(); },
  toggleFilters() { UI.accounts.showFilters = !UI.accounts.showFilters; UI.save(); App.refresh(); },
  clearFilters() {
    ACCT_FILTER_KEYS.forEach((k) => (UI.accounts[k] = k === 'prio' ? false : ''));
    UI.accounts.archived = 'active'; UI.accounts.q = '';
    UI.save(); App.refresh();
  },
  prioShow(el) { UI.prios.show = el.dataset.val; UI.save(); App.refresh(); },
  prioImp(el) { UI.prios.imp = el.dataset.val; UI.save(); App.refresh(); },

  async newRoute() { await Forms.route(); },
  editRoute(el) { Forms.route(Data.route(el.dataset.id)); },
  async deleteRoute(el) {
    const r = Data.route(el.dataset.id);
    const n = Data.s.accounts.filter((a) => a.routeId === r.id).length;
    if (!(await confirmBox(`Delete the route "${r.name}"?${n ? ` Its ${plural(n, 'account')} will move to "No route".` : ''}`, { ok: 'Delete', danger: true }))) return;
    Data.s.routes = Data.s.routes.filter((x) => x.id !== r.id);
    Data.s.accounts.forEach((a) => { if (a.routeId === r.id) a.routeId = ''; });
    Store.save();
    await Modal.close();
    location.hash = '#/routes';
  },
  routeMove(el) {
    const list = Data.routesSorted(); const i = list.findIndex((r) => r.id === el.dataset.id); const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((r, k) => (r.order = k));
    commit();
  },
  async routeAddAccounts(el) {
    const r = Data.route(el.dataset.id);
    const ids = await Picker.account({ title: `Add to ${r.name}`, multi: true, exclude: Data.s.accounts.filter((a) => a.routeId === r.id).map((a) => a.id) });
    if (!ids?.length) return;
    ids.forEach((id) => (Data.account(id).routeId = r.id));
    commit();
    Toast.show(`Moved ${plural(ids.length, 'account')} to ${r.name}`);
  },

  newTag() { Forms.tag(); },
  async newTagInline(el) {
    const box = el.closest('.tag-pick');
    const id = await Forms.tag();
    const t = id && Data.tag(id);
    if (!t) return;
    const existing = box.querySelector(`input[value="${t.id}"]`);
    if (existing) { existing.checked = true; return; }
    el.insertAdjacentHTML('beforebegin', tagChip(t, true));
  },
  async newRep() { const id = await Forms.rep(); if (id && Data.rep(id)) location.hash = '#/rep/' + id; },
  addRepNote(el) { Forms.note({ repId: el.dataset.id }); },
  async repAddAccounts(el) {
    const r = Data.rep(el.dataset.id);
    const ids = await Picker.account({ title: `Assign to ${r.name}`, multi: true, exclude: Data.s.accounts.filter((a) => a.repId === r.id).map((a) => a.id) });
    if (!ids?.length) return;
    const moved = ids.filter((id) => Data.account(id).repId && Data.account(id).repId !== r.id).length;
    ids.forEach((id) => (Data.account(id).repId = r.id));
    commit();
    Toast.show(`${plural(ids.length, 'account')} assigned to ${r.name}${moved ? ` (${moved} moved from another rep)` : ''}`);
  },
  editRep(el) { Forms.rep(Data.rep(el.dataset.id)); },
  repAccounts(el) { ACT.clearFilters(); UI.accounts.rep = el.dataset.id; UI.accounts.showFilters = true; UI.save(); location.hash = '#/accounts'; },
  async deleteRep(el) {
    const r = Data.rep(el.dataset.id);
    const n = Data.s.accounts.filter((a) => a.repId === r.id).length;
    const nn = Data.s.notes.filter((x) => x.repId === r.id).length;
    if (!(await confirmBox(`Remove ${r.name} from your rep list?${n ? ` ${plural(n, 'account')} will be left with no rep.` : ''}${nn ? ` Their ${plural(nn, 'note')} will be deleted.` : ''}`, { ok: 'Remove', danger: true }))) return;
    Data.s.settings.reps = Data.s.settings.reps.filter((x) => x.id !== r.id);
    Data.s.accounts.forEach((a) => { if (a.repId === r.id) a.repId = ''; });
    Data.s.notes = Data.s.notes.filter((x) => x.repId !== r.id);
    await Modal.close(); Store.save();
    if (location.hash.startsWith('#/rep/')) location.replace('#/reps'); else App.refresh();
  },
  editTag(el) { Forms.tag(Data.tag(el.dataset.id)); },
  tagAccounts(el) { ACT.clearFilters(); UI.accounts.tag = el.dataset.id; UI.save(); location.hash = '#/accounts'; },
  tagMove(el) {
    const list = Data.s.settings.tags; const i = list.findIndex((t) => t.id === el.dataset.id);
    if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; commit(); }
  },
  async deleteTag(el) {
    const t = Data.tag(el.dataset.id);
    const n = Data.s.accounts.filter((a) => (a.tags || []).includes(t.id)).length;
    if (!(await confirmBox(`Delete the tag "${t.name}"?${n ? ` It will be removed from ${plural(n, 'account')}.` : ''}`, { ok: 'Delete', danger: true }))) return;
    Data.s.settings.tags = Data.s.settings.tags.filter((x) => x.id !== t.id);
    Data.s.accounts.forEach((a) => (a.tags = (a.tags || []).filter((x) => x !== t.id)));
    Modal.close(); commit();
  },
  addProduct() { Forms.product(); },
  productInfo(el) { const p = Data.product(el.dataset.id); if (p) Forms.productInfo(p); },
  async deleteProduct(el) {
    const p = Data.product(el.dataset.id);
    const uses = Data.s.accounts.filter((a) => a.placements.some((pl) => pl.productId === p.id)).length;
    if (!(await confirmBox(`Delete ${Data.productLabel(p, true)} from your product list?${uses ? `\n\nIt will also be removed from ${plural(uses, 'account')} that carry it.` : ''}`, { ok: 'Delete', danger: true }))) return;
    const s = Data.s;
    const cur = Data.product(p.id) || p;
    if (cur.builtin) cur.hidden = true; // built-in products come back on update, so hide instead
    else s.products = s.products.filter((x) => x.id !== p.id);
    s.accounts.forEach((a) => (a.placements = a.placements.filter((pl) => pl.productId !== p.id)));
    s.opportunities = s.opportunities.filter((o) => o.productId !== p.id);
    Modal.close(); commit();
  },

  setTheme(el) { Data.s.settings.theme = el.dataset.val; applyTheme(); commit(); },
  editTypes() { Forms.types(); },
  backupNow() { IO.backup(); },
  exportSheet() { IO.exportSheet(); },
  exportVisits() { Forms.exportVisits(); },
  visitRange(el) {
    const box = Modal.top(), f = box.querySelector('form');
    f.from.value = el.dataset.from; f.to.value = el.dataset.to;
    $$('[data-act=visitRange]', box).forEach((c) => c.classList.toggle('on', c === el));
    box._upd?.();
  },
  syncSetup() { Forms.syncSetup(); },
  addLink(el) { Forms.link(findAcc(el)); },
  editLink(el) { const g = Data.s.linkGroups.find((x) => x.id === el.dataset.id); if (g) Forms.editLink(g); },
  async deleteLink(el) {
    if (!(await confirmBox('Remove this link? The accounts themselves are not changed.', { ok: 'Remove', danger: true }))) return;
    Data.s.linkGroups = Data.s.linkGroups.filter((x) => x.id !== el.dataset.id);
    Modal.close(); commit();
  },
  async pickLinkAccounts(el) {
    const form = el.closest('form');
    const ids = await Picker.account({ title: 'Link with…', multi: true, exclude: [el.dataset.acc] });
    if (!ids?.length) return;
    form.accountIds.value = ids.join(',');
    el.textContent = ids.map((id) => Data.account(id)?.name).join(', ');
  },
  syncNow() { Sync.run({ manual: true }); },
  async syncDisconnect() {
    if (!(await confirmBox('Turn off sync on this device? Your data stays on this device and in your repository; this device just stops syncing. You\'ll need the access key to turn it back on.', { ok: 'Turn off' }))) return;
    await Sync.disconnect(); App.refresh(); Toast.show('Sync turned off on this device');
  },
  restoreFile() { $('#fileRestore').click(); },
  importFile() { $('#fileImport').click(); },
  downloadTemplate() { IO.template(); },
  async eraseAll() {
    if (!(await confirmBox('Erase every account, note, visit, priority and product on this device? This cannot be undone. Back up first if you might want any of it.', { ok: 'Erase everything', danger: true, title: 'Erase all data?' }))) return;
    if (!(await confirmBox('Really erase everything?', { ok: 'Yes, erase', danger: true, title: 'Last check' }))) return;
    if (Sync.on) await Sync.disconnect(); // so erasing here never erases your other devices
    await Store.replace(Store.defaults());
    applyTheme(); location.hash = '#/visits'; App.refresh();
  },
};

/* ---------- Change / input handlers ---------- */
const CHG = {
  visitSort(el) { UI.visits.sort = el.value; UI.save(); App.refresh(); },
  visitRep(el) { UI.visits.rep = el.value; UI.save(); App.refresh(); },
  visitTag(el) { UI.visits.tag = el.value; UI.save(); App.refresh(); },
  visitOpenToday(el) { UI.visits.openToday = el.checked; UI.save(); App.refresh(); },
  acctFilter(el) {
    const k = el.dataset.key;
    UI.accounts[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'brand') UI.accounts.product = '';
    UI.save(); App.refresh();
  },
  prioFilter(el) { UI.prios[el.dataset.key] = el.value; UI.save(); App.refresh(); },
  freqSel(el) { const c = el.form.freqCustom; c.hidden = el.value !== 'custom'; if (!c.hidden) c.focus(); },
  async routeSel(el) {
    if (el.value !== '__new') return;
    const id = await Forms.route();
    const r = id && Data.route(id);
    if (r) { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; el.insertBefore(o, el.lastElementChild); el.value = r.id; }
    else el.value = '';
  },
  async repSel(el) {
    if (el.value !== '__new') return;
    const id = await Forms.rep();
    const r = id && Data.rep(id);
    if (r) {
      if (!el.querySelector(`option[value="${r.id}"]`)) { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; el.insertBefore(o, el.lastElementChild); }
      el.value = r.id;
    } else el.value = '';
  },
  linkType(el) {
    const own = el.value === 'ownership';
    $('#ownerName').hidden = !own;
    $('#linkHint').textContent = own ? 'Same owner or restaurant group. Shown on each account; no check-in prompt.' : 'Same building, or close enough that one conversation covers both. Checking in at one will offer to check in at the others.';
  },
  plCocktail(el) { $('#cocktailField').hidden = !el.checked; },
  hoursClosed(el) { const f = el.form, d = el.dataset.day; f['from_' + d].disabled = f['to_' + d].disabled = el.checked; },
  pickProdToggle(el) { const s = Picker._prod.sel; el.checked ? s.add(el.value) : s.delete(el.value); Picker.updateProdBtn(); },
  pickAcctToggle(el) { const s = Picker._acct.sel; el.checked ? s.add(el.value) : s.delete(el.value); const b = $('#pickAcctDoneBtn'); if (b) b.textContent = s.size ? `Add ${s.size} selected` : 'Add selected'; },
  moveRoute(el) { const a = Data.account(el.dataset.id); a.routeId = el.value; commit(); Toast.show(`${a.name} moved to ${Data.routeName(el.value)}`); },
  emailApp(el) { Data.s.settings.emailApp = el.value; commit(); Toast.show('Email buttons updated'); },
  defaultFreq(el) { Data.s.settings.defaultFreq = Number(el.value); commit(); },
  fileImport(el) { const f = el.files[0]; el.value = ''; if (f) IO.importFile(f); },
  fileRestore(el) { const f = el.files[0]; el.value = ''; if (f) IO.restore(f); },
};
const INPUT = {
  acctSearch: debounce((el) => { UI.accounts.q = el.value; $('#acctList').innerHTML = Pages.accountsList(); }, 150),
  otherSearch: debounce((el) => { UI.other.q = el.value; $('#otherList').innerHTML = Pages.otherList(); }, 150),
  prodSearch: debounce((el) => { UI.products.q = el.value; $('#prodTree').innerHTML = Pages.productTree(); }, 150),
  pickAcctSearch: debounce((el) => { Picker._acct.q = el.value; $('#pickAcctList').innerHTML = Picker.acctList(); }, 100),
  pickPersonSearch: debounce((el) => { Picker._person.q = el.value; $('#pickPersonList').innerHTML = Picker.personList(); }, 100),
  pickProdSearch: debounce((el) => { Picker._prod.q = el.value; $('#pickProdTree').innerHTML = Picker.prodTree(); }, 150),
};
function debounce(fn, ms) { let t; return (el) => { clearTimeout(t); t = setTimeout(() => fn(el), ms); }; }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const link = e.target.closest('a[href]');
  if (link && el.contains(link) && link !== el) return; // let inner links navigate
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e); });
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  FORMS[f.dataset.form]?.(f, new FormData(f));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && Modal.stack.length) Modal.close();
  // Ctrl/Cmd+Enter submits the open form (handy for notes on desktop)
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const f = Modal.top()?.querySelector('form'); if (f) f.requestSubmit(); }
});
window.addEventListener('popstate', () => { Modal.onPop(); });
document.addEventListener('toggle', (e) => {
  const d = e.target; if (!d.dataset || !d.dataset.plcat) return;
  UI.acct.plOpen = UI.acct.plOpen || {};
  UI.acct.plOpen[App.currentAccountId() + '|' + d.dataset.plcat] = d.open;
}, true);
window.addEventListener('scroll', () => { if (App.lastHash) App.scrolls[App.lastHash] = window.scrollY; }, { passive: true });
window.addEventListener('hashchange', () => { App.navDepth++; Toast.hide(); App.render(false); });
// tapping a tab: open that page at the top (and if you're already there, scroll back up)
$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('a[href]'); if (!a) return;
  App.fromTab = true;
  if (a.getAttribute('href') === location.hash) { App.fromTab = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { Store.flush(); if (Sync.on && Sync.timer) Sync.run(); }
  else { if (!Modal.stack.length) App.refresh(); if (Sync.on && (!Sync.cfg.lastAt || Date.now() - new Date(Sync.cfg.lastAt) > 20000)) Sync.run(); }
});

/* ---------- Boot ---------- */
(async function init() {
  $$('#nav .ni').forEach((s) => (s.outerHTML = icon(s.dataset.icon)));
  $('#back').innerHTML = icon('back');
  $('#fab').innerHTML = icon('plus');
  UI.load();
  Sync.load();
  await Store.load();
  applyTheme();
  if (history.state?.modal) history.replaceState(null, '');
  if (!location.hash) location.replace('#/visits');
  App.render();
  if (Sync.on) setTimeout(() => Sync.run(), 300);
  window.addEventListener('online', () => Sync.run());
  window.addEventListener('offline', () => { if (Sync.on) Sync.setState('offline'); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) Toast.show('A new version of Rounds is ready', [{ label: 'Reload', fn: () => location.reload() }], 15000);
        });
      });
    }).catch((e) => console.warn('SW registration failed', e));
  }
})();

/* After checking in somewhere that has "Same proximity" links, offer to check in at those too */
function askLinkedCheckins(a, at, note = '') {
  const near = Data.nearby(a.id);
  if (!near.length) return Promise.resolve([]);
  return new Promise((res) => {
    const lm = Data.lastVisitMap();
    Modal.open(`${modalHead('Also check in nearby?')}<div class="modal-body">
      <p style="margin-top:0">${esc(a.name)} is linked by proximity to:</p>
      ${near.map((n) => `<label class="checkline"><input type="checkbox" name="linkedCheckin" value="${n.id}" checked><span><b>${esc(n.name)}</b><br><span class="small muted">${esc(Data.statusText(Data.status(n, lm)))}</span></span></label>`).join('')}
      </div><div class="modal-foot"><button class="btn" data-act="modalClose">Just ${esc(a.name)}</button><button class="btn primary" data-act="linkCheckinsDone">Check in</button></div>`,
    { onClose: (ids) => {
      const made = (Array.isArray(ids) ? ids : []).map((id) => ({ id: uid(), accountId: id, at, note }));
      if (made.length) { Data.s.visits.push(...made); commit(); }
      res(made);
    } });
  });
}
