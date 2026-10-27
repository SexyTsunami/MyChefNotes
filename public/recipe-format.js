// Shared by the server and the browser. Markdown in, recipe out.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RecipeFormat = api;
})(typeof self !== "undefined" ? self : this, function () {
  const STOP = new Set([
    "a", "an", "the", "and", "or", "of", "to", "for", "with", "without", "on", "in", "at", "into", "plus",
    "cup", "cups", "tbsp", "tbsps", "tablespoon", "tablespoons", "tsp", "tsps", "teaspoon", "teaspoons",
    "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "g", "gram", "grams", "kg", "ml", "l",
    "liter", "liters", "litre", "litres", "pint", "pints", "quart", "quarts", "gallon", "gallons",
    "can", "cans", "package", "packages", "pkg", "box", "boxes", "bag", "bags", "jar", "jars",
    "clove", "cloves", "slice", "slices", "piece", "pieces", "head", "heads", "bunch", "bunches",
    "sprig", "sprigs", "stick", "sticks", "pinch", "pinches", "dash", "dashes", "handful", "handfuls",
    "scoop", "scoops", "inch", "inches", "cm", "mm", "wedge", "wedges", "strip", "strips",
    "large", "small", "medium", "extra", "virgin", "fresh", "dried", "ground", "whole", "raw",
    "diced", "minced", "chopped", "sliced", "peeled", "deveined", "optional", "divided",
    "softened", "melted", "beaten", "shredded", "grated", "crushed", "drained", "rinsed",
    "thinly", "finely", "roughly", "taste", "room", "temperature", "unsalted", "salted",
    "boneless", "skinless", "cooked", "uncooked", "about", "approx", "approximately",
  ]);

  const ALIASES = {
    prawn: "shrimp",
    scallion: "green onion",
    coriander: "cilantro",
    chile: "chili",
    chilli: "chili",
    capsicum: "bell pepper",
    aubergine: "eggplant",
    courgette: "zucchini",
    garbanzo: "chickpea",
    yam: "sweet potato",
    mayo: "mayonnaise",
    soya: "soy",
  };

  const IRREGULAR = {
    chilies: "chili",
    chillies: "chili",
    leaves: "leaf",
    halves: "half",
    loaves: "loaf",
    potatoes: "potato",
    tomatoes: "tomato",
  };

  function fold(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function singular(word) {
    if (IRREGULAR[word]) return IRREGULAR[word];
    if (/(ss|us|is|ous)$/.test(word)) return word;
    if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
    if (word.endsWith("es") && word.length > 4) {
      const stem = word.slice(0, -2);
      if (/(?:s|x|z|ch|sh|o)$/.test(stem)) return stem;
    }
    if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
    return word;
  }

function canonWord(word) {
  if (STOP.has(word)) return [];
  const aliased = ALIASES[word] || word;
  const one = ALIASES[singular(aliased)] || singular(aliased);
  if (STOP.has(one)) return [];
  return one.split(" ").filter((part) => part && !STOP.has(part));
}

  function normalizeIngredient(line) {
    let text = fold(line).replace(/\([^)]*\)/g, " ").split(",")[0];
    text = text.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, " ");
    text = text.replace(/\b\d+\s+\d+\/\d+\b/g, " ");
    text = text.replace(/\b\d+\/\d+\b/g, " ");
    text = text.replace(/\b\d+(?:\.\d+)?\b/g, " ");
    const words = text
      .split(/[^a-z]+/)
      .filter(Boolean)
      .flatMap(canonWord)
      .filter((word) => word && !STOP.has(word));
    return { raw: String(line || "").trim(), phrase: words.join(" "), words };
  }

  function parseFridge(input) {
    return String(input || "")
      .split(/,|\band\b/i)
      .map((part) => normalizeIngredient(part))
      .filter((item) => item.words.length);
  }

  function ingredientMatches(parsed, query) {
    if (query.words.length > 1) return parsed.phrase.includes(query.phrase);
    return parsed.words.some((word) => word === query.words[0]);
  }

  function scoreRecipe(recipe, queries) {
    const parsed = recipe.parsedIngredients || recipe.ingredients.map(normalizeIngredient);
    return queries.reduce((score, query) => {
      return score + (parsed.some((item) => ingredientMatches(item, query)) ? 1 : 0);
    }, 0);
  }

  function favoriteFirst(a, b) {
    return Number(Boolean(b && b.favorite)) - Number(Boolean(a && a.favorite));
  }

  function filterRecipes(recipes, query) {
    const text = fold(query && query.q).trim();
    let list = recipes.slice();
    if (text) {
      list = list.filter((recipe) => {
        const hay = fold(
          [recipe.title, recipe.time, recipe.temp, recipe.notes, ...(recipe.ingredients || []), ...(recipe.steps || [])].join("\n")
        );
        return hay.includes(text);
      });
    }
    const queries = parseFridge(query && query.fridge);
    if (!queries.length) {
      list.sort((a, b) => favoriteFirst(a, b) || a.title.localeCompare(b.title));
      return { results: list, partial: false, queries: [] };
    }
    const scored = list
      .map((recipe) => ({ recipe, score: scoreRecipe(recipe, queries) }))
      .filter((item) => item.score > 0);
    const full = scored.filter((item) => item.score === queries.length);
    const chosen = full.length ? full : scored;
    chosen.sort((a, b) => favoriteFirst(a.recipe, b.recipe) || b.score - a.score || a.recipe.ingredients.length - b.recipe.ingredients.length || a.recipe.title.localeCompare(b.recipe.title));
    return {
      results: chosen.map((item) => item.recipe),
      partial: full.length === 0 && chosen.length > 0,
      queries,
    };
  }

  function cleanInline(value) {
    return String(value || "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripBullet(line) {
    return line.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+[.)]\s+/, "");
  }

  function unquote(value) {
    let text = String(value || "").trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }
    return text.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  }

  function yamlQuote(value) {
    const text = String(value || "").replace(/\r?\n/g, " ").trim();
    if (!text) return "";
    if (/^[A-Za-z0-9][A-Za-z0-9 .%°/+-]{0,80}$/.test(text)) return text;
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  function parseMarkdown(markdown) {
    const text = String(markdown || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const meta = { time: "", temp: "", servings: "", source: "", from: "", tags: "", favorite: "" };
    let body = text;
    const front = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (front) {
      body = text.slice(front[0].length);
      for (const line of front[1].split("\n")) {
        const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
        if (!match) continue;
        const key = match[1].toLowerCase();
        if (Object.prototype.hasOwnProperty.call(meta, key)) meta[key] = unquote(match[2]);
      }
    }

    let title = "";
    let mode = "preamble";
    const ingredients = [];
    const optional = [];
    const steps = [];
    const notes = [];
    const details = [];
    const full = [];
    const original = [];
    const blocks = { notes, details, full, original };
    for (const line of body.split("\n")) {
      if (mode === "original") {
        if (!line.trim()) {
          if (original.length && original[original.length - 1] !== "") original.push("");
        } else original.push(cleanInline(line));
        continue;
      }
      const heading1 = line.match(/^#\s+(.+)$/);
      const heading2 = line.match(/^##\s+(.+)$/);
      if (heading1 && !title) {
        title = cleanInline(heading1[1]);
        continue;
      }
      if (heading2) {
        const name = heading2[1].toLowerCase();
        if (name.includes("ingredient")) mode = "ingredients";
        else if (name.includes("optional")) mode = "optional";
        else if (name === "original") mode = "original";
        else if (name.includes("detail")) mode = "details";
        else if (/\bfull\b/.test(name)) mode = "full";
        else if (/step|method|instruction|direction/.test(name)) mode = "steps";
        else if (name.includes("note")) mode = "notes";
        else mode = "other";
        continue;
      }
      if (!line.trim()) {
        const block = blocks[mode];
        if (block && block.length && block[block.length - 1] !== "") block.push("");
        continue;
      }
      if (mode === "ingredients") ingredients.push(cleanInline(stripBullet(line)));
      else if (mode === "optional") optional.push(cleanInline(stripBullet(line)));
      else if (mode === "steps") steps.push(cleanInline(stripBullet(line)));
      else if (mode === "notes" || mode === "details" || mode === "full") blocks[mode].push(cleanInline(line));
    }

    const recipe = {
      title,
      time: meta.time,
      temp: meta.temp,
      servings: meta.servings,
      source: meta.source,
      from: meta.from,
      tags: meta.tags,
      ingredients: ingredients.filter(Boolean),
      optional: optional.filter(Boolean),
      steps: steps.filter(Boolean),
      notes: notes.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      details: details.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      full: full.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      original: original.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      favorite: /^(1|true|yes)$/i.test(meta.favorite),
    };
    recipe.parsedIngredients = recipe.ingredients.concat(recipe.optional).map(normalizeIngredient);
    return recipe;
  }

  function toMarkdown(recipe) {
    const lines = ["---"];
    if (recipe.time) lines.push(`time: ${yamlQuote(recipe.time)}`);
    if (recipe.temp) lines.push(`temp: ${yamlQuote(recipe.temp)}`);
    if (recipe.servings) lines.push(`servings: ${yamlQuote(recipe.servings)}`);
    if (recipe.from) lines.push(`from: ${yamlQuote(recipe.from)}`);
    if (recipe.tags) lines.push(`tags: ${yamlQuote(recipe.tags)}`);
    if (recipe.source) lines.push(`source: ${yamlQuote(recipe.source)}`);
    if (recipe.favorite) lines.push("favorite: yes");
    lines.push("---", "", `# ${String(recipe.title || "Untitled").trim()}`, "");
    if (String(recipe.details || "").trim()) lines.push("## Details", "", String(recipe.details).trim(), "");
    lines.push("## Ingredients", "");
    for (const item of recipe.ingredients || []) {
      const text = String(item || "").trim();
      if (text) lines.push(`- ${text.replace(/^[-*]\s+/, "")}`);
    }
    if ((recipe.optional || []).some((item) => String(item || "").trim())) {
      lines.push("", "## Optional", "");
      for (const item of recipe.optional) {
        const text = String(item || "").trim();
        if (text) lines.push(`- ${text.replace(/^[-*]\s+/, "")}`);
      }
    }
    lines.push("", "## Steps", "");
    (recipe.steps || []).filter((step) => String(step || "").trim()).forEach((step, index) => {
      lines.push(`${index + 1}. ${String(step).trim().replace(/^\d+[.)]\s+/, "")}`);
    });
    if (String(recipe.full || "").trim()) lines.push("", "## Full", "", String(recipe.full).trim());
    if (String(recipe.notes || "").trim()) lines.push("", "## Notes", "", String(recipe.notes).trim());
    if (String(recipe.original || "").trim()) lines.push("", "## Original", "", String(recipe.original).trim());
    lines.push("");
    return lines.join("\n");
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function formatDuration(value) {
    if (!value) return "";
    const iso = String(value).trim().toUpperCase();
    const match = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) return String(value).replace(/\s+/g, " ").trim();
    const [, days, hours, minutes, seconds] = match;
    const parts = [];
    if (days) parts.push(`${Number(days)} day${Number(days) === 1 ? "" : "s"}`);
    if (hours) parts.push(`${Number(hours)} hr`);
    if (minutes) parts.push(`${Number(minutes)} min`);
    if (seconds && !days && !hours && !minutes) parts.push(`${Number(seconds)} sec`);
    return parts.join(" ");
  }

  function composeTime(node) {
    const prep = formatDuration(node.prepTime);
    const cook = formatDuration(node.cookTime);
    const bits = [];
    if (prep) bits.push(`prep ${prep}`);
    if (cook) bits.push(`cook ${cook}`);
    if (bits.length) return bits.join(" · ");
    return formatDuration(node.totalTime);
  }

  function findTemps(text) {
    const found = [];
    const pattern = /\b\d{2,3}\s*°\s*[FC]\b|\b\d{2,3}\s*degrees?\s*[FC]\b|\b\d{2,3}[FC]\b|\bmedium[\s-]high\b|\bmedium[\s-]low\b|\b(?:very\s+)?(?:high|medium|low)\s+heat\b/gi;
    for (const match of String(text || "").matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, " ").replace(/\s*°\s*/g, "°");
      if (!found.some((item) => item.toLowerCase() === value.toLowerCase())) found.push(value);
    }
    return found.slice(0, 3).join(" · ");
  }

  function cleanStep(value) {
    const text = stripHtml(value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (/^(advertisement|advertisement\s*advertisement|watch|video|print|jump to recipe|nutrition facts)$/i.test(text)) return "";
    return text.replace(/^\d+[.)]\s+/, "");
  }

  function splitSteps(value) {
    const cleaned = stripHtml(value).trim();
    if (!cleaned) return [];
    const chunks = cleaned.includes("\n")
      ? cleaned.split(/\n+/)
      : cleaned.split(/(?:^|\s)(?=\d+\.\s+)/);
    const steps = chunks.map(cleanStep).filter(Boolean);
    return steps.length ? steps : [cleanStep(cleaned)].filter(Boolean);
  }

  function flattenInstructions(node, out) {
    if (!node) return out;
    if (typeof node === "string") {
      splitSteps(node).forEach((step) => out.push(step));
      return out;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => flattenInstructions(item, out));
      return out;
    }
    if (typeof node === "object") {
      if (Array.isArray(node.itemListElement)) flattenInstructions(node.itemListElement, out);
      else if (node.text) splitSteps(node.text).forEach((step) => out.push(step));
    }
    return out;
  }

  function asText(value) {
    if (!value) return "";
    if (Array.isArray(value)) return asText(value[0]);
    if (typeof value === "object") return stripHtml(value.name || value.value || value.text || "");
    return stripHtml(value);
  }

  function cleanIngredientLine(value) {
  let text = stripHtml(value).replace(/\s+/g, " ").trim();
  text = text.replace(/,?\s*note\s*\d+/gi, "");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/\(([^()]*)\)/g, (full, inner) => {
      const aside = inner.trim();
      if (/^shrimp$/i.test(aside) || /^prawns?$/i.test(aside)) return full;
      if (/\d/.test(aside) && !/peeled|deveined|unpeeled|weight|note/i.test(aside)) return full;
      return "";
    });
  }
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[,)\s]+|[,(\s]+$/g, "")
    .trim();
}

