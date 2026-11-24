import { readFileSync } from 'node:fs';
import { parseV4, generateV4 } from '../src/v4/engine.ts';
const read = (file) => parseV4(readFileSync(new URL(file, import.meta.url), 'utf8'));
const library = read('../src/v4/default-styles.json');
const styles = library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style }));
const generic = read('../design/prompt-scheme-v4.example.json');
const genericResult = generateV4(generic, styles.filter((style) => style.style.id === 'anime'));
if (!genericResult.prompt) throw Error('untyped custom themes must support built-in styles');
for (const name of ['general', 'concept', 'asian_male_studio', 'aj_series']) {
  const theme = read(`../src/v4/themes/${name}.json`);
  const available = styles.filter((style) => theme.style.recommended.includes(style.fullId));
  for (let i = 0; i < 30; i++) {
    const result = generateV4(theme, available);
    if (!result.prompt || /\{[A-Z_0-9]+\}/.test(result.prompt)) throw Error(`${name}: invalid prompt`);
  }
  for (const test of theme.tests ?? []) {
    let seed = 1234567; const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
    const result = generateV4(theme, available, test.select, [], random);
    const expect = test.expect;
    if ((expect.include ?? []).some((key) => !result.selections[key]) || (expect.omit ?? []).some((key) => result.selections[key]) || (expect.prompt_contains ?? []).some((value) => !result.prompt.toLowerCase().includes(value.toLowerCase())) || (expect.prompt_excludes ?? []).some((value) => result.prompt.toLowerCase().includes(value.toLowerCase()))) throw Error(`${name}: ${test.name} failed`);
  }
  console.log(`PASS ${name}: generated 30 compatible prompts`);
}
