'use strict';
/* ---------- Sync across devices through a private GitHub repository ----------
   The whole data set is one file (rounds-data.json) in the private repo.
   Each device keeps the copy it last synced ("base"). When syncing it compares
   base / this device / the repo copy, so it knows which side changed what. */

const SYNC_FILE = 'rounds-data.json';

const SyncMerge = {
  LISTS: ['accounts', 'notes', 'priorities', 'visits', 'opportunities', 'routes', 'products', 'linkGroups', 'people'],
  same(a, b) { return stableStr(a) === stableStr(b); },
  /* field by field: whichever side changed a field wins; if both changed it, the newer edit wins */
  record(b, l, r) {
    b = b || {};
    const out = {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    keys.delete('_mt');
    const rNewer = (r._mt || '') > (l._mt || '');
    for (const k of keys) {
      const lv = l[k], rv = r[k], bv = b[k];
      let v;
      if (this.same(lv, rv)) v = lv;
      else if (this.same(lv, bv)) v = rv;
      else if (this.same(rv, bv)) v = lv;
      else v = rNewer ? rv : lv;
      if (v !== undefined) out[k] = v;
    }
    const mt = [l._mt, r._mt].filter(Boolean).sort().pop();
    if (mt) out._mt = mt;
    return out;
  },
  /* records matched by id: added anywhere = kept; deleted on one side and untouched on the other = deleted;
     deleted on one side but edited on the other = kept (an edit beats a delete) */
  list(bl, ll, rl) {
    bl = bl || []; ll = ll || []; rl = rl || [];
    const B = new Map(bl.map((x) => [x.id, x])), L = new Map(ll.map((x) => [x.id, x])), R = new Map(rl.map((x) => [x.id, x]));
    const out = new Map();
    for (const l of ll) {
      const r = R.get(l.id), b = B.get(l.id);
      if (r) out.set(l.id, this.record(b, l, r));
      else if (!b || !this.same(l, b)) out.set(l.id, l);
    }
    for (const r of rl) {
      if (L.has(r.id)) continue;
      const b = B.get(r.id);
      if (!b || !this.same(r, b)) out.set(r.id, r);
    }
    // keep the order of whichever side re-ordered (matters for tags)
    const ids = (a) => a.map((x) => x.id).join('|');
    const order = ids(ll) === ids(bl) ? rl : ll;
    const res = [];
    for (const x of order) if (out.has(x.id)) { res.push(out.get(x.id)); out.delete(x.id); }
    return res.concat(Array.from(out.values()));
  },
  merge(b, l, r) {
    b = b || {};
    const out = { ...r, ...l };
    for (const k of this.LISTS) out[k] = this.list(b[k], l[k], r[k]);
    const strip = (s) => ({ ...(s || {}), tags: undefined, reps: undefined });
    out.settings = this.record(strip(b.settings), strip(l.settings), strip(r.settings));
    out.settings.tags = this.list(b.settings?.tags, l.settings?.tags, r.settings?.tags);
    out.settings.reps = this.list(b.settings?.reps, l.settings?.reps, r.settings?.reps);
    out.catalogVersion = Math.max(l.catalogVersion || 0, r.catalogVersion || 0);
    return out;
  },
};

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const GH = {
  base: 'https://api.github.com',
  async req(cfg, path, opts = {}) {
    try {
      return await fetch(`${this.base}/repos/${cfg.repo}${path}`, {
        cache: 'no-store', ...opts,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
      });
    } catch (err) { const e = new Error('No connection to GitHub'); e.offline = true; throw e; }
  },
  async error(res) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch {}
    const e = new Error(
      res.status === 401 ? 'The access key isn\'t valid or has expired. Create a new one and paste it in.'
        : res.status === 404 ? 'Repository not found, or the access key can\'t see it. Check the name and that the key includes this repository.'
          : res.status === 403 ? `GitHub refused the request${/permission|access/i.test(msg) ? ': the key needs "Contents: Read and write" on this repository' : ''}. ${msg}`
            : `GitHub error ${res.status}. ${msg}`);
    e.status = res.status;
    return e;
  },
  async repo(cfg) {
    const res = await this.req(cfg, '');
    if (!res.ok) throw await this.error(res);
    return res.json();
  },
  async get(cfg) {
    const res = await this.req(cfg, `/contents/${SYNC_FILE}`);
    if (res.status === 404) return { sha: null, data: null };
    if (!res.ok) throw await this.error(res);
    const j = await res.json();
    let text;
    if (j.content) text = b64decode(j.content);
    else { // files over 1 MB come without content
      const raw = await this.req(cfg, `/contents/${SYNC_FILE}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!raw.ok) throw await this.error(raw);
      text = await raw.text();
    }
    return { sha: j.sha, data: JSON.parse(text) };
  },
  async put(cfg, data, sha, message) {
    const body = { message, content: b64encode(JSON.stringify(data)) };
    if (sha) body.sha = sha;
    const res = await this.req(cfg, `/contents/${SYNC_FILE}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 409 || (res.status === 422 && !sha)) { const e = new Error('conflict'); e.conflict = true; throw e; }
    if (!res.ok) throw await this.error(res);
    return (await res.json()).content.sha;
  },
};

const Sync = {
  cfg: null,
  busy: false,
  again: false,
  timer: null,
  state: 'off',     // off | idle | syncing | offline | error
  error: '',
  KEY: 'rounds-sync',
  load() {
    try { this.cfg = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch { this.cfg = null; }
    this.state = this.on ? 'idle' : 'off';
  },
  saveCfg() { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); },
  get on() { return !!(this.cfg && this.cfg.token && this.cfg.repo); },
  defaultRepo() { const h = location.hostname; return h.endsWith('.github.io') ? `${h.split('.')[0]}/rounds-data` : ''; },
  defaultDevice() { const u = navigator.userAgent; return /Android/i.test(u) ? 'Android phone' : /iPhone/i.test(u) ? 'iPhone' : /iPad/i.test(u) ? 'iPad' : 'Computer'; },
  setState(st, err = '') {
    this.state = st; this.error = err;
    if (location.hash === '#/more' && !Modal.stack.length) App.refresh();
  },
  changed() { if (this.on) this.schedule(4000); },
  schedule(ms = 4000) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms); },

  async run({ manual = false } = {}) {
    clearTimeout(this.timer); this.timer = null;
    if (!this.on) return;
    if (!navigator.onLine) { this.setState('offline'); return; }
    if (this.busy) { this.again = true; return; }
    if (Modal.stack.length && !manual) { this.schedule(3000); return; } // don't swap data under an open form
    this.busy = true; this.again = false;
    this.setState('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        await Store.flush();
        const local = JSON.parse(JSON.stringify(Store.state));
        const base = await Store.kvGet('syncBase');
        const remote = await GH.get(this.cfg);
        const merged = remote.data ? SyncMerge.merge(base, local, remote.data) : local;
        let sha = remote.sha;
        if (!remote.data || stableStr(merged) !== stableStr(remote.data)) {
          try { sha = await GH.put(this.cfg, merged, remote.sha, `Sync from ${this.cfg.device || 'a device'}`); }
          catch (e) { if (e.conflict) continue; throw e; } // another device saved first: merge again
        }
        // edits made on this device while we were talking to GitHub get layered back on top
        const now = JSON.parse(JSON.stringify(Store.state));
        const editedMeanwhile = stableStr(now) !== stableStr(local);
        const final = editedMeanwhile ? SyncMerge.merge(local, now, merged) : merged;
        await Store.kvPut('syncBase', merged);
        this.cfg.sha = sha; this.cfg.lastAt = new Date().toISOString(); this.saveCfg();
        if (stableStr(final) !== stableStr(Store.state)) {
          await Store.applySynced(final);
          applyTheme();
          App.refresh();
        }
        if (editedMeanwhile) this.again = true;
        this.setState('idle');
        if (manual) Toast.show('Synced');
        return;
      }
      throw new Error('Kept colliding with another device. Try again in a moment.');
    } catch (e) {
      console.warn('Sync failed', e);
      const offline = !navigator.onLine || e.offline;
      this.setState(offline ? 'offline' : 'error', offline ? '' : e.message);
      if (manual || e.status === 401) Toast.show(offline ? 'No connection. Will sync when you\'re back online.' : 'Sync failed: ' + e.message, [], 8000);
    } finally {
      this.busy = false;
      if (this.again) this.schedule(1500);
    }
  },

  /* first-time setup on this device */
  async connect({ repo, token, device }) {
    repo = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
    token = token.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository should look like username/rounds-data');
    if (!token) throw new Error('Paste your access key');
    const cfg = { repo, token, device: device.trim() || this.defaultDevice() };
    const info = await GH.repo(cfg);
    if (!info.private) throw new Error('That repository is public. Make it private on GitHub first, so your data stays private.');
    const remote = await GH.get(cfg);
    const localHas = Store.state.accounts.length > 0;
    let mode = 'push';
    if (remote.data) {
      const n = remote.data.accounts?.length || 0;
      if (!localHas) mode = 'use';
      else {
        mode = await new Promise((res) => {
          Modal.open(`${modalHead('Both have data')}<div class="modal-body">
            <p style="margin-top:0">Your synced data has <b>${plural(n, 'account')}</b>, and this device has <b>${plural(Store.state.accounts.length, 'account')}</b>.</p>
            <button class="quick" style="width:100%;margin-bottom:10px" data-act="modalResolve" data-val="use"><b>Use the synced data</b><small>Recommended if this device is new. Replaces what's on this device.</small></button>
            <button class="quick" style="width:100%" data-act="modalResolve" data-val="combine"><b>Combine both</b><small>Keeps everything from both. If you imported the same spreadsheet on both, you'll get duplicate accounts.</small></button>
            </div>`, { onClose: (v) => res(v || '') });
        });
        if (!mode) return false;
      }
    }
    this.cfg = cfg;
    if (mode === 'use') {
      await Store.applySynced(remote.data);
      await Store.kvPut('syncBase', remote.data);
      this.cfg.sha = remote.sha; this.cfg.lastAt = new Date().toISOString();
      applyTheme();
    } else {
      await Store.kvPut('syncBase', null);
    }
    this.saveCfg();
    this.state = 'idle';
    await this.run({ manual: true });
    return true;
  },
  async disconnect() {
    clearTimeout(this.timer);
    localStorage.removeItem(this.KEY);
    await Store.kvPut('syncBase', null);
    this.cfg = null; this.state = 'off'; this.error = '';
  },
};
