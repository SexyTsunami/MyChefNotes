const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((file) => file && fs.existsSync(file));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isChallenge(html) {
  const title = (String(html || "").match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  return /just a moment|performing security verification|verify you are not a bot/i.test(title);
}

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

async function debuggingPort(profile) {
  const file = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (fs.existsSync(file)) {
      const port = fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
      if (port) return port;
    }
    await sleep(250);
  }
  throw new Error("The browser did not open.");
}

async function pageSocket(port, pageUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl && (!pageUrl || String(item.url || "").includes(new URL(pageUrl).hostname)));
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // The browser is still starting.
    }
    await sleep(250);
  }
  throw new Error("The browser did not open the recipe page.");
}

function connect(socketUrl) {
  const ws = new WebSocket(socketUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, (message) => {
      if (message.error) reject(new Error("The browser could not read that page."));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  return { ws, ready, send };
}

async function readHtml(send) {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const title = document.title || "";
      const preview = document.body ? document.body.innerText.slice(0, 400) : "";
      const html = document.documentElement ? document.documentElement.outerHTML : "";
      if (html.length < 1000) return "";
      if (/just a moment|performing security verification|verify you are not a bot/i.test(title + " " + preview)) return "";
      return html;
    })()`,
    returnByValue: true,
  });
  if (result.exceptionDetails) return "";
  return String(result.result && result.result.value || "");
}

async function fetchPageInBrowser(pageUrl, timeoutMs) {
  if (!CHROME) return null;
  const profile = path.join(os.tmpdir(), "mychefnotes-import");
  fs.mkdirSync(profile, { recursive: true });
  fs.rmSync(path.join(profile, "DevToolsActivePort"), { force: true });
  const chrome = spawn(CHROME, [
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    pageUrl,
  ], { stdio: "ignore" });
  const deadline = Date.now() + (timeoutMs || 75000);
  let socket;
  try {
    const port = await debuggingPort(profile);
    socket = connect(await pageSocket(port, pageUrl));
    await socket.ready;
    while (Date.now() < deadline) {
      try {
        const html = await readHtml(socket.send);
        if (html && !isChallenge(html)) return { html, url: pageUrl };
      } catch {
        // The page is still loading.
      }
      await sleep(1000);
    }
    const error = new Error("That site asked for a check in the browser window. Finish the check, then try the link again.");
    error.status = 502;
    throw error;
  } finally {
    if (socket) socket.ws.close();
    killTree(chrome);
  }
}

module.exports = { isChallenge, fetchPageInBrowser };
