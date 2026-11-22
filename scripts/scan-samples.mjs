#!/usr/bin/env node
/**
 * 樣本圖增量盤點 —— 零依賴、零出圖額度。
 *
 *   node scripts/scan-samples.mjs                        盤點（唯讀）
 *   node scripts/scan-samples.mjs --verbose             額外列出每張已登記圖
 *   node scripts/scan-samples.mjs --json                輸出機器可讀 JSON（唯讀）
 *   node scripts/scan-samples.mjs --register <批次>      把新圖登記進 INDEX.md
 *
 * 比對鍵是「檔案內容 sha256 前 12 位」，不是檔名。
 * 台帳：.sample/INDEX.md（逐圖明細第一欄）。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = join(ROOT, ".sample");
const INDEX = join(SAMPLE, "INDEX.md");
const ROWS_MARK = "<!-- APPEND_ROWS_HERE -->";
const BATCH_MARK = "<!-- APPEND_BATCHES_HERE -->";
const DETAIL_ROW = /^\|\s*`([a-f0-9]{12})`\s*\|\s*`([^`]*)`\s*\|\s*`([^`]*)`\s*\|\s*([a-z]+)\s*\|/gm;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff"]);
const STATES = ["verified", "excluded", "landed", "prompted", "pending"];
const args = process.argv.slice(2);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

const sha12 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
const cleanPath = (file) => relative(SAMPLE, file).replace(/\\/g, "/");

/** @returns {Map<string, {file:string,batch:string,status:string}>} */
function readLedger() {
  if (!existsSync(INDEX)) {
    console.error("找不到 " + INDEX + "，請先建立台帳（見 .sample/README.md）。");
    process.exit(1);
  }
  const text = readFileSync(INDEX, "utf8");
  const map = new Map();
  for (const match of text.matchAll(DETAIL_ROW)) {
    map.set(match[1], { file: match[2], batch: match[3], status: match[4] });
  }
  return map;
}

const ledger = readLedger();
const rows = walk(SAMPLE).map((file) => ({
  sha: sha12(file),
  file: basename(file),
  path: cleanPath(file),
  kb: Math.round(statSync(file).size / 1024),
}));

/** 同一內容可能出現多次（換檔名的副本），以 sha 分組 */
const groups = new Map();
for (const row of rows) {
  if (!groups.has(row.sha)) groups.set(row.sha, []);
  groups.get(row.sha).push(row);
}
const entries = [...groups.entries()].sort((a, b) => a[1][0].path.localeCompare(b[1][0].path));
const fresh = entries.filter(([sha]) => !ledger.has(sha));
const known = entries.filter(([sha]) => ledger.has(sha));
const duplicates = entries.filter(([, list]) => list.length > 1);
const inboxStale = rows.filter((row) => row.path.startsWith("inbox/") && ledger.has(row.sha));
const stateCounts = Object.fromEntries(STATES.map((s) => [s, 0]));
for (const [sha] of known) {
  const state = ledger.get(sha).status;
  if (state in stateCounts) stateCounts[state] += 1;
}
const unfinished = known.filter(([sha]) => !["verified", "excluded"].includes(ledger.get(sha).status));

if (args.includes("--json")) {
  console.log(JSON.stringify({
    scanned: rows.length,
    unique: groups.size,
    registered: ledger.size,
    fresh: fresh.map(([sha, list]) => ({ sha, paths: list.map((r) => r.path) })),
    known: known.map(([sha, list]) => ({ sha, status: ledger.get(sha).status, batch: ledger.get(sha).batch, paths: list.map((r) => r.path) })),
    duplicates: duplicates.map(([sha, list]) => ({ sha, paths: list.map((r) => r.path) })),
    inboxStale: inboxStale.map((r) => r.path),
    stateCounts,
  }, null, 2));
  process.exit(0);
}

