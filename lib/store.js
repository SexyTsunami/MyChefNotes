const fs = require("fs");
const path = require("path");
const { supabaseConfig } = require("./env");
const { normalizeIngredient } = require("../public/recipe-format");
const { fail, recipeFromMarkdown, toMarkdown } = require("./recipes");

const RECIPES = path.join(__dirname, "..", "recipes");

function usingSupabase() {
  return Boolean(supabaseConfig());
}

function recipeFile(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) return null;
  const file = path.resolve(RECIPES, `${slug}.md`);
  const relative = path.relative(RECIPES, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function readFileRecipe(slug) {
  const file = recipeFile(slug);
  if (!file || !fs.existsSync(file)) return null;
  return recipeFromMarkdown(fs.readFileSync(file, "utf8"), slug);
}

function listFileRecipes() {
  fs.mkdirSync(RECIPES, { recursive: true });
  return fs
    .readdirSync(RECIPES)
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .map((name) => readFileRecipe(name.slice(0, -3)))
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function supabaseFetch(pathname, options = {}) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
  }
  if (!response.ok) {
    const detail = JSON.stringify(payload || {});
    if (/does not exist|schema cache|PGRST205/i.test(detail)) {
      throw fail(500, "The recipes table is not in Supabase yet. Run the SQL in supabase/recipes.sql.");
    }
    throw fail(502, (payload && (payload.message || payload.error || payload.hint)) || "Supabase could not save that recipe.");
  }
  return payload;
}

function rowToRecipe(row) {
  const recipe = recipeFromMarkdown(row.markdown || "", row.slug);
  recipe.title = row.title || recipe.title;
  recipe.time = row.time || "";
  recipe.temp = row.temp || "";
  recipe.servings = row.servings || "";
  recipe.source = row.source || "";
  recipe.ingredients = Array.isArray(row.ingredients) ? row.ingredients : recipe.ingredients;
  recipe.steps = Array.isArray(row.steps) ? row.steps : recipe.steps;
  recipe.notes = row.notes || "";
  if (!recipe.markdown) recipe.markdown = toMarkdown(recipe);
  recipe.parsedIngredients = (recipe.ingredients || []).concat(recipe.optional || []).map((line) => normalizeIngredient(line));
  return recipe;
}

function recipeToRow(slug, recipe) {
  const markdown = recipe.markdown || toMarkdown(recipe);
  return {
    slug,
    title: recipe.title,
    time: recipe.time || "",
    temp: recipe.temp || "",
    servings: recipe.servings || "",
    source: recipe.source || "",
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    notes: recipe.notes || "",
    markdown: markdown.endsWith("\n") ? markdown : `${markdown}\n`,
    updated_at: new Date().toISOString(),
  };
}

async function listRecipes() {
  if (!usingSupabase()) return listFileRecipes();
  const rows = await supabaseFetch("recipes?select=*&order=title.asc");
  return (Array.isArray(rows) ? rows : []).map(rowToRecipe);
}

async function readRecipe(slug) {
  if (!usingSupabase()) return readFileRecipe(slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) return null;
  const rows = await supabaseFetch(`recipes?slug=eq.${encodeURIComponent(slug)}&select=*`);
  const list = Array.isArray(rows) ? rows : [];
  return list[0] ? rowToRecipe(list[0]) : null;
}

async function uniqueSlug(base) {
  const stem = base || "recipe";
  const recipes = await listRecipes();
  const taken = new Set(recipes.map((recipe) => recipe.slug));
  if (!taken.has(stem)) return stem;
  let count = 2;
  while (taken.has(`${stem}-${count}`)) count += 1;
  return `${stem}-${count}`;
}

function assertRecipe(recipe) {
  if (!recipe.title) throw fail(400, "Add a title.");
  if (!recipe.ingredients.length) throw fail(400, "Add at least one ingredient.");
}

async function writeRecipe(slug, recipe) {
  assertRecipe(recipe);
  if (!usingSupabase()) {
    const file = recipeFile(slug);
    if (!file) throw fail(400, "That recipe name cannot be saved.");
    const markdown = (recipe.markdown || toMarkdown(recipe));
    fs.mkdirSync(RECIPES, { recursive: true });
    fs.writeFileSync(file, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
    return readFileRecipe(slug);
  }
  const rows = await supabaseFetch("recipes?on_conflict=slug", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: recipeToRow(slug, recipe),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw fail(502, "Supabase did not return the saved recipe.");
  return rowToRecipe(row);
}

async function deleteRecipe(slug) {
  if (!usingSupabase()) {
    const file = recipeFile(slug);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) return false;
  const existing = await readRecipe(slug);
  if (!existing) return false;
  await supabaseFetch(`recipes?slug=eq.${encodeURIComponent(slug)}`, { method: "DELETE", prefer: "return=minimal" });
  return true;
}

module.exports = {
  RECIPES,
  usingSupabase,
  listRecipes,
  readRecipe,
  writeRecipe,
  deleteRecipe,
  uniqueSlug,
};
