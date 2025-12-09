// server.js - Final Railway Compatible Version
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();

// ----------------------
// Railway-safe Paths
// ----------------------
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const SESSION_DIR = "/app/.sessions";

// Ensure session folder
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// Ensure upload folder
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ----------------------
// Default demo users
// ----------------------
const defaultUsers = [
  { username: "captain", password: "captain123", name: "Team Captain", role: "captain" },
  { username: "elec", password: "elec123", name: "Electrical Lead", role: "electrical" },
  { username: "mech", password: "mech123", name: "Mechanical Lead", role: "mechanical" },
  { username: "driver", password: "driver123", name: "Driver", role: "driver" }
];

// ----------------------
// DB File Management
// ----------------------
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      project: { name: "Phenix Racing - EV", createdAt: new Date().toISOString() },
      entries: [],
      users: defaultUsers
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }

  try {
    const content = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "{}");

    if (!content.entries) content.entries = [];
    if (!content.users) content.users = defaultUsers;
    if (!content.project)
      content.project = { name: "Phenix Racing - EV", createdAt: new Date().toISOString() };

    fs.writeFileSync(DATA_FILE, JSON.stringify(content, null, 2));
    return content;
  } catch (err) {
    console.error("Bad data.json, rebuilding:", err);
    const init = {
      project: { name: "Phenix Racing - EV", createdAt: new Date().toISOString() },
      entries: [],
      users: defaultUsers
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

ensureDataFile();

// ----------------------
// Middleware
// ----------------------
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "frontend")));

app.use(
  session({
    store: new FileStore({
      path: SESSION_DIR,
      retries: 1,
      ttl: 86400
    }),
    secret: "phenix-racing-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: false
    }
  })
);

// ----------------------
// Multer Upload
// ----------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) =>
      cb(null, Date.now().toString(36) + "-" + file.originalname.replace(/\s+/g, "_"))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----------------------
// Auth Middleware
// ----------------------
function requireLogin(req, res, next) {
  if (!req.session?.user)
    return res.status(401).json({ ok: false, error: "not_authenticated" });
  next();
}

// ----------------------
// API Routes
// ----------------------
app.get("/api/ping", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ ok: false, error: "missing_credentials" });

  const db = readData();
  const user = db.users.find(u => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ ok: false, error: "invalid_credentials" });

  req.session.user = {
    username: user.username,
    name: user.name,
    role: user.role
  };

  res.json({ ok: true, user: req.session.user });
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Who am I
app.get("/api/whoami", (req, res) => {
  res.json({ ok: true, user: req.session.user || null });
});

// Get full state
app.get("/api/state", (_, res) => res.json(readData()));

// Create entry
app.post("/api/entry", requireLogin, (req, res) => {
  const { section, title } = req.body;
  if (!section || !title)
    return res.status(400).json({ ok: false, error: "missing_fields" });

  const db = readData();
  const entry = {
    id: Date.now(),
    section,
    title,
    description: req.body.description || "",
    assignee: req.body.assignee || req.session.user.username,
    status: req.body.status || "Pending",
    percent: Number(req.body.percent || 0),
    amount: Number(req.body.amount || 0),
    images: req.body.images || [],
    timeline: [
      { ts: new Date().toISOString(), note: `Created by ${req.session.user.username}` }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.entries.push(entry);
  writeData(db);

  res.json({ ok: true, entry });
});

// Update entry
app.put("/api/entry/:id", requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const db = readData();
  const entry = db.entries.find(e => Number(e.id) === id);

  if (!entry) return res.status(404).json({ ok: false, error: "not_found" });

  const user = req.session.user;
  if (user.role !== "captain" && user.username !== entry.assignee)
    return res.status(403).json({ ok: false, error: "forbidden" });

  Object.assign(entry, {
    section: req.body.section ?? entry.section,
    title: req.body.title ?? entry.title,
    description: req.body.description ?? entry.description,
    assignee: req.body.assignee ?? entry.assignee,
    status: req.body.status ?? entry.status,
    percent: req.body.percent ?? entry.percent,
    amount: req.body.amount ?? entry.amount
  });

  if (req.body.timelineNote) {
    entry.timeline.push({
      ts: new Date().toISOString(),
      note: `${req.body.timelineNote} (by ${user.username})`
    });
  }

  entry.updatedAt = new Date().toISOString();

  writeData(db);
  res.json({ ok: true, entry });
});

// Delete entry
app.delete("/api/entry/:id", requireLogin, (req, res) => {
  const db = readData();
  db.entries = db.entries.filter(e => Number(e.id) !== Number(req.params.id));
  writeData(db);
  res.json({ ok: true });
});

// Upload image
app.post("/api/upload", requireLogin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });
  res.json({ ok: true, url: "/uploads/" + path.basename(req.file.path) });
});

app.use("/uploads", express.static(UPLOAD_DIR));

// Export JSON
app.get("/api/export", (_, res) => res.download(DATA_FILE));

// ----------------------
// SPA Fallback (Required for Railway)
// ----------------------
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
