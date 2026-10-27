const app = document.getElementById("app");
const state = {
  recipes: [],
  info: null,
  q: sessionStorage.getItem("chef-q") || "",
  fridge: sessionStorage.getItem("chef-fridge") || "",
  quickLink: "",
  status: "",
  statusKind: "",
  editKey: null,
  draft: null,
  markdownDraft: "",
  editorMode: "fields",
  fieldsDirty: false,
  mdDirty: false,
  pendingDraft: null,
  signature: "",
};

function storageFootnote(phone) {
  if (state.info && state.info.storage === "supabase") return "Recipes are saved in Supabase.";
  return `${phone ? `Phone on this Wi-Fi: ${esc(phone)}<br>` : ""}Edits save markdown files in the recipes folder.`;
}

function savedLabel(slug) {
  if (state.info && state.info.storage === "supabase") return "Saved to Supabase";
  return `Saved recipes/${slug}.md`;
}

function showLogin(message) {
  app.innerHTML = `
    <form id="login" class="login">
      <button class="brand" type="button"><em>My</em>ChefNotes</button>
      <label class="lbl" for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" autofocus>
      <p class="status" data-kind="bad">${esc(message || "")}</p>
      <div class="form-bar"><button class="btn primary" type="submit">Open</button></div>
    </form>`;
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    showLogin("Enter the password to open your recipes.");
    const error = new Error("locked");
    error.locked = true;
    throw error;
  }
  return response;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function parseRoute() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  if (parts[0] === "recipe" && parts[1]) return { name: "recipe", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "edit" && parts[1]) return { name: "edit", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "new") return { name: "edit", slug: null };
  return { name: "home", slug: null };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function recipeBySlug(slug) {
  return state.recipes.find((recipe) => recipe.slug === slug) || null;
}

function blankDraft() {
  return {
    title: "", time: "", temp: "", servings: "", source: "", from: "", tags: "",
    ingredients: [], optional: [], steps: [], notes: "", details: "", full: "", original: "",
  };
}

