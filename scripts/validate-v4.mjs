import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseV4, generateV4 } from '../src/v4/engine.ts';
import { bundledPresets } from '../src/v4/bundled-presets.ts';
const read = (file) => parseV4(readFileSync(new URL(file, import.meta.url), 'utf8'));
const showSamples = process.argv.includes('--samples');
const { library, themes } = bundledPresets;
const styles = library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style }));
for (const { id, name } of [...themes, ...library.styles]) {
  assert.ok([...name].length <= 5, `Built-in preset ${id} needs a name of at most five characters`);
}
const seededRandom = () => {
  let seed = 1234567;
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
};

function validateStyleOptions(theme, available) {
  const singleCandidate = { ...theme, sampling: { ...theme.sampling, candidate_count: 1 } };
  let checked = 0;
  for (const entry of available) {
    const { ART_STYLE, PALETTE } = entry.style.variables;
    const checkedPalettes = new Set();
    for (const art of ART_STYLE.options) {
      const compatible = PALETTE.options.filter((palette) =>
        palette.requires_any?.some((tag) => art.tags?.includes(tag)),
      );
      assert.ok(compatible.length >= 2, `${entry.fullId}/${art.id}: needs alternative palettes`);
      for (const palette of PALETTE.options) {
        const locks = { 'style.ART_STYLE': art.id, 'style.PALETTE': palette.id };
        const label = `${theme.id}: ${entry.fullId}/${art.id} + ${palette.id}`;
        const generate = () => generateV4(singleCandidate, [entry], locks, [], seededRandom());
        if (!compatible.includes(palette)) {
          assert.throws(generate, /沒有符合條件的組合；手動選擇與主題／畫風約束衝突/, label);
          continue;
        }
        const result = generate();
        assert.equal(result.labels['style.ART_STYLE'], art.label, label);
        assert.equal(result.labels['style.PALETTE'], palette.label, label);
        assert.ok(result.prompt.includes(art.value) && result.prompt.includes(palette.value), label);
        checkedPalettes.add(palette.id);
        checked++;
      }
    }
    assert.equal(checkedPalettes.size, PALETTE.options.length, `${entry.fullId}: unreachable palette`);
  }
  return checked;
}

const generic = read('../design/prompt-scheme-v4.example.json');
const genericResult = generateV4(generic, styles.filter((style) => style.style.id === 'anime'));
if (!genericResult.prompt) throw Error('untyped custom themes must support built-in styles');
for (const theme of themes) {
  const name = theme.id;
  const available = styles.filter((style) => theme.style?.recommended?.includes(style.fullId));
  for (let i = 0; i < 30; i++) {
    const result = generateV4(theme, available);
    assert.ok(result.prompt && !/\{[A-Z_0-9]+\}/.test(result.prompt), `${name}: invalid prompt`);
    assert.ok(result.selections['style.ART_STYLE'] && result.selections['style.PALETTE'], `${name}: missing art or palette`);
    if (showSamples && i < 4) console.log(`[${name} ${i + 1}] ${result.prompt}`);
  }
  for (const test of theme.tests ?? []) {
    const expect = test.expect;
    try {
      const result = generateV4(theme, available, test.select, [], seededRandom());
      if (expect.error
        || Object.entries(expect.selected ?? {}).some(([key, id]) => result.selections[key] !== id)
        || (expect.include ?? []).some((key) => !result.selections[key])
        || (expect.omit ?? []).some((key) => result.selections[key])
        || (expect.prompt_contains ?? []).some((value) => !result.prompt.toLowerCase().includes(value.toLowerCase()))
        || (expect.prompt_excludes ?? []).some((value) => result.prompt.toLowerCase().includes(value.toLowerCase()))) {
        throw Error('unexpected result');
      }
    } catch (error) {
      if (expect.error === 'incompatible_selection' && error.message.startsWith('沒有符合條件')) continue;
      throw Error(`${name}: ${test.name} failed`, { cause: error });
    }
  }
  const checked = validateStyleOptions(theme, available);
  console.log(`PASS ${name}: generated 30 compatible prompts, verified ${checked} compatible art and palette pairs`);
}

const aj = themes.find(({ id }) => id === 'aj_series');
const ajSampling = { ...aj, sampling: { ...aj.sampling, candidate_count: 1 } };
const ajStyles = styles.filter(({ fullId }) => aj.style.recommended.includes(fullId));
for (const framing of aj.variables.FRAMING.options) {
  for (const shoe of aj.variables.FOOTWEAR.options) {
    const result = generateV4(ajSampling, ajStyles, { FRAMING: framing.id, FOOTWEAR: shoe.id }, [], seededRandom());
    assert.equal(result.selections.FOOTWEAR, shoe.id);
    assert.ok(result.prompt.includes(shoe.value + ' worn on the feet'), `${framing.id}/${shoe.id}`);
  }
}
assert.throws(() => generateV4(aj, ajStyles, { FOOTWEAR: null }), /必填變量/);
console.log(`PASS AJ: all ${aj.variables.FRAMING.options.length} framings keep all ${aj.variables.FOOTWEAR.options.length} shoe options visible in the prompt`);

const portrait = themes.find(({ id }) => id === 'asian_male_studio');
const portraitSampling = { ...portrait, sampling: { ...portrait.sampling, candidate_count: 1 } };
const photography = styles.filter(({ style }) => style.id === 'photography');
for (const pose of portrait.variables.POSE.options) {
  const result = generateV4(portraitSampling, photography, { POSE: pose.id }, [], seededRandom());
  if (result.labels.POSE !== pose.label || !result.prompt.includes(pose.value)
    || (pose.tags?.includes('pose:fixed_hands') && (result.selections.HAND_POSITION || result.selections.ACCESSORY === 'opt0007'))
    || (pose.tags?.includes('pose:fixed_legs') && result.selections.LEG_POSITION)) {
    throw Error(`portrait pose ${pose.id}: incorrect wording or conflicting limb directions`);
  }
}
console.log(`PASS photography: verified all ${portrait.variables.POSE.options.length} portrait poses`);

const portraitOutfit = { FRAMING: 'opt0001' };
for (const variable of ['UPPER_CLOTHING', 'LOWER_CLOTHING']) {
  for (const option of portrait.variables[variable].options) {
    const result = generateV4(portraitSampling, photography, { ...portraitOutfit, [variable]: option.id }, [], seededRandom());
    if (result.labels[variable] !== option.label || !result.prompt.includes(option.value)) {
      throw Error(`portrait clothing ${variable}.${option.id}: incorrect wording`);
    }
  }
}
const wardrobeRandom = seededRandom();
const omittedPortraitPhrases = ['fully covered groin', 'no genital exposure', 'no text'];
for (let i = 0; i < 30; i++) {
  const result = generateV4(portraitSampling, photography, portraitOutfit, [], wardrobeRandom);
  for (const variable of ['UPPER_CLOTHING', 'LOWER_CLOTHING']) {
    const picked = portrait.variables[variable].options.find(({ id }) => id === result.selections[variable]);
    if (!picked || picked.weight === 0) throw Error(`portrait random outfit lost ${variable}`);
  }
  if (omittedPortraitPhrases.some((phrase) => result.prompt.toLowerCase().includes(phrase))) {
    throw Error('portrait prompt retained the removed wording');
  }
}
console.log(`PASS photography: verified ${portrait.variables.UPPER_CLOTHING.options.length} tops and ${portrait.variables.LOWER_CLOTHING.options.length} bottoms, including random full-body styling`);
