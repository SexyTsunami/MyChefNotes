const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { handle } = require("./lib/api");
const { usingSupabase, RECIPES } = require("./lib/store");

loadEnv();

const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 8787;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
  });
  res.end(payload);
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.resolve(PUBLIC, `.${decodeURIComponent(requested)}`);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    send(res, 403, "Not allowed");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, "Not found");
    return;
  }
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handle(req, res);
      return;
    }
    if (req.method === "GET") return serveStatic(res, url.pathname);
    send(res, 405, "Not allowed");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, "Something went wrong.");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other MyChefNotes window, or set PORT to a free port.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("MyChefNotes");
  console.log(`On this computer:  http://localhost:${PORT}`);
  if (usingSupabase()) console.log("Recipes:            Supabase");
  else console.log(`Recipes:            ${RECIPES}`);
  console.log("");
});
