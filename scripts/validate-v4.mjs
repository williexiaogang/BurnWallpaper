import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseV4, generateV4 } from '../src/v4/engine.ts';
import { bundledPresets } from '../src/v4/bundled-presets.ts';
const read = (file) => parseV4(readFileSync(new URL(file, import.meta.url), 'utf8'));
const showSamples = process.argv.includes('--samples');
const { library, themes } = bundledPresets;
const styles = library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style }));
const seededRandom = () => {
  let seed = 1234567;
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
};

function validateStyleOptions(theme, available) {
  const singleCandidate = { ...theme, sampling: { ...theme.sampling, candidate_count: 1 } };
  let checked = 0;
  for (const entry of available) {
    for (const [variable, tagPrefix] of [['ART_STYLE', 'surface_profile:'], ['MATERIAL', 'surface_medium:'], ['PALETTE', 'palette:']]) {
      const key = 'style.' + variable;
      for (const option of entry.style.variables[variable]?.options ?? []) {
        if (!option.tags?.some((tag) => tag.startsWith(tagPrefix))) continue;
        try {
          const result = generateV4(singleCandidate, [entry], { [key]: option.id }, [], seededRandom());
          if (result.labels[key] !== option.label || (option.value && !result.prompt.includes(option.value))) {
            throw Error('did not render as selected');
          }
        } catch (error) {
          throw Error(`${theme.id}: ${entry.fullId} ${key} ${option.id}`, { cause: error });
        }
        checked++;
      }
    }
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
    if (!result.prompt || /\{[A-Z_0-9]+\}/.test(result.prompt)) throw Error(`${name}: invalid prompt`);
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
  console.log(`PASS ${name}: generated 30 compatible prompts, verified ${checked} style, material and palette choices`);
}

const general = themes.find(({ id }) => id === 'general');
const incompatibleStyleOptions = [
  [general, 'anime', { 'style.ART_STYLE': 'opt0006', 'style.FINISH': 'opt0002', 'style.LIGHTING': 'opt0006' }],
  [general, 'anime', { 'style.ART_STYLE': 'charcoal_animation_film', 'style.LIGHTING': 'opt0009' }],
  [general, 'illustration', { 'style.ART_STYLE': 'cyanotype_illustration', 'style.LIGHTING': 'opt0003' }],
  [general, 'graphic', { 'style.ART_STYLE': 'opt0002', 'style.FINISH': 'opt0002', 'style.LIGHTING': 'opt0005' }],
  [general, 'graphic', { 'style.ART_STYLE': 'opt0003', 'style.MATERIAL': 'opt0003' }],
  [general, 'three_d', { 'style.ART_STYLE': 'opt0003', 'style.FINISH': 'opt0002', 'style.LENS': 'opt0004' }],
  [general, 'three_d', { 'style.ART_STYLE': 'miniature_cgi_cinema', 'style.LENS': 'opt0004' }],
  [themes.find(({ id }) => id === 'asian_male_studio'), 'photography', { 'style.ART_STYLE': 'opt0004', 'style.LIGHTING': 'opt0002' }],
];
for (const [theme, styleId, locks] of incompatibleStyleOptions) {
  const pool = styles.filter(({ style }) => style.id === styleId);
  assert.throws(
    () => generateV4(theme, pool, locks, [], seededRandom()),
    /沒有符合條件的組合；手動選擇與主題／畫風約束衝突/,
    `${styleId}: allowed conflicting locks ${JSON.stringify(locks)}`,
  );
}
console.log(`PASS style constraints: rejected ${incompatibleStyleOptions.length} conflicting combinations`);

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
