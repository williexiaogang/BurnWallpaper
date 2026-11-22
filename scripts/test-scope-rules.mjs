import { chooseStylePack, combinePacks, resolveStylePrompt, resolveStylePromptDetailed, runPresetTests } from "../src/utils/prompt.ts";
import { parseStylePresetImport, presetBundleTemplateText, presetTemplate, presetTemplateText } from "../src/utils/preset-json.ts";
import presetData from "../src/style-presets/index.ts";

const content = presetData.find((preset) => preset.id === "general");
const core = presetData.find((preset) => preset.id === "core");
const studio = presetData.find((preset) => preset.id === "studio");
const general = combinePacks(content, core);
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
}

function selections(framing) {
  return {
    ...Object.fromEntries(Object.keys(general.variables).map((variable) => [variable, "__random__"])),
    FRAMING: framing,
  };
}

const fixedRandom = (value = 0.01) => () => value;

{
  const prompt = resolveStylePrompt(general, selections("close-up on face and shoulders"), fixedRandom());
  console.log("\n[1] face close-up:\n", prompt, "\n");
  check("face close-up 不含鞋类", !/sneaker|boot|shoe/i.test(prompt), prompt);
  check("face close-up 不含服装", !/jacket|shirt|shorts|pants|hoodie/i.test(prompt), prompt);
  check("face close-up 保留表情", /gaze|smirk|stare|expression|calm|breathing heavily/i.test(prompt), prompt);
  check("无残留占位符", !/\{\w+\}/.test(prompt), prompt);
}

{
  const prompt = resolveStylePrompt(general, selections("close-up on legs and footwear"), fixedRandom());
  console.log("[2] legs close-up:\n", prompt, "\n");
  check("legs close-up 保留鞋", /sneaker|boot|shoe/i.test(prompt), prompt);
  check("legs close-up 保留下装", /shorts|pants/i.test(prompt), prompt);
  check("legs close-up 无上衣", !/jacket|shirt|hoodie|tank top|jersey|vest/i.test(prompt), prompt);
  check("legs close-up 无表情", !/gaze|smirk|stare|expression/i.test(prompt), prompt);
}

{
  const prompt = resolveStylePrompt(general, selections("close-up on foot and footwear"), fixedRandom());
  console.log("[3] foot close-up:\n", prompt, "\n");
  check("foot close-up 保留鞋", /sneaker|boot|shoe/i.test(prompt), prompt);
  check("foot close-up 不含上下装", !/jacket|shirt|shorts|pants|hoodie/i.test(prompt), prompt);
  check("foot close-up 不含面部姿势", !/turning to look|focused expression|gaze|smirk/i.test(prompt), prompt);
}

{
  const prompt = resolveStylePrompt(general, selections("full body"), fixedRandom());
  console.log("[4] full body:\n", prompt, "\n");
  check("full body 保留服装与鞋", /wearing/i.test(prompt) && /sneaker|boot|shoe/i.test(prompt), prompt);
  check("full body 无空洞", !/,\s*,/.test(prompt) && !/\{\w+\}/.test(prompt), prompt);
}

{
  const picks = selections("full body");
  picks.ART_STYLE = "modern anime illustration";
  picks.POSE = "one foot raised showing the sneaker";
  let calls = 0;
  const prompt = resolveStylePrompt(general, { ...picks, FRAMING: "__random__" }, () => calls++ === 0 ? 0.6 : 0.01);
  console.log("[5] random face close-up + conflicting pose:\n", prompt, "\n");
  check("冲突姿势被省略", !/one foot raised/.test(prompt), prompt);
}

{
  const seasonPreset = {
    schema_version: 3,
    kind: "content",
    id: "season_test",
    name: "季节测试",
    english: "TEST",
    description: "通用标签验证",
    is_builtin: false,
    template: [{ text: "A {SEASON} scene, {SUBJECT}" }, { if: "OUTFIT", text: " wearing {OUTFIT}" }],
    variables: {
      SEASON: {
        provider: true,
        group: "presentation",
        options: [
          { value: "snowy winter", provides: ["cold"] },
          { value: "blazing summer", provides: ["hot"] },
        ],
      },
      SUBJECT: { group: "content", options: [{ value: "a wolf" }, { value: "a tiger" }] },
      OUTFIT: {
        group: "content",
        options: [
          { value: "a heavy down jacket", requires: ["cold"] },
          { value: "a summer tank top", requires: ["hot"] },
          { value: "a simple cloak" },
        ],
      },
    },
    tests: [],
    randomize_variables: true,
    aspect_ratio: "16:9",
  };
  const picks = { SEASON: "__random__", SUBJECT: "__random__", OUTFIT: "__random__" };
  const winter = resolveStylePrompt(seasonPreset, picks, fixedRandom(0.01));
  const summer = resolveStylePrompt(seasonPreset, picks, fixedRandom(0.9));
  console.log("[6] tag rules:\n", winter, "\n", summer, "\n");
  check("冬季不出现夏装", !/tank top/.test(winter), winter);
  check("夏季不出现羽绒服", !/down jacket/.test(summer), summer);
}

