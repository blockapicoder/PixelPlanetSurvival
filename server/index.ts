import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);
const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "sphere-shoot" });
});

if (isProduction) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Sphere Shoot running on http://localhost:${port}`);
});
