import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateV4, parseV4 } from "../src/v4/engine.ts";
import { bundledPresets } from "../src/v4/bundled-presets.ts";
import { buildAiAuthoringTemplate } from "../src/v4/authoring.ts";
import { sceneCategories, scopeScenes } from "../src/v4/scenes.ts";

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const theme = load("./prompt-scheme-v4.example.json");
const library = load("./style-library-v4.example.json");
const exportedExamples = [...buildAiAuthoringTemplate().matchAll(/```json\n([\s\S]*?)\n```/g)].map(([, json]) => parseV4(json));
assert.deepEqual(exportedExamples, [theme, library]);
const tagPattern = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;
const knownTags = new Set();

function validateVariables(variables, template, prefix) {
  assert(variables && typeof variables === "object", `${prefix}: variables`);
  for (const [name, variable] of Object.entries(variables)) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    assert.equal(typeof variable.required, "boolean", `${prefix}.${name}.required`);
    assert(variable.options.length > 0, `${prefix}.${name}.options`);
    const ids = new Set();
    for (const option of variable.options) {
      assert(!ids.has(option.id), `${prefix}.${name}: duplicate ${option.id}`);
      ids.add(option.id);
      assert.equal(typeof option.value.en, "string");
      assert.equal(typeof option.value.zh, "string", `${prefix}.${name}.${option.id}: complete Chinese value`);
      for (const tag of option.tags ?? []) { assert.match(tag, tagPattern); knownTags.add(tag); }
    }
  }
  for (const block of template) {
    if (block.if) assert(variables[block.if], `${prefix}: unknown if ${block.if}`);
    assert.equal(typeof block.text.en, "string");
    assert.equal(typeof block.text.zh, "string", `${prefix}: localized template text`);
    for (const text of [block.text.en, block.text.zh]) {
      for (const match of text.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
        assert(variables[match[1]], `${prefix}: unknown placeholder ${match[1]}`);
      }
    }
  }
}

assert.equal(theme.schema_version, 5);
assert.equal(theme.kind, "prompt_scheme");
assert.equal(theme.style.mode, "external");
assert.equal(library.schema_version, 5);
assert.equal(library.kind, "style_library");
validateVariables(theme.variables, theme.template, theme.id);
const styleIds = new Set();
for (const style of library.styles) {
  assert(!styleIds.has(style.id), `duplicate style ${style.id}`);
  styleIds.add(style.id);
  for (const tag of style.tags ?? []) { assert.match(tag, tagPattern); knownTags.add(tag); }
  validateVariables(style.variables, style.template, style.id);
}
for (const recommendation of theme.style.recommended) {
  const [libraryId, styleId] = recommendation.split("/");
  assert.equal(libraryId, library.id);
  assert(styleIds.has(styleId), `unknown style ${recommendation}`);
}
for (const key of theme.sampling.diversity_keys) {
  const sharedStyleVariable = key.startsWith("style.") && library.styles.every((style) => style.variables[key.slice(6)]);
  assert(theme.variables[key] || key === "STYLE" || sharedStyleVariable, `unknown diversity key ${key}`);
}
for (const variable of Object.values(theme.variables)) for (const option of variable.options) {
  for (const tag of [...(option.requires_all ?? []), ...(option.requires_any ?? []), ...Object.keys(option.prefer ?? {})]) {
    assert(knownTags.has(tag), `no provider for ${tag}`);
  }
}
for (const test of theme.tests) for (const [name, id] of Object.entries(test.select)) {
  assert(theme.variables[name]?.options.some((option) => option.id === id), `${test.name}: unknown ${name}.${id}`);
}
const parsedTheme = parseV4(JSON.stringify(theme));
const parsedLibrary = parseV4(JSON.stringify(library));
assert.ok(!bundledPresets.themes.some(({ id }) => id === parsedTheme.id));
assert.notEqual(parsedLibrary.id, load("../src/v4/default-styles.json").id);
const candidates = parsedLibrary.styles.map((style) => ({ fullId: parsedLibrary.id + "/" + style.id, style }));
for (const { name, select, expect } of parsedTheme.tests) {
  const generate = () => generateV4(parsedTheme, candidates, select);
  if (expect.error) {
    assert.throws(generate, /^Error: 沒有符合條件/, name);
    continue;
  }
  const result = generate();
  for (const [key, id] of Object.entries(expect.selected ?? {})) assert.equal(result.selections[key], id, name);
  for (const key of expect.include ?? []) assert.ok(result.selections[key], name);
  for (const key of expect.omit ?? []) assert.equal(result.selections[key], undefined, name);
  for (const value of expect.prompt_contains ?? []) assert.ok(result.prompt.includes(value), name);
}
assert.equal(sceneCategories(parsedTheme).length, 7);
const fantasy = scopeScenes(parsedTheme, "fantasy");
assert.deepEqual(fantasy.variables.SCENE.options.map(({ id }) => id), ["cloud_sea", "lunar_greenhouse"]);
for (const candidate of candidates) {
  const { ART_STYLE, PALETTE } = candidate.style.variables;
  for (const art of ART_STYLE.options) {
    const matches = PALETTE.options.filter((palette) => palette.requires_any.some((tag) => art.tags.includes(tag)));
    assert.ok(matches.length >= 2, `${candidate.fullId}/${art.id}`);
    for (const palette of PALETTE.options) {
      const generate = () => generateV4(parsedTheme, [candidate], { "style.ART_STYLE": art.id, "style.PALETTE": palette.id });
      if (matches.includes(palette)) {
        const result = generate();
        assert.ok(result.prompt.includes(palette.value.en));
        assert.ok(result.prompts.zh.includes(palette.value.zh));
      } else assert.throws(generate, /^Error: 沒有符合條件/);
    }
  }
}
console.log("v5 AI export: both JSON examples import, reference valid options, and pass scene and palette checks");
