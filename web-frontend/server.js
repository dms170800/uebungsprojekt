import express from "express";
import Redis from "ioredis";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const redisHost = process.env.REDIS_HOST || "redis-master";
const redisPort = Number(process.env.REDIS_PORT || "6379");

const redis = new Redis(redisPort, redisHost, { lazyConnect: true });

async function ensureRedis() {
  if (redis.status === "ready") return true;
  try { await redis.connect(); await redis.ping(); return true; } catch { return false; }
}
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}

app.get("/", async (_req, res) => {
  const ok = await ensureRedis();
  if (!ok) return res.status(503).send("Redis noch nicht bereit – bitte neu laden.");

  const raw = await redis.lrange("todos", 0, -1);
  const todos = raw.map((t, idx) => ({ t, idx })).filter(x => x.t !== "__deleted__");

  const items = todos.map(x => `
    <li class="item">
      <div class="text">${esc(x.t)}</div>
      <form method="POST" action="/delete">
        <input type="hidden" name="idx" value="${x.idx}" />
        <button class="btn danger" type="submit">Delete</button>
      </form>
    </li>`).join("");

  res.send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Todo App v2</title><link rel="stylesheet" href="/style.css"/>
</head><body>
<div class="container"><div class="card">
  <div class="header">
    <div class="brand">
      <img class="logo" src="/logo.svg" alt="Logo"/>
      <div><h1 class="title">Todo App v2</h1><div class="subtitle">Docker Compose • Redis • UI mit Bildern</div></div>
    </div>
    <img class="hero" src="/hero.svg" alt="Hero"/>
  </div>

  <div class="grid">
    <div class="card">
      <form class="row" method="POST" action="/add">
        <input type="text" name="item" placeholder="Neues Todo..." required />
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div class="meta"><div>Total: <b>${todos.length}</b></div></div>
      <ul class="list">${items || `<li class="item"><div class="text">Noch keine Todos 🙂</div></li>`}</ul>
    </div>

    <div class="card">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <form method="POST" action="/seed"><button class="btn" type="submit">Seed</button></form>
        <form method="POST" action="/clear"><button class="btn danger" type="submit">Clear All</button></form>
      </div>
      <p class="small" style="margin-top:12px">URL: <b>http://localhost:3000</b></p>
    </div>
  </div>

</div></div>
</body></html>`);
});

app.post("/add", async (req, res) => {
  if (!await ensureRedis()) return res.status(503).send("Redis noch nicht bereit.");
  const item = String(req.body.item || "").trim();
  if (item) await redis.rpush("todos", item);
  res.redirect("/");
});

app.post("/delete", async (req, res) => {
  if (!await ensureRedis()) return res.status(503).send("Redis noch nicht bereit.");
  const idx = Number(req.body.idx);
  if (!Number.isFinite(idx) || idx < 0) return res.redirect("/");
  await redis.lset("todos", idx, "__deleted__");
  await redis.lrem("todos", 1, "__deleted__");
  res.redirect("/");
});

app.post("/clear", async (_req, res) => {
  if (!await ensureRedis()) return res.status(503).send("Redis noch nicht bereit.");
  await redis.del("todos");
  res.redirect("/");
});

app.post("/seed", async (_req, res) => {
  if (!await ensureRedis()) return res.status(503).send("Redis noch nicht bereit.");
  if ((await redis.llen("todos")) === 0) {
    await redis.rpush("todos","Docker läuft ✅","UI + Bilder 🎨","Buttons 🔥");
  }
  res.redirect("/");
});

const port = Number(process.env.PORT || "3000");
app.listen(port, "0.0.0.0", () => console.log(`Listening on :${port}`));