console.log("=== .sample 樣本圖盤點 ===");
console.log(`掃描圖片 ${rows.length} 張（唯一內容 ${groups.size}）｜台帳已登記 ${ledger.size} 個 hash`);
console.log("");
console.log(`🆕 未登記（本次要分析）：${fresh.length}`);
for (const [sha, list] of fresh) {
  console.log(`   ${sha}  ${list[0].path}  (${list[0].kb} KB)`);
}
console.log(`✅ 已登記（跳過）：${known.length}   └ ` + STATES.map((s) => `${s} ${stateCounts[s]}`).join(" / "));
if (unfinished.length) {
  console.log(`   其中 ${unfinished.length} 張尚未 verified：`);
  for (const [sha] of unfinished) console.log(`   - ${sha}  ${ledger.get(sha).status}  ${ledger.get(sha).batch}`);
}
console.log(`⚠️ 內容重複（同 sha 多檔）：${duplicates.length}`);
for (const [sha, list] of duplicates) console.log(`   ${sha}  ` + list.map((r) => r.path).join(" , "));
console.log(`📦 inbox 中已登記但尚未歸檔：${inboxStale.length}`);
for (const row of inboxStale) console.log(`   ${row.path}`);

if (args.includes("--verbose")) {
  console.log("");
  console.log("--- 已登記明細 ---");
  for (const [sha, list] of known) {
    const item = ledger.get(sha);
    console.log(`   ${sha}  ${String(item.status).padEnd(9)} ${item.batch.padEnd(22)} ${list[0].path}`);
  }
}

console.log("");
if (fresh.length === 0 && inboxStale.length === 0 && duplicates.length === 0) {
  console.log("→ 沒有新圖，無需分析。若預期有新圖，請確認是否放進 .sample/inbox/。");
} else if (fresh.length) {
  console.log(`→ 只分析上面 ${fresh.length} 張 🆕；寫完 PROMPTS.md 後執行：`);
  console.log(`   node scripts/scan-samples.mjs --register <批次ID>`);
}

if (args.includes("--register")) {
  const batch = args[args.indexOf("--register") + 1];
  if (!batch || batch.startsWith("--")) {
    console.error("--register 需要批次 ID，例如：node scripts/scan-samples.mjs --register 2026-12-03-retro");
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(batch)) {
    console.error("批次 ID 格式應為 YYYY-MM-DD-主題（小寫英數與連字號），收到：" + batch);
    process.exit(1);
  }
  if (fresh.length === 0) {
    console.log(`--register ${batch}：沒有新圖，台帳未變動。`);
  } else {
    let text = readFileSync(INDEX, "utf8");
    if (!text.includes(ROWS_MARK) || !text.includes(BATCH_MARK)) {
      console.error("INDEX.md 缺少插入標記 " + ROWS_MARK + " 或 " + BATCH_MARK);
      process.exit(1);
    }
    // 必須在插入明細行之前判斷：明細行第 3 欄也含有 `批次`，
    // 插完再判斷會誤以為總表已有該批次而漏寫。
    const batchInLedger = text.includes("| `" + batch + "` |");
    const rowLines = fresh.map(([sha, list]) =>
      `| \`${sha}\` | \`${list[0].file}\` | \`${batch}\` | pending | — | — |`);
    text = text.replace(ROWS_MARK, rowLines.join("\n") + "\n" + ROWS_MARK);
    if (!batchInLedger) {
      const today = new Date().toISOString().slice(0, 10);
      const batchLine = `| \`${batch}\` | ${today} | ${fresh.length} | \`batches/${batch}/PROMPTS.md\` | pending | — |`;
      text = text.replace(BATCH_MARK, batchLine + "\n" + BATCH_MARK);
    } else {
      const escaped = batch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const countRe = new RegExp("(\\| `" + escaped + "` \\| [^|]+ \\| )(\\d+)( \\|)");
      text = text.replace(countRe, (all, head, count, tail) => head + (Number(count) + fresh.length) + tail);
    }
    writeFileSync(INDEX, text, "utf8");
    console.log(`--register ${batch}：已把 ${fresh.length} 張新圖寫入 INDEX.md（狀態 pending）。`);
    console.log("   接著請手動把這些行的狀態改為 prompted／landed／verified，並補上 PROMPT 錨點。");
  }
}
