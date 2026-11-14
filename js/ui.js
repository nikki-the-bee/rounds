'use strict';
/* ---------- Modal sheets (Android back button closes the top one) ---------- */
const Modal = {
  stack: [],
  queue: [],
  open(html, opts = {}) {
    Toast.hide();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${opts.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    $('#modals').append(wrap);
    this.stack.push({ el: wrap, onClose: opts.onClose });
    history.pushState({ modal: this.stack.length }, '');
    let downOnBackdrop = false;
    wrap.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === wrap; });
    wrap.addEventListener('click', (e) => { if (e.target === wrap && downOnBackdrop) this.close(); });
    requestAnimationFrame(() => wrap.classList.add('show'));
    const af = wrap.querySelector('[autofocus]');
    if (af) setTimeout(() => af.focus(), 80);
    return wrap;
  },
  close(result) {
    const m = this.stack.pop();
    if (!m) return Promise.resolve();
    m.el.remove();
    return new Promise((res) => {
      this.queue.push(() => { m.onClose?.(result); res(); });
      history.back();
    });
  },
  closeAll() {
    const n = this.stack.length;
    if (!n) return Promise.resolve();
    const ms = this.stack.splice(0).reverse();
    ms.forEach((m) => m.el.remove());
    return new Promise((res) => {
      this.queue.push(() => { ms.forEach((m) => m.onClose?.()); res(); });
      history.go(-n);
    });
  },
  onPop() {
    if (this.queue.length) { this.queue.shift()(); return true; }
    if (this.stack.length) { const m = this.stack.pop(); m.el.remove(); m.onClose?.(); return true; }
    return false;
  },
  top() { return this.stack.at(-1)?.el; },
};

function modalHead(title) {
  return `<div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn ghost" data-act="modalClose" aria-label="Close">${icon('x')}</button></div>`;
}

