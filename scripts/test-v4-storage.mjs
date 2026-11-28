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
    stdin: { contents: 'export * from "./src/v4/storage.ts"; export * from "./src/v4/preset-updates.ts"; export { getStudioPresets } from "./src/v4/studio-presets.ts";', resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "esm", outfile: file, logLevel: "silent",
  });
  const data = new Map();
  const setItem = (key, value) => data.set(key, value);
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem };
  const moduleUrl = pathToFileURL(file).href;
  const storage = await import(moduleUrl);
  const bundled = storage.getOfficialPresets();
  const published = JSON.parse(await readFile(new URL("../presets/presets-v4.json", import.meta.url), "utf8"));
  const { studio: publishedStudio, ...publishedHome } = published;
  assert.deepEqual(publishedHome, bundled);
  const bundledStudio = storage.getStudioPresets([]);
  assert.deepEqual(publishedStudio.map(({ fullId }) => fullId), bundledStudio.map(({ fullId }) => fullId));
  for (const { slug, thumbnailWebp } of publishedStudio) {
    assert.deepEqual(Buffer.from(thumbnailWebp, "base64"), await readFile(new URL(`../public/style-previews/${slug}.webp`, import.meta.url)));
  }
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
    studio: [{ ...publishedStudio[0], name: "新版工作室画风", thumbnailWebp: publishedStudio[1].thumbnailWebp }, ...publishedStudio.slice(1)],
  };
  let payload = JSON.stringify(published);
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/.+\/presets-v4\.json$/);
    assert.equal(options.credentials, "omit");
    return new Response(payload);
  };
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: published.revision, updated: true });
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: published.revision, updated: false });
  const sameRevisionOffline = await import(`${moduleUrl}?same-revision-offline`);
  assert.deepEqual(sameRevisionOffline.getOfficialPresets(), published);
  payload = JSON.stringify(latest);
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
  const [firstStudioPreset] = offline.getStudioPresets([], offline.getOfficialPresets().studio);
  assert.equal(firstStudioPreset.fullId, bundledStudio[0].fullId);
  assert.equal(firstStudioPreset.style.name, "新版工作室画风");
  assert.equal(firstStudioPreset.thumbnailSrc, `data:image/webp;base64,${publishedStudio[1].thumbnailWebp}`);

  const lastGood = data.get("burn.v4.official");
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: latest.revision, updated: false });
  payload = JSON.stringify(bundled);
  assert.deepEqual(await storage.checkPresetUpdate(), { revision: latest.revision, updated: false });
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, schema_version: 6 });
  await assert.rejects(storage.checkPresetUpdate(), /不兼容/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, library: { ...latest.library, styles: latest.library.styles.slice(1) } });
  await assert.rejects(storage.checkPresetUpdate(), /推荐画风缺失/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, studio: [{ ...latest.studio[0], thumbnailWebp: "R0lGODdh" }] });
  await assert.rejects(storage.checkPresetUpdate(), /WebP 缩图无效/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, studio: [{ ...latest.studio[0], background: [] }] });
  await assert.rejects(storage.checkPresetUpdate(), /background 候选无效/);
  payload = JSON.stringify({ ...latest, revision: latest.revision + 1, studio: [latest.studio[0], latest.studio[0]] });
  await assert.rejects(storage.checkPresetUpdate(), /ID 无效或重复/);
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
  console.log("PASS: official home and Studio updates, the same-revision migration, offline images, preserved custom choices and failed updates");
} finally { await rm(dir, { recursive: true, force: true }); }
