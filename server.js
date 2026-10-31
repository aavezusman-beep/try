'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

const ENQ_STATUSES = ['Pending', 'Confirmed', 'Cancelled'];
const DAY_STATUSES = ['available', 'booked', 'blocked'];
const CONTENT_KEYS = ['tagline', 'hall', 'contact', 'facilities', 'events', 'gallery', 'packages', 'menu', 'reviews'];

if (!ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. Admin login is disabled until you set it.');
}

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const load = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const save = (db) => {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
};
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const bookedNote = (name) => 'Booked: ' + name;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- admin auth ----------
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin is not configured yet. The website owner needs to set ADMIN_PASSWORD on the server and restart it.' });
  }
  const now = Date.now();
  const rec = loginAttempts.get(req.ip) || { count: 0, until: 0 };
  if (rec.until > now) return res.status(429).json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  if (!safeEqual(String(req.body?.password || ''), ADMIN_PASSWORD)) {
    rec.count += 1;
    if (rec.count >= 5) { rec.until = now + 15 * 60 * 1000; rec.count = 0; }
    loginAttempts.set(req.ip, rec);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  loginAttempts.delete(req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { exp: now + SESSION_MS });
  res.json({ token });
});

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
  s.exp = Date.now() + SESSION_MS;
  next();
}

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete((req.headers.authorization || '').replace(/^Bearer /, ''));
  res.json({ ok: true });
});

// ---------- public API ----------
app.get('/api/content', (req, res) => {
  const c = load().content;
  res.json({
    ...c,
    facilities: c.facilities.filter((f) => f.active),
    menu: { categories: c.menu.categories, items: c.menu.items.filter((i) => i.available) }
  });
});

// Public availability: only the status per date, never notes or customer data.
app.get('/api/availability', (req, res) => {
  const db = load();
  const from = isDate(req.query.from) ? req.query.from : todayIST();
  let to = isDate(req.query.to) ? req.query.to : addDays(from, 120);
  if (to > addDays(from, 400)) to = addDays(from, 400);
  const days = {};
  for (const [d, v] of Object.entries(db.availability)) {
    if (d >= from && d <= to) days[d] = v.status;
  }
  res.json({ from, to, days });
});

app.post('/api/enquiries', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true, message: 'Thank you.' }); // honeypot for bots

  const errors = {};
  const db = load();

  const name = clean(b.name, 80);
  if (name.length < 2) errors.name = 'Please enter your name.';

  const phone = clean(b.phone, 20).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number.';

  const email = clean(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email or leave it empty.';

  const eventType = clean(b.eventType, 60);
  if (!db.content.events.some((e) => e.title === eventType)) errors.eventType = 'Choose an event type.';

  const date = clean(b.date, 10);
  if (!isDate(date) || date < todayIST()) errors.date = 'Choose a date from today onwards.';

  const guests = parseInt(b.guests, 10);
  if (!(guests >= 1 && guests <= 5000)) errors.guests = 'Enter the expected number of guests (1 to 5000).';

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const day = db.availability[date];
  if (day && day.status !== 'available') {
    return res.status(409).json({ errors: { date: 'Sorry, this date is not available. Please choose another date or call us.' } });
  }

  const dup = db.enquiries.find((e) => e.phone === phone && e.date === date && e.status !== 'Cancelled');
  if (dup) {
    return res.status(409).json({ errors: { date: 'We already have an open enquiry from this number for this date.' } });
  }

  const now = new Date().toISOString();
  const enquiry = {
    id: crypto.randomBytes(6).toString('hex'),
    createdAt: now,
    updatedAt: now,
    status: 'Pending',
    name,
    phone,
    email,
    eventType,
    date,
    guests,
    package: clean(b.package, 60),
    budget: clean(b.budget, 60),
    requirements: clean(b.requirements, 1000),
    adminNote: ''
  };
  db.enquiries.push(enquiry);
  save(db);
  res.status(201).json({
    ok: true,
    id: enquiry.id,
    message: 'Thank you! We have received your enquiry for ' + date + '. Our team will contact you to confirm. This is an enquiry, not a confirmed booking.'
  });
});

