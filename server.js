// server.js - Fully fixed Railway-compatible version
const express = require('express');
const session = require('express-session');
const FileStore = (() => {
  try {
    // preferred: session-file-store (install: npm i session-file-store)
    const SessionFileStore = require('session-file-store')(session);
    return SessionFileStore;
  } catch (err) {
    console.warn('session-file-store not installed; falling back to MemoryStore (not ideal for production).');
    return null;
  }
})();
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();

// ----------------------
// Configurable (robust)
// ----------------------
// Use env overrides if supplied (Railway), otherwise local project folder.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// ----------------------
// Default users
// ----------------------
const defaultUsers = [
  { username: 'captain', password: 'captain123', name: 'Team Captain', role: 'captain' },
  { username: 'elec',    password: 'elec123',    name: 'Electrical Lead', role: 'electrical' },
  { username: 'mech',    password: 'mech123',    name: 'Mechanical Lead', role: 'mechanical' },
  { username: 'driver',  password: 'driver123',  name: 'Driver', role: 'driver' }
];

// ----------------------
// Helpers
// ----------------------
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      project: { name: "Phenix Racing - EV", createdAt: new Date().toISOString() },
      entries: [],
      users: defaultUsers
    };
    // ensure directory exists for file
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    } catch (e) { /* ignore */ }
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8') || "{}";
    const parsed = JSON.parse(raw);

    if (!parsed.entries) parsed.entries = [];
    if (!parsed.users) parsed.users = defaultUsers;
    if (!parsed.project)
      parsed.project = { name: "Phenix Racing - EV", createdAt: new Date().toISOString() };

    fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (err) {
    console.error("Failed to read data.json, recreating:", err);
    const initial = {
      project: { name: "Phenix Racing - EV", createdAt: new Date().toISOString() },
      entries: [],
      users: defaultUsers
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    return ensureDataFile();
  }
}

function writeData(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

ensureDataFile();

// ----------------------
// Middleware
// ----------------------
app.use(cors());
app.use(bodyParser.json({ limit: '8mb' }));

// serve frontend static files from ./frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// trust proxy so cookies behave correctly when behind Railway / proxies
app.set('trust proxy', 1);

// session store: prefer file-backed store to avoid MemoryStore warning
let sessionStore = undefined;
if (FileStore) {
  sessionStore = new FileStore({
    path: path.join(__dirname, '.sessions'),
    ttl: 24 * 60 * 60,
    retries: 1
  });
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'phenix-racing-secret-2025',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' // true on production (Railway)
    }
  })
);

// ----------------------
// Uploads (multer)
// ----------------------
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(null, Date.now().toString(36) + '-' + file.originalname.replace(/\s+/g, '_'))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----------------------
// Auth middleware
// ----------------------
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user)
    return res.status(401).json({ ok: false, error: "not_authenticated" });
  next();
}

// ----------------------
// API Routes
// ----------------------
app.get("/api/ping", (req, res) => res.json({ ok: true, t: new Date().toISOString() }));

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: "missing_credentials" });

    const db = readData();
    const user = (db.users || []).find(u => u.username === username && u.password === password);

    if (!user) return res.status(401).json({ ok: false, error: "invalid_credentials" });

    req.session.user = {
      username: user.username,
      name: user.name,
      role: user.role
    };

    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/whoami", (req, res) => {
  res.json({ ok: true, user: req.session.user || null });
});

app.get("/api/state", (req, res) => {
  res.json(readData());
});

// create
app.post("/api/entry", requireLogin, (req, res) => {
  try {
    const { section, title } = req.body;
    if (!section || !title) return res.status(400).json({ ok: false, error: "section_title_required" });

    const db = readData();
    const entry = {
      id: Date.now(),
      section,
      title,
      description: req.body.description || '',
      assignee: req.body.assignee || req.session.user.username,
      status: req.body.status || 'Pending',
      percent: Number(req.body.percent || 0),
      amount: Number(req.body.amount || 0),
      images: Array.isArray(req.body.images) ? req.body.images : [],
      timeline: [{ ts: new Date().toISOString(), note: `Created by ${req.session.user.username}` }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.entries.push(entry);
    writeData(db);

    res.json({ ok: true, entry });
  } catch (err) {
    console.error("add entry error:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// update
app.put("/api/entry/:id", requireLogin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = readData();
    const entry = (db.entries || []).find(e => Number(e.id) === id);

    if (!entry) return res.status(404).json({ ok: false, error: "not_found" });

    const user = req.session.user;
    if (!(user.role === 'captain' || user.username === entry.assignee)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    if (req.body.section !== undefined) entry.section = req.body.section;
    if (req.body.title !== undefined) entry.title = req.body.title;
    if (req.body.description !== undefined) entry.description = req.body.description;
    if (req.body.assignee !== undefined) entry.assignee = req.body.assignee;
    if (req.body.status !== undefined) entry.status = req.body.status;
    if (req.body.percent !== undefined) entry.percent = Number(req.body.percent);
    if (req.body.amount !== undefined) entry.amount = Number(req.body.amount);

    if (req.body.timelineNote) {
      entry.timeline = entry.timeline || [];
      entry.timeline.push({ ts: new Date().toISOString(), note: `${req.body.timelineNote} (by ${user.username})` });
    }

    entry.updatedAt = new Date().toISOString();
    writeData(db);

    res.json({ ok: true, entry });
  } catch (err) {
    console.error("update error:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// delete
app.delete("/api/entry/:id", requireLogin, (req, res) => {
  try {
    const user = req.session.user;
    if (user.role !== 'captain') return res.status(403).json({ ok: false, error: "forbidden" });

    const id = Number(req.params.id);
    const db = readData();
    db.entries = (db.entries || []).filter(e => Number(e.id) !== id);
    writeData(db);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// upload
app.post("/api/upload", requireLogin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });
  const url = '/uploads/' + path.basename(req.file.path);
  res.json({ ok: true, url });
});

app.use('/uploads', express.static(UPLOAD_DIR));

// export
app.get("/api/export", (req, res) => {
  res.download(DATA_FILE);
});

// ----------------------
// SPA fallback - serve index.html for all other paths
// (must be last route)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ----------------------
// Start server
// ----------------------
const PORT = Number(process.env.PORT || process.env.RAILWAY_PORT || 3000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - NODE_ENV=${process.env.NODE_ENV || 'development'}`);
});
