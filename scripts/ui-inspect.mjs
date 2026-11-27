import { spawn } from "node:child_process";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9224;
const proc = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/burn-shots-profile2`,
  "--window-size=1280,800",
  "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const page = (await res.json()).find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("no cdp");
}

const ws = new WebSocket(await getWsUrl());
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((r) => { ws.onopen = r; });
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://localhost:5173" });
await new Promise((r) => setTimeout(r, 3500));
await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('.nav-item')].find(item => item.textContent.trim() === '收藏')?.click()` });
await new Promise((r) => setTimeout(r, 800));
const res = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `JSON.stringify([...document.querySelectorAll('.filters label')].map((label) => {
    const sel = label.querySelector('select');
    const lr = label.getBoundingClientRect();
    const sr = sel?.getBoundingClientRect();
    const cl = getComputedStyle(label);
    const parentW = label.parentElement.getBoundingClientRect().width;
    return { labelText: label.firstChild?.textContent?.trim(), label: [lr.x, lr.width], scrollW: label.scrollWidth, flexShrink: cl.flexShrink, display: cl.display, parentW, select: sr ? [sr.x, sr.width] : null };
  }))`,
});
console.log(res.result.result.value);
proc.kill();
process.exit(0);