// ---------- admin: overview ----------
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const db = load();
  const today = todayIST();
  const count = (s) => db.enquiries.filter((e) => e.status === s).length;
  const upcoming = db.enquiries
    .filter((e) => e.date >= today && e.status !== 'Cancelled')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
  const recent = [...db.enquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  res.json({
    total: db.enquiries.length,
    pending: count('Pending'),
    confirmed: count('Confirmed'),
    cancelled: count('Cancelled'),
    upcoming,
    recent
  });
});

// ---------- admin: enquiries ----------
app.get('/api/admin/enquiries', requireAdmin, (req, res) => {
  res.json(load().enquiries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.patch('/api/admin/enquiries/:id', requireAdmin, (req, res) => {
  const db = load();
  const e = db.enquiries.find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'Enquiry not found.' });

  const { status, adminNote } = req.body || {};
  const now = new Date().toISOString();

  if (status !== undefined) {
    if (!ENQ_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const day = db.availability[e.date];

    if (status === 'Confirmed') {
      if (day && day.status !== 'available' && day.note !== bookedNote(e.name)) {
        return res.status(409).json({ error: 'This date is already marked ' + day.status + ' in the calendar. Free it first or pick another date.' });
      }
      db.availability[e.date] = { status: 'booked', note: bookedNote(e.name), updatedAt: now };
    }
    if (status === 'Cancelled' && day && day.note === bookedNote(e.name)) {
      delete db.availability[e.date]; // free the date this enquiry was holding
    }
    e.status = status;
  }
  if (adminNote !== undefined) e.adminNote = clean(adminNote, 500);
  e.updatedAt = now;
  save(db);
  res.json(e);
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = load().enquiries;
  const cols = ['id', 'createdAt', 'status', 'name', 'phone', 'email', 'eventType', 'date', 'guests', 'package', 'budget', 'requirements', 'adminNote'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="enquiries.csv"');
  res.send(csv);
});

// ---------- admin: hall availability ----------
app.get('/api/admin/availability', requireAdmin, (req, res) => {
  res.json(load().availability);
});

// Body: { dates: ["2026-12-05", ...], status: "available" | "booked" | "blocked", note: "optional" }
app.put('/api/admin/availability', requireAdmin, (req, res) => {
  const { dates, status, note } = req.body || {};
  if (!Array.isArray(dates) || dates.length === 0 || dates.length > 400 || !dates.every(isDate)) {
    return res.status(400).json({ error: 'Choose a valid date range.' });
  }
  if (!DAY_STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be available, booked or blocked.' });
  const db = load();
  const now = new Date().toISOString();
  for (const d of dates) {
    if (status === 'available') delete db.availability[d];
    else db.availability[d] = { status, note: clean(note, 200), updatedAt: now };
  }
  save(db);
  res.json({ ok: true, updated: dates.length });
});

// ---------- admin: website content ----------
app.get('/api/admin/content', requireAdmin, (req, res) => res.json(load().content));

app.put('/api/admin/content/:key', requireAdmin, (req, res) => {
  const key = req.params.key;
  if (!CONTENT_KEYS.includes(key)) return res.status(404).json({ error: 'Unknown section.' });
  const value = req.body?.value;
  const wantArray = ['facilities', 'events', 'gallery', 'packages', 'reviews'].includes(key);
  const wantString = key === 'tagline';
  if (wantString && typeof value !== 'string') return res.status(400).json({ error: 'Expected text.' });
  if (wantArray && !Array.isArray(value)) return res.status(400).json({ error: 'Expected a list.' });
  if (!wantArray && !wantString && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return res.status(400).json({ error: 'Expected an object.' });
  }
  const db = load();
  db.content[key] = wantString ? clean(value, 200) : value;
  save(db);
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log('Vaishnavi Banquet site running at http://localhost:' + PORT);
  console.log('Admin panel: http://localhost:' + PORT + '/admin.html');
});
