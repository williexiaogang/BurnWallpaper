import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9226;
const proc = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/burn-cutout-test`,
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
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (/cutout|error|fail|warn/i.test(text)) console.log("[console]", m.params.type, text.slice(0, 300));
  }
  if (m.method === "Runtime.exceptionThrown") {
    console.log("[exception]", JSON.stringify(m.params.exceptionDetails?.exception?.description || m.params).slice(0, 400));
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://localhost:5173" });
console.log("page loaded, waiting for cutout (model download + inference)…");

let found = false;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `Boolean(document.querySelector('.wallpaper-cutout'))`,
  });
  if (res.result?.result?.value === true) { found = true; break; }
  if (i % 10 === 0) console.log(`waiting… ${i * 2}s`);
}

console.log("cutout element:", found);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("sample/ui/now-cutout.png", Buffer.from(shot.result.data, "base64"));
console.log("saved sample/ui/now-cutout.png");
proc.kill();
process.exit(0);