function keptFields(found) {
  const source = found || {};
  return {
    from: source.from || "",
    tags: source.tags || "",
    details: source.details || "",
    optional: source.optional ? source.optional.slice() : [],
    full: source.full || "",
    original: source.original || "",
  };
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function emphasizeAmount(text) {
  return esc(text).replace(
    /^((?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s+(?:cups?|tbsps?|tbs|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|quarts?|pints?|gallons?|cans?|cloves?|sticks?)\b)?)/i,
    "<b>$1</b>"
  );
}

function emphasizeStep(text) {
  return esc(text).replace(
    /(\b\d{2,3}\s*°\s*[FC]\b|\b\d{2,3}\s*degrees?\s*[FC]\b|\b\d{2,3}[FC]\b|\bmedium[\s-]high\b|\bmedium[\s-]low\b|\b(?:high|medium|low)\s+heat\b|\b\d+\s*(?:–|-|to)\s*\d+\s*(?:min|mins|minutes|sec|secs|seconds|hr|hrs|hours)\b|\b\d+\s*(?:min|mins|minutes|sec|secs|seconds|hr|hrs|hours)\b)/gi,
    "<b>$1</b>"
  );
}

function highlight(text, terms) {
  let html = esc(text);
  const unique = [...new Set(terms.filter((term) => term && term.length > 1))];
  for (const term of unique) {
    const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    html = html.replace(pattern, "<mark>$1</mark>");
  }
  return html;
}

function termLine(recipe) {
  const words = [];
  for (const item of recipe.parsedIngredients || []) {
    if (item.phrase && !words.includes(item.phrase)) words.push(item.phrase);
  }
  return words.slice(0, 8).join(" · ");
}

function checkedSet(slug) {
  return new Set(JSON.parse(sessionStorage.getItem(`check:${slug}`) || "[]").map(String));
}

function stepIndex(slug, count) {
  const saved = Number(sessionStorage.getItem(`step:${slug}`) || 0);
  if (!Number.isFinite(saved)) return 0;
  return Math.max(0, Math.min(count - 1, saved));
}

function needsPager(steps) {
  if (steps.length > 4) return true;
  if (steps.length <= 1) return false;
  return steps.join(" ").length > 280;
}

function metaBits(recipe) {
  const bits = [];
  if (recipe.time) bits.push(["Time", recipe.time, true]);
  if (recipe.temp) bits.push(["Temp", recipe.temp, false]);
  if (recipe.servings) bits.push(["Serves", recipe.servings, false]);
  return bits;
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

function setStatus(message, kind) {
  state.status = message || "";
  state.statusKind = kind || "";
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = state.status;
  if (kind) el.dataset.kind = kind;
  else el.removeAttribute("data-kind");
}

function shell(route) {
  const show = route.name === "home" ? "list" : route.name;
  const phone = state.info && state.info.lanUrls && state.info.lanUrls[0];
  return `
    <div class="shell" data-show="${show}">
      <aside class="aside">
        <header class="bar pad">
          <button class="brand" type="button" data-action="home"><em>My</em>ChefNotes</button>
          <button class="icon-btn" type="button" data-action="create" aria-label="New recipe">+</button>
        </header>
        <div class="pad">
          <label class="lbl" for="q">Search</label>
          <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="garlic shrimp" value="${esc(state.q)}">
          <label class="lbl" for="fridge">In the fridge</label>
          <input id="fridge" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="tomatoes, egg, shrimp" value="${esc(state.fridge)}">
          <form id="quick-add">
            <label class="lbl" for="quick-link">Recipe link</label>
            <div class="inline">
              <input id="quick-link" type="url" inputmode="url" enterkeyhint="go" placeholder="https://" value="${esc(state.quickLink)}">
              <button class="btn primary" type="submit">Add</button>
            </div>
          </form>
        </div>
        <p class="count pad" id="count"></p>
        <div class="results pad" id="results"></div>
        <p class="footnote pad">${storageFootnote(phone)}</p>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
}

function paintList() {
  const count = document.getElementById("count");
  const results = document.getElementById("results");
  if (!results) return;
  const route = parseRoute();
  const filtered = RecipeFormat.filterRecipes(state.recipes, { q: state.q, fridge: state.fridge });
  const terms = state.q.trim().split(/\s+/).concat((filtered.queries || []).map((item) => item.phrase));
  if (!state.recipes.length) count.textContent = "No recipes yet";
  else if (state.fridge.trim() && filtered.partial) count.textContent = "No recipe uses all of these. Closest matches:";
  else if (state.fridge.trim()) count.textContent = `${filtered.results.length} with those ingredients`;
  else if (state.q.trim()) count.textContent = `${filtered.results.length} found`;
  else count.textContent = `${state.recipes.length} recipe${state.recipes.length === 1 ? "" : "s"}`;

  if (!filtered.results.length) {
    results.innerHTML = `<p class="empty-list">${state.recipes.length ? "Nothing matches." : "Paste a link or tap + to add the first recipe."}</p>`;
    return;
  }
  results.innerHTML = filtered.results.map((recipe) => {
    const meta = [recipe.time, recipe.temp].filter(Boolean).join(" · ");
    const active = route.slug === recipe.slug ? " active" : "";
    return `<button type="button" class="recipe-link${active}" data-action="open" data-slug="${esc(recipe.slug)}" ${active ? 'aria-current="true"' : ""}>
      <h2>${highlight(recipe.title, terms)}</h2>
      ${meta ? `<p>${esc(meta)}</p>` : ""}
      <p class="terms">${highlight(termLine(recipe), terms)}</p>
    </button>`;
  }).join("");
}

function allStepsHtml(steps) {
  if (!steps.length) return `<h2>Steps</h2><p class="step-text">No steps yet.</p>`;
  return `<h2>Steps</h2>${steps.map((step, index) => `<p class="step-line"><span>${index + 1}</span><span>${emphasizeStep(step)}</span></p>`).join("")}`;
}

function pagerHtml(recipe, index) {
  const steps = recipe.steps;
  const atStart = index <= 0;
  const atEnd = index >= steps.length - 1;
  return `
    <p class="kicker">Step ${index + 1} of ${steps.length}</p>
    <p class="step-text">${emphasizeStep(steps[index] || "")}</p>
    <div class="pager">
      <button type="button" class="btn secondary" data-action="step" data-dir="-1" ${atStart ? "disabled" : ""}>Back</button>
      <button type="button" class="btn secondary" data-action="step" data-dir="1" ${atEnd ? "disabled" : ""}>Next</button>
    </div>`;
}

function ingredientList(recipe, items, offset) {
  const checks = checkedSet(recipe.slug);
  return items.map((item, index) => {
    const key = String(offset + index);
    const on = checks.has(key);
    return `
      <button type="button" class="ing-item${on ? " done" : ""}" data-action="check" data-slug="${esc(recipe.slug)}" data-index="${key}" aria-pressed="${on ? "true" : "false"}">
        <i></i><span>${emphasizeAmount(item)}</span>
      </button>`;
  }).join("");
}

function foldButton(id, label, html, prominent) {
  if (!html) return "";
  return `
    <button type="button" class="fold${prominent ? " fold-main" : ""}" data-action="toggle" data-panel="${id}" aria-expanded="false" aria-controls="${id}">${label}</button>
    <div class="fold-panel" id="${id}" hidden>${html}</div>`;
}

function originalPanel(recipe) {
  const original = String(recipe.original || "").trim();
  if (original) return `<div class="prose">${esc(original)}</div>`;
  return detailPanel(recipe);
}

function detailPanel(recipe) {
  const from = recipe.from || (!safeUrl(recipe.source) ? recipe.source : "");
  if (!from && !recipe.details && !recipe.tags) return "";
  const lines = [];
  if (from) lines.push(`From: ${from}`);
  if (recipe.servings) lines.push(recipe.servings);
  if (recipe.tags) {
    const tags = recipe.tags.trim();
    lines.push(tags.startsWith("(") ? tags : `(${tags})`);
  }
  const head = lines.map((line) => `<p class="detail-line">${esc(line)}</p>`).join("");
  const prose = recipe.details ? `<div class="prose">${esc(recipe.details)}</div>` : "";
  return head + prose;
}

function recipeHtml(recipe) {
  const steps = recipe.steps || [];
  const compact = steps.length > 0 && steps.length <= 3 && steps.every((step) => step.length <= 180);
  const pager = !compact && needsPager(steps);
  const index = stepIndex(recipe.slug, steps.length || 1);
  const source = safeUrl(recipe.source);
  const tucked = recipe.from || recipe.details || recipe.tags;
  const meta = metaBits(recipe).filter(([label]) => !(tucked && label === "Serves"));
  const optional = recipe.optional || [];
  const stepsHtml = !steps.length ? "" : compact
    ? steps.map((step) => `<p class="step-text">${emphasizeStep(step)}</p>`).join("")
    : (pager ? pagerHtml(recipe, index) : allStepsHtml(steps));
  const more = foldButton("full-panel", "More instructions", recipe.full ? `<div class="prose">${esc(recipe.full)}</div>` : "");
  const method = `${stepsHtml}${more}`;
  return `
    <header class="bar pad">
      <button class="back" type="button" data-action="home" aria-label="Back to recipes">←</button>
      <h1 class="recipe-title">${esc(recipe.title)}</h1>
      <button class="text-btn" type="button" data-action="edit" data-slug="${esc(recipe.slug)}">Edit</button>
    </header>
    ${meta.length ? `<div class="meta pad">${meta.map(([label, value, grow]) => `<span class="${grow ? "grow" : ""}"><small>${label}</small><strong>${esc(value)}</strong></span>`).join("")}</div>` : ""}
    <div class="cook">
      <div class="ingredients pad">
        ${foldButton("details-panel", "Details", originalPanel(recipe), true)}
        ${ingredientList(recipe, recipe.ingredients || [], 0)}
        ${optional.length ? `<h2 class="opt-label">Optional</h2>${ingredientList(recipe, optional, (recipe.ingredients || []).length)}` : ""}
        ${source ? `<a class="source-line" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Original page</a>` : ""}
      </div>
      ${method.trim() ? `<div class="method pad${pager ? " is-pager" : ""}" id="method" data-slug="${esc(recipe.slug)}">${method}</div>` : ""}
    </div>`;
}

function introHtml() {
  const phone = state.info && state.info.lanUrls && state.info.lanUrls[0];
  return `
    <section class="intro pad">
      <h1>Recipes, without the scroll.</h1>
      <p>Search by name, or type what is in the fridge. A recipe that uses all of those ingredients comes up first.</p>
      <p>Paste a recipe link and MyChefNotes keeps the amounts, the time, and the temperature. The long story on the page stays behind.</p>
      <p>${state.info && state.info.storage === "supabase" ? "Saving stores the recipe in Supabase, so it is there on your phone and on this computer." : "Saving writes a markdown file in the recipes folder on this computer. You can edit that file directly, then come back here."}</p>
      ${phone ? `<p class="phone">On your phone, same Wi-Fi: ${esc(phone)}</p>` : ""}
    </section>`;
}

function field(id, label, value, extra) {
  return `<label class="lbl" for="${id}">${label}</label><input id="${id}" type="text" value="${esc(value || "")}" ${extra || ""}>`;
}

function editorHtml(route) {
  const key = route.slug || "new";
  if (state.editKey !== key || !state.draft) {
    const found = route.slug ? recipeBySlug(route.slug) : (state.pendingDraft || blankDraft());
    state.pendingDraft = null;
    if (route.slug && !found) {
      state.editKey = key;
      state.draft = null;
      return `<div class="missing pad"><p>That recipe is not in the folder.</p><button class="btn secondary" type="button" data-action="home">Back</button></div>`;
    }
    state.editKey = key;
    state.draft = {
      title: found.title || "",
      time: found.time || "",
      temp: found.temp || "",
      servings: found.servings || "",
      source: found.source || "",
      ingredients: found.ingredients ? found.ingredients.slice() : [],
      steps: found.steps ? found.steps.slice() : [],
      notes: found.notes || "",
      ...keptFields(found),
    };
    state.markdownDraft = found.markdown || RecipeFormat.toMarkdown(state.draft);
    state.fieldsDirty = !route.slug;
    state.mdDirty = false;
    state.editorMode = "fields";
  }
  const draft = state.draft;
  const file = state.info && state.info.storage === "supabase"
    ? (route.slug ? "this recipe in Supabase" : "a new recipe in Supabase")
    : (route.slug ? `recipes/${route.slug}.md` : "a new file in the recipes folder");
  const fields = state.editorMode === "fields" ? `
    ${field("title", "Title", draft.title, 'autocomplete="off"')}
    <div class="grid-3">
      <div>${field("time", "Time", draft.time, 'placeholder="12 min" autocomplete="off"')}</div>
      <div>${field("temp", "Temp", draft.temp, 'placeholder="400°F or medium" autocomplete="off"')}</div>
      <div class="span">${field("servings", "Serves", draft.servings, 'inputmode="numeric" autocomplete="off"')}</div>
    </div>
    ${field("source", "Source link", draft.source, 'inputmode="url" autocomplete="off"')}
    <label class="lbl" for="ingredients">Ingredients</label>
    <textarea id="ingredients" rows="8" placeholder="1 lb shrimp&#10;3 cloves garlic">${esc((draft.ingredients || []).join("\n"))}</textarea>
    <label class="lbl" for="steps">Steps</label>
    <textarea id="steps" rows="7" placeholder="Cook over medium-high heat for 2 minutes per side.">${esc((draft.steps || []).join("\n"))}</textarea>
    <label class="lbl" for="notes">Notes</label>
    <textarea id="notes" rows="3">${esc(draft.notes || "")}</textarea>` : `
    <label class="lbl" for="markdown">Markdown</label>
    <textarea id="markdown" class="markdown-box" spellcheck="false">${esc(state.markdownDraft)}</textarea>`;
  return `
    <div class="editor">
      <header class="bar pad">
        <button class="back" type="button" data-action="home" aria-label="Back to recipes">←</button>
        <h1 class="recipe-title">${route.slug ? "Edit recipe" : "New recipe"}</h1>
      </header>
      <div class="pad">
        <form id="import-form">
          <label class="lbl" for="import-url">Copy from a link</label>
          <div class="inline">
            <input id="import-url" type="url" inputmode="url" enterkeyhint="go" placeholder="https://" value="${esc(draft.source || "")}">
            <button class="btn secondary" type="submit">Copy</button>
          </div>
        </form>
        <p class="status" id="status" ${state.statusKind ? `data-kind="${esc(state.statusKind)}"` : ""}>${esc(state.status)}</p>
        <div class="tabs">
          <button type="button" data-action="mode" data-mode="fields" class="${state.editorMode === "fields" ? "active" : ""}">Fields</button>
          <button type="button" data-action="mode" data-mode="markdown" class="${state.editorMode === "markdown" ? "active" : ""}">Markdown</button>
        </div>
        <form id="editor" novalidate>
          ${fields}
          <p class="file-note">Saves ${esc(file)}${state.info && state.info.storage === "supabase" ? "." : " on this computer."}</p>
          <div class="form-bar"><button class="btn primary" type="submit">Save markdown</button></div>
          ${route.slug ? `<button class="link-danger" type="button" data-action="delete" data-slug="${esc(route.slug)}">Delete recipe</button>` : ""}
        </form>
      </div>
    </div>`;
}

function settleCook() {
  const cook = document.querySelector(".cook");
  if (!cook) return;
  cook.classList.remove("is-tight");
  if (cook.scrollHeight > cook.clientHeight + 2) cook.classList.add("is-tight");
}

function paintMain() {
  const main = document.getElementById("main");
  const route = parseRoute();
  if (!main) return;
  if (route.name === "home") {
    main.className = "main is-scroll";
    main.innerHTML = introHtml();
    return;
  }
  if (route.name === "recipe") {
    const recipe = recipeBySlug(route.slug);
    main.className = "main is-locked";
    main.innerHTML = recipe
      ? recipeHtml(recipe)
      : `<div class="missing pad"><p>That recipe is not in the folder.</p><button class="btn secondary" type="button" data-action="home">Back</button></div>`;
    settleCook();
    document.title = recipe ? `${recipe.title} · MyChefNotes` : "MyChefNotes";
    return;
  }
  main.className = "main is-scroll";
  main.innerHTML = editorHtml(route);
  document.title = route.slug ? "Edit recipe · MyChefNotes" : "New recipe · MyChefNotes";
}

function render() {
  const route = parseRoute();
  if (route.name !== "edit") state.editKey = null;
  app.innerHTML = shell(route);
  paintList();
  paintMain();
  if (route.name === "home") document.title = "MyChefNotes";
}

function readForm() {
  const value = (id) => (document.getElementById(id) ? document.getElementById(id).value : "");
  const lines = (id) => value(id).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    title: value("title").trim(),
    time: value("time").trim(),
    temp: value("temp").trim(),
    servings: value("servings").trim(),
    source: value("source").trim(),
    ingredients: lines("ingredients"),
    steps: lines("steps"),
    notes: value("notes").trim(),
    ...keptFields(state.draft),
  };
}

function moveStep(direction) {
  const method = document.getElementById("method");
  if (!method || !method.classList.contains("is-pager")) return;
  const recipe = recipeBySlug(method.dataset.slug);
  if (!recipe || !recipe.steps.length) return;
  const next = Math.max(0, Math.min(recipe.steps.length - 1, stepIndex(recipe.slug, recipe.steps.length) + direction));
  sessionStorage.setItem(`step:${recipe.slug}`, String(next));
  method.innerHTML = pagerHtml(recipe, next);
}

async function reloadRecipes() {
  const response = await apiFetch("/api/recipes");
  if (!response.ok) throw new Error("The recipes could not be read.");
  state.recipes = await response.json();
  state.signature = state.recipes.map((recipe) => `${recipe.slug}\n${recipe.markdown}`).join("\n---\n");
}

async function addFromLink(event) {
  event.preventDefault();
  const input = document.getElementById("quick-link");
  const url = input.value.trim();
  if (!url) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Adding";
  try {
    const response = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, save: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not read that page.");
    state.quickLink = "";
    await reloadRecipes();
    toast(data.existing ? "Already in your recipes" : savedLabel(data.recipe.slug));
    go(`#/recipe/${encodeURIComponent(data.recipe.slug)}`);
  } catch (error) {
    if (error.locked) return;
    state.pendingDraft = { ...blankDraft(), source: url };
    state.status = error.message;
    state.statusKind = "bad";
    state.editKey = null;
    state.quickLink = url;
    go("#/new");
  }
}

async function copyFromLink() {
  const url = document.getElementById("import-url").value.trim();
  if (!url) return setStatus("Paste a recipe link first.", "bad");
  if ((state.fieldsDirty || state.mdDirty) && state.draft && state.draft.title) {
    if (!confirm("Replace the open recipe with the ingredients from this link?")) return;
  }
  setStatus("Reading the page…");
  try {
    const response = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, save: false }),
    });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error || "Could not read that page.", "bad");
    const recipe = data.recipe;
    state.draft = {
      title: recipe.title || "",
      time: recipe.time || "",
      temp: recipe.temp || "",
      servings: recipe.servings || "",
      source: recipe.source || url,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      notes: recipe.notes || "",
      ...keptFields(recipe),
    };
    state.markdownDraft = RecipeFormat.toMarkdown(state.draft);
    state.fieldsDirty = true;
    state.mdDirty = false;
    state.editorMode = "fields";
    state.status = `Copied ${recipe.ingredients.length} ingredients${recipe.steps.length ? ` and ${recipe.steps.length} steps` : ""}. Save to keep them.`;
    state.statusKind = "good";
    paintMain();
    document.querySelector(".main")?.scrollTo(0, 0);
  } catch (error) {
    if (!error.locked) setStatus("Could not reach that page.", "bad");
  }
}