function uniqueLines(lines) {
    const seen = new Set();
    const out = [];
    for (const line of lines) {
      const text = String(line || "").replace(/\s+/g, " ").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  function isRecipeType(type) {
    const types = Array.isArray(type) ? type : type ? [type] : [];
    return types.some((item) => String(item).toLowerCase().replace(/^https?:\/\/schema\.org\//, "") === "recipe");
  }

  function findRecipeNodes(node, out, seen) {
    if (!node || typeof node !== "object") return out;
    if (seen.has(node)) return out;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item) => findRecipeNodes(item, out, seen));
      return out;
    }
    if (isRecipeType(node["@type"])) out.push(node);
    for (const value of Object.values(node)) findRecipeNodes(value, out, seen);
    return out;
  }

  function recipeFromSchema(node, pageUrl) {
    const ingredients = uniqueLines((Array.isArray(node.recipeIngredient) ? node.recipeIngredient : []).map(asText).map(cleanIngredientLine)).slice(0, 60);
    const steps = uniqueLines(flattenInstructions(node.recipeInstructions, [])).slice(0, 40);
    const recipe = {
      title: asText(node.name).replace(/\s+recipe$/i, "").trim(),
      time: composeTime(node),
      temp: findTemps(steps.join("\n")),
      servings: asText(node.recipeYield).replace(/\s+/g, " ").trim().slice(0, 40),
      source: pageUrl || asText(node.url) || "",
      ingredients,
      steps,
      notes: "",
    };
    recipe.parsedIngredients = recipe.ingredients.map(normalizeIngredient);
    return recipe;
  }

  function extractMicrodata(html) {
    if (!/itemtype\s*=\s*["'][^"']*schema\.org\/Recipe["']/i.test(html)) return null;
    const ingredients = uniqueLines(
      [...html.matchAll(/itemprop\s*=\s*["']recipeIngredient["'][^>]*>([\s\S]*?)<\/[a-z0-9]+/gi)].map((match) => cleanIngredientLine(match[1]))
    );
    const contentIngredients = [...html.matchAll(/itemprop\s*=\s*["']recipeIngredient["'][^>]*content\s*=\s*["']([^"']+)["']/gi)].map((match) => cleanIngredientLine(match[1]));
    const merged = uniqueLines(ingredients.concat(contentIngredients));
    if (!merged.length) return null;
    const name = html.match(/itemprop\s*=\s*["']name["'][^>]*>([\s\S]*?)<\/[a-z0-9]+/i);
    const steps = uniqueLines(
      [...html.matchAll(/itemprop\s*=\s*["']recipeInstructions["'][^>]*>([\s\S]*?)<\/[a-z0-9]+/gi)].map((match) => stripHtml(match[1]))
    );
    const recipe = {
      title: name ? stripHtml(name[1]) : "",
      time: "",
      temp: findTemps(steps.join("\n")),
      servings: "",
      source: "",
      ingredients: merged.slice(0, 60),
      steps: steps.slice(0, 40),
      notes: "",
    };
    recipe.parsedIngredients = recipe.ingredients.map(normalizeIngredient);
    return recipe;
  }

  function extractRecipeFromHtml(html, pageUrl) {
    const scripts = [...String(html || "").matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const recipes = [];
    for (const script of scripts) {
      try {
        findRecipeNodes(JSON.parse(script[1].trim()), recipes, new Set());
      } catch {
        // Some pages ship broken JSON-LD. Skip that block and keep looking.
      }
    }
    const schema = recipes.map((node) => recipeFromSchema(node, pageUrl)).find((recipe) => recipe.ingredients.length);
    if (schema && schema.title) return schema;
    const micro = extractMicrodata(html);
    if (micro) {
      micro.source = pageUrl || "";
      if (!micro.title && schema) micro.title = schema.title;
      return micro;
    }
    return null;
  }

  function runTests() {
    let failed = 0;
    function check(condition, message) {
      if (!condition) {
        failed += 1;
        console.error("FAIL " + message);
      } else {
        console.log("ok " + message);
      }
    }

    const shrimp = normalizeIngredient("1 lb shrimp, peeled and deveined");
    check(shrimp.phrase === "shrimp", "shrimp phrase");
    const garlic = normalizeIngredient("3 cloves garlic, minced");
    check(garlic.words.includes("garlic") && !garlic.words.includes("clove"), "garlic without clove");
    const tomatoes = normalizeIngredient("1 cup cherry tomatoes");
    check(tomatoes.words.includes("tomato") && tomatoes.words.includes("cherry"), "cherry tomatoes -> tomato");
    const eggs = normalizeIngredient("4 large eggs");
    check(eggs.words.length === 1 && eggs.words[0] === "egg", "eggs -> egg");
    check(normalizeIngredient("1 tbsp olive oil").phrase === "olive oil", "olive oil");
    check(normalizeIngredient("3 cloves garlic, minced").phrase === "garlic", "cloves garlic -> garlic");
    check(!normalizeIngredient("1 eggplant").words.includes("egg"), "eggplant is not egg");

    const library = [
      { title: "Shrimp Tomato Omelette", ingredients: ["4 large eggs", "1 cup cherry tomatoes", "6 oz shrimp"], steps: [], parsedIngredients: null },
      { title: "Tomato Egg Scramble", ingredients: ["3 eggs", "1 large tomato"], steps: [], parsedIngredients: null },
      { title: "Garlic Butter Shrimp", ingredients: ["1 lb shrimp", "3 cloves garlic", "2 tbsp butter"], steps: [], parsedIngredients: null },
      { title: "Roast Chicken Thighs", ingredients: ["4 chicken thighs", "1 tsp salt"], steps: [], parsedIngredients: null },
    ];
    library.forEach((recipe) => {
      recipe.parsedIngredients = recipe.ingredients.map(normalizeIngredient);
    });
    const allThree = filterRecipes(library, { fridge: "tomatoes, egg, shrimp" });
    check(allThree.results.length === 1 && allThree.results[0].title.startsWith("Shrimp"), "fridge match uses all three");
    check(allThree.partial === false, "full match is not partial");
    const partial = filterRecipes(library, { fridge: "beef, shrimp" });
    check(partial.partial === true && partial.results.every((recipe) => /shrimp/i.test(recipe.ingredients.join(" "))), "partial fridge matches");
    const named = filterRecipes(library, { q: "omelette" });
    check(named.results.length === 1, "name search");
    library[3].favorite = true;
    const topped = filterRecipes(library, {});
    check(topped.results[0].title === "Roast Chicken Thighs", "favorites sort first");
    library[3].favorite = false;

    const round = parseMarkdown(toMarkdown({
      title: "Garlic Shrimp",
      time: "prep 5 min · cook 10 min",
      temp: "medium-high",
      servings: "2",
      source: "https://example.com/garlic:shrimp",
      ingredients: ["1 lb shrimp", "2 tbsp butter"],
      steps: ["Melt butter over medium-high heat for 1 minute."],
      notes: "Serve hot.",
    }));
    check(round.title === "Garlic Shrimp", "round trip title");
    check(round.time.includes("prep 5 min"), "round trip time");
    check(round.temp === "medium-high", "round trip temp");
    check(round.source === "https://example.com/garlic:shrimp", "round trip source");
    check(round.ingredients.length === 2 && round.steps.length === 1 && round.notes === "Serve hot.", "round trip body");
    check(round.favorite === false, "round trip favorite defaults off");
    const starred = parseMarkdown(toMarkdown({ title: "Starred", ingredients: ["1 egg"], steps: ["Cook."], favorite: true }));
    check(starred.favorite === true, "round trip favorite");

    const folded = parseMarkdown(toMarkdown({
      title: "A Magical Peanut Sauce",
      servings: "Serves 4",
      from: "We Fancy",
      tags: "DF, EF, GF, RSF, S30",
      details: "A good peanut sauce.\n\nThrow in fish sauce.",
      ingredients: ["1/4 cup peanut butter", "3/4 cup water"],
      optional: ["fish sauce", "peeled ginger"],
      steps: ["Blend for about 3 minutes until thick."],
      full: "Blend the sauce: blend on high for about 3 minutes.\n\nServe: drizzle it over anything.",
    }));
    check(folded.from === "We Fancy" && folded.tags.includes("GF") && folded.servings === "Serves 4", "round trip details meta");
    check(folded.details.includes("fish sauce") && folded.optional.length === 2, "round trip optional and details");
    check(folded.full.includes("drizzle") && folded.ingredients.length === 2, "round trip full instructions");
    check(folded.parsedIngredients.some((item) => item.words.includes("ginger")), "optional ingredients stay searchable");
    const sourced = parseMarkdown(toMarkdown({
      title: "Sauce",
      ingredients: ["1/4 cup peanut butter"],
      steps: ["Blend."],
      original: "From: We Fancy\n\n## Ingredients\n\n- peanut butter, 1/4 cup\n\n## Instructions\n\nBlend the sauce for 3 minutes.",
    }));
    check(sourced.ingredients.length === 1 && sourced.original.includes("## Ingredients") && sourced.original.includes("3 minutes"), "original section keeps the source recipe");

    const extracted = extractRecipeFromHtml(`
      <script type="application/ld+json">
      {"@graph":[{"@type":"Recipe","name":"Weeknight Garlic Shrimp Recipe","prepTime":"PT5M","cookTime":"PT10M","recipeYield":"2 servings",
        "recipeIngredient":["1 lb shrimp","2 tbsp butter","<b>3 cloves garlic</b>"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Melt butter over medium-high heat for 1 minute."},{"@type":"HowToStep","text":"Cook shrimp 2 minutes per side."}]}]}
      </script>`, "https://example.com/shrimp");
    check(extracted && extracted.title === "Weeknight Garlic Shrimp", "json-ld title");
    check(extracted.ingredients.length === 3 && extracted.ingredients[2] === "3 cloves garlic", "json-ld ingredients stripped");
    check(extracted.time === "prep 5 min · cook 10 min", "json-ld time");
    check(/medium-high/i.test(extracted.temp), "json-ld temperature");
    check(extracted.steps.length === 2 && extracted.servings === "2 servings", "json-ld steps and yield");
    check(cleanIngredientLine("1 (14 oz) can tomatoes") === "1 (14 oz) can tomatoes", "keep can size");
    check(cleanIngredientLine("lemon wedges to serve (optional)") === "lemon wedges to serve", "drop optional aside");
    check(
      cleanIngredientLine("500g / 1lb prawns (shrimp) (, peeled and deveined, tail on (unpeeled weight 1kg/2lb, Note 1))") === "500g / 1lb prawns (shrimp)",
      "drop nested prep notes"
    );

    if (failed) {
      console.error(failed + " failed");
      process.exit(1);
    }
    console.log("all tests passed");
  }

  if (typeof module !== "undefined" && require.main === module) runTests();

  return { parseMarkdown, toMarkdown, extractRecipeFromHtml, filterRecipes, normalizeIngredient, formatDuration };
});
