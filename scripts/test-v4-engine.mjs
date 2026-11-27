import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseV4, generateV4 } from '../src/v4/engine.ts';
import { bundledPresets } from '../src/v4/bundled-presets.ts';
import { sceneCategories, sceneOptions, scopeScenes } from '../src/v4/scenes.ts';
import { createStudioLibrary, getStudioPresets, studioPromptLocks } from '../src/v4/studio-presets.ts';
const { themes, library } = bundledPresets;
const theme = parseV4(readFileSync(new URL('../design/prompt-scheme-v4.example.json', import.meta.url), 'utf8'));
const styles = library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style }));
let seed = 421; const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const rain = generateV4(theme, styles, { DIRECTION: 'urban_night', SCENE: 'rainy_street', FRAMING: 'full', CLOTHING: 'raincoat' }, [], random);
assert.match(rain.prompt, /raincoat/);
assert.throws(() => generateV4(theme, styles, { DIRECTION: 'urban_night', SCENE: 'rainy_street', FRAMING: 'portrait', CLOTHING: 'raincoat' }, [], random), /沒有符合條件/);
assert.throws(() => generateV4(theme, [], {}, [], random), /沒有選擇畫風/);
const tied = structuredClone(theme);
tied.variables.SCENE.options.find(({ id }) => id === 'rainy_street').requires_all = ['style:anime'];
assert.throws(() => generateV4(tied, styles.filter((s) => s.style.id === 'illustration'), { DIRECTION: 'urban_night', SCENE: 'rainy_street' }, [], random), /沒有符合條件/);
const match = generateV4(tied, styles.filter((s) => s.style.id === 'anime'), { DIRECTION: 'urban_night', SCENE: 'rainy_street' }, [], random);
assert.equal(match.styleId, `${library.id}/anime`);
assert.throws(() => parseV4(JSON.stringify({ ...theme, schema_version: 3 })), /只接受 4/);
const bad = structuredClone(theme); bad.variables.SCENE.options[1].id = bad.variables.SCENE.options[0].id;
assert.throws(() => parseV4(JSON.stringify(bad)), /重複選項/);
const simple = { schema_version:4, kind:'prompt_scheme', id:'distribution', name:'distribution', aspect_ratio:'16:9', style:{mode:'embedded'}, template:[{text:'{X}'}], sampling:{history_window:1,repeat_penalty:0,diversity_keys:['X']}, variables:{X:{label:'X',required:true,options:[{id:'a',label:'a',value:'a',weight:1},{id:'b',label:'b',value:'b',weight:3}]}} };
let b = 0; for (let i=0; i<5000; i++) if (generateV4(simple, [], {}, [], random).prompt === 'b') b++;
assert(b > 3600 && b < 3900, `weight distribution ${b}`);
const history = [{themeId:'distribution', selections:{X:'b'}, prompt:'b', at:1}];
assert.equal(generateV4(simple, [], {}, history, random).prompt,'a');
assert.equal(generateV4(simple, [], {X:'b'}, history, random).prompt,'b');
assert.throws(() => generateV4(theme, styles, {}, [], random, 0), /搜尋次數已達上限/);
console.log('v4 engine: cross-resource rules, locks, validation, weights, history and search limits passed');

const concept = themes.find(({ id }) => id === 'concept');
assert.equal(scopeScenes(concept), concept);
assert.ok(sceneCategories(concept).includes('fantasy'));
const fantasy = scopeScenes(concept, 'fantasy');
const fantasyIds = new Set(sceneOptions(concept, 'fantasy').map(({ id }) => id));
assert.ok(sceneOptions(concept, 'indoor').some(({ id }) => fantasyIds.has(id)));
assert.equal(sceneOptions(concept).filter(({ id }) => id === 'lunar_greenhouse').length, 1);
for (let i = 0; i < 30; i++) {
  const result = generateV4(fantasy, styles, { MOTIF: 'opt0001' }, [], random);
  assert.ok(fantasyIds.has(result.selections.SCENE));
  assert.match(result.prompt, /small fish/);
}
const clouds = generateV4(fantasy, styles, { MOTIF: 'opt0001', SCENE: 'cloud_sea', DECORATION: 'edge_stars_and_moons' }, [], random);
assert.match(clouds.prompt, /small fish.*drifting clouds.*small star and crescent motifs/);
assert.throws(() => scopeScenes(concept, 'empty'), /没有可抽取的场景/);
assert.throws(() => generateV4(fantasy, styles, { SCENE: 'opt0001' }), /選項不存在/);
const invalidCategory = structuredClone(concept);
invalidCategory.variables.SCENE.options[0].categories = ['outdoor', 'outdoor'];
assert.throws(() => parseV4(JSON.stringify(invalidCategory)), /categories/);

const portrait = themes.find(({ id }) => id === 'asian_male_studio');
const photo = styles.filter(({ style }) => style.id === 'photography');
const pullUp = { POSE: 'pull_up_top', FRAMING: 'opt0001' };
assert.throws(() => generateV4(scopeScenes(portrait, 'fantasy'), photo, pullUp), /沒有符合條件/);
const rooftop = generateV4(scopeScenes(portrait, 'outdoor'), photo, pullUp, [], random);
assert.equal(rooftop.selections.SCENE, 'rooftop_pull_up');
assert.equal(rooftop.selections.HAND_POSITION, undefined);
assert.match(rooftop.prompt, /rooftop workout area with a visible pull-up bar/);
console.log('v4 scenes: category filtering, overlapping membership, fantasy motifs, decoration and equipment constraints passed');