async function saveRecipe(event) {
  event.preventDefault();
  const route = parseRoute();
  let body;
  if (state.editorMode === "markdown" && state.mdDirty) body = { markdown: state.markdownDraft };
  else if (state.editorMode === "fields") body = readForm();
  else body = state.draft;
  const preview = body.markdown ? RecipeFormat.parseMarkdown(body.markdown) : body;
  if (!String(preview.title || "").trim()) return setStatus("Add a title.", "bad");
  const ingredients = preview.ingredients || [];
  if (!ingredients.some((item) => String(item).trim())) return setStatus("Add at least one ingredient.", "bad");
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await apiFetch(route.slug ? `/api/recipes/${encodeURIComponent(route.slug)}` : "/api/recipes", {
      method: route.slug ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error || "Could not save.", "bad");
    await reloadRecipes();
    state.editKey = null;
    state.status = "";
    toast(savedLabel(data.slug));
    go(`#/recipe/${encodeURIComponent(data.slug)}`);
  } catch (error) {
    if (!error.locked) setStatus("Could not save the recipe.", "bad");
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function deleteRecipe(slug) {
  const recipe = recipeBySlug(slug);
  if (!confirm(`Delete ${recipe ? recipe.title : "this recipe"}?`)) return;
  try {
    const response = await apiFetch(`/api/recipes/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      return setStatus(data.error || "Could not delete it.", "bad");
    }
    await reloadRecipes();
    state.editKey = null;
    toast(state.info && state.info.storage === "supabase" ? "Deleted from Supabase" : "Deleted the markdown file");
    go("#/");
  } catch (error) {
    if (!error.locked) setStatus("Could not delete it.", "bad");
  }
}

function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "home") go("#/");
  else if (action === "create") {
    state.pendingDraft = null;
    state.status = "";
    state.statusKind = "";
    state.editKey = null;
    go("#/new");
  } else if (action === "open") go(`#/recipe/${encodeURIComponent(target.dataset.slug)}`);
  else if (action === "edit") go(`#/edit/${encodeURIComponent(target.dataset.slug)}`);
  else if (action === "check") {
    const set = checkedSet(target.dataset.slug);
    const index = target.dataset.index;
    if (set.has(index)) set.delete(index);
    else set.add(index);
    sessionStorage.setItem(`check:${target.dataset.slug}`, JSON.stringify([...set]));
    target.classList.toggle("done", set.has(index));
    target.setAttribute("aria-pressed", set.has(index) ? "true" : "false");
  } else if (action === "step") moveStep(Number(target.dataset.dir));
  else if (action === "toggle") {
    const panel = document.getElementById(target.dataset.panel);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    target.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
    settleCook();
  }
  else if (action === "mode") switchMode(target.dataset.mode);
  else if (action === "delete") deleteRecipe(target.dataset.slug);
}

function switchMode(next) {
  if (!next || next === state.editorMode) return;
  if (next === "markdown") {
    if (state.editorMode === "fields" && document.getElementById("title")) state.draft = readForm();
    if (state.fieldsDirty) state.markdownDraft = RecipeFormat.toMarkdown(state.draft);
  }
  if (next === "fields" && state.mdDirty) {
    const parsed = RecipeFormat.parseMarkdown(state.markdownDraft);
    if (!parsed.title) return setStatus("The markdown needs a title line, like # Garlic Shrimp.", "bad");
    state.draft = parsed;
    state.fieldsDirty = true;
    state.status = "";
  }
  state.editorMode = next;
  paintMain();
}

function onInput(event) {
  const target = event.target;
  if (target.id === "q") {
    state.q = target.value;
    sessionStorage.setItem("chef-q", state.q);
    paintList();
    return;
  }
  if (target.id === "fridge") {
    state.fridge = target.value;
    sessionStorage.setItem("chef-fridge", state.fridge);
    paintList();
    return;
  }
  if (target.id === "quick-link") {
    state.quickLink = target.value;
    return;
  }
  if (target.id === "markdown") {
    state.markdownDraft = target.value;
    state.mdDirty = true;
    return;
  }
  if (target.closest("#editor")) {
    state.draft = readForm();
    state.fieldsDirty = true;
  }
}

function onSubmit(event) {
  if (event.target.id === "login") login(event);
  else if (event.target.id === "quick-add") addFromLink(event);
  else if (event.target.id === "import-form") {
    event.preventDefault();
    copyFromLink();
  } else if (event.target.id === "editor") saveRecipe(event);
}

let touchX = null;
app.addEventListener("click", onClick);
app.addEventListener("input", onInput);
app.addEventListener("submit", onSubmit);
app.addEventListener("touchstart", (event) => {
  if (!event.target.closest("#method")) return;
  touchX = event.changedTouches[0].clientX;
}, { passive: true });
app.addEventListener("touchend", (event) => {
  if (touchX == null || !event.target.closest("#method")) {
    touchX = null;
    return;
  }
  const delta = event.changedTouches[0].clientX - touchX;
  touchX = null;
  if (delta > 50) moveStep(-1);
  else if (delta < -50) moveStep(1);
}, { passive: true });

window.addEventListener("hashchange", render);
window.matchMedia("(min-width: 860px)").addEventListener("change", render);
window.addEventListener("focus", () => { refreshQuiet(); });

async function refreshQuiet() {
  if (document.visibilityState === "hidden" || parseRoute().name === "edit") return;
  try {
    const response = await apiFetch("/api/recipes");
    if (!response.ok) return;
    const next = await response.json();
    const signature = next.map((recipe) => `${recipe.slug}\n${recipe.markdown}`).join("\n---\n");
    if (signature === state.signature) return;
    state.recipes = next;
    state.signature = signature;
    paintList();
    if (parseRoute().name === "recipe") paintMain();
  } catch (error) {
    if (error.locked) return;
  }
}

async function login(event) {
  event.preventDefault();
  const passwordField = document.getElementById("password");
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: passwordField ? passwordField.value : "" }),
  });
  if (!response.ok) {
    showLogin("That password didn't match.");
    return;
  }
  boot();
}

async function boot() {
  try {
    const infoResponse = await fetch("/api/info");
    if (!infoResponse.ok) throw new Error("info");
    state.info = await infoResponse.json();
    const response = await apiFetch("/api/recipes");
    const recipes = await response.json();
    if (!response.ok || !Array.isArray(recipes)) throw new Error(recipes.error || "bad list");
    state.recipes = recipes;
    state.signature = recipes.map((recipe) => `${recipe.slug}\n${recipe.markdown}`).join("\n---\n");
    render();
    if (!boot.started) {
      boot.started = true;
      setInterval(refreshQuiet, 8000);
    }
  } catch (error) {
    if (error.locked) return;
    app.innerHTML = `<p class="boot-error">MyChefNotes can’t reach the recipe list. Start it locally, or check the Vercel and Supabase settings.</p>`;
  }
}

boot();
