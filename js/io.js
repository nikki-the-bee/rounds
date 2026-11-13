'use strict';
/* ---------- Backup / restore / spreadsheet import ---------- */
const IO = {
  async backup() {
    const s = Data.s;
    const stamp = toLocalDate();
    const blob = new Blob([JSON.stringify({ app: 'rounds-crm', version: 1, exportedAt: new Date().toISOString(), state: s }, null, 1)], { type: 'application/json' });
    const name = `rounds-backup-${stamp}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    let shared = false;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: 'Rounds backup' });
        shared = true;
      }
    } catch (e) {
      if (e.name === 'AbortError') return Toast.show('Backup cancelled');
    }
    if (!shared) this.download(blob, name);
    s.settings.lastBackup = new Date().toISOString();
    commit();
    Toast.show(shared ? 'Backup shared' : 'Backup downloaded');
  },
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return Toast.show('That file isn\'t a Rounds backup'); }
    const st = data?.state;
    if (!st || !Array.isArray(st.accounts)) return Toast.show('That file isn\'t a Rounds backup');
    const ok = await confirmBox(`This backup is from ${data.exportedAt ? fmtDateTime(data.exportedAt) : 'an unknown date'} and has ${plural(st.accounts.length, 'account')}, ${plural((st.visits || []).length, 'visit')} and ${plural((st.notes || []).length, 'note')}.\n\nRestoring replaces everything on this device.`, { ok: 'Restore', danger: true, title: 'Restore backup?' });
    if (!ok) return;
    await Store.replace(st);
    applyTheme();
    App.refresh();
    Toast.show('Backup restored');
  },
  async template() {
    try { await this.loadXLSX(); } catch (e) { return Toast.show(e.message); }
    const wb = XLSX.utils.book_new();
    const help = [['How to fill in this template'], [''],
      ['• Keep the header rows and tab names exactly as they are. Delete the example rows before importing.'], [''],
      ['PRODUCTS tab'], ['• One row per product SIZE. Jim Beam in 750ml and 1L = two rows.'],
      ['• Subcategory is optional: leave it blank when a category goes straight to the brand (e.g. Rum > Cruzan).'], [''],
      ['ACCOUNTS tab'], ['• One row per account. Only Account Name is required.'],
      ['• Route = your part-of-town group. New routes are created automatically.'], ['• Tier = A, B or C (optional).'],
      ['• Visit Every (Days) = target frequency: 7 weekly, 14 every two weeks, 30 monthly.'],
      ['• Tags = comma-separated labels, e.g. "My connection, Jordan\'s account".'], ['• Open Mondays / Open for Lunch = Yes or No.'],
      ['• Best Times = days and times of day, e.g. "Tues, Weds, Morning, Afternoon".'],
      ['• More than 2 contacts? Add another row with the same Account Name and fill in only the contact columns.']];
    const h = XLSX.utils.aoa_to_sheet(help); h['!cols'] = [{ wch: 110 }];
    const prod = XLSX.utils.aoa_to_sheet([['Category', 'Subcategory', 'Brand', 'Product', 'Size'], ['Whiskey', 'Bourbon', 'Jim Beam', 'Jim Beam', '750ml'], ['Rum', '', 'Cruzan', 'Cruzan Black Strap Rum', '1L']]);
    prod['!cols'] = [16, 16, 20, 34, 10].map((wch) => ({ wch }));
    const acct = XLSX.utils.aoa_to_sheet([['Account Name', 'Account Type', 'Address', 'Route', 'Tier', 'Breakthru Rep', 'Visit Every (Days)', 'Tags', 'Open Mondays', 'Open for Lunch', 'Best Times', 'Contact 1 Name', 'Contact 1 Role', 'Contact 1 Phone', 'Contact 1 Email', 'Contact 2 Name', 'Contact 2 Role', 'Contact 2 Phone', 'Contact 2 Email', 'Notes'],
      ['The Copper Still', 'Bar', '123 Main St, Springfield, IL 62701', 'Downtown', 'A', 'Chris Miller', 14, 'My connection', 'No', 'Yes', 'Tues, Weds, Afternoon', 'Dane Smith', 'Bar Manager', '555-123-4567', 'dane@copperstill.com', '', '', '', '', 'Example row: delete me']]);
    acct['!cols'] = [26, 16, 34, 14, 6, 16, 12, 22, 10, 10, 26, 18, 16, 15, 26, 18, 16, 15, 26, 34].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, h, 'How to fill this in');
    XLSX.utils.book_append_sheet(wb, prod, 'Products');
    XLSX.utils.book_append_sheet(wb, acct, 'Accounts');
    XLSX.writeFile(wb, 'Rounds_Import_Template.xlsx');
  },
  async loadXLSX() {
    if (window.XLSX) return;
    await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'lib/xlsx.full.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('Could not load spreadsheet reader')); document.head.append(sc); });
  },
  async importFile(file) {
    try { await this.loadXLSX(); } catch (e) { return Toast.show(e.message); }
    let wb;
    try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); } catch { return Toast.show('Could not read that spreadsheet'); }
    const nk = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    let prodRows = [], acctRows = [];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
      if (!rows.length) continue;
      const norm = rows.map((r) => { const o = {}; for (const k in r) o[nk(k)] = String(r[k]).trim(); return o; });
      const keys = Object.keys(norm[0]);
      if (keys.includes('account')) continue; // reference tabs from an export (Notes, Visits, …)
      if (keys.includes('accountname')) acctRows = acctRows.concat(norm);
      else if (keys.includes('brand') && (keys.includes('product') || keys.includes('productname'))) prodRows = prodRows.concat(norm);
    }
    // Skip the template's example account row
    acctRows = acctRows.filter((r) => r.accountname && !(r.accountname === 'The Copper Still' && (r.address || '').startsWith('123 Main St')));
    prodRows = prodRows.filter((r) => r.brand && (r.product || r.productname));
    if (!acctRows.length && !prodRows.length) {
      return Toast.show('No Products or Accounts tab found. Check the column headers match the template.', [], 7000);
    }
    const byId = new Map(Data.s.accounts.map((a) => [a.id, a]));
    const idRows = acctRows.filter((r) => r.id && byId.has(r.id));
    const idSet = new Set(idRows.map((r) => r.id));
    const nameRows = acctRows.filter((r) => !(r.id && byId.has(r.id)));
    const accNames = new Set(nameRows.map((r) => norm(r.accountname)));
    const existing = Data.s.accounts.filter((a) => accNames.has(norm(a.name))).length;
    const lines = [];
    if (prodRows.length) lines.push(`• ${plural(prodRows.length, 'product row')}`);
    if (idSet.size) lines.push(`• ${plural(idSet.size, 'account')} from a Rounds export: they'll be updated to match the spreadsheet`);
    if (accNames.size - existing) lines.push(`• ${plural(accNames.size - existing, 'new account')}`);
    if (existing) lines.push(`• ${plural(existing, 'account')} matched by name: only blank fields will be filled in`);
    const ok = await confirmBox(lines.join('\n') + '\n\nNo accounts will be deleted. Notes, visits, priorities and products are kept.', { ok: 'Import', title: `Import from ${file.name}?` });
    if (!ok) return;
    const s = Data.s;
    let pAdded = 0;
    for (const r of prodRows) {
      if (addProduct({ category: r.category || 'Other', subcategory: r.subcategory || '', brand: r.brand, name: r.product || r.productname, size: r.size || '' })) pAdded++;
    }
    let aAdded = 0, aUpdated = 0;
    const now = new Date().toISOString();
    const routeFor = (name) => {
      if (!name) return '';
      let r = s.routes.find((x) => norm(x.name) === norm(name));
      if (!r) { r = { id: uid(), name, color: ROUTE_COLORS[s.routes.length % ROUTE_COLORS.length], order: s.routes.length }; s.routes.push(r); }
      return r.id;
    };
    const TAG_HINTS = { 'my connection': '#7bd88f', "jordan's account": '#f2cc4d', questionable: '#9aa5b1', 'chopping block': '#ff5c7a' };
    const tagFor = (name) => {
      const tags = s.settings.tags;
      let t = tags.find((x) => norm(x.name) === norm(name));
      if (!t) { t = { id: uid(), name, color: TAG_HINTS[norm(name)] || TAG_COLORS[tags.length % TAG_COLORS.length] }; tags.push(t); }
      return t.id;
    };
    const yn = (v) => { v = norm(v); return ['yes', 'y', 'true'].includes(v) ? 'yes' : ['no', 'n', 'false'].includes(v) ? 'no' : ''; };
    const tagIds = (v) => String(v || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean).map(tagFor);
    const rowContacts = (r) => {
      const out = [];
      for (let n = 1; n <= 12; n++) {
        const c = { name: r[`contact${n}name`] || (n === 1 ? r.contactname : '') || '', role: r[`contact${n}role`] || (n === 1 ? r.contactrole : '') || '', phone: r[`contact${n}phone`] || (n === 1 ? r.contactphone : '') || '', email: r[`contact${n}email`] || (n === 1 ? r.contactemail : '') || '' };
        if (c.name || c.phone || c.email) out.push(c);
      }
      return out;
    };
    const touched = new Set();

    // 1) Rows exported from Rounds (have an ID): the spreadsheet wins for every column it contains
    for (const r of idRows) {
      const a = byId.get(r.id), has = (k) => k in r;
      if (!touched.has(a.id)) aUpdated++;
      const first = !touched.has(a.id);
      touched.add(a.id);
      if (!first) { // extra row for the same account: only add contacts
        for (const c of rowContacts(r)) if (!a.contacts.some((x) => norm(x.name) === norm(c.name) && x.phone === c.phone)) a.contacts.push({ id: uid(), ...c });
        continue;
      }
      if (r.accountname) a.name = r.accountname;
      if (has('accounttype')) a.type = r.accounttype;
      if (has('address')) a.address = r.address;
      if (has('route')) a.routeId = routeFor(r.route);
      if (has('tier')) { const t = r.tier.toUpperCase(); a.tier = ['A', 'B', 'C'].includes(t) ? t : ''; }
      if (has('breakthrurep')) a.repId = Data.repFor(r.breakthrurep);
      if (has('visiteverydays')) { const f = parseInt(r.visiteverydays, 10); a.freqDays = f > 0 ? f : null; }
      if (has('tags')) a.tags = tagIds(r.tags);
      if (has('openforlunch')) a.lunch = yn(r.openforlunch);
      if (has('hours')) a.hours = parseHours(r.hours);
      if (has('besttimes')) a.best = parseBestTimes(r.besttimes);
      if (has('archived')) a.archived = yn(r.archived) === 'yes';
      if ('contact1name' in r) {
        const old = a.contacts;
        a.contacts = rowContacts(r).map((c) => ({ id: old.find((x) => norm(x.name) === norm(c.name))?.id || uid(), ...c }));
      }
      if (r.notes && !s.notes.some((n) => n.accountId === a.id && n.text === r.notes)) s.notes.push({ id: uid(), accountId: a.id, text: r.notes, createdAt: now, updatedAt: now });
    }

    // 2) Other rows: match by name, only fill in what's blank
    for (const r of nameRows) {
      let a = s.accounts.find((x) => norm(x.name) === norm(r.accountname));
      if (!a) {
        a = { id: uid(), name: r.accountname, createdAt: now, archived: false, contacts: [], placements: [], hours: {}, best: {}, tags: [], type: '', address: '', routeId: '', tier: '', repId: '', freqDays: null };
        s.accounts.push(a); aAdded++;
      } else if (!touched.has(a.id)) aUpdated++;
      touched.add(a.id);
      if (!a.type && r.accounttype) a.type = r.accounttype;
      if (!a.address && r.address) a.address = r.address;
      if (!Data.route(a.routeId) && r.route) a.routeId = routeFor(r.route);
      const tier = (r.tier || '').toUpperCase();
      if (!a.tier && ['A', 'B', 'C'].includes(tier)) a.tier = tier;
      if (!Data.rep(a.repId) && (r.breakthrurep || r.rep)) a.repId = Data.repFor(r.breakthrurep || r.rep);
      const f = parseInt(r.visitevery || r.visiteverydays || r.frequency, 10);
      if (!a.freqDays && f > 0) a.freqDays = f;
      for (const c of rowContacts(r)) {
        const dup = a.contacts.some((x) => (c.name && norm(x.name) === norm(c.name)) || (c.phone && x.phone === c.phone) || (c.email && norm(x.email) === norm(c.email)));
        if (!dup) a.contacts.push({ id: uid(), ...c });
      }
      for (const id of tagIds(r.tags)) { a.tags ||= []; if (!a.tags.includes(id)) a.tags.push(id); }
      if (!a.lunch && yn(r.openforlunch || r.lunch)) a.lunch = yn(r.openforlunch || r.lunch);
      if (yn(r.openmondays || r.mondays) === 'no' && !a.hours.mon) a.hours.mon = { closed: true };
      if (r.hours) { const h = parseHours(r.hours); for (const d in h) if (!a.hours[d]) a.hours[d] = h[d]; }
      const best = parseBestTimes(r.besttimes || r.bestday || r.besttime);
      for (const d in best) if (!(a.best[d] || []).length && !a.hours[d]?.closed) a.best[d] = best[d];
      if (r.notes && !s.notes.some((n) => n.accountId === a.id && n.text === r.notes)) s.notes.push({ id: uid(), accountId: a.id, text: r.notes, createdAt: now, updatedAt: now });
    }
    // keep well-known tags in the order of your sheet's color key
    const order = Object.keys(TAG_HINTS);
    const rank = (t) => { const i = order.indexOf(norm(t.name)); return i < 0 ? 99 : i; };
    s.settings.tags.sort((a, b) => rank(a) - rank(b));
    commit();
    const parts = [];
    if (prodRows.length) parts.push(`${plural(pAdded, 'product')} added`);
    if (acctRows.length) parts.push(`${plural(aAdded, 'account')} added${aUpdated ? `, ${aUpdated} updated` : ''}`);
    Toast.show('Import done: ' + parts.join(' · '), [], 7000);
  },
};

