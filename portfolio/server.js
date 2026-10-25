const express = require("express"), multer = require("multer"), crypto = require("crypto");
const fs = require("fs"), path = require("path");

const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET || PASS || "change-me";
const DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UP = path.join(DIR, "uploads"), FILE = path.join(DIR, "data.json");
fs.mkdirSync(UP, { recursive: true });
if (!PASS) console.warn("ADMIN_PASSWORD is not set: admin login is disabled.");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// ---- auth: signed, expiring cookie ----
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(p => p[0]));
const isOwner = req => {
  const [exp, sig] = (cookies(req).sid || "").split(".");
  return !!(exp && sig && Number(exp) > Date.now() && eq(sig, sign(exp)));
};
const needOwner = (req, res, next) => isOwner(req) ? next() : res.status(401).json({ error: "owner only" });

const tries = new Map();
app.post("/api/login", (req, res) => {
  const ip = req.ip, t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 10) return res.status(429).json({ error: "too many attempts" });
  tries.set(ip, { ...t, n: t.n + 1 });
  const given = crypto.createHash("sha256").update(String((req.body || {}).password || "")).digest("hex");
  const real = crypto.createHash("sha256").update(String(PASS || "\0no-pass")).digest("hex");
  if (!PASS || !eq(given, real)) return res.status(401).json({ error: "wrong password" });
  const exp = String(Date.now() + 7 * 864e5);
  res.setHeader("Set-Cookie", `sid=${exp}.${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${req.secure ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ owner: isOwner(req) }));

// ---- content ----
const STR = ["name", "tagline", "about", "email", "github", "linkedin", "photo"];
const LIST = ["skills", "learnt", "learning", "will", "gallery"];
const readData = () => {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return JSON.parse(fs.readFileSync(path.join(__dirname, "default-data.json"), "utf8")); }
};
app.get("/api/data", (req, res) => res.json(readData()));
app.put("/api/data", needOwner, (req, res) => {
  const b = req.body || {}, out = {};
  STR.forEach(k => out[k] = String(b[k] ?? "").slice(0, 5000));
  LIST.forEach(k => out[k] = (Array.isArray(b[k]) ? b[k] : []).slice(0, 200).map(x => String(x).slice(0, 500)));
  out.projects = (Array.isArray(b.projects) ? b.projects : []).slice(0, 100).map(p => ({
    title: String(p.title || "").slice(0, 200), desc: String(p.desc || "").slice(0, 2000),
    tags: (Array.isArray(p.tags) ? p.tags : []).slice(0, 20).map(t => String(t).slice(0, 40)),
    link: String(p.link || "").slice(0, 500), img: String(p.img || "").slice(0, 500) }));
  out.resume = b.resume && b.resume.url ? { url: String(b.resume.url).slice(0, 500), name: String(b.resume.name || "resume.pdf").slice(0, 200) } : null;
  fs.writeFileSync(FILE, JSON.stringify(out));
  res.json({ ok: true });
});

// ---- uploads (images + PDF only) ----
const OK = { ".jpg": 1, ".jpeg": 1, ".png": 1, ".gif": 1, ".webp": 1, ".pdf": 1 };
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: UP,
    filename: (req, f, cb) => cb(null, crypto.randomBytes(12).toString("hex") + path.extname(f.originalname).toLowerCase())
  }),
  fileFilter: (req, f, cb) => cb(null, !!OK[path.extname(f.originalname).toLowerCase()] && /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(f.mimetype))
});
app.post("/api/upload", needOwner, upload.single("file"), (req, res) =>
  req.file ? res.json({ url: "/uploads/" + req.file.filename }) : res.status(400).json({ error: "images or PDF up to 10 MB only" }));
app.use("/uploads", express.static(UP, { setHeaders: r => r.setHeader("X-Content-Type-Options", "nosniff") }));

app.use(express.static(path.join(__dirname, "public")));
app.use((err, req, res, next) => res.status(400).json({ error: err.message }));
app.listen(PORT, () => console.log("Portfolio running on port " + PORT));
