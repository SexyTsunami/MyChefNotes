const dns = require("dns").promises;
const { parseMarkdown, toMarkdown, extractRecipeFromHtml } = require("../public/recipe-format");
const { isChallenge, fetchPageInBrowser } = require("./browser-page");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function slugify(title) {
  const slug = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "recipe";
}

function linesOf(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return source.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 80);
}

function cleanSource(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function recipeFromBody(body) {
  if (body && typeof body.markdown === "string") {
    const parsed = parseMarkdown(body.markdown);
    parsed.markdown = body.markdown.replace(/\r\n/g, "\n");
    parsed.source = cleanSource(parsed.source);
    return parsed;
  }
  const recipe = {
    title: String((body && body.title) || "").trim(),
    time: String((body && body.time) || "").trim(),
    temp: String((body && body.temp) || "").trim(),
    servings: String((body && body.servings) || "").trim(),
    source: cleanSource(body && body.source),
    from: String((body && body.from) || "").trim(),
    tags: String((body && body.tags) || "").trim(),
    ingredients: linesOf(body && body.ingredients),
    optional: linesOf(body && body.optional),
    steps: linesOf(body && body.steps),
    notes: String((body && body.notes) || "").trim(),
    details: String((body && body.details) || "").trim(),
    full: String((body && body.full) || "").trim(),
    original: String((body && body.original) || "").trim(),
    favorite: body && (body.favorite === true || /^(1|true|yes)$/i.test(String(body.favorite || ""))),
  };
  recipe.markdown = toMarkdown(recipe);
  return recipe;
}

function recipeFromMarkdown(markdown, slug) {
  const recipe = parseMarkdown(markdown);
  recipe.markdown = String(markdown || "").replace(/\r\n/g, "\n");
  recipe.slug = slug || "";
  if (!recipe.title && slug) recipe.title = slug.replace(/-/g, " ");
  return recipe;
}

function isPrivateIp(ip) {
  const value = String(ip || "").toLowerCase().replace(/^::ffff:/, "");
  if (!value || value === "::1" || value === "0.0.0.0") return true;
  if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true;
  return false;
}

function netIsIp(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

async function assertPublicUrl(url) {
  if (url.username || url.password) throw fail(400, "That address can't be opened.");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw fail(400, "Paste a link that starts with http:// or https://.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw fail(400, "That address can't be opened.");
  }
  if (netIsIp(host)) {
    if (isPrivateIp(host)) throw fail(400, "That address can't be opened.");
    return;
  }
  const lookedUp = await dns.lookup(host, { all: true, verbatim: true });
  if (!lookedUp.length || lookedUp.some((entry) => isPrivateIp(entry.address))) {
    throw fail(400, "That address can't be opened.");
  }
}

async function fetchPageDirect(input) {
  let current;
  try {
    current = new URL(input);
  } catch {
    throw fail(400, "Paste a full recipe link.");
  }
  for (let hop = 0; hop < 5; hop += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(12000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw fail(502, "The page redirected somewhere unusable.");
      current = new URL(location, current);
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw fail(502, "That site blocked the copy. Paste the ingredient lines below.");
    }
    if (!response.ok) throw fail(502, "The page returned an error.");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_000_000) throw fail(502, "That page is too large to read.");
    const html = Buffer.from(await response.arrayBuffer());
    if (html.length > 2_000_000) throw fail(502, "That page is too large to read.");
    const text = html.toString("utf8");
    if (isChallenge(text)) throw fail(502, "That site blocked the copy. Paste the ingredient lines below.");
    return { html: text, url: current.href };
  }
  throw fail(502, "The page redirected too many times.");
}

async function fetchPage(input) {
  try {
    return await fetchPageDirect(input);
  } catch (error) {
    const blocked = error && error.status === 502 && /blocked the copy/i.test(error.message);
    if (!blocked || process.env.VERCEL) throw error;
    let browsed = null;
    try {
      browsed = await fetchPageInBrowser(String(input));
    } catch (browserError) {
      if (browserError && browserError.status) throw browserError;
      throw error;
    }
    if (!browsed || !browsed.html || isChallenge(browsed.html)) throw error;
    if (browsed.html.length > 2_000_000) throw fail(502, "That page is too large to read.");
    return browsed;
  }
}

module.exports = {
  fail,
  slugify,
  recipeFromBody,
  recipeFromMarkdown,
  fetchPage,
  extractRecipeFromHtml,
  toMarkdown,
  parseMarkdown,
};
