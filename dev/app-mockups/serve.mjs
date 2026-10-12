// Serves the mockups at http://localhost:5178 (trailers need http, not file://). Ctrl+C to stop.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const icons = resolve(root, "../../icons");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

createServer((request, response) => {
  const path = decodeURIComponent(request.url.split("?")[0]);
  const base = path.startsWith("/icons/") ? icons : root;
  const file = join(base, path === "/" ? "prism.html" : path.replace(/^\/icons/, ""));
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    return response.end();
  }
  response.writeHead(200, { "content-type": `${types[extname(file)] || "application/octet-stream"}; charset=utf-8` });
  createReadStream(file).pipe(response);
}).listen(5178, () => console.log("Mockups at http://localhost:5178"));