const Toast = {
  t: null,
  show(msg, actions = [], ms = 4500) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>` + actions.map((a, i) => `<button data-i="${i}">${esc(a.label)}</button>`).join('');
    el.hidden = false;
    el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.hide(); actions[b.dataset.i].fn(); };
    clearTimeout(this.t);
    this.t = setTimeout(() => this.hide(), ms);
  },
  hide() { $('#toast').hidden = true; },
};

function confirmBox(msg, { ok = 'OK', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((res) => {
    Modal.open(`${modalHead(title)}<div class="modal-body"><p class="pre" style="margin:0">${esc(msg)}</p></div>
      <div class="modal-foot"><button class="btn" data-act="modalClose">Cancel</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-act="modalResolve" data-val="1">${esc(ok)}</button></div>`,
    { onClose: (r) => res(!!r) });
  });
}

/* ---------- Product tree (Category > Subcategory > Brand > Product > Sizes) ---------- */
function renderTree(products, leaf, { open = false, countFn } = {}) {
  const tree = new Map();
  for (const p of products) {
    const cat = p.category || 'Other', sub = p.subcategory || '', brand = p.brand || 'Other', name = p.name || '?';
    if (!tree.has(cat)) tree.set(cat, new Map());
    const subs = tree.get(cat);
    if (!subs.has(sub)) subs.set(sub, new Map());
    const brands = subs.get(sub);
    if (!brands.has(brand)) brands.set(brand, new Map());
    const names = brands.get(brand);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(p);
  }
  const keys = (m) => Array.from(m.keys()).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const o = open ? 'open' : '';
  const cnt = (list) => { const n = countFn ? countFn(list) : list.length; return n ? `<span class="t-count">${n}</span>` : ''; };
  const flat = (m) => Array.from(m.values()).flatMap((v) => (Array.isArray(v) ? v : flat(v)));
  let h = '<div class="tree">';
  for (const cat of keys(tree)) {
    const subs = tree.get(cat);
    h += `<details class="t-cat" ${o}><summary>${esc(cat)}${cnt(flat(subs))}</summary>`;
    for (const sub of keys(subs)) {
      const brands = subs.get(sub);
      if (sub) h += `<details class="t-sub" ${o}><summary>${esc(sub)}${cnt(flat(brands))}</summary>`;
      for (const brand of keys(brands)) {
        const names = brands.get(brand);
        h += `<details class="t-brand" ${o}><summary>${esc(brand)}${cnt(flat(names))}</summary>`;
        for (const name of keys(names)) {
          const ps = sortBy(names.get(name), (p) => sizeValue(p.size));
          h += `<div class="t-prod"><div class="t-name">${esc(name)}</div><div class="t-sizes">${ps.map(leaf).join('')}</div></div>`;
        }
        h += '</details>';
      }
      if (sub) h += '</details>';
    }
    h += '</details>';
  }
  return h + '</div>';
}

/* ---------- Pickers ---------- */
const Picker = {
  _acct: null,
  _prod: null,
  account({ title = 'Choose account', multi = false, exclude = [], allowNone = false } = {}) {
    return new Promise((res) => {
      this._acct = { multi, exclude: new Set(exclude), sel: new Set(), q: '', allowNone };
      Modal.open(`${modalHead(title)}
        <div class="modal-body">
          <div class="search" style="margin-bottom:10px">${icon('search')}<input type="search" placeholder="Search accounts" data-input="pickAcctSearch" ${multi ? '' : 'autofocus'}></div>
          <div id="pickAcctList">${this.acctList()}</div>
        </div>
        ${multi ? `<div class="modal-foot"><button class="btn" data-act="modalClose">Cancel</button><button class="btn primary" data-act="pickAcctDone" id="pickAcctDoneBtn">Add selected</button></div>` : ''}`,
      { onClose: res, cls: 'tall' });
    });
  },
  acctList() {
    const st = this._acct, ws = words(st.q);
    let list = sortBy(Data.active().filter((a) => !st.exclude.has(a.id)), (a) => sortName(a.name));
    if (ws.length) list = list.filter((a) => matchesAll(`${a.name} ${Data.routeName(a.routeId)} ${a.type || ''} ${a.address || ''}`, ws));
    const row = (a) => {
      const sub = esc([Data.isOther(a) ? 'Other account' : '', Data.route(a.routeId)?.name, a.type].filter(Boolean).join(' · '));
      if (st.multi) return `<label class="row"><input type="checkbox" class="toggle" style="width:20px;height:20px;accent-color:var(--accent)" value="${a.id}" data-chg="pickAcctToggle" ${st.sel.has(a.id) ? 'checked' : ''}><div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${sub}</div></div></label>`;
      return `<div class="row" data-act="modalResolve" data-val="${a.id}"><span class="dot" style="background:${Data.routeColor(a.routeId)}"></span><div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-sub">${sub}</div></div></div>`;
    };
    let h = '';
    if (!st.multi && !ws.length) {
      const lm = Data.lastVisitMap();
      const recent = sortBy(list.filter((a) => lm[a.id]), (a) => lm[a.id].at).reverse().slice(0, 5);
      if (recent.length && list.length > 8) h += `<div class="list"><div class="group-head">Recently visited</div>${recent.map(row).join('')}</div>`;
    }
    if (st.allowNone && !ws.length) h += `<div class="list"><div class="row" data-act="modalResolve" data-val="__none"><div class="row-main"><div class="row-title">No account</div><div class="row-sub">General to-do, not tied to an account</div></div></div></div>`;
    if (!list.length) return h + '<div class="empty">No matching accounts</div>';
    return h + `<div class="list">${!st.multi && !ws.length && h ? '<div class="group-head">All accounts</div>' : ''}${list.map(row).join('')}</div>`;
  },
  _person: null,
  person({ title = 'Add existing contact', exclude = [] } = {}) {
    return new Promise((res) => {
      this._person = { exclude: new Set(exclude), q: '' };
      Modal.open(`${modalHead(title)}<div class="modal-body">
          <div class="search" style="margin-bottom:10px">${icon('search')}<input type="search" placeholder="Search name, phone, email or account" data-input="pickPersonSearch" autofocus></div>
          <div id="pickPersonList">${this.personList()}</div></div>`, { onClose: res, cls: 'tall' });
    });
  },
  personList() {
    const st = this._person, ws = words(st.q);
    let list = sortBy(Data.s.people.filter((p) => !st.exclude.has(p.id)), (p) => norm(p.name));
    const where = (p) => Data.accountsOfPerson(p.id).map((a) => { const l = a.contacts.find((x) => x.personId === p.id); return a.name + (l?.role ? ` (${l.role})` : ''); });
    if (ws.length) list = list.filter((p) => matchesAll([p.name, p.phone, p.email, p.instagram, ...where(p)].join(' '), ws));
    if (!list.length) return '<div class="empty">No matching contacts</div>';
    return `<div class="list">${list.map((p) => `<div class="row" data-act="modalResolve" data-val="${p.id}"><div class="row-main"><div class="row-title">${esc(p.name || 'Unnamed')}</div><div class="row-sub">${esc(where(p).join(' · '))}</div>${p.phone || p.email ? `<div class="row-sub">${esc([p.phone, p.email].filter(Boolean).join(' · '))}</div>` : ''}</div></div>`).join('')}</div>`;
  },
  products({ title = 'Add products', exclude = new Map() } = {}) {
    return new Promise((res) => {
      if (!Data.liveProducts().length) {
        Toast.show('No products yet. Import your product list from the More tab.');
        return res([]);
      }
      this._prod = { sel: new Set(), exclude, q: '' };
      Modal.open(`${modalHead(title)}
        <div class="modal-body">
          <div class="search" style="margin-bottom:6px">${icon('search')}<input type="search" placeholder="Search brand, product or size" data-input="pickProdSearch"></div>
          <div id="pickProdTree">${this.prodTree()}</div>
        </div>
        <div class="modal-foot"><button class="btn" data-act="modalClose">Cancel</button><button class="btn primary" data-act="pickProdDone" id="pickProdDoneBtn" disabled>Add selected</button></div>`,
      { onClose: (r) => res(r || []), cls: 'tall' });
    });
  },
  prodTree() {
    const st = this._prod, ws = words(st.q);
    let list = Data.liveProducts(new Set(st.exclude.keys()));
    if (ws.length) list = list.filter((p) => matchesAll([p.category, p.subcategory, p.brand, p.name, p.size].join(' '), ws));
    if (!list.length) return '<div class="empty">No matching products</div>';
    return renderTree(list, (p) => {
      const ex = st.exclude.get(p.id);
      return `<label class="size-chip ${ex ? 'dis' : ''}"><input type="checkbox" value="${p.id}" data-chg="pickProdToggle" ${st.sel.has(p.id) || ex ? 'checked' : ''} ${ex ? 'disabled' : ''}><span>${esc(p.size || 'Any size')}${ex ? ` <small>· ${esc(ex)}</small>` : ''}</span></label>`;
    }, { open: ws.length > 0 && list.length <= 60 });
  },
  updateProdBtn() {
    const b = $('#pickProdDoneBtn'); if (!b) return;
    const n = this._prod.sel.size;
    b.disabled = !n; b.textContent = n ? `Add ${n} selected` : 'Add selected';
  },
};
