(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const KEY = 'vb_admin_token';
  let token = sessionStorage.getItem(KEY) || '';
  let calMonth = new Date(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  let availability = {};
  let content = null;
  let selected = null;

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, { ...opts, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401 && !path.endsWith('/login')) { logout(true); throw new Error('Session expired. Please log in again.'); }
    const isJson = (r.headers.get('content-type') || '').includes('json');
    const data = isJson ? await r.json() : null;
    if (!r.ok) throw new Error((data && (data.error || (data.errors && Object.values(data.errors)[0]))) || 'Request failed.');
    return data;
  }
  const say = (id, text, ok = true) => { const el = $(id); el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'bad'); };

  // ---------- auth ----------
  function showApp(on) {
    $('#login-view').classList.toggle('hidden', on);
    $('#app-view').classList.toggle('hidden', !on);
  }
  function logout(silent) {
    if (token && !silent) api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    token = ''; sessionStorage.removeItem(KEY); showApp(false);
    if (silent) $('#login-msg').textContent = 'Your session expired. Please log in again.';
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-msg').textContent = '';
    try {
      const d = await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      token = d.token; sessionStorage.setItem(KEY, token); $('#pw').value = '';
      await start();
    } catch (err) { $('#login-msg').textContent = err.message; }
  });
  $('#logout').addEventListener('click', () => logout(false));

  // ---------- tabs ----------
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'overview') loadOverview();
    if (b.dataset.tab === 'calendar') loadAvailability();
    if (b.dataset.tab === 'enquiries') loadEnquiries();
    if (b.dataset.tab === 'content') loadContent();
  }));

  // ---------- overview ----------
  async function loadOverview() {
    const d = await api('/api/admin/overview');
    $('#s-total').textContent = d.total; $('#s-pending').textContent = d.pending;
    $('#s-confirmed').textContent = d.confirmed; $('#s-cancelled').textContent = d.cancelled;
    const rowList = (list) => list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Name</th><th>Event</th><th>Status</th></tr></thead><tbody>${list.map((e) =>
      `<tr><td>${esc(e.date)}</td><td>${esc(e.name)}<br><span class="small muted">${esc(e.phone)}</span></td><td>${esc(e.eventType)}</td><td><span class="pill p-${esc(e.status)}">${esc(e.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing yet.</p>';
    $('#o-upcoming').innerHTML = rowList(d.upcoming);
    $('#o-recent').innerHTML = rowList(d.recent);
  }

  // ---------- availability ----------
  async function loadAvailability() {
    availability = await api('/api/admin/availability');
    drawAdminCal(); drawList();
  }
  function drawAdminCal() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let h = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
      <button class="btn btn-outline small-btn" id="ac-prev">&lsaquo;</button><strong>${calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
      <button class="btn btn-outline small-btn" id="ac-next">&rsaquo;</button></div>
      <div class="cal-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}`;
    for (let i = 0; i < first; i++) h += '<div class="day blank"></div>';
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const st = availability[ds]?.status || 'available';
      h += `<button class="day ${st} ${ds === selected ? 'sel' : ''}" data-d="${ds}" title="${ds}: ${st}">${d}</button>`;
    }
    h += '</div>';
    $('#admin-cal').innerHTML = h;
    $('#ac-prev').onclick = () => { calMonth = new Date(y, m - 1, 1); drawAdminCal(); };
    $('#ac-next').onclick = () => { calMonth = new Date(y, m + 1, 1); drawAdminCal(); };
  }
  function drawList() {
    const entries = Object.entries(availability).sort(([a], [b]) => a.localeCompare(b));
    $('#a-list').innerHTML = entries.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${entries.map(([d, v]) =>
      `<tr><td>${esc(d)}</td><td><span class="pill">${esc(v.status)}</span></td><td>${esc(v.note)}</td><td><button class="btn btn-outline small-btn" data-open="${esc(d)}">Make available</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">All dates are available. Mark a date to change it.</p>';
  }
  $('#admin-cal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    selected = b.dataset.d;
    $('#a-from').value = selected; $('#a-to').value = selected;
    const st = availability[selected]?.status || 'available';
    $('#a-status').value = st;
    $('#a-note').value = availability[selected]?.note || '';
    drawAdminCal();
  });
  $('#a-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    try {
      await api('/api/admin/availability', { method: 'PUT', body: { dates: [b.dataset.open], status: 'available' } });
      say('#a-msg', 'Date is available again.'); await loadAvailability();
    } catch (err) { say('#a-msg', err.message, false); }
  });
  $('#a-apply').addEventListener('click', async () => {
    const from = $('#a-from').value, to = $('#a-to').value || from;
    if (!from) return say('#a-msg', 'Choose a date.', false);
    if (to < from) return say('#a-msg', 'The "To" date must be on or after "From".', false);
    const dates = [];
    for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    if (dates.length > 400) return say('#a-msg', 'Please choose at most 400 days at a time.', false);
    try {
      const r = await api('/api/admin/availability', { method: 'PUT', body: { dates, status: $('#a-status').value, note: $('#a-note').value } });
      say('#a-msg', `Saved. ${r.updated} date(s) updated.`);
      await loadAvailability();
    } catch (err) { say('#a-msg', err.message, false); }
  });

  // ---------- enquiries ----------
  let enquiries = [];
  async function loadEnquiries() {
    enquiries = await api('/api/admin/enquiries');
    drawEnquiries();
  }
  function drawEnquiries() {
    const f = $('#e-filter').value, q = $('#e-search').value.trim().toLowerCase();
    const list = enquiries.filter((e) => (!f || e.status === f) && (!q || e.name.toLowerCase().includes(q) || e.phone.includes(q)));
    $('#e-body').innerHTML = list.length ? list.map((e) => `
      <tr data-id="${esc(e.id)}">
        <td>${esc(new Date(e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}</td>
        <td><b>${esc(e.name)}</b>${e.email ? '<br><span class="small muted">' + esc(e.email) + '</span>' : ''}</td>
        <td>${esc(e.eventType)}${e.package ? '<br><span class="small muted">' + esc(e.package) + '</span>' : ''}${e.budget ? '<br><span class="small muted">Budget: ' + esc(e.budget) + '</span>' : ''}</td>
        <td>${esc(e.date)}<br><span class="small muted">${esc(e.guests)} guests</span></td>
        <td><select data-field="status">${['Pending','Confirmed','Cancelled'].map((s) => `<option ${s === e.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td style="min-width:200px"><div class="small">${esc(e.requirements)}</div><textarea rows="2" data-field="adminNote" placeholder="Your private note">${esc(e.adminNote)}</textarea><button class="btn btn-outline small-btn" data-save-note>Save note</button></td>
        <td><a href="tel:+91${esc(e.phone)}">${esc(e.phone)}</a><br><a target="_blank" rel="noopener" href="https://wa.me/91${esc(e.phone)}">WhatsApp</a></td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">No enquiries match.</td></tr>';
  }
  $('#e-filter').addEventListener('change', drawEnquiries);
  $('#e-search').addEventListener('input', drawEnquiries);
  $('#e-body').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-field="status"]'); if (!sel) return;
    const id = sel.closest('tr').dataset.id;
    try {
      await api('/api/admin/enquiries/' + id, { method: 'PATCH', body: { status: sel.value } });
      say('#e-msg', 'Status updated. Calendar reflects it.');
      await loadEnquiries();
    } catch (err) { say('#e-msg', err.message, false); await loadEnquiries(); }
  });
  $('#e-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save-note]'); if (!b) return;
    const row = b.closest('tr');
    try {
      await api('/api/admin/enquiries/' + row.dataset.id, { method: 'PATCH', body: { adminNote: row.querySelector('[data-field="adminNote"]').value } });
      say('#e-msg', 'Note saved.');
    } catch (err) { say('#e-msg', err.message, false); }
  });
  $('#export').addEventListener('click', async () => {
    const r = await fetch('/api/admin/export.csv', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return say('#e-msg', 'Export failed. Please log in again.', false);
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'vaishnavi-enquiries.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // ---------- content ----------
  async function loadContent() {
    content = await api('/api/admin/content');
    $('#c-tagline').value = content.tagline;
    $('#c-areas').value = (content.hall.areas || []).join('\n');
    $('#c-capacity').value = content.hall.capacity || '';
    $('#c-address').value = content.contact.address;
    $('#c-phones').value = content.contact.phones.join(', ');
    $('#c-wa').value = content.contact.whatsapp;
    $('#c-hours').value = content.contact.hours;
    ['facilities','events','packages','menu','reviews','gallery'].forEach((k) => { $('#j-' + k).value = JSON.stringify(content[k], null, 2); });
  }
  $('#save-basic').addEventListener('click', async () => {
    try {
      const phones = $('#c-phones').value.split(',').map((s) => s.replace(/\D/g, '').replace(/^91/, '')).filter(Boolean);
      const wa = $('#c-wa').value.replace(/\D/g, '').replace(/^91/, '');
      if (phones.some((p) => !/^[6-9]\d{9}$/.test(p)) || !/^[6-9]\d{9}$/.test(wa)) throw new Error('Check the phone numbers. Each must be a 10-digit Indian mobile number.');
      const hall = { ...content.hall, areas: $('#c-areas').value.split('\n').map((s) => s.trim()).filter(Boolean), capacity: $('#c-capacity').value.trim() };
      const contact = { ...content.contact, address: $('#c-address').value.trim(), phones, whatsapp: wa, hours: $('#c-hours').value.trim() };
      await api('/api/admin/content/hall', { method: 'PUT', body: { value: hall } });
      await api('/api/admin/content/contact', { method: 'PUT', body: { value: contact } });
      await api('/api/admin/content/tagline', { method: 'PUT', body: { value: $('#c-tagline').value.trim() } });
      say('#basic-msg', 'Saved. Refresh the website to see changes.');
      await loadContent();
    } catch (err) { say('#basic-msg', err.message, false); }
  });
  $$('[data-save]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.save;
    try {
      const value = JSON.parse($('#j-' + key).value);
      await api('/api/admin/content/' + key, { method: 'PUT', body: { value } });
      say('#json-msg', `${key} saved. Refresh the website to see changes.`);
      await loadContent();
    } catch (err) { say('#json-msg', 'Could not save: ' + (err.message.includes('JSON') ? 'the text is not valid JSON. Check quotes and commas.' : err.message), false); }
  }));

  // ---------- start ----------
  async function start() {
    showApp(true);
    await loadOverview();
  }
  (async () => {
    if (!token) return showApp(false);
    try { await start(); } catch { logout(true); }
  })();
  $('#a-from').min = todayStr();
})();