/* "Tues, Weds, Thurs, Morning, Afternoon" -> { tue: [...], wed: [...], thu: [...] } */
function parseBestTimes(str) {
  if (!str) return {};
  if (String(str).includes(';')) return Object.assign({}, ...String(str).split(';').map(parseBestTimes));
  const DAYS = { mon: 'mon', monday: 'mon', mondays: 'mon', tue: 'tue', tues: 'tue', tuesday: 'tue', wed: 'wed', weds: 'wed', wednesday: 'wed', thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu', fri: 'fri', friday: 'fri', sat: 'sat', saturday: 'sat', sun: 'sun', sunday: 'sun' };
  const SL = { morning: 'morning', mornings: 'morning', am: 'morning', afternoon: 'afternoon', afternoons: 'afternoon', aft: 'afternoon', evening: 'evening', evenings: 'evening', eve: 'evening', night: 'evening', pm: 'evening' };
  const days = [], slots = [];
  for (const w of norm(str).split(/[^a-z]+/).filter(Boolean)) {
    if (DAYS[w] && !days.includes(DAYS[w])) days.push(DAYS[w]);
    else if (SL[w] && !slots.includes(SL[w])) slots.push(SL[w]);
  }
  if (!days.length && !slots.length) return {};
  const out = {};
  for (const d of days.length ? days : DAY_ORDER) out[d] = slots.length ? SLOTS.filter((x) => slots.includes(x)) : SLOTS.slice();
  return out;
}

/* "Mon: Closed; Tue: 16:00-02:00" (also accepts 4pm-2am) -> hours object */
function parseHours(str) {
  const DAYS = { mon: 'mon', tue: 'tue', tues: 'tue', wed: 'wed', weds: 'wed', thu: 'thu', thur: 'thu', thurs: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
  const t24 = (h, m, ap) => { h = Number(h); m = Number(m || 0); if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; return `${pad(h)}:${pad(m)}`; };
  const out = {};
  for (const seg of String(str || '').split(';')) {
    const m = seg.trim().toLowerCase().match(/^([a-z]+)[a-z]*\s*:?\s*(.*)$/);
    if (!m) continue;
    const d = DAYS[m[1].slice(0, 4)] || DAYS[m[1].slice(0, 3)];
    if (!d) continue;
    if (/closed/.test(m[2])) { out[d] = { closed: true }; continue; }
    const t = m[2].match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?m?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?m?/);
    if (t) out[d] = { from: t24(t[1], t[2], t[3]), to: t24(t[4], t[5], t[6]) };
  }
  return out;
}

/* ---------- Export everything to a spreadsheet you can edit and re-import ---------- */
IO.exportSheet = async function () {
  try { await this.loadXLSX(); } catch (e) { return Toast.show(e.message); }
  const s = Data.s;
  const accts = sortBy(s.accounts, (a) => `${String(Data.route(a.routeId)?.order ?? 999).padStart(4, '0')}|${norm(a.name)}`);
  const maxC = Math.max(2, ...accts.map((a) => a.contacts.length));
  const hdr = ['ID', 'Account Name', 'Account Type', 'Address', 'Route', 'Tier', 'Breakthru Rep', 'Visit Every (Days)', 'Tags', 'Open for Lunch', 'Hours', 'Best Times', 'Archived'];
  for (let i = 1; i <= maxC; i++) hdr.push(`Contact ${i} Name`, `Contact ${i} Role`, `Contact ${i} Phone`, `Contact ${i} Email`);
  const yn = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');
  const rows = accts.map((a) => {
    const hours = DAY_ORDER.filter((d) => a.hours[d]).map((d) => `${DAY_LABEL[d]}: ${a.hours[d].closed ? 'Closed' : `${a.hours[d].from || ''}-${a.hours[d].to || ''}`}`).join('; ');
    const best = DAY_ORDER.filter((d) => (a.best[d] || []).length).map((d) => `${DAY_LABEL[d]}: ${a.best[d].map((x) => SLOT_LABEL[x]).join(', ')}`).join('; ');
    const row = [a.id, a.name, a.type || '', a.address || '', Data.route(a.routeId)?.name || '', a.tier || '', Data.repName(a), a.freqDays || '', Data.acctTags(a).map((t) => t.name).join(', '), yn(a.lunch), hours, best, a.archived ? 'Yes' : 'No'];
    for (let i = 0; i < maxC; i++) { const c = a.contacts[i] || {}; row.push(c.name || '', c.role || '', c.phone || '', c.email || ''); }
    return row;
  });
  const wb = XLSX.utils.book_new();
  const acc = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
  acc['!cols'] = [6, 30, 14, 40, 24, 5, 14, 9, 28, 9, 30, 30, 8, ...Array(maxC).fill([16, 18, 14, 26]).flat()].map((wch) => ({ wch }));
  acc['!cols'][0].hidden = true;
  const name = (id) => Data.account(id)?.name || '(deleted)';
  const lm = Data.lastVisitMap();
  const help = XLSX.utils.aoa_to_sheet([['Editing this export'], [''],
    ['• Edit anything on the Accounts tab (names, routes, tags, contacts…), then import this file in Rounds (More → Import spreadsheet).'],
    ['• The hidden ID column (column A) is how Rounds recognizes each account. Leave it alone and renames will just work.'],
    ['• For accounts with an ID, the spreadsheet wins: a cleared cell clears that field in the app.'],
    ['• Add a new account by adding a row with the ID left blank. Deleting a row does NOT delete the account; use Archived = Yes or delete it in the app.'],
    ['• Hours format: "Mon: Closed; Tue: 16:00-02:00". Best Times format: "Mon: Afternoon, Evening; Tue: Morning".'],
    ['• The Notes, Visits, Priorities and Products Carried tabs are for reference only. Changes there are not imported.'],
    [''], [`Exported ${new Date().toLocaleString()}`]]);
  help['!cols'] = [{ wch: 120 }];
  const notes = XLSX.utils.aoa_to_sheet([['Account', 'Date', 'Note'], ...sortBy(s.notes, (n) => n.createdAt).reverse().map((n) => [name(n.accountId), fmtDateTime(n.createdAt), n.text])]);
  notes['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 90 }];
  const visits = XLSX.utils.aoa_to_sheet([['Account', 'Date', 'Note'], ...sortBy(s.visits, (v) => v.at).reverse().map((v) => [name(v.accountId), fmtDateTime(v.at), v.note || ''])]);
  visits['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 70 }];
  const prios = XLSX.utils.aoa_to_sheet([['Account', 'Priority', 'Importance', 'Added', 'Due', 'Done'], ...Data.sortPriorities(s.priorities).map((p) => [p.accountId ? name(p.accountId) : 'General', p.text, IMPORTANCE[p.importance]?.label || '', fmtDate(p.createdAt, true), p.due ? fmtDate(p.due, true) : '', p.done ? fmtDate(p.doneAt, true) : ''])]);
  prios['!cols'] = [{ wch: 30 }, { wch: 60 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const pl = [['Account', 'Category', 'Item', 'Size', 'Well', 'Back Bar', 'Cocktail', 'Cocktail Name', 'Placed On']];
  for (const a of accts) for (const x of a.placements) { const p = Data.product(x.productId); pl.push([a.name, p?.category || '', p?.name || '?', p?.size || '', x.well ? 'Yes' : '', x.backBar ? 'Yes' : '', x.cocktail ? 'Yes' : '', x.cocktailName || '', x.since || '']); }
  const plS = XLSX.utils.aoa_to_sheet(pl);
  plS['!cols'] = [30, 12, 40, 8, 6, 8, 8, 24, 12].map((wch) => ({ wch }));
  const sum = XLSX.utils.aoa_to_sheet([['Account', 'Route', 'Last Visit', 'Days Since', 'Open Priorities'], ...accts.filter((a) => !a.archived).map((a) => { const st = Data.status(a, lm); return [a.name, Data.route(a.routeId)?.name || '', st.last ? fmtDate(st.last.at, true) : 'Never', st.days ?? '', Data.openPriorities(a.id).length]; })]);
  sum['!cols'] = [30, 26, 14, 10, 14].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, acc, 'Accounts');
  XLSX.utils.book_append_sheet(wb, help, 'How to edit');
  XLSX.utils.book_append_sheet(wb, sum, 'Visit Status');
  XLSX.utils.book_append_sheet(wb, notes, 'Notes');
  XLSX.utils.book_append_sheet(wb, visits, 'Visits');
  XLSX.utils.book_append_sheet(wb, prios, 'Priorities');
  XLSX.utils.book_append_sheet(wb, plS, 'Products Carried');
  XLSX.writeFile(wb, `Rounds_Export_${toLocalDate()}.xlsx`);
  Toast.show('Spreadsheet exported');
};
