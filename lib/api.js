const crypto = require("crypto");
const os = require("os");
const { loadEnv, password, supabaseConfig } = require("./env");
const { fail, slugify, recipeFromBody, fetchPage, extractRecipeFromHtml, toMarkdown } = require("./recipes");
const store = require("./store");

loadEnv();

function sessionToken() {
  const secret = password();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update("chef-notes-v1").digest("hex");
}

function isAuthed(req) {
  if (!password()) return true;
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)chef_notes=([a-f0-9]+)/);
  const expected = sessionToken();
  if (!match || match[1].length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(match[1]), Buffer.from(expected));
}

function lanUrls() {
  const port = Number(process.env.PORT) || 8787;
  const urls = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

function send(res, status, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? "" : body);
  res.writeHead(status, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(payload);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value));
}

async function readBody(req) {
  if (req.body != null && req.body !== "") {
    if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8");
      return raw ? JSON.parse(raw) : {};
    }
    if (typeof req.body === "object") return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw fail(413, "That recipe is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw fail(400, "The request was not valid JSON.");
  }
}

function infoPayload() {
  const hosted = Boolean(supabaseConfig());
  return {
    storage: hosted ? "supabase" : "folder",
    auth: Boolean(password()),
    lanUrls: hosted ? [] : lanUrls(),
    recipesDir: hosted ? "" : store.RECIPES,
  };
}

async function handle(req, res, forcedPath) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = forcedPath || url.pathname;
    const method = req.method || "GET";

    if (method === "GET" && pathname === "/api/info") {
      sendJson(res, 200, infoPayload());
      return;
    }
    if (method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const given = String(body.password || "");
      const expected = password();
      if (!expected) return sendJson(res, 200, { ok: true });
      const givenBuf = Buffer.from(given);
      const expectedBuf = Buffer.from(expected);
      const match = givenBuf.length === expectedBuf.length && crypto.timingSafeEqual(givenBuf, expectedBuf);
      if (!match) return sendJson(res, 401, { error: "That password didn't match." });
      const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `chef_notes=${sessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (!isAuthed(req)) return sendJson(res, 401, { error: "Enter the password to open your recipes." });

    if (method === "GET" && pathname === "/api/recipes") {
      sendJson(res, 200, await store.listRecipes());
      return;
    }
    if (pathname.startsWith("/api/recipes/")) {
      const slug = decodeURIComponent(pathname.slice("/api/recipes/".length));
      if (method === "GET") {
        const recipe = await store.readRecipe(slug);
        if (!recipe) return sendJson(res, 404, { error: "That recipe is not saved." });
        return sendJson(res, 200, recipe);
      }
      if (method === "PUT") {
        if (!(await store.readRecipe(slug))) return sendJson(res, 404, { error: "That recipe is not saved." });
        return sendJson(res, 200, await store.writeRecipe(slug, recipeFromBody(await readBody(req))));
      }
      if (method === "DELETE") {
        const removed = await store.deleteRecipe(slug);
        if (!removed) return sendJson(res, 404, { error: "That recipe is not saved." });
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
    }
    if (method === "POST" && pathname === "/api/recipes") {
      const recipe = recipeFromBody(await readBody(req));
      const saved = await store.writeRecipe(await store.uniqueSlug(slugify(recipe.title)), recipe);
      return sendJson(res, 201, saved);
    }
    if (method === "POST" && pathname === "/api/import") {
      const body = await readBody(req);
      const page = await fetchPage(body.url);
      const extracted = extractRecipeFromHtml(page.html, page.url);
      if (!extracted || !extracted.ingredients.length) {
        throw fail(422, "That page didn't include a simple ingredient list. Paste the ingredients below.");
      }
      if (!extracted.title) extracted.title = "Imported recipe";
      extracted.source = page.url;
      extracted.markdown = toMarkdown(extracted);
      if (body.save) {
        const existing = (await store.listRecipes()).find((recipe) => recipe.source === page.url);
        if (existing) return sendJson(res, 200, { recipe: existing, existing: true });
        const saved = await store.writeRecipe(await store.uniqueSlug(slugify(extracted.title)), extracted);
        return sendJson(res, 201, { recipe: saved, existing: false });
      }
      return sendJson(res, 200, { recipe: extracted, existing: false });
    }
    sendJson(res, 405, { error: "Not allowed." });
  } catch (error) {
    const status = error.status || (error.name === "TimeoutError" || error.name === "AbortError" ? 504 : 500);
    const message = status === 504 ? "The page took too long." : error.message || "Something went wrong.";
    if (status === 500) console.error(error);
    sendJson(res, status, { error: message });
  }
}

module.exports = { handle };
