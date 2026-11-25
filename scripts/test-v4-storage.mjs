import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "burn-storage-test-"));
try {
  const file = join(dir, "storage.mjs");
  await build({
    stdin: { contents: 'export * from "./src/v4/storage.ts"; export * from "./src/v4/preset-updates.ts";', resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "esm", outfile: file, logLevel: "silent",
  });
  const data = new Map();
  const setItem = (key, value) => data.set(key, value);
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem };
  const moduleUrl = pathToFileURL(file).href;
  const storage = await import(moduleUrl);
  const bundled = storage.getOfficialPresets();
  assert.deepEqual(JSON.parse(await readFile(new URL("../presets/presets-v4.json", import.meta.url), "utf8")), bundled);
  const valid = { ...bundled.themes[0], id: "custom" };
  const invalid = { schema_version: 2, id: "broken" };
  data.set("burn.v4.packs", JSON.stringify([valid, invalid]));
  assert.equal(storage.readPacks().length, 1);
  assert.match(storage.packsWarning(), /1 個/);
  storage.savePacks(storage.readPacks());
  assert.deepEqual(JSON.parse(data.get("burn.v4.packs"))[1], invalid);
  data.set("burn.v4.packs", "bad json");
  assert.throws(() => storage.savePacks([]), /備份/);
  assert.equal(data.get("burn.v4.packs"), "bad json");
  data.set("burn.v4.history", "bad json");
  assert.throws(() => storage.recordHistory({themeId:"x", selections:{}, themeSnapshot:valid}, "prompt"));
  assert.equal(data.get("burn.v4.history"), "bad json");
  const oldHistory = JSON.stringify([{ themeId: "aj_series", selections: { FOOTWEAR: "opt0019" }, prompt: "old AJ prompt", at: 1 }]);
  data.set("burn.v4.history", oldHistory);
  globalThis.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  assert.throws(() => storage.recordHistory({themeId:"x", selections:{}, themeSnapshot:valid}, "prompt"), /quota/);
  assert.equal(data.get("burn.v4.history"), oldHistory);
  console.log("PASS: invalid custom packs and damaged history remain recoverable");

  globalThis.localStorage.setItem = setItem;
  data.set("burn.v4.packs", JSON.stringify([valid, invalid]));
  data.delete("burn.v4.choice");
  assert.deepEqual(storage.readChoice(), { themeId: bundled.themes[0].id, styles: [] });
  const ajChoice = { themeId: "aj_series", styles: ["builtin_visual_styles/anime"], sceneCategory: "outdoor" };
  storage.saveChoice(ajChoice);
  assert.deepEqual(storage.readChoice(), { ...ajChoice, themeId: "general" });
  storage.saveChoice({ ...ajChoice, themeId: "character_wallpaper_example" });
  assert.deepEqual(storage.readChoice(), { ...ajChoice, themeId: "general" });
  assert.deepEqual(storage.readHistory(), JSON.parse(oldHistory));
  storage.saveChoice(ajChoice);
  storage.savePacks([valid, { ...valid, id: "aj_series" }]);
  assert.deepEqual(storage.readChoice(), ajChoice);
  storage.savePacks([valid]);
  const legacyChoice = { themeId: valid.id, styles: valid.style.recommended.slice(0, 1) };
  storage.saveChoice(legacyChoice);
  assert.deepEqual(storage.readChoice(), legacyChoice);
  const choice = { ...legacyChoice, sceneCategory: "fantasy" };
  storage.saveChoice({ ...choice, styles: [...valid.style.recommended] });
  assert.deepEqual(storage.readChoice(), choice);
  storage.saveChoice(choice);
  const latest = {
    ...bundled,
    revision: bundled.revision + 1,
    themes: [{ ...bundled.themes[0], name: "新版主题" }, ...bundled.themes.slice(1), { ...valid, name: "同 ID 的官方主题" }],
    library: { ...bundled.library, styles: [{ ...bundled.library.styles[0], name: "新版画风" }, ...bundled.library.styles.slice(1)] },
  };
  let payload = JSON.stringify(latest);
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/.+\/presets-v4\.json$/);
    assert.equal(options.credentials, "omit");
    return new Response(payload);
  };
  let notifications = 0;
  const unsubscribe = storage.subscribeOfficialPresets(() => { notifications++; });
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: latest.revision, updated: true });
  assert.equal(notifications, 1);
  assert.equal(storage.getAllPacks().themes[0].name, "新版主题");
  assert.equal(storage.getAllPacks().themes.find((theme) => theme.id === valid.id).name, valid.name);
  assert.equal(storage.getAllPacks().libraries[0].styles[0].name, "新版画风");
  assert.deepEqual(storage.readChoice(), choice);
  assert.equal(data.get("burn.v4.packs"), JSON.stringify([valid, invalid]));
  assert.equal(data.get("burn.v4.history"), oldHistory);
  const offline = await import(`${moduleUrl}?offline`);
  assert.deepEqual(offline.getOfficialPresets(), latest);

  const lastGood = data.get("burn.v4.official");
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: latest.revision, updated: false });
  payload = JSON.stringify(bundled);
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: latest.revision, updated: false });
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, schema_version: 5 });
  await assert.rejects(storage.checkPresetUpdate(), /不兼容/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, library: { ...latest.library, styles: latest.library.styles.slice(1) } });
  await assert.rejects(storage.checkPresetUpdate(), /推荐画风缺失/);
  payload = " ".repeat(2 * 1024 * 1024 + 1);
  await assert.rejects(storage.checkPresetUpdate(), /超过 2 MB/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1 });
  globalThis.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  await assert.rejects(storage.checkPresetUpdate(), /quota/);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(storage.checkPresetUpdate(), /无法连接 GitHub/);
  assert.equal(data.get("burn.v4.official"), lastGood);
  assert.equal(storage.getOfficialPresets().revision, latest.revision);
  assert.equal(notifications, 1);
  unsubscribe();

  data.set("burn.v4.official", "bad cache");
  const corrupted = await import(`${moduleUrl}?corrupted`);
  assert.deepEqual(corrupted.getOfficialPresets(), bundled);
  console.log("PASS: official preset updates, offline cache, custom choices, and failed updates");
} finally { await rm(dir, { recursive: true, force: true }); }
