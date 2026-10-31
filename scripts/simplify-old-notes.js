const fs = require("fs");
const path = require("path");
const { slugify, parseMarkdown, toMarkdown } = require("../lib/recipes");

const sourceDir = "C:\\Users\\ashyg\\Desktop\\Personal Workflow Projects\\RecipeScanner\\recipes";
const destinations = [
  path.join(__dirname, "..", "recipes"),
  "C:\\Users\\ashyg\\Desktop\\Personal Workflow Projects\\RecipeScanner\\simplified",
];

const shortSteps = {
  "Artichoke Pine Nut Ground Beef Thyme.md": ["Cook the onion and garlic, brown the thyme beef, then simmer with tomatoes, artichokes, basil, and toasted pine nuts. Serve on pasta."],
  "Best Chocolate Cake with Chocolate Ganache.md": ["Beat the eggs and wet ingredients, fold in the sifted dry mix, and bake at 320°F for 40–45 min. Microwave the ganache and pour it over the cooled cakes."],
  "Best Cinnamon Roll Ever.md": ["Knead the dough 5–10 min and rise 3–4 hours. Fill, cut 12 rolls, rise 30 min–1 hour, and bake at 350°F for 30–40 min."],
  "Braised Lamb Shank.md": ["Brown the shanks, soften the vegetables, then braise at 300°F for 3 hours and blend the sauce."],
  "Brussels Sprouts.md": ["Sear cut-side down, roast at 400°F about 20 min, then toss with butter, salt, and pepper."],
  "Canele.md": ["Simmer the milk, mix the batter, and chill at least 48 hours. Bake at 470°F for 16 min, then 375°F for 56 min."],
  "Carrot Cake.md": ["Mix the dry ingredients with the carrots and the wet ingredients, then bake at 325°F for 40–45 min."],
  "Catfish Stew.md": ["Start the onion and garlic in oil, lay the fish in one layer, and stew 20 min, turning halfway."],
  "Chicken Yakisoba.md": ["Cook the chicken with chili sauce, brown sugar, and soy, then the vegetables, then the noodles with soy and broth."],
  "Creamy Italian White Bean Soup.md": ["Simmer the onion, celery, beans, and broth 15 min, blend most of it, then stir in spinach and lemon."],
  "Flan.md": ["Coat the pan with dark caramel, blend the custard, and bake at 320°F in a water bath about 1 hour. Chill before serving."],
  "Golabki.md": ["Brown the beef, then simmer with cabbage, onion, garlic, and tomatoes until the cabbage is tender."],
  "Hainan Chicken and Rice.md": ["Boil the chicken 30–45 min. Soak the rice 15 min, fry the ginger and garlic, then cook the rice in half the broth. Warm the sauce and serve with cucumber and cilantro."],
  "Herbs Pork and Potatoes.md": ["Brown the garlic, shallots, and pork, reduce the wine, then simmer the vegetables in broth 45 min–1 hour."],
  "Horchata.md": ["Soak the rice 4–6 hours or overnight, blend it with cinnamon and vanilla, then mix with sugar and milk and serve cold."],
  "Japanese Cheesecake.md": ["Cook the cream cheese base, fold in stiff egg whites, and bake in a water bath at 320°F for 25 min, then 280°F for 55 min."],
  "Key Lime Pie.md": ["Bake the crust at 350°F for 12–14 min. Blend the filling with the lime gelatin, pour it in, and chill at least 3 hours."],
  "Kimchi Fried Rice with Chinese Sausage and Fried Eggs.md": ["Fry the kimchi, garlic, green onions, and sausage, then the rice with sesame oil and soy. Top with fried eggs."],
  "Macarons.md": ["Heat the whites and sugar to 160°F, beat to stiff peaks, fold in the almond mix, dry 1 hour, and bake 12–14 min at 320–325°F."],
  "Mushroom Meatloaf.md": ["Mix and bake at 350°F about 1.5 hours to 160°F, then sauté the onion and mushrooms for the sauce."],
  "Mushroom Risotto.md": ["Soften the mushrooms, toast the rice, stir in wine and then broth until al dente, and finish with butter and cheese."],
  "Palak Paneer.md": ["Blanch the spinach, sauté the aromatics, blend, then simmer with cream and paneer."],
  "Pico de Gallo.md": ["Dice, mix with lime, season, and rest at least 4 hours."],
  "Pork Laab.md": ["Marinate the pork in lime, cook it, then toss with basil and peanuts off the heat. Serve on lettuce."],
  "Pumpkin Cheesecake.md": ["Bake the crust at 300°F for 15 min. Beat the filling and bake at 350°F for 50–55 min, then chill overnight."],
  "Red Potato Salad.md": ["Boil the potatoes about 15 min, mix with the eggs and dressing, and chill about 2 hours."],
  "Soon Du Bu Jjigae.md": ["Boil the broth 30 min, brown the beef, then simmer the seafood, tofu, and eggs 10–15 min."],
  "Stewed Pork and Eggs.md": ["Marinate the pork over 1 hour, simmer it in Coco Rico about 1.5 hours, then add the eggs for 20–30 min."],
  "Tamari-Honey Baby Back Ribs.md": ["Simmer the honey-tamari sauce 5 min. Steam the ribs at 325°F for 30–45 min, then baste and bake uncovered about 30 min."],
  "Tart Shell.md": ["Mix the dough, chill at least 1 hour, then bake at 375°F for 25–30 min with weights and 5 min more until golden."],
  "Banh Tam Bi.md": ["Top the thick noodles with herbs, cucumber, coconut milk, and nuoc mam."],
  "Lemongrass Chicken.md": ["Marinate the drumsticks in nuoc mam, sugar, lemongrass, and garlic."],
  "Sesame Ginger Eggplant.md": ["Cook the eggplant, then stir in the sesame-soy mix and simmer until thick."],
  "Tamago.md": ["Cook on low-medium heat so the eggs do not brown."],
  "Eggplant Lasagna with Caramelized Onions.md": ["Mix the spinach, ricotta, Parmesan, egg, and olive oil for the filling."],
  "Low Carb Berry Muffins.md": ["Stir the dry ingredients with the oil, milk, eggs, and vanilla, fold in the berries, and bake at 350°F for 20 min."],
  "Swiss Meringue Buttercream.md": ["Beat the whites and sugar 5 min, then beat in the butter for 10 min."],
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceText(markdown) {
  const lines = String(markdown || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/\bphotos?\s*:/i.test(line));
  if (/^#\s+/.test(lines[0] || "")) lines.shift();
  return lines.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
}

function headingText(line) {
  return line.replace(/^#{1,3}\s+/, "").trim();
}

function headingKind(text) {
  if (/^(instructions|directions|method)$/i.test(text)) return "method";
  if (/instruction|direction|filling and bake/i.test(text)) return "method";
  if (/^variations$/i.test(text)) return "extra";
  if (/^ganache$/i.test(text)) return "component";
  return "ingredients";
}

function componentGroup(text) {
  return /ganache|whipped|icing|dressing|sauce|seasoning|batter|crust|filling|dough/i.test(text)
    && !/instruction|direction/i.test(text);
}

function shortGroup(label) {
  const text = String(label || "").replace(/:\s*$/, "").trim();
  if (!text || /^ingredients$/i.test(text)) return "";
  if (/^mix$/i.test(text)) return "Sauce";
  if (/boiled with the chicken/i.test(text)) return "With the chicken";
  if (/^sauce\b/i.test(text)) return "Sauce";
  if (/two options/i.test(text)) return "Bì";
  if (/coating the molds/i.test(text)) return "Mold coating";
  if (/saut[eé]ed for sauce/i.test(text)) return "Topping";
  if (/^filling for\b/i.test(text)) return "Filling";
  return text.length > 32 ? text.split(",")[0].slice(0, 32) : text;
}

function isServings(text) {
  return /^(makes|yields|serves|yield|frosts)\b/i.test(text) || /\b(pancakes|macarons|cups|people|servings)\b/i.test(text);
}

function simplify(raw, filename) {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const title = clean((lines.find((line) => /^#\s+/.test(line)) || "").replace(/^#\s+/, ""));
  if (!title) throw new Error(`No title in ${filename}`);

  const ingredients = [];
  const optional = [];
  const steps = [];
  const detailLines = [];
  const methodLines = [];
  let servings = "";
  let time = "";
  let mode = "preamble";
  let group = "";
  let orNext = false;

  function addDetail(line) {
    const text = line.trim();
    if (text) detailLines.push(text);
  }

  function addIngredient(item) {
    let text = clean(item).replace(/^[-*]\s+/, "");
    if (orNext) {
      text = `or ${text}`;
      orNext = false;
    }
    text = text.replace(/,?\s*\boptional\b/ig, "").trim();
    if (!text) return;
    const label = shortGroup(group);
    if (/^optional$/i.test(label) || /\boptional\b/i.test(item)) {
      optional.push(text);
      return;
    }
    if (label) text = `${label}: ${text}`;
    ingredients.push(text);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#\s+/.test(trimmed) || /\bphotos?\s*:/i.test(trimmed) || /^\*\*From:\*\*/i.test(trimmed)) continue;
    if (/^or$/i.test(trimmed)) {
      orNext = true;
      continue;
    }

    if (/^#{2,3}\s+/.test(trimmed)) {
      const text = headingText(trimmed);
      const kind = headingKind(text);
      if (kind === "method") {
        mode = "method";
        group = /^(instructions|directions|method)$/i.test(text) ? "" : text;
      } else if (kind === "extra") {
        mode = "extra";
        group = "";
        addDetail(text);
      } else if (kind === "component") {
        mode = "component";
        group = shortGroup(text);
      } else if (mode === "extra") {
        addDetail(text);
      } else {
        mode = mode === "method" || mode === "component" ? mode : "ingredients";
        if (mode === "method" && !componentGroup(text)) group = "";
        else group = shortGroup(text);
        if (mode !== "ingredients" && mode !== "component") addDetail(text);
      }
      continue;
    }

    const bold = trimmed.match(/^\*\*(.+)\*\*$/);
    if (bold && mode === "preamble") {
      const text = clean(bold[1]);
      if (/^from:/i.test(text)) continue;
      if (/^bake:/i.test(text)) time = text.replace(/^bake:\s*/i, "");
      else if (isServings(text)) servings = servings || text;
      else addDetail(text);
      continue;
    }

    if (mode === "preamble") {
      if (isServings(trimmed)) servings = servings || clean(trimmed);
      else addDetail(trimmed);
      continue;
    }

    if (mode === "extra") {
      addDetail(trimmed);
      continue;
    }

    if (mode === "ingredients" || mode === "component") {
      if (/^[-*]\s+/.test(trimmed)) {
        const body = clean(trimmed.replace(/^[-*]\s+/, ""));
        const note = !/\d/.test(body) && (
          /^(heat|pour|place|bake|mix|stir|whisk|let|set|cool)\b/i.test(body)
          || (/\.$/.test(body) && body.split(/\s+/).length >= 3 && !/\b(cup|tbsp|tsp|oz|lb|ml)\b/i.test(body))
        );
        if (note) addDetail(body);
        else addIngredient(trimmed);
        continue;
      }
      if (/:\s*$/.test(trimmed)) {
        group = shortGroup(trimmed);
        continue;
      }
      if (/^\\\*/.test(trimmed) || /^\*/.test(trimmed)) {
        addDetail(trimmed.replace(/^\\\*\s*/, "").replace(/^\*\s*/, ""));
        continue;
      }
      if (mode === "component" && /^\d+[.)]\s+/.test(trimmed)) {
        steps.push(clean(trimmed.replace(/^\d+[.)]\s+/, "")));
        methodLines.push(trimmed);
        continue;
      }
      if (trimmed.length < 140 && /^(cook|mix|steam|bake|serve|marinate|boil|stir|whisk|whip|heat|fry)\b/i.test(trimmed)) {
        steps.push(clean(trimmed));
        methodLines.push(trimmed);
        continue;
      }
      if (trimmed.length <= 120) {
        if (/:/.test(trimmed)) group = "";
        addIngredient(trimmed);
      } else addDetail(trimmed);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) && componentGroup(group)) {
      addIngredient(trimmed);
      continue;
    }
    if (/^\\\*/.test(trimmed) || (/^\*/.test(trimmed) && !/^[-*]\s+/.test(trimmed))) {
      addDetail(trimmed.replace(/^\\\*\s*/, "").replace(/^\*\s*/, ""));
      continue;
    }
    if (/^a crossed-out\b/i.test(trimmed) || /^if storing\b/i.test(trimmed)) {
      addDetail(trimmed);
      continue;
    }
    const step = clean(trimmed.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""));
    if (step) {
      steps.push(step);
      methodLines.push(trimmed);
    }
  }

  let chosen = shortSteps[filename];
  let usedShort = Boolean(chosen);
  if (!chosen) {
    const long = steps.length > 3 || steps.some((step) => step.length > 180);
    if (!long) chosen = steps;
    else {
      usedShort = true;
      const sentence = steps.join(" ");
      chosen = [sentence.length > 340 ? `${sentence.slice(0, 320).replace(/\s+\S*$/, "")}.` : sentence];
    }
  }
  const recipe = {
    title,
    from: "Old Notes",
    servings,
    time,
    details: detailLines.filter((line) => !/^\*\*From:\*\*/i.test(line)).join("\n").trim(),
    ingredients,
    optional,
    steps: chosen.length ? chosen : steps.slice(0, 3),
    full: usedShort ? methodLines.join("\n").trim() : "",
    original: sourceText(raw),
  };
  return recipe;
}

const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith(".md")).sort();
let written = 0;
for (const name of files) {
  const raw = fs.readFileSync(path.join(sourceDir, name), "utf8");
  if (/\*\*From:\*\*\s*We Fancy/.test(raw)) continue;
  const recipe = simplify(raw, name);
  if (!recipe.ingredients.length) throw new Error(`No ingredients in ${name}`);
  const markdown = toMarkdown(recipe);
  const parsed = parseMarkdown(markdown);
  if (parsed.from !== "Old Notes") throw new Error(`From was dropped for ${name}`);
  if (parsed.ingredients.length !== recipe.ingredients.length) throw new Error(`Ingredients changed for ${name}`);
  if (/photo\s*:/i.test(parsed.original || "")) throw new Error(`Photo kept for ${name}`);
  if (!String(parsed.original || "").includes("Old Notes")) throw new Error(`Original dropped for ${name}`);
  const slug = slugify(recipe.title);
  for (const dir of destinations) {
    const file = path.join(dir, `${slug}.md`);
    if (fs.existsSync(file) && /from:\s*We Fancy/.test(fs.readFileSync(file, "utf8"))) {
      throw new Error(`Refusing to overwrite ${file}`);
    }
    fs.writeFileSync(file, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }
  written += 1;
  console.log(`${slug} | ${recipe.ingredients.length} ingredients | ${recipe.steps.length} steps | ${recipe.steps[0] || "(no method)"}`);
}
console.log(`Wrote ${written} recipes.`);
