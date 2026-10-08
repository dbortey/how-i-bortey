import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import { entryRoutes } from "./routes/entries";
import { requireSession, type AppEnv } from "./middleware/auth";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.get("/me", requireSession, (c) => c.json({ userId: c.get("userId") }));
app.route("/entries", entryRoutes);

export default app;