{
  const results = runPresetTests(general);
  for (const result of results) {
    check(`内置测试：${result.name}`, result.passed, `${result.failures.join("、")}\n${result.prompt}`);
  }
}

{
  for (const [variable, config] of Object.entries(general.variables)) {
    const values = config.options.map((option) => option.value);
    check(`${variable} 没有重复选项`, new Set(values).size === values.length);
    check(`${variable} 有中文变量名`, Boolean(config.label), variable);
    for (const option of config.options) {
      check(`${variable} 选项有中文对照`, Boolean(option.label), option.value);
    }
  }
  for (const style of general.variables.ART_STYLE.options) {
    const provided = new Set(style.provides ?? []);
    for (const variable of ["MATERIAL", "BRUSH", "FINISH"]) {
      const config = general.variables[variable];
      const compatible = config.options.filter((option) =>
        (option.requires ?? config.requires ?? []).every((tag) => provided.has(tag))
        && (!option.any_of || option.any_of.some((tag) => provided.has(tag)))
        && !option.excludes?.some((tag) => provided.has(tag)));
      check(`画风有相容${variable}：${style.value}`, compatible.length > 0);
    }
  }
  let valid = true;
  try {
    parseStylePresetImport(JSON.stringify(content), []);
    parseStylePresetImport(JSON.stringify(core), []);
  } catch (error) { valid = false; console.error(error); }
  check("内容与画风包可通过严格验证", valid);
}

{
  const zeroWeighted = structuredClone(presetTemplate);
  for (const option of zeroWeighted.variables.SUBJECT.options) option.weight = 0;
  const result = resolveStylePromptDetailed(zeroWeighted, {
    FRAMING: "full body",
    SUBJECT: "__random__",
    OUTFIT: "__omit__",
    FOOTWEAR: "__omit__",
  }, fixedRandom());
  check("全零权重时省略变量", result.omitted.includes("SUBJECT") && !result.resolved.some((item) => item.variable === "SUBJECT"), result.prompt);
}

{
  const imported = parseStylePresetImport(presetTemplateText, []);
  check("AI 内容模板可通过严格验证", imported.length === 1 && imported[0].schema_version === 3 && imported[0].kind === "content");
  const bundle = parseStylePresetImport(presetBundleTemplateText, []);
  check("bundle 拆成内容与画风包", bundle.length === 2 && bundle[0].kind === "content" && bundle[1].kind === "style");
  const invalid = structuredClone(presetTemplate);
  delete invalid.variables.FRAMING.options[0].provides;
  let rejected = false;
  try { parseStylePresetImport(JSON.stringify(invalid), []); } catch (error) { rejected = /provides/.test(String(error)); }
  check("provider 缺规则会指出错误", rejected);
  let legacyRejected = false;
  try { parseStylePresetImport(JSON.stringify({ ...presetTemplate, schema_version: 2 }), []); } catch { legacyRejected = true; }
  check("v2 格式明确拒绝", legacyRejected);
}

{
  const first = chooseStylePack([core, studio], ["core", "studio"], fixedRandom(0));
  const second = chooseStylePack([core, studio], ["core", "studio"], fixedRandom(0.99));
  check("多选画风包按随机值抽取", first.id === "core" && second.id === "studio");
  check("单选画风包固定使用", chooseStylePack([core, studio], ["studio"], fixedRandom(0)).id === "studio");
  check("画风选项都有分类", core.variables.ART_STYLE.options.every((option) => option.category));
}

{
  const detail = resolveStylePromptDetailed(general, selections("full body"), fixedRandom());
  check("中文预览包含变量中文对照", /[\u4e00-\u9fff]/.test(detail.preview) && detail.resolved.every((item) => item.label && detail.preview.includes(item.label)), detail.preview);
  check("英文提交保留变量英文值", !/[\u4e00-\u9fff]/.test(detail.prompt) && detail.resolved.every((item) => detail.prompt.includes(item.value)), detail.prompt);
  const compositions = general.variables.COMPOSITION.options.map((option) => option.value);
  check("通用预设包含多种画面布局", compositions.length >= 8 && compositions.some((value) => detail.prompt.includes(value)), detail.prompt);
}

if (failed) {
  console.error(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL PASS");
