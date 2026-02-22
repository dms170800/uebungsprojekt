import express from "express";
import Redis from "ioredis";

const app = express();
app.use(express.urlencoded({ extended: true }));

const redisHost = process.env.REDIS_HOST || "redis-master";
const redisPort = Number(process.env.REDIS_PORT || "6379");

const redis = new Redis(redisPort, redisHost, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

async function ensureRedis() {
  if (redis.status === "ready") return true;
  try {
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

app.get("/", async (_req, res) => {
  const ok = await ensureRedis();
  if (!ok) {
    res.status(503).send(`
      <html><body>
        <h1>Todo App v2 (Docker Compose)</h1>
        <p>Redis ist noch nicht bereit. Bitte Seite in 5 Sekunden neu laden.</p>
      </body></html>
    `);
    return;
  }

  const todos = await redis.lrange("todos", 0, -1);
  const items = todos.map(t => `<li>${t}</li>`).join("");

  res.send(`
    <html><body>
      <h1>Todo App v2 (Docker Compose)</h1>
      <form method="POST" action="/add">
        <input name="item" placeholder="Neues Todo" required />
        <button type="submit">Hinzufügen</button>
      </form>
      <ul>${items}</ul>
    </body></html>
  `);
});

app.post("/add", async (req, res) => {
  const ok = await ensureRedis();
  if (!ok) return res.status(503).send("Redis noch nicht bereit – bitte neu versuchen.");

  const item = String(req.body.item || "").trim();
  if (item) await redis.rpush("todos", item);
  res.redirect("/");
});

const port = Number(process.env.PORT || "3000");
app.listen(port, "0.0.0.0", () =>
  console.log(`Listening on :${port} (redis: ${redisHost}:${redisPort})`)
);
