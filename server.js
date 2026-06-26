/* =========================================================
   MJ COZ / Mutaz Portfolio — server
   Serves the static site + a small content API + admin panel.
   ========================================================= */
"use strict";

const express = require("express");
const multer  = require("multer");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ---------- config / paths ---------- */
const ROOT         = __dirname;
const SEED_CONTENT = path.join(ROOT, "data", "content.json");
// CONTENT_FILE / UPLOAD_DIR can point at a Render persistent disk (e.g. /var/data)
const CONTENT_FILE = process.env.CONTENT_FILE || SEED_CONTENT;
const UPLOAD_DIR   = process.env.UPLOAD_DIR   || path.join(ROOT, "assets");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const ADMIN_SECRET   = process.env.ADMIN_SECRET   || crypto.randomBytes(24).toString("hex");
const TOKEN_TTL_MS   = 1000 * 60 * 60 * 12; // 12h

if (ADMIN_PASSWORD === "change-me") {
  console.warn("⚠️  ADMIN_PASSWORD is not set — using default 'change-me'. Set it in your environment!");
}

/* ---------- ensure content + upload dir exist ---------- */
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
if (!fs.existsSync(CONTENT_FILE)) {
  // seed from the repo copy on first run (e.g. fresh persistent disk)
  const seed = fs.existsSync(SEED_CONTENT) ? fs.readFileSync(SEED_CONTENT, "utf8") : "{}";
  fs.writeFileSync(CONTENT_FILE, seed);
}

/* ---------- auth (stateless HMAC token) ---------- */
function makeToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}
function validToken(token) {
  if (!token || token.indexOf(".") < 0) return false;
  const [exp, sig] = token.split(".");
  if (Number(exp) < Date.now()) return false;
  const good = crypto.createHmac("sha256", ADMIN_SECRET).update(String(exp)).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)); }
  catch (e) { return false; }
}
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!validToken(token)) return res.status(401).json({ error: "unauthorized" });
  next();
}

/* ---------- middleware ---------- */
app.use(express.json({ limit: "2mb" }));

/* ---------- uploads (multer) ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
    cb(null, `${Date.now()}-${safe || "image"}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("only image files are allowed"));
  }
});

/* ---------- API ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/content", (req, res) => {
  fs.readFile(CONTENT_FILE, "utf8", (err, data) => {
    if (err) return res.status(500).json({ error: "could not read content" });
    res.type("application/json").send(data);
  });
});

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length === 0)
    return res.status(400).json({ error: "password required" });
  const ok = password.length === ADMIN_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
  if (!ok) return res.status(401).json({ error: "wrong password" });
  res.json({ token: makeToken() });
});

app.put("/api/content", requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return res.status(400).json({ error: "invalid content" });
  const tmp = CONTENT_FILE + ".tmp";
  fs.writeFile(tmp, JSON.stringify(body, null, 2), (err) => {
    if (err) return res.status(500).json({ error: "could not save" });
    fs.rename(tmp, CONTENT_FILE, (err2) => {
      if (err2) return res.status(500).json({ error: "could not save" });
      res.json({ ok: true });
    });
  });
});

app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ path: "/uploads/" + req.file.filename });
});

/* ---------- static ---------- */
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(ROOT, { extensions: ["html"] }));

app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin", "index.html")));

/* error handler (e.g. multer size/type) */
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || "error" });
});

app.listen(PORT, () => console.log(`▶  Portfolio running on http://localhost:${PORT}  (admin at /admin)`));
