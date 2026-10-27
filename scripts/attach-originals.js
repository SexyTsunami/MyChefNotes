const fs = require("fs");
const path = require("path");
const { slugify, parseMarkdown, toMarkdown } = require("../lib/recipes");

const sourceDir = "C:\\Users\\ashyg\\Desktop\\Personal Workflow Projects\\RecipeScanner\\recipes";
const destinations = [
  path.join(__dirname, "..", "recipes"),
  "C:\\Users\\ashyg\\Desktop\\Personal Workflow Projects\\RecipeScanner\\simplified",
];

function sourceText(markdown) {
  const lines = String(markdown || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/\bphoto\s*:/i.test(line));
  if (/^#\s+/.test(lines[0] || "")) lines.shift();
  return lines.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
}

const sources = fs.readdirSync(sourceDir).filter((name) => name.endsWith(".md"));
let attached = 0;
for (const name of sources) {
  const raw = fs.readFileSync(path.join(sourceDir, name), "utf8");
  const title = (raw.match(/^#\s+(.+)$/m) || [])[1];
  if (!title) throw new Error(`No title in ${name}`);
  const slug = slugify(title.replace(/\*\*/g, "").replace(/[*_`]/g, ""));
  const original = sourceText(raw);
  for (const dir of destinations) {
    const file = path.join(dir, `${slug}.md`);
    if (!fs.existsSync(file)) throw new Error(`Missing simplified file for ${name}: ${file}`);
    const recipe = parseMarkdown(fs.readFileSync(file, "utf8"));
    recipe.original = original;
    const markdown = toMarkdown(recipe);
    fs.writeFileSync(file, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }
  attached += 1;
}
console.log(`Attached original text to ${attached} recipes.`);
