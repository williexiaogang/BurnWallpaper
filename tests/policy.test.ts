import assert from "node:assert/strict";
import test from "node:test";
import { decideFavorites } from "../src/utils/favorites-seed.ts";
import { pendingIdsAfterRetry } from "../src/utils/pending-policy.ts";
import { mergeStylePresets, parseStoredPresets } from "../src/utils/style-store.ts";
import type { StylePreset } from "../src/types.ts";

const builtin: StylePreset = {
  id: "free",
  name: "自由",
  english: "FREE",
  description: "desc",
  is_builtin: true,
  prompt_template: "original",
  variables: {},
  randomize_variables: false,
  aspect_ratio: "16:9",
};

test("style merge keeps builtin edits and custom presets", () => {
  const custom: StylePreset = { ...builtin, id: "custom-1", name: "夜", is_builtin: false, prompt_template: "custom" };
  const edited: StylePreset = { ...builtin, prompt_template: "edited" };
  const merged = mergeStylePresets([builtin], [edited, custom]);
  assert.equal(merged[0]?.prompt_template, "edited");
  assert.equal(merged[1]?.id, "custom-1");
  assert.equal(parseStoredPresets("nope"), null);
  assert.equal(parseStoredPresets(JSON.stringify([custom]))?.[0]?.name, "夜");
});

test("cleared favorites are not seeded again", () => {
  const fresh = decideFavorites({ stored: [], seededFlag: null, hasGenerated: false, hasOtherSettings: false, seedIds: ["a", "b"] });
  assert.deepEqual(fresh.toggleOn, ["a", "b"]);
  const cleared = decideFavorites({ stored: [], seededFlag: "1", hasGenerated: true, hasOtherSettings: true, seedIds: ["a", "b"] });
  assert.deepEqual(cleared.ids, []);
  assert.deepEqual(cleared.toggleOn, []);
  const legacyCleared = decideFavorites({ stored: [], seededFlag: null, hasGenerated: true, hasOtherSettings: false, seedIds: ["a", "b"] });
  assert.deepEqual(legacyCleared.toggleOn, []);
});

test("retry keeps the previous request id", () => {
  assert.deepEqual(pendingIdsAfterRetry(["old", "older"], "old", "new"), ["new", "old", "older"]);
});
