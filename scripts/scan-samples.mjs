#!/usr/bin/env node
/**
 * 樣本圖增量盤點 —— 零依賴、零出圖額度。
 *
 *   node scripts/scan-samples.mjs                        盤點（唯讀）
 *   node scripts/scan-samples.mjs --verbose             額外列出每張已登記圖
 *   node scripts/scan-samples.mjs --json                輸出機器可讀 JSON（唯讀）
 *   node scripts/scan-samples.mjs --register <批次> <sha12> [...]  登記指定的已歸檔圖片
 *
 * 比對鍵是「檔案內容 sha256 前 12 位」，不是檔名。
 * 台帳：.sample/INDEX.md（逐圖明細第一欄）。
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = join(ROOT, ".sample");
const INDEX = join(SAMPLE, "INDEX.md");
const INDEX_TEMP = join(SAMPLE, ".INDEX.md.tmp");
const ROWS_MARK = "<!-- APPEND_ROWS_HERE -->";
const BATCH_MARK = "<!-- APPEND_BATCHES_HERE -->";
const EMPTY_LEDGER = [
  "# .sample 本機樣本台帳",
  "",
  "## 批次總表",
  "",
  "| 批次 | 日期 | 張數 | PROMPT | 狀態 | 落地到 |",
  "|---|---|---|---|---|---|",
  BATCH_MARK,
  "",
  "## 逐圖明細",
  "",
  "| sha12 | 檔案 | 批次 | 狀態 | PROMPT 錨點 | 落地版本 |",
  "|---|---|---|---|---|---|",
  ROWS_MARK,
  "",
].join("\n");
const DETAIL_ROW = /^\|\s*`([a-f0-9]{12})`\s*\|\s*`([^`]*)`\s*\|\s*`([^`]*)`\s*\|\s*([a-z]+)\s*\|/gm;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff"]);
const UNSUPPORTED_IMAGE_EXT = new Set([".heic", ".heif", ".svg", ".jxl", ".jp2", ".ico", ".psd", ".dng"]);
const STATES = ["verified", "excluded", "landed", "prompted", "pending"];
const args = process.argv.slice(2);
const registerAt = args.indexOf("--register");
const terminal = (status) => status === "verified" || status === "excluded";

function walk(dir, files, unsupported) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files, unsupported);
    else if (entry.isFile()) {
      const extension = extname(entry.name).toLowerCase();
      if (IMAGE_EXT.has(extension)) files.push(full);
      else if (UNSUPPORTED_IMAGE_EXT.has(extension)) unsupported.push(cleanPath(full));
    }
  }
}

const sha12 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
const cleanPath = (file) => relative(SAMPLE, file).replace(/\\/g, "/");

/** @returns {Map<string, {file:string,batch:string,status:string}>} */
function parseLedger(text) {
  const map = new Map();
  for (const match of text.matchAll(DETAIL_ROW)) {
    map.set(match[1], { file: match[2], batch: match[3], status: match[4] });
  }
  return map;
}

