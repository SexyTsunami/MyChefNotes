const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../lib/env");
const { recipeFromMarkdown } = require("../lib/recipes");
const store = require("../lib/store");

loadEnv();

async function main() {
  if (!store.usingSupabase()) {
    console.log("Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run this again.");
    process.exit(1);
  }
  const existing = new Set((await store.listRecipes()).map((recipe) => recipe.slug));
  const dir = path.join(__dirname, "..", "recipes");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
  for (const file of files) {
    const slug = file.slice(0, -3);
    if (existing.has(slug)) {
      console.log(`skip ${slug}`);
      continue;
    }
    const recipe = recipeFromMarkdown(fs.readFileSync(path.join(dir, file), "utf8"), slug);
    await store.writeRecipe(slug, recipe);
    console.log(`saved ${slug}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
