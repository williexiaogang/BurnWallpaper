import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9223;
const OUT = "sample/ui";
mkdirSync(OUT, { recursive: true });

const proc = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/burn-shots-profile`,
  "--window-size=1280,800",
  "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("CDP not reachable");
}

const ws = new WebSocket(await getWsUrl());
let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise((r) => { ws.onopen = r; });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173" });
await new Promise((r) => setTimeout(r, 4000));

const views = ["now", "favorites", "styles", "rotation", "history", "settings"];
const wake = `window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true})); document.querySelector('.app')?.classList.remove('is-idle'); true`;
for (let i = 0; i < views.length; i++) {
  await send("Runtime.evaluate", {
    expression: `document.querySelectorAll('.nav-item')[${i}]?.click()`,
  });
  await new Promise((r) => setTimeout(r, 900));
  // 此刻頁再補一張：選中 furry power 展開變量區
  if (views[i] === "now") {
    await send("Runtime.evaluate", {
      expression: `(()=>{const chips=[...document.querySelectorAll('.built-in-presets .chip')];const target=chips.find(c=>c.textContent.includes('力量感'));target&&target.click();return true})()`,
    });
    await new Promise((r) => setTimeout(r, 700));
    await send("Runtime.evaluate", { expression: wake });
    const shotVars = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/now-variables.png`, Buffer.from(shotVars.result.data, "base64"));
    console.log("captured now-variables");
  }
  await send("Runtime.evaluate", { expression: wake });
  await new Promise((r) => setTimeout(r, 300));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${views[i]}.png`, Buffer.from(shot.result.data, "base64"));
  console.log("captured", views[i]);
}

proc.kill();
process.exit(0);