function readLedgerText() {
  try {
    return readFileSync(INDEX, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return EMPTY_LEDGER;
    throw error;
  }
}
if (registerAt >= 0 && args.includes("--json")) {
  console.error("--json 用於唯讀盤點，請單獨執行 --register。");
  process.exit(1);
}

const ledger = parseLedger(readLedgerText());
const files = [];
const unsupported = [];
walk(SAMPLE, files, unsupported);
unsupported.sort();
const rows = files.map((file) => ({
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
for (const { status: state } of ledger.values()) {
  if (state in stateCounts) stateCounts[state] += 1;
}
const unfinished = [...ledger].filter(([, item]) => !terminal(item.status)).map(([sha, item]) => ({
  sha, ...item, paths: (groups.get(sha) ?? []).map((row) => row.path),
}));
const completedCount = stateCounts.verified + stateCounts.excluded;

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
    unfinished,
    unsupported,
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
console.log(`✅ 台帳已結案（跳過）：${completedCount}   └ ` + STATES.map((s) => `${s} ${stateCounts[s]}`).join(" / "));
if (unfinished.length) {
  console.log(`🔄 台帳待續跑：${unfinished.length}`);
  for (const { sha, status, batch, file, paths } of unfinished) {
    console.log(`   - ${sha}  ${status}  ${batch}  ${paths.join(" , ") || `原圖缺失（${file}）`}`);
  }
}
console.log(`⚠️ 內容重複（同 sha 多檔）：${duplicates.length}`);
for (const [sha, list] of duplicates) console.log(`   ${sha}  ` + list.map((r) => r.path).join(" , "));
console.log(`📦 inbox 中已登記但尚未歸檔：${inboxStale.length}`);
for (const row of inboxStale) console.log(`   ${row.path}`);
console.log(`⏭️ 略過的圖片格式：${unsupported.length}`);
for (const path of unsupported) console.log(`   ${path}`);

if (args.includes("--verbose")) {
  console.log("");
  console.log("--- 已登記明細 ---");
  for (const [sha, list] of known) {
    const item = ledger.get(sha);
    console.log(`   ${sha}  ${String(item.status).padEnd(9)} ${item.batch.padEnd(22)} ${list[0].path}`);
  }
}

console.log("");
if (fresh.length) {
  console.log("→ 記下本批選定的 sha12，歸檔後執行：");
  console.log("   node scripts/scan-samples.mjs --register <批次ID> <sha12> [...]");
}
if (unfinished.length) console.log("→ 按台帳狀態續跑：pending 分析、prompted 落地、landed 驗證。");
if (fresh.length === 0 && unfinished.length === 0 && inboxStale.length === 0 && duplicates.length === 0 && unsupported.length === 0) {
  console.log("→ 沒有新圖或待續跑的台帳項目。");
}

function registerBatch(batch, selection) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(batch)) {
    throw Error("批次 ID 格式為 YYYY-MM-DD-主題（小寫英數與連字號）。");
  }
  if (!selection.length || selection.some((sha) => !/^[a-f0-9]{12}$/.test(sha))) {
    throw Error("--register 需要至少一個明確選定的 sha12，例如從 samples:status 複製。");
  }

  const prefix = "batches/" + batch + "/images/";
  const quote = String.fromCharCode(96);
  const code = (value) => quote + value + quote;
  const tableRow = (columns) => "| " + columns.join(" | ") + " |";
  const descriptor = openSync(INDEX_TEMP, "wx");
  let replaced = false;
  try {
    let count;
    try {
      let text = readLedgerText();
      if (!text.includes(ROWS_MARK) || !text.includes(BATCH_MARK)) {
        throw Error("INDEX.md 缺少插入標記 " + ROWS_MARK + " 或 " + BATCH_MARK);
      }
      const current = parseLedger(text);
      const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";
      const newRows = [];
      for (const sha of new Set(selection)) {
        const previous = current.get(sha);
        if (previous?.batch === batch) continue;
        if (previous) throw Error(sha + " 已登記到 " + previous.batch + "。");
        const row = groups.get(sha)?.find((sample) => sample.path.startsWith(prefix));
        if (!row || sha12(join(SAMPLE, row.path)) !== sha) {
          throw Error(sha + " 的原圖需先歸檔至 " + prefix + "。");
        }
        if (row.path.includes(quote) || /[|\r\n]/.test(row.path)) {
          throw Error("請先移除圖片路徑中的反引號、豎線或換行。");
        }
        newRows.push(tableRow([code(sha), code(row.path), code(batch), "pending", "—", "—"]));
      }
      count = newRows.length;
      if (!count) {
        console.log("--register " + batch + "：指定圖片已登記。");
        return;
      }

      const total = count + [...current.values()].filter((item) => item.batch === batch).length;
      const batchRow = new RegExp("^\\|[ \\t]*" + code(batch) + "[ \\t]*\\|[^\\r\\n]*", "m");
      if (batchRow.test(text)) {
        text = text.replace(batchRow, (line) => {
          const columns = line.split("|");
          columns[3] = " " + total + " ";
          columns[5] = " pending ";
          return columns.join("|");
        });
      } else {
        const line = tableRow([code(batch), batch.slice(0, 10), total, code("batches/" + batch + "/PROMPTS.md"), "pending", "—"]);
        text = text.replace(BATCH_MARK, () => line + lineBreak + BATCH_MARK);
      }
      text = text.replace(ROWS_MARK, () => newRows.join(lineBreak) + lineBreak + ROWS_MARK);
      writeFileSync(descriptor, text, "utf8");
    } finally {
      closeSync(descriptor);
    }
    renameSync(INDEX_TEMP, INDEX);
    replaced = true;
    console.log("--register " + batch + "：已登記 " + count + " 張指定圖片，狀態為 pending。");
  } finally {
    if (!replaced) rmSync(INDEX_TEMP, { force: true });
  }
}

if (registerAt >= 0) {
  try {
    registerBatch(args[registerAt + 1] ?? "", args.slice(registerAt + 2));
  } catch (error) {
    console.error(error.code === "EEXIST" ? "台帳正在更新。請確認上一個登記程序已完成再重試。" : error.message);
    process.exitCode = 1;
  }
}
