const fs = require("fs");
const path = require("path");
const { slugify, toMarkdown } = require("../lib/recipes");

const appRecipes = path.join(__dirname, "..", "recipes");
const archive = path.join(
  "C:\\Users\\ashyg\\Desktop\\Personal Workflow Projects\\RecipeScanner\\simplified"
);
const starters = [
  "garlic-butter-shrimp.md",
  "shrimp-tomato-omelette.md",
  "tomato-egg-scramble.md",
  "roast-chicken-thighs.md",
];

const recipes = [
  ...JSON.parse(fs.readFileSync(path.join(__dirname, "simplified-a.json"), "utf8")),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, "simplified-b.json"), "utf8")),
];

fs.mkdirSync(archive, { recursive: true });
fs.mkdirSync(appRecipes, { recursive: true });
for (const name of starters) {
  const file = path.join(appRecipes, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

const used = new Set();
for (const recipe of recipes) {
  const slug = slugify(recipe.title);
  if (used.has(slug)) throw new Error(`Duplicate slug: ${slug}`);
  used.add(slug);
  const markdown = toMarkdown({ ...recipe, from: "We Fancy" });
  const file = `${slug}.md`;
  const text = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  fs.writeFileSync(path.join(archive, file), text);
  fs.writeFileSync(path.join(appRecipes, file), text);
}

const appCount = fs.readdirSync(appRecipes).filter((name) => name.endsWith(".md")).length;
const archiveCount = fs.readdirSync(archive).filter((name) => name.endsWith(".md")).length;
if (recipes.length !== 44 || appCount < 44 || archiveCount !== 44) {
  throw new Error(`Expected 44 recipes. Wrote ${recipes.length}, app ${appCount}, archive ${archiveCount}.`);
}
console.log(`Wrote ${recipes.length} simplified recipes.`);
