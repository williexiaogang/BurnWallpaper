import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateV4, parseV4 } from "../src/v4/engine.ts";

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const theme = load("./prompt-scheme-v4.example.json");
const library = load("./style-library-v4.example.json");
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
      assert.equal(typeof option.value, "string");
      for (const tag of option.tags ?? []) { assert.match(tag, tagPattern); knownTags.add(tag); }
    }
  }
  for (const block of template) {
    assert.equal(typeof block.text, "string");
    if (block.if) assert(variables[block.if], `${prefix}: unknown if ${block.if}`);
    assert.equal(typeof block.text_zh, "string", `${prefix}: localized template text`);
    for (const text of [block.text, block.text_zh]) {
      for (const match of text.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)) {
        assert(variables[match[1]], `${prefix}: unknown placeholder ${match[1]}`);
      }
    }
  }
}

assert.equal(theme.schema_version, 4);
assert.equal(theme.kind, "prompt_scheme");
assert.equal(theme.style.mode, "external");
assert.equal(library.schema_version, 4);
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
for (const key of theme.sampling.diversity_keys) assert(theme.variables[key] || key === "STYLE", `unknown diversity key ${key}`);
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
assert.notEqual(parsedTheme.id, load("../src/v4/default-theme.json").id);
assert.notEqual(parsedLibrary.id, load("../src/v4/default-styles.json").id);
const candidates = parsedLibrary.styles.map((style) => ({ fullId: parsedLibrary.id + "/" + style.id, style }));
assert.equal(generateV4(parsedTheme, candidates, theme.tests[0].select).selections.CLOTHING, "raincoat");
assert.throws(() => generateV4(parsedTheme, candidates, theme.tests[1].select), /^Error: 沒有符合條件/);
console.log("v4 theme and style-library examples: references and schema essentials pass");
