// Local static server. No dependencies, no caching, no directory listings.
// Run with `npm run serve` (serves the repo root) or `npm run serve -- dist`.

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = 8000;
const dir = resolve(process.argv[2] ?? ".");

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = normalize(join(dir, pathname));
  if (!file.startsWith(dir + sep) && file !== dir) {
    res.writeHead(403).end();
    return;
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(301, { location: pathname + "/" }).end();
    return;
  }

  res.writeHead(200, {
    "content-type": types[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`serving ${dir} at http://localhost:${port}/`);
});
