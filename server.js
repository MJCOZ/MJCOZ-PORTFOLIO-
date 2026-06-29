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

// Optional: free permanent storage — commit admin changes back to GitHub so
// they survive redeploys on the free plan. Set GITHUB_TOKEN to enable.
const GH_TOKEN  = process.env.GITHUB_TOKEN  || "";
const GH_REPO   = process.env.GITHUB_REPO   || "mjcoz/mjcoz-portfolio-";
const GH_BRANCH = process.env.GITHUB_BRANCH || "claude/brutalism-portfolio-site-a2pehk";

if (ADMIN_PASSWORD === "change-me") {
  console.warn("⚠️  ADMIN_PASSWORD is not set — using default 'change-me'. Set it in your environment!");
}
if (!GH_TOKEN) {
  console.warn("ℹ️  GITHUB_TOKEN not set — admin changes are temporary (lost on redeploy). Set it for permanent storage.");
}

/* ---------- GitHub persistence (best-effort) ---------- */
async function ghCommit(repoPath, buffer, message) {
  if (!GH_TOKEN || !GH_REPO) return;
  const api = `https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repoPath)}`;
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mutaz-portfolio"
  };
  try {
    let sha;
    const cur = await fetch(`${api}?ref=${encodeURIComponent(GH_BRANCH)}`, { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    const body = { message, content: buffer.toString("base64"), branch: GH_BRANCH };
    if (sha) body.sha = sha;
    const put = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!put.ok) console.error("GitHub commit failed:", repoPath, put.status, await put.text());
    else console.log("✓ committed to GitHub:", repoPath);
  } catch (e) {
    console.error("GitHub commit error:", repoPath, e.message);
  }
}

/* ---------- ensure content + upload dir exist (resilient) ----------
   Never crash on startup if the storage path isn't writable yet (e.g. a
   Render disk that is still attaching). The server boots and serves the
   repo content; full read/write resumes once the disk is ready. */
let DATA_READY = false;
function ensureStorage() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
    if (!fs.existsSync(CONTENT_FILE)) {
      const seed = fs.existsSync(SEED_CONTENT) ? fs.readFileSync(SEED_CONTENT, "utf8") : "{}";
      fs.writeFileSync(CONTENT_FILE, seed);
    }
    DATA_READY = true;
  } catch (e) {
    DATA_READY = false;
    console.error("⚠️  storage not writable yet (" + e.message + ") — serving repo content read-only until the disk is ready.");
  }
}
ensureStorage();

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
  destination: (req, file, cb) => {
    if (!DATA_READY) ensureStorage();                 // self-heal once disk is ready
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}
    cb(null, UPLOAD_DIR);
  },
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
    if (!err) return res.type("application/json").send(data);
    // fallback: serve the repo seed if the storage file isn't readable yet
    fs.readFile(SEED_CONTENT, "utf8", (e2, seed) => {
      if (e2) return res.status(500).json({ error: "could not read content" });
      res.type("application/json").send(seed);
    });
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
  if (!DATA_READY) ensureStorage();                   // self-heal once disk is ready
  const json = JSON.stringify(body, null, 2);
  const tmp = CONTENT_FILE + ".tmp";
  fs.writeFile(tmp, json, (err) => {
    if (err) return res.status(500).json({ error: "could not save" });
    fs.rename(tmp, CONTENT_FILE, (err2) => {
      if (err2) return res.status(500).json({ error: "could not save" });
      ghCommit("data/content.json", Buffer.from(json), "admin: update content"); // permanent (if token set)
      res.json({ ok: true });
    });
  });
});

app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const filePath = path.join(UPLOAD_DIR, req.file.filename);
  const repoPath = path.relative(ROOT, filePath).split(path.sep).join("/");
  let publicPath = "/uploads/" + req.file.filename;       // served from UPLOAD_DIR
  if (!repoPath.startsWith("..")) {                        // inside repo (assets/) → persist to GitHub
    publicPath = repoPath;                                 // e.g. "assets/<file>"
    try { ghCommit(repoPath, fs.readFileSync(filePath), "admin: upload " + req.file.filename); } catch (e) {}
  }
  res.json({ path: publicPath });
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