const general = themes.find(({ id }) => id === 'general');
const anime = styles.filter(({ style }) => style.id === 'anime');
const art = anime[0].style.variables.ART_STYLE.options[0];
const customLocks = {
  OCCUPATION: { text: ' a bicycle courier ' },
  LOWER_CLOTHING: { text: 'black linen trousers' },
  'style.ART_STYLE': { text: 'angular pen illustration', baseId: art.id },
};
const custom = generateV4(general, anime, customLocks, [], random);
assert.match(custom.prompt, /working as a bicycle courier.*wearing black linen trousers.*angular pen illustration/);
assert.deepEqual(custom.customValues, { OCCUPATION: 'a bicycle courier', LOWER_CLOTHING: 'black linen trousers', 'style.ART_STYLE': 'angular pen illustration' });
assert.equal(custom.selections.OCCUPATION, '__custom__');
assert.ok(custom.selections['style.PALETTE']);
assert.ok(!general.variables.OCCUPATION.options.some(({ value }) => value === 'a bicycle courier'));
for (const framing of general.variables.FRAMING.options) {
  const result = generateV4(general, anime, { FRAMING: framing.id }, [], random);
  assert.ok(result.selections.LOWER_CLOTHING, framing.id);
}
assert.throws(() => generateV4(general, anime, { LOWER_CLOTHING: null }), /必填變量/);
assert.throws(() => generateV4(general, anime, { FRAMING: 'opt0008', FOOTWEAR: { text: 'yellow boots' } }), /沒有符合條件/);
console.log('v4 custom values: required trousers, manual theme and style values, and shared framing constraints passed');

const studioPresets = getStudioPresets([]);
assert.equal(studioPresets.length, 19);
assert.equal(new Set(studioPresets.map(({ fullId }) => fullId)).size, studioPresets.length);
for (const { thumbnail } of studioPresets) {
  const cover = readFileSync(new URL(`../public/style-previews/${thumbnail}`, import.meta.url));
  assert.equal(cover.toString('ascii', 8, 12), 'WEBP', thumbnail);
}
for (const preset of studioPresets) {
  const draft = parseV4(JSON.stringify(preset.theme));
  assert.ok(!themes.some(({ id }) => id === draft.id));
  const reference = generateV4(draft, [preset], studioPromptLocks(preset, {}, 'reference'), [], random);
  assert.equal(reference.styleId, preset.fullId);
  for (const [key, variable] of Object.entries(draft.variables)) {
    assert.equal(reference.selections[key], variable.options[0].id);
    assert.ok(reference.prompt.includes(variable.options[0].value), `${preset.fullId} ${key}`);
  }
  assert.ok(Array.from(reference.prompt).length <= 799, `${preset.fullId} exceeds the shortest supported prompt limit`);
  const detail = generateV4(draft, [preset], studioPromptLocks(preset, {}, 'details', reference), [{ ...reference, at: 1 }], random);
  assert.notEqual(detail.selections.DETAIL, reference.selections.DETAIL);
  assert.deepEqual({ ...detail.selections, DETAIL: reference.selections.DETAIL }, reference.selections);
  const manual = { SCENE: { text: 'a pale lavender observatory at dusk' } };
  const edited = generateV4(draft, [preset], studioPromptLocks(preset, manual, 'edit', detail, 'SCENE'), [], random);
  assert.match(edited.prompt, /pale lavender observatory at dusk/);
  assert.ok(!edited.prompt.includes(draft.variables.SCENE.options[0].value));
  assert.deepEqual({ ...edited.selections, SCENE: detail.selections.SCENE }, detail.selections);
  const varied = Array.from({ length: 8 }, () => generateV4(draft, [preset], studioPromptLocks(preset, manual, 'free', edited), [], random));
  assert.ok(varied.every((result) => result.selections['style.ART_STYLE'] === preset.artStyle && result.customValues.SCENE === manual.SCENE.text));
  assert.ok(varied.some((result) => result.selections.SUBJECT !== reference.selections.SUBJECT));
  assert.ok(varied.some((result) => result.selections.COMPOSITION !== reference.selections.COMPOSITION));
}
for (const [thumbnail, visibleCue, inferredMedium] of [
  ['embroidered-illustration.webp', /knit-like loops/, /embroidery|embroidered/i],
  ['palette-knife-oil.webp', /pigment ridges.*scrape-like/, /palette knife|oil painting/i],
  ['soft-animation-cgi.webp', /lit hair tips.*coarser surface/, /CGI/i],
]) {
  const preset = studioPresets.find((entry) => entry.thumbnail === thumbnail);
  const result = generateV4(preset.theme, [preset], studioPromptLocks(preset, {}, 'reference'), [], random);
  assert.match(result.prompt, visibleCue);
  assert.doesNotMatch(result.prompt, inferredMedium);
}
const { pack: customLibrary, preset: customStudio } = createStudioLibrary('studio_test', '线稿', 'fine lithographic linework', 'sepia and ivory');
assert.equal(getStudioPresets([customLibrary]).at(-1).fullId, customStudio.fullId);
const customDraft = generateV4(customStudio.theme, [customStudio], studioPromptLocks(customStudio, {}, 'reference'), [], random);
assert.match(customDraft.prompt, /fine lithographic linework.*sepia and ivory/);
console.log('v4 studio drafts: 19 reference setups, thumbnail assets, visible texture cues, detail rerolls, background edits and free variations passed');
