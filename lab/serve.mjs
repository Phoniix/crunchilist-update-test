// Local site for the lab: npm run lab, then open http://127.0.0.1:5391. Ctrl+C stops it.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT) || 5391;
// Only what the lab pages load; keys, data and the rest of the repo are never served.
const SHARED = ["lab", "app/prism.css", "fonts", "icons"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function allowed(relative) {
  const clean = relative.split(path.sep).join("/");
  if (clean.endsWith(".test.js") || clean === "lab/serve.mjs") return false;
  return SHARED.some((entry) => clean === entry || clean.startsWith(`${entry}/`));
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/") return res.writeHead(302, { location: "/lab/player/player.html" }).end();
  const file = path.resolve(ROOT, `.${decodeURIComponent(pathname)}`);
  const relative = path.relative(ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !allowed(relative)) return res.writeHead(404).end("Not found");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Crunchilist lab on http://127.0.0.1:${PORT}`));
