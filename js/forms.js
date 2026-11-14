'use strict';
/* ---------- Form sheets: Forms.x() opens, FORMS.x() handles submit ---------- */
function formSheet(name, title, body, { id = '', del = '', submit = 'Save', extra = '' } = {}) {
  return `<form data-form="${name}" data-id="${esc(id)}" ${extra} novalidate>${modalHead(title)}
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${del ? `<button type="button" class="btn danger" data-act="${del}" data-id="${esc(id)}" aria-label="Delete">${icon('trash')}</button>` : ''}<button type="button" class="btn" data-act="modalClose">Cancel</button><button type="submit" class="btn primary">${esc(submit)}</button></div>
  </form>`;
}
function acctField(accId, { allowNone = false, label = 'Account' } = {}) {
  const a = accId && Data.account(accId);
  return `<div class="field"><span>${label}</span><input type="hidden" name="accountId" value="${esc(accId || '')}">
    <button type="button" class="picker-btn" data-act="pickAccountField" data-allow-none="${allowNone ? 1 : ''}">${a ? esc(a.name) : allowNone ? 'No account (general)' : 'Choose account…'}</button></div>`;
}
function datalist(id, items) { return `<datalist id="${id}">${items.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>`; }
function impSeg(cur = 'med') {
  return `<div class="field"><span>Importance</span><div class="seg">${['high', 'med', 'low'].map((k) => `<label><input type="radio" name="importance" value="${k}" ${cur === k ? 'checked' : ''}><span>${IMPORTANCE[k].label}</span></label>`).join('')}</div></div>`;
}
function freqField(cur) {
  const preset = FREQ_PRESETS.some(([d]) => d === Number(cur));
  const def = Data.s.settings.defaultFreq;
  return `<div class="field"><span>Target visit frequency</span>
    <select name="freqSel" data-chg="freqSel">
      <option value="" ${!cur ? 'selected' : ''}>Use default (every ${def} days)</option>
      ${FREQ_PRESETS.map(([d, l]) => `<option value="${d}" ${Number(cur) === d ? 'selected' : ''}>${l} (${d} days)</option>`).join('')}
      <option value="custom" ${cur && !preset ? 'selected' : ''}>Custom…</option>
    </select>
    <input type="number" name="freqCustom" min="1" max="365" placeholder="Every how many days?" value="${cur && !preset ? cur : ''}" style="margin-top:8px" ${cur && !preset ? '' : 'hidden'}></div>`;
}
function routeSelect(cur) {
  return `<label class="field"><span>Route</span><select name="routeId" data-chg="routeSel">
    <option value="">No route</option>
    ${Data.routesSorted().map((r) => `<option value="${r.id}" ${cur === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
    <option value="__new">+ New route…</option></select></label>`;
}
function tagChip(t, on) { return `<label><input type="checkbox" name="tags" value="${t.id}" ${on ? 'checked' : ''}><span style="--tc:${t.color}">${esc(t.name)}</span></label>`; }
const val = (fd, k) => String(fd.get(k) ?? '').trim();

const Forms = {
  quickAdd() {
    const q = (k, ic, t, d) => `<button class="quick" data-act="quick" data-kind="${k}">${icon(ic)}<b>${t}</b><small>${d}</small></button>`;
    Modal.open(`${modalHead('Quick add')}<div class="modal-body"><div class="quick-grid">
      ${q('visit', 'check', 'Log visit', 'Check in now or backdate')}
      ${q('note', 'note', 'Note', 'Attach to an account')}
      ${q('priority', 'flag', 'Priority', 'To-do with importance')}
      ${q('opp', 'target', 'Opportunity', 'Product you\'re pitching')}
      ${q('account', 'store', 'New account', 'Add a new account')}
      ${q('contact', 'user', 'Contact', 'Add someone to an account')}
    </div></div>`);
  },

  account(a, opts = {}) {
    const isNew = !a; a = a || { tier: '', list: opts.list || '' };
    const tierSeg = `<div class="field"><span>Tier</span><div class="seg">${[['', 'None'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([v, l]) => `<label><input type="radio" name="tier" value="${v}" ${(a.tier || '') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>`;
    const body = `
      <div class="field"><span>Where it lives</span><div class="seg">
        <label><input type="radio" name="list" value="" ${a.list !== 'other' ? 'checked' : ''}><span>Account List</span></label>
        <label><input type="radio" name="list" value="other" ${a.list === 'other' ? 'checked' : ''}><span>Other Accounts</span></label></div></div>
      <label class="field"><span>Account name *</span><input type="text" name="name" value="${esc(a.name)}" required ${isNew ? 'autofocus' : ''} autocomplete="off"></label>
      <label class="field"><span>Type</span><input type="text" name="type" list="dl-types" value="${esc(a.type)}" placeholder="Bar, Restaurant, Country Club…" autocomplete="off"></label>
      <label class="field"><span>Address</span><input type="text" name="address" value="${esc(a.address)}" placeholder="Street, city" autocomplete="off"></label>
      ${routeSelect(a.routeId)}
      ${tierSeg}
      <label class="field"><span>Breakthru rep</span><select name="repId" data-chg="repSel">
        <option value="">No rep</option>
        ${Data.reps().map((r) => `<option value="${r.id}" ${a.repId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        <option value="__new">+ Add new rep…</option></select></label>
      ${freqField(a.freqDays)}
      <div class="field"><span>Tags</span><div class="tag-pick">${Data.tags().map((t) => tagChip(t, (a.tags || []).includes(t.id))).join('')}<button type="button" class="chip" data-act="newTagInline">${icon('plus')} New tag</button></div></div>
      ${isNew ? `<div class="section-label">Main contact (optional)</div>
        <div class="two"><label class="field"><span>Name</span><input type="text" name="cName" autocomplete="off"></label><label class="field"><span>Role</span><input type="text" name="cRole" list="dl-roles" autocomplete="off"></label></div>
        <div class="two"><label class="field"><span>Phone</span><input type="tel" name="cPhone" autocomplete="off"></label><label class="field"><span>Email</span><input type="email" name="cEmail" autocomplete="off"></label></div>` : ''}
      ${datalist('dl-types', Data.types())}${datalist('dl-roles', Data.roles())}`;
    Modal.open(formSheet('account', isNew ? 'New account' : 'Edit account', body, { id: a.id || '', submit: isNew ? 'Create' : 'Save' }), { cls: 'tall' });
  },

  /* c = existing contact on this account (edit), or opts.personId = add a person you already have */
  contact(accId, c, opts = {}) {
    const isNew = !c;
    const person = opts.personId ? Data.person(opts.personId) : null;
    c = c || (person ? { ...person, personId: person.id, role: '' } : {});
    const shared = c.personId ? Data.accountsOfPerson(c.personId).filter((o) => o.id !== accId) : [];
    const body = `
      ${accId ? `<input type="hidden" name="accountId" value="${accId}">` : acctField('')}
      <input type="hidden" name="personId" value="${esc(c.personId || '')}">
      ${shared.length ? `<p class="hint" style="margin-top:0">${icon('link')} Also at ${shared.map((o) => esc(o.name)).join(', ')}. Name, phone, email and social links update everywhere. Role is just for this account.</p>` : ''}
      <label class="field"><span>Name *</span><input type="text" name="name" value="${esc(c.name)}" ${isNew && !person ? 'autofocus' : ''} autocomplete="off"></label>
      <label class="field"><span>Role${shared.length || person ? ' at this account' : ''}</span><input type="text" name="role" list="dl-roles" value="${esc(c.role)}" placeholder="Bar Manager, Owner…" autocomplete="off" ${person ? 'autofocus' : ''}></label>
      <label class="field"><span>Phone</span><input type="tel" name="phone" value="${esc(c.phone)}" autocomplete="off"></label>
      <label class="field"><span>Email</span><input type="email" name="email" value="${esc(c.email)}" autocomplete="off"></label>
      <label class="field"><span>Instagram</span><input type="text" name="instagram" value="${c.instagram ? '@' + esc(c.instagram) : ''}" autocomplete="off" autocapitalize="off" placeholder="@handle"></label>
      <label class="field"><span>Other social (optional)</span><input type="text" name="social" value="${esc(c.social)}" autocomplete="off" autocapitalize="off" placeholder="Link to Facebook, TikTok, LinkedIn…"></label>
      ${datalist('dl-roles', Data.roles())}`;
    Modal.open(formSheet('contact', person ? `Add ${person.name || 'contact'}` : isNew ? 'New contact' : 'Edit contact', body, { id: isNew ? '' : c.id, del: isNew ? '' : 'deleteContact', extra: `data-acc="${esc(accId || '')}"` }));
  },

  note({ accountId, repId, note } = {}) {
    const isNew = !note; note = note || {};
    repId = repId || note.repId || '';
    const about = repId ? `Rep: ${Data.rep(repId)?.name || ''}` : Data.account(note.accountId)?.name || '';
    const body = `${repId ? `<input type="hidden" name="repId" value="${esc(repId)}">${isNew ? `<p class="hint" style="margin-top:0">${esc(about)}</p>` : ''}` : isNew ? acctField(accountId) : `<input type="hidden" name="accountId" value="${note.accountId}">`}
      ${!isNew ? `<p class="hint" style="margin-top:0">${esc(about)}${note.updatedAt && note.updatedAt !== note.createdAt ? ` · last edited ${fmtDateTime(note.updatedAt)}` : ''}</p>` : ''}
      <label class="field"><span>Note</span><textarea name="text" autofocus rows="6" placeholder="What happened, what you learned…">${esc(note.text)}</textarea></label>
      <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="at" value="${toLocalInput(note.createdAt || new Date())}" max="${toLocalInput(new Date(Date.now() + 864e5))}"></label>
      ${isNew ? '<p class="hint">Set to right now. Change it if you\'re catching up on an earlier day.</p>' : ''}`;
    Modal.open(formSheet('note', isNew ? 'New note' : 'Edit note', body, { id: note.id || '', del: isNew ? '' : 'deleteNote' }));
  },

  priority({ accountId, prio } = {}) {
    const isNew = !prio; prio = prio || { importance: 'med' };
    const body = `${acctField(isNew ? accountId : prio.accountId, { allowNone: true })}
      <label class="field"><span>Priority</span><textarea name="text" rows="3" ${isNew ? 'autofocus' : ''} placeholder="e.g. Find out about coasters for Dane">${esc(prio.text)}</textarea></label>
      ${impSeg(prio.importance)}
      <label class="field"><span>Due date (optional)</span><input type="date" name="due" value="${esc(prio.due)}"></label>
      ${!isNew ? `<label class="checkline"><input type="checkbox" name="done" ${prio.done ? 'checked' : ''}> Done${prio.doneAt ? ` (${fmtDate(prio.doneAt)})` : ''}</label><p class="hint" style="margin-top:4px">Added ${fmtDateTime(prio.createdAt)}</p>` : ''}`;
    Modal.open(formSheet('priority', isNew ? 'New priority' : 'Edit priority', body, { id: prio.id || '', del: isNew ? '' : 'deletePriority' }));
  },

  visit({ accountId, visit } = {}) {
    const isNew = !visit; visit = visit || { at: new Date().toISOString() };
    const sibs = isNew ? [] : Data.visitSiblings(visit).map((x) => Data.account(x.accountId)?.name).filter(Boolean);
    const body = `${sibs.length ? `<p class="hint" style="margin-top:0">${icon('link')} Logged together with ${sibs.map(esc).join(', ')}. The note and time update there too.</p>` : ''}${acctField(isNew ? accountId : visit.accountId)}
      <label class="field"><span>When</span><input type="datetime-local" name="at" value="${toLocalInput(visit.at)}"></label>
      <label class="field"><span>Visit note (optional)</span><textarea name="note" rows="4" ${isNew ? '' : 'autofocus'} placeholder="Who you saw, what you talked about…">${esc(visit.note)}</textarea></label>`;
    Modal.open(formSheet('visit', isNew ? 'Log visit' : 'Edit visit', body, { id: visit.id || '', del: isNew ? '' : 'deleteVisit', submit: isNew ? 'Log visit' : 'Save' }));
  },

  placement(acc, pl) {
    const p = Data.product(pl.productId);
    const body = `<p style="margin:0 0 14px"><b>${esc(Data.productLabel(p, true))}</b><br><span class="muted small">${esc([p?.category, p?.subcategory].filter(Boolean).join(' › '))}</span></p>
      ${isRTD(p) ? '<p class="hint">Canned (RTD): no well, back bar or cocktail needed.</p>' : `<div class="field"><span>Where it's poured</span>
        <label class="checkline"><input type="checkbox" name="well" ${pl.well ? 'checked' : ''}> In the well</label>
        <label class="checkline"><input type="checkbox" name="backBar" ${pl.backBar ? 'checked' : ''}> On the back bar</label>
        <label class="checkline"><input type="checkbox" name="cocktail" ${pl.cocktail ? 'checked' : ''} data-chg="plCocktail"> In a cocktail</label>
      </div>
      <label class="field" id="cocktailField" ${pl.cocktail ? '' : 'hidden'}><span>Cocktail name(s)</span><input type="text" name="cocktailName" value="${esc(pl.cocktailName)}" placeholder="e.g. House Old Fashioned"></label>`}
      <label class="field"><span>Placed on (optional)</span><input type="date" name="since" value="${esc(pl.since)}"></label>
      <p class="hint">Set this for new placements. They count toward "New placements this month".</p>
      <label class="field"><span>Competing product (optional)</span><input type="text" name="competitor" value="${esc(pl.competitor)}" placeholder="What they'd pour instead"></label>
      <label class="field"><span>Notes (optional)</span><textarea name="notes" rows="2">${esc(pl.notes)}</textarea></label>`;
    Modal.open(formSheet('placement', 'Product placement', body, { id: pl.id, del: 'deletePlacement', extra: `data-acc="${acc.id}"` }));
  },

  /* after choosing products: where is each one poured? (Back bar is on by default; RTDs skip this) */
  placementSetup(acc, ids) {
    return new Promise((res) => {
      const ps = ids.map((id) => Data.product(id)).filter(Boolean);
      ps.sort((x, y) => `${x.category}|${x.brand}|${x.name}|${String(sizeValue(x.size)).padStart(8, '0')}`.localeCompare(`${y.category}|${y.brand}|${y.name}|${String(sizeValue(y.size)).padStart(8, '0')}`));
      const many = ps.filter((p) => !isRTD(p)).length > 1;
      const opt = (k, label, on) => `<label class="slot"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
      const rows = ps.map((p) => `<div class="ps-item" data-pid="${p.id}" ${isRTD(p) ? 'data-rtd="1"' : ''} style="padding:10px 0;border-top:1px solid var(--border)">
          <div style="font-weight:600;margin-bottom:6px">${esc(p.name)} <span class="size">${esc(p.size)}</span></div>
          ${isRTD(p) ? '<div class="small muted">Canned (RTD): no placement needed</div>' : `<div class="slots" style="display:flex;gap:6px;flex-wrap:wrap">${opt('backBar', 'Back bar', true)}${opt('well', 'Well', false)}${opt('cocktail', 'Cocktail', false)}</div>`}
        </div>`).join('');
      Modal.open(`${modalHead(ps.length > 1 ? `Where are these poured?` : 'Where is it poured?')}<div class="modal-body">
          <p class="hint" style="margin-top:0">${esc(acc.name)}. You can change these any time by tapping the product.</p>
          ${many ? `<div class="toolbar" style="margin-bottom:4px"><span class="small muted">Toggle all:</span><button class="chip mini-chip" data-act="psAll" data-k="backBar">Back bar</button><button class="chip mini-chip" data-act="psAll" data-k="well">Well</button><button class="chip mini-chip" data-act="psAll" data-k="cocktail">Cocktail</button></div>` : ''}
          ${rows}
          <label class="checkline" style="margin-top:8px;border-top:1px solid var(--border);padding-top:12px"><input type="checkbox" name="psNew"> <span>New placements (placed today)<br><span class="small muted">Counts toward "New placements this month"</span></span></label>
        </div><div class="modal-foot"><button class="btn" data-act="modalClose">Cancel</button><button class="btn primary" data-act="placementSetupDone">Add ${plural(ps.length, 'product')}</button></div>`,
      { onClose: (v) => res(v || null), cls: ps.length > 4 ? 'tall' : '' });
    });
  },
  opp(o) {
    const p = Data.product(o.productId);
    const body = `<p style="margin:0 0 14px"><b>${esc(Data.productLabel(p, true))}</b><br><span class="muted small">${esc(Data.account(o.accountId)?.name || '')} · pitching since ${fmtDate(o.createdAt)}</span></p>
      <div class="field"><span>Status</span><div class="seg">${[['open', 'Pitching'], ['won', 'Won'], ['lost', 'Lost']].map(([v, l]) => `<label><input type="radio" name="status" value="${v}" ${o.status === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <label class="field"><span>Note (optional)</span><textarea name="note" rows="3">${esc(o.note)}</textarea></label>`;
    Modal.open(formSheet('opp', 'Opportunity', body, { id: o.id, del: 'deleteOpp' }));
  },

  hours(a) {
    const rows = DAY_ORDER.map((d) => {
      const h = a.hours[d] || {}; const b = a.best[d] || [];
      return `<div class="hrow"><div class="d">${DAY_LABEL[d]}</div>
        <div class="times"><input type="time" name="from_${d}" value="${esc(h.from)}" aria-label="${d} opens" ${h.closed ? 'disabled' : ''}><span class="muted">–</span><input type="time" name="to_${d}" value="${esc(h.to)}" aria-label="${d} closes" ${h.closed ? 'disabled' : ''}></div>
        <div class="slots"><span class="small muted" style="align-self:center">Best:</span>${SLOTS.map((s) => `<label class="slot"><input type="checkbox" name="best_${d}" value="${s}" ${b.includes(s) ? 'checked' : ''}><span>${SLOT_LABEL[s]}</span></label>`).join('')}
          <label class="toggle closed-t"><input type="checkbox" name="closed_${d}" data-chg="hoursClosed" data-day="${d}" ${h.closed ? 'checked' : ''}>Closed</label></div>
      </div>`;
    }).join('');
    const body = `<div class="field"><span>Open for lunch?</span><div class="seg">${[['', 'Not sure'], ['yes', 'Yes'], ['no', 'No']].map(([v, l]) => `<label><input type="radio" name="lunch" value="${v}" ${(a.lunch || '') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <p class="hint" style="margin-top:0">Leave times blank if you don't know them. "Best" marks good times to stop by on that day.</p>
      <button type="button" class="btn small" data-act="copyMonday" style="margin-bottom:8px">Copy Monday to every day</button>
      ${rows}`;
    Modal.open(formSheet('hours', 'Hours & best times', body, { id: a.id }), { cls: 'tall' });
  },

  route(r) {
    return new Promise((res) => {
      const isNew = !r; r = r || { color: ROUTE_COLORS[Data.s.routes.length % ROUTE_COLORS.length] };
      const body = `<label class="field"><span>Route name</span><input type="text" name="name" value="${esc(r.name)}" autofocus placeholder="e.g. Downtown, North Side, The Lake"></label>
        <div class="field"><span>Color</span><div class="colors">${ROUTE_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${r.color === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`;
      Modal.open(formSheet('route', isNew ? 'New route' : 'Edit route', body, { id: r.id || '', del: isNew ? '' : 'deleteRoute' }), { onClose: res });
    });
  },

  rep(r) {
    return new Promise((res) => {
      const isNew = !r; r = r || {};
      const n = r.id ? Data.s.accounts.filter((a) => a.repId === r.id).length : 0;
      const body = `<label class="field"><span>Rep's name *</span><input type="text" name="name" value="${esc(r.name)}" ${isNew ? 'autofocus' : ''} autocomplete="off" placeholder="First and last name"></label>
        <label class="field"><span>Title (optional)</span><input type="text" name="title" value="${esc(r.title)}" autocomplete="off" placeholder="Sales Rep, Key Account Manager…"></label>
        <label class="field"><span>Phone</span><input type="tel" name="phone" value="${esc(r.phone)}" autocomplete="off"></label>
        <label class="field"><span>Email</span><input type="email" name="email" value="${esc(r.email)}" autocomplete="off"></label>
        ${isNew ? `<p class="hint">Already listed: ${Data.reps().map((x) => esc(x.name)).join(', ') || 'nobody yet'}.</p>` : `<p class="hint">Assigned to ${plural(n, 'account')}. Renaming updates all of them.</p>`}`;
      Modal.open(formSheet('rep', isNew ? 'New Breakthru rep' : 'Edit rep', body, { id: r.id || '', del: isNew ? '' : 'deleteRep' }), { onClose: res });
    });
  },
  tag(t) {
    return new Promise((res) => {
      const isNew = !t; t = t || { color: ROUTE_COLORS[Data.tags().length % ROUTE_COLORS.length] };
      const body = `<label class="field"><span>Tag name</span><input type="text" name="name" value="${esc(t.name)}" autofocus placeholder="e.g. My connection, Chopping Block"></label>
        <div class="field"><span>Color</span><div class="colors">${TAG_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${t.color === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`;
      Modal.open(formSheet('tag', isNew ? 'New tag' : 'Edit tag', body, { id: t.id || '', del: isNew ? '' : 'deleteTag' }), { onClose: res });
    });
  },
  product() {
    const s = Data.s;
    const body = `<label class="field"><span>Category *</span><input type="text" name="category" list="dl-cat" autofocus placeholder="Whiskey"></label>
      <label class="field"><span>Subcategory</span><input type="text" name="subcategory" list="dl-sub" placeholder="Bourbon (optional)"></label>
      <label class="field"><span>Brand *</span><input type="text" name="brand" list="dl-brand" placeholder="Jim Beam"></label>
      <label class="field"><span>Product *</span><input type="text" name="name" list="dl-prod" placeholder="Jim Beam Black"></label>
      <label class="field"><span>Size(s)</span><input type="text" name="size" placeholder="750ml, 1L, 1.75L"></label>
      <p class="hint">Separate sizes with commas to add several at once.</p>
      ${datalist('dl-cat', uniqSorted(s.products.map((p) => p.category)))}${datalist('dl-sub', uniqSorted(s.products.map((p) => p.subcategory)))}${datalist('dl-brand', Data.brands())}${datalist('dl-prod', Data.productNames())}`;
    Modal.open(formSheet('product', 'Add product', body, { submit: 'Add' }));
  },

  productInfo(p) {
    const rows = [];
    for (const a of sortBy(Data.active(), (a) => sortName(a.name))) {
      const pl = a.placements.find((x) => x.productId === p.id);
      if (pl) rows.push(`<div class="row" data-act="go" data-href="#/account/${a.id}"><div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${esc([Data.route(a.routeId)?.name, ...Object.keys(PLACEMENT_TYPES).filter((k) => pl[k]).map((k) => PLACEMENT_TYPES[k])].filter(Boolean).join(' · '))}</div></div></div>`);
    }
    const pitching = Data.s.opportunities.filter((o) => o.productId === p.id && o.status === 'open').map((o) => Data.account(o.accountId)).filter(Boolean);
    Modal.open(`${modalHead(Data.productLabel(p, true))}<div class="modal-body">
      <p class="muted small" style="margin-top:0">${esc([p.category, p.subcategory, p.brand].filter(Boolean).join(' › '))}${p.discontinued ? ' · <b class="red">Discontinued</b>' : ''}</p>
      <div class="label">Carried at ${plural(rows.length, 'account')}</div>
      ${rows.length ? `<div class="list">${rows.join('')}</div>` : '<p class="muted small">Not carried anywhere yet.</p>'}
      ${pitching.length ? `<div class="label">Pitching at</div><div class="list">${pitching.map((a) => `<div class="row" data-act="go" data-href="#/account/${a.id}"><div class="row-main"><div class="row-title">${esc(a.name)}</div></div></div>`).join('')}</div>` : ''}
      </div><div class="modal-foot"><button class="btn danger" data-act="deleteProduct" data-id="${p.id}">${icon('trash')} ${p.builtin ? 'Remove from list' : 'Delete product'}</button><button class="btn" data-act="modalClose">Close</button></div>`);
  },

  /* add links from an account: pick type, then accounts */
  link(acc) {
    const s = Data.s;
    const own = Data.linkGroups(acc.id).find((g) => g.type === 'ownership');
    const owners = s.linkGroups.filter((g) => g.type === 'ownership' && g.name).map((g) => g.name);
    const body = `<p class="small muted" style="margin-top:0">Linking <b>${esc(acc.name)}</b> with other accounts.</p>
      <div class="field"><span>How are they linked?</span><div class="seg">
        <label><input type="radio" name="type" value="proximity" checked data-chg="linkType"><span>Same proximity</span></label>
        <label><input type="radio" name="type" value="ownership" data-chg="linkType"><span>Same ownership</span></label></div></div>
      <p class="hint" id="linkHint">Same building, or close enough that one conversation covers both. Checking in at one will offer to check in at the others.</p>
      <label class="field" id="ownerName" hidden><span>Ownership group name (optional)</span><input type="text" name="name" list="dl-owners" value="${esc(own?.name)}" placeholder="e.g. Gamlin Restaurant Group" autocomplete="off"></label>
      ${datalist('dl-owners', uniqSorted(owners))}
      <input type="hidden" name="accountIds" value="">
      <div class="field"><span>Link with</span><button type="button" class="picker-btn" data-act="pickLinkAccounts" data-acc="${acc.id}">Choose accounts…</button></div>`;
    Modal.open(formSheet('link', 'Link accounts', body, { id: acc.id, submit: 'Link' }));
  },
  editLink(g) {
    const body = `<p class="small muted" style="margin-top:0">${esc(Data.LINK_TYPES[g.type])}${g.type === 'proximity' ? ': checking in at one offers the others.' : '.'}</p>
      ${g.type === 'ownership' ? `<label class="field"><span>Ownership group name (optional)</span><input type="text" name="name" value="${esc(g.name)}" autocomplete="off"></label>` : ''}
      <div class="field"><span>Accounts in this group (uncheck to remove)</span>
        ${g.accountIds.map((id) => Data.account(id)).filter(Boolean).map((a) => `<label class="checkline"><input type="checkbox" name="keep" value="${a.id}" checked> ${esc(a.name)}</label>`).join('')}</div>`;
    Modal.open(formSheet('editLink', 'Edit link', body, { id: g.id, del: 'deleteLink' }));
  },
  syncSetup() {
    const c = Sync.cfg || {};
    const body = `<p class="small muted" style="margin-top:0">Uses the private <b>rounds-data</b> repository and the access key you created on GitHub. The key is stored only on this device.</p>
      <label class="field"><span>Repository</span><input type="text" name="repo" value="${esc(c.repo || Sync.defaultRepo())}" autocomplete="off" autocapitalize="off" placeholder="username/rounds-data"></label>
      <label class="field"><span>Access key</span><input type="password" name="token" value="" autocomplete="off" autocapitalize="off" placeholder="github_pat_…" ${c.repo ? 'autofocus' : ''}></label>
      <label class="field"><span>Name for this device</span><input type="text" name="device" value="${esc(c.device || Sync.defaultDevice())}" autocomplete="off"></label>
      <p class="hint">The name just labels each sync in your repository's history.</p>`;
    Modal.open(formSheet('syncSetup', 'Set up sync', body, { submit: 'Connect' }));
  },
  types() {
    const s = Data.s.settings;
    const body = `<label class="field"><span>Account types (one per line)</span><textarea name="types" rows="8">${esc(s.accountTypes.join('\n'))}</textarea></label>
      <label class="field"><span>Contact roles (one per line)</span><textarea name="roles" rows="8">${esc(s.roles.join('\n'))}</textarea></label>
      <p class="hint">These are suggestions. You can always type something new on an account.</p>`;
    Modal.open(formSheet('types', 'Suggestion lists', body));
  },
};

/* ---------- Submit handlers ---------- */
const FORMS = {
  account(form, fd) {
    const s = Data.s, name = val(fd, 'name');
    if (!name) return Toast.show('Give the account a name');
    const id = form.dataset.id;
    let freq = fd.get('freqSel');
    freq = freq === 'custom' ? parseInt(fd.get('freqCustom'), 10) || null : freq ? Number(freq) : null;
    let routeId = fd.get('routeId'); if (routeId === '__new') routeId = '';
    const fields = { name, type: val(fd, 'type'), address: val(fd, 'address'), routeId, tier: fd.get('tier') || '', repId: fd.get('repId') === '__new' ? '' : fd.get('repId') || '', freqDays: freq, tags: fd.getAll('tags'), list: fd.get('list') === 'other' ? 'other' : '' };
    let a;
    if (id) { a = Data.account(id); Object.assign(a, fields); }
    else {
      a = { id: uid(), createdAt: new Date().toISOString(), archived: false, contacts: [], placements: [], hours: {}, best: {}, ...fields };
      const c = { name: val(fd, 'cName'), phone: val(fd, 'cPhone'), email: val(fd, 'cEmail') };
      if (c.name || c.phone || c.email) a.contacts.push({ id: uid(), personId: Data.personFor(c).id, role: val(fd, 'cRole') });
      s.accounts.push(a);
    }
    Store.save();
    Modal.close().then(() => { if (!id) location.hash = '#/account/' + a.id; else App.refresh(); });
  },
  async contact(form, fd) {
    const s = Data.s, a = Data.account(fd.get('accountId'));
    if (!a) return Toast.show('Choose an account');
    const info = { name: val(fd, 'name'), phone: val(fd, 'phone'), email: val(fd, 'email'), instagram: igHandle(val(fd, 'instagram')), social: val(fd, 'social') };
    const role = val(fd, 'role');
    if (!info.name && !info.phone && !info.email && !info.instagram) return Toast.show('Add at least a name, phone, email or Instagram');
    const linkId = form.dataset.id;
    let personId = fd.get('personId') || '';
    if (linkId) { // editing: person details change everywhere, role only here
      const l = a.contacts.find((x) => x.id === linkId);
      Object.assign(Data.person(l.personId), info);
      l.role = role;
    } else {
      if (!personId) { // brand-new contact: is it someone you already have?
        const cands = Data.similarPeople(info).filter((p) => !a.contacts.some((l) => l.personId === p.id));
        if (cands.length) {
          const pick = await askSamePerson(cands, info);
          if (pick === null) return;
          personId = pick;
        }
      }
      if (personId) { const p = Data.person(personId); for (const k of PERSON_FIELDS) if (info[k]) p[k] = info[k]; }
      else { const p = { id: uid(), ...info }; s.people.push(p); personId = p.id; }
      if (a.contacts.some((l) => l.personId === personId)) { Store.save(); Modal.close(); App.refresh(); return Toast.show(`${info.name || 'They'} are already on ${a.name}`); }
      a.contacts.push({ id: uid(), personId, role });
    }
    Store.save(); Modal.close(); App.refresh();
    if (!linkId && !form.dataset.acc) Toast.show(`Contact added to ${a.name}`, [{ label: 'Open', fn: () => (location.hash = '#/account/' + a.id) }]);
  },
  note(form, fd) {
    const text = val(fd, 'text'), accId = fd.get('accountId') || '', repId = fd.get('repId') || '';
    if (!accId && !repId) return Toast.show('Choose an account');
    if (!text) return Toast.show('The note is empty');
    const id = form.dataset.id, now = new Date().toISOString();
    const at = fd.get('at') ? new Date(fd.get('at')).toISOString() : null;
    if (id) {
      const n = Data.s.notes.find((x) => x.id === id);
      const editedBefore = n.updatedAt && n.updatedAt !== n.createdAt;
      if (at && toLocalInput(at) !== toLocalInput(n.createdAt)) { n.createdAt = at; if (!editedBefore) n.updatedAt = at; } // moving the date isn't an "edit"
      if (n.text !== text) { n.text = text; n.updatedAt = now; }
    } else {
      const when = at || now;
      Data.s.notes.push({ id: uid(), accountId: accId, repId, text, createdAt: when, updatedAt: when });
    }
    if (repId) { Store.save(); Modal.close(); App.refresh(); return; }
    Store.save(); Modal.close(); App.refresh();
    if (!id && !location.hash.includes(accId)) Toast.show(`Note added to ${Data.account(accId)?.name}`, [{ label: 'Open', fn: () => (location.hash = '#/account/' + accId) }]);
  },
  priority(form, fd) {
    const text = val(fd, 'text');
    if (!text) return Toast.show('Describe the priority');
    const id = form.dataset.id;
    const f = { accountId: fd.get('accountId') || '', text, importance: fd.get('importance') || 'med', due: fd.get('due') || '' };
    if (id) {
      const p = Data.s.priorities.find((x) => x.id === id);
      const done = fd.get('done') === 'on';
      Object.assign(p, f);
      if (done !== !!p.done) { p.done = done; p.doneAt = done ? new Date().toISOString() : null; }
    } else Data.s.priorities.push({ id: uid(), ...f, done: false, doneAt: null, createdAt: new Date().toISOString() });
    Store.save(); Modal.close(); App.refresh();
    if (!id) Toast.show('Priority added');
  },
  visit(form, fd) {
    const accId = fd.get('accountId');
    if (!accId) return Toast.show('Choose an account');
    const at = fd.get('at') ? new Date(fd.get('at')).toISOString() : new Date().toISOString();
    const id = form.dataset.id, note = val(fd, 'note');
    if (id) {
      const v = Data.s.visits.find((x) => x.id === id);
      const sibs = v.accountId === accId ? Data.visitSiblings(v) : [];
      Object.assign(v, { accountId: accId, at, note });
      sibs.forEach((x) => Object.assign(x, { at, note })); // the visit at the nearby account(s) stays in step
    } else Data.s.visits.push({ id: uid(), accountId: accId, at, note });
    Store.save(); App.refresh();
    Modal.close().then(async () => {
      if (id) return;
      const extra = await askLinkedCheckins(Data.account(accId), at, note);
      Toast.show(`Visit logged for ${Data.account(accId)?.name}${extra.length ? ` + ${plural(extra.length, 'nearby account')}` : ''}`);
    });
  },
  placement(form, fd) {
    const a = Data.account(form.dataset.acc);
    const pl = a.placements.find((x) => x.id === form.dataset.id);
    const rtd = isRTD(Data.product(pl.productId));
    Object.assign(pl, { well: !rtd && fd.get('well') === 'on', backBar: !rtd && fd.get('backBar') === 'on', cocktail: !rtd && fd.get('cocktail') === 'on', cocktailName: rtd ? '' : val(fd, 'cocktailName'), since: fd.get('since') || '', competitor: val(fd, 'competitor'), notes: val(fd, 'notes') });
    Store.save(); Modal.close(); App.refresh();
  },
  opp(form, fd) {
    const o = Data.s.opportunities.find((x) => x.id === form.dataset.id);
    const status = fd.get('status');
    o.note = val(fd, 'note');
    Modal.close();
    if (status !== o.status) setOppStatus(o, status); else commit();
  },
  hours(form, fd) {
    const a = Data.account(form.dataset.id);
    a.hours = {}; a.best = {}; a.lunch = fd.get('lunch') || '';
    for (const d of DAY_ORDER) {
      const closed = fd.get('closed_' + d) === 'on', from = fd.get('from_' + d) || '', to = fd.get('to_' + d) || '';
      if (closed) a.hours[d] = { closed: true };
      else if (from || to) a.hours[d] = { from, to };
      const b = fd.getAll('best_' + d);
      if (b.length && !closed) a.best[d] = b;
    }
    Store.save(); Modal.close(); App.refresh();
  },
  route(form, fd) {
    const name = val(fd, 'name');
    if (!name) return Toast.show('Name the route');
    const id = form.dataset.id, s = Data.s;
    let r;
    if (id) { r = Data.route(id); r.name = name; r.color = fd.get('color') || r.color; }
    else { r = { id: uid(), name, color: fd.get('color') || ROUTE_COLORS[0], order: s.routes.length ? Math.max(...s.routes.map((x) => x.order ?? 0)) + 1 : 0 }; s.routes.push(r); }
    Store.save(); Modal.close(r.id); App.refresh();
  },
  async rep(form, fd) {
    const name = niceName(val(fd, 'name'));
    if (!name) return Toast.show('Enter the rep\'s name');
    const id = form.dataset.id, reps = Data.s.settings.reps;
    const same = reps.find((x) => norm(x.name) === norm(name) && x.id !== id);
    if (same && !id) { Modal.close(same.id); Toast.show(`${same.name} is already on your list`); return; }
    if (same && id) {
      const r = Data.rep(id);
      if (!(await confirmBox(`"${same.name}" already exists. Merge "${r.name}" into it? Every account assigned to "${r.name}" will move to "${same.name}".`, { ok: 'Merge', title: 'Merge reps?' }))) return;
      Data.s.accounts.forEach((a) => { if (a.repId === id) a.repId = same.id; });
      Data.s.notes.forEach((n) => { if (n.repId === id) n.repId = same.id; });
      for (const k of ['title', 'phone', 'email']) if (!same[k] && r[k]) same[k] = r[k];
      Data.s.settings.reps = reps.filter((x) => x.id !== id);
      Store.save(); await Modal.close(same.id); Toast.show('Reps merged');
      if (location.hash === '#/rep/' + id) location.replace('#/rep/' + same.id); else App.refresh();
      return;
    }
    let r;
    const info = { name, title: val(fd, 'title'), phone: val(fd, 'phone'), email: val(fd, 'email') };
    if (id) { r = Data.rep(id); Object.assign(r, info); } else { r = { id: uid(), ...info }; reps.push(r); }
    Store.save(); Modal.close(r.id); App.refresh();
  },
  tag(form, fd) {
    const name = val(fd, 'name');
    if (!name) return Toast.show('Name the tag');
    const id = form.dataset.id, tags = Data.s.settings.tags;
    let t;
    const same = tags.find((x) => norm(x.name) === norm(name) && x.id !== id);
    if (same && !id) { Modal.close(same.id); return; }
    if (id) { t = Data.tag(id); t.name = name; t.color = fd.get('color') || t.color; }
    else { t = { id: uid(), name, color: fd.get('color') || TAG_COLORS[0] }; tags.push(t); }
    Store.save(); Modal.close(t.id); App.refresh();
  },
  product(form, fd) {
    const f = { category: val(fd, 'category'), subcategory: val(fd, 'subcategory'), brand: val(fd, 'brand'), name: val(fd, 'name') };
    if (!f.category || !f.brand || !f.name) return Toast.show('Category, brand and product are required');
    const sizes = val(fd, 'size').split(',').map((x) => x.trim()).filter(Boolean);
    let n = 0;
    for (const size of sizes.length ? sizes : ['']) n += addProduct({ ...f, size }) ? 1 : 0;
    Store.save(); Modal.close(); App.refresh();
    Toast.show(n ? `Added ${plural(n, 'product')}` : 'Already in your list');
  },
  link(form, fd) {
    const s = Data.s, accId = form.dataset.id, type = fd.get('type'), name = val(fd, 'name');
    const picked = String(fd.get('accountIds') || '').split(',').filter(Boolean);
    if (!picked.length) return Toast.show('Choose at least one account to link');
    const members = new Set([accId, ...picked]);
    // join any existing groups of the same type these accounts already belong to
    const existing = s.linkGroups.filter((g) => g.type === type && g.accountIds.some((id) => members.has(id)));
    let g = existing[0];
    if (!g) { g = { id: uid(), type, name: '', accountIds: [] }; s.linkGroups.push(g); }
    for (const other of existing.slice(1)) { other.accountIds.forEach((id) => members.add(id)); if (!g.name && other.name) g.name = other.name; }
    s.linkGroups = s.linkGroups.filter((x) => !existing.slice(1).includes(x));
    g.accountIds = Array.from(new Set([...g.accountIds, ...members]));
    if (type === 'ownership' && name) g.name = name;
    Store.save(); Modal.close(); App.refresh();
    Toast.show(`Linked ${plural(g.accountIds.length, 'account')} (${Data.LINK_TYPES[type].toLowerCase()})`);
  },
  editLink(form, fd) {
    const s = Data.s, g = s.linkGroups.find((x) => x.id === form.dataset.id);
    g.accountIds = fd.getAll('keep');
    if (g.type === 'ownership') g.name = val(fd, 'name');
    if (g.accountIds.length < 2) s.linkGroups = s.linkGroups.filter((x) => x !== g);
    Store.save(); Modal.close(); App.refresh();
  },
  async syncSetup(form, fd) {
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const ok = await Sync.connect({ repo: val(fd, 'repo'), token: val(fd, 'token'), device: val(fd, 'device') });
      if (ok) { await Modal.close(); App.refresh(); Toast.show('Sync is on for this device'); }
    } catch (e) { Toast.show(e.message, [], 9000); }
    finally { btn.disabled = false; btn.textContent = 'Connect'; }
  },
  types(form, fd) {
    const lines = (k) => uniqSorted(String(fd.get(k) || '').split('\n').map((x) => x.trim()));
    Data.s.settings.accountTypes = lines('types');
    Data.s.settings.roles = lines('roles');
    Store.save(); Modal.close(); App.refresh();
  },
};

function productKey(p) { return [p.category, p.subcategory, p.brand, p.name, p.size].map(norm).join('|'); }
function addProduct(p) {
  const s = Data.s, k = productKey(p);
  const pk = (x) => [x.brand, x.name, x.size].map(norm).join('|');
  const existing = s.products.find((x) => productKey(x) === k || (x.builtin && pk(x) === pk(p)));
  if (existing) { if (existing.hidden) { existing.hidden = false; return true; } return false; }
  s.products.push({ id: uid(), category: p.category, subcategory: p.subcategory || '', brand: p.brand, name: p.name, size: p.size || '' });
  return true;
}
function setOppStatus(o, status) {
  o.status = status;
  o.closedAt = status === 'open' ? null : new Date().toISOString();
  let msg = '';
  if (status === 'won') {
    const a = Data.account(o.accountId);
    if (a && !a.placements.some((pl) => pl.productId === o.productId)) {
      a.placements.push({ id: uid(), productId: o.productId, since: toLocalDate(), addedAt: new Date().toISOString(), backBar: !isRTD(Data.product(o.productId)) });
      msg = 'Won! Added to products carried.';
    } else msg = 'Marked as won';
  }
  commit();
  if (msg) Toast.show(msg);
}

/* "Same person as …?" when a new contact matches someone you already have. Resolves to a person id,
   '' for "someone new", or null for cancel. */
function askSamePerson(cands, info) {
  return new Promise((res) => {
    const desc = (p) => esc([Data.accountsOfPerson(p.id).map((a) => a.name).join(', '), p.phone, p.email].filter(Boolean).join(' · '));
    Modal.open(`${modalHead('Someone you already have?')}<div class="modal-body">
      <p style="margin-top:0">${esc(info.name || 'This contact')} looks like:</p>
      ${cands.slice(0, 4).map((p) => `<button class="quick" style="width:100%;margin-bottom:8px" data-act="modalResolve" data-val="${p.id}"><b>Yes, ${esc(p.name || 'this person')}</b><small>${desc(p)}</small></button>`).join('')}
      <button class="quick" style="width:100%" data-act="modalResolve" data-val="__new"><b>No, someone new</b><small>Add as a separate contact</small></button>
      </div>`, { onClose: (v) => res(v === undefined ? null : v === '__new' ? '' : v) });
  });
}
