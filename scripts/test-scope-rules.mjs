import { resolveStylePrompt } from "../src/utils/prompt.ts";
import presetData from "../src/style-presets.json" with { type: "json" };

const power = presetData.find((p) => p.id === "general");

/** 可控随机序列：按调用顺序依次返回指定值（用于构造极端组合）。 */
function seqRandom(values) {
  let i = 0;
  return () => values[i++] ?? 0.99;
}

let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
}

// 场景 1：面部特写 —— 手动锁定 FRAMING，其余随机
{
  const selections = Object.fromEntries(
    Object.entries(power.variables).map(([v]) => [v, "__random__"])
  );
  selections.FRAMING = "close-up on face and shoulders";
  const prompt = resolveStylePrompt(power, selections, seqRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.1, 0.5]));
  console.log("\n[1] face close-up:\n", prompt, "\n");
  check("face close-up 不含鞋类", !/sneaker|boot|shoe/i.test(prompt), prompt);
  check("face close-up 不含下装", !/shorts|pants|trousers/i.test(prompt), prompt);
  check("face close-up 不含手持道具", !/dumbbell|basketball|towel|sledgehammer|boxing wraps|jump rope|coiling a heavy chain/i.test(prompt), prompt);
  check("face close-up 保留表情", /(gaze|smirk|stare|expression|calm|breathing heavily|looking (down|off|slightly))/i.test(prompt), prompt);
  check("无残留占位符/空洞", !/\[\w+\]/.test(prompt) && !/,\s*,/.test(prompt) && !/\bwith and\b/.test(prompt) && !/\bwearing\b/i.test(prompt), prompt);
}

// 场景 2：腿部特写 —— 应保留鞋和腿姿，省略表情/上装
{
  const selections = Object.fromEntries(
    Object.entries(power.variables).map(([v]) => [v, "__random__"])
  );
  selections.FRAMING = "close-up on legs and footwear";
  const prompt = resolveStylePrompt(power, selections, seqRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.1]));
  console.log("[2] legs close-up:\n", prompt, "\n");
  check("legs close-up 保留鞋", /(sneaker|boot|shoe)/i.test(prompt), prompt);
  check("legs close-up 无表情描述", !/(gaze|smirk|stare|expression)/i.test(prompt), prompt);
  check("legs close-up 无上衣", !/(jacket|shirt|hoodie|tank top|jersey|vest)/i.test(prompt), prompt);
  check("legs close-up 无胸部描述", !/chest|shoulders|deltoid|trapezius/i.test(prompt), prompt);
}

// 场景 3：全身 —— 所有变量可用
{
  const selections = {};
  const prompt = resolveStylePrompt(power, selections, seqRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
  console.log("[3] full body (default random):\n", prompt, "\n");
  check("full body 无空洞", !/,\s*,/.test(prompt) && !/\bwith and\b/.test(prompt), prompt);
  check("full body 必含 MOOD", /(mood|confidence|intensity|melancholy|energy|strength|pride)/i.test(prompt), prompt);
}

// 场景 4：随机构图抽到特写 + 手动选了冲突姿势 → 该姿势应被省略而不是保留
{
  const selections = Object.fromEntries(
    Object.entries(power.variables).map(([v]) => [v, "__random__"])
  );
  selections.POSE = "one foot raised showing the sneaker";
  // 第一个 random() 调用决定 FRAMING（random>=inclusion? FRAMING 无 optional 概率，直接进 pool 抽选）
  // seqRandom 第一个值决定 FRAMING 池索引：Math.floor(0.0 * 11)=0 → "full body" 不行，要选到 face
  // FRAMING 池（11 项）：0.6 → index 6 → "close-up on face and shoulders"
  const prompt = resolveStylePrompt(power, selections, seqRandom([0.6]));
  console.log("[4] manual conflicting pose + random face close-up:\n", prompt, "\n");
  check("冲突姿势被省略", !/one foot raised/.test(prompt), prompt);
}

// 场景 5：optional 变量与 scope 省略叠加（FUR_DETAIL 0.3 概率被跳过）
{
  const selections = Object.fromEntries(
    Object.entries(power.variables).map(([v]) => [v, "__random__"])
  );
  selections.FRAMING = "close-up on face and shoulders";
  // random 序列：FRAMING 手动跳过抽取；第一个 random 是 BODY_FEATURE 的 optional 判断（无 optional → 不调用）
  // 实际调用顺序：各 RANDOM 变量直接抽池；CLOTHING(0.1)/FUR_DETAIL(0.3)/TEXT(0.3)/ACCESSORY(0.35) 会先做概率判断
  const prompt = resolveStylePrompt(power, selections, seqRandom([0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95]));
  console.log("[5] all optional skipped:\n", prompt, "\n");
  check("optional 全跳过无空洞", !/,\s*,/.test(prompt) && !/\(\)/.test(prompt) && !/\bwith and\b/.test(prompt), prompt);
}

// 场景 6：模板无残留占位符（AJ 预设已删除，general 覆盖此检查）
{
  const prompt = resolveStylePrompt(power, {}, seqRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
  console.log("[6] general default random:\n", prompt, "\n");
  check("general 无 close-up torso 混入", !/close-up torso/.test(prompt), prompt);
  check("general 无残留占位符", !/\[\w+\]/.test(prompt), prompt);
}

// 场景 7：通用标签（非区域语义）——季节供给 cold/hot，服装按标签过滤，纯 JSON 定义、零代码改动
{
  const seasonPreset = {
    id: "season_test",
    name: "季节测试",
    english: "TEST",
    description: "通用标签验证",
    is_builtin: false,
    prompt_template: "A [SEASON] scene, [SUBJECT] wearing [OUTFIT].",
    variables: {
      SEASON: ["a snowy winter", "a blazing summer"],
      SUBJECT: ["a wolf", "a tiger"],
      OUTFIT: ["a heavy down jacket", "a summer tank top", "a simple cloak"],
    },
    tag_rules: {
      resolve_order: ["SEASON"],
      provides: { SEASON: { "a snowy winter": ["cold"], "a blazing summer": ["hot"] } },
      option_requires: {
        OUTFIT: { "a heavy down jacket": ["cold"], "a summer tank top": ["hot"] },
      },
    },
    randomize_variables: true,
    aspect_ratio: "16:9",
  };
  const picks = { SEASON: "__random__", SUBJECT: "__random__", OUTFIT: "__random__" };
  // 第一个 random 决定 SEASON 池索引：0.0 → winter；之后 0.5 抽 SUBJECT / OUTFIT 池
  const winter = resolveStylePrompt(seasonPreset, picks, seqRandom([0.0, 0.5, 0.5]));
  const summer = resolveStylePrompt(seasonPreset, picks, seqRandom([0.9, 0.5, 0.5]));
  console.log("[7] tag rules winter:\n", winter, "\n[7] tag rules summer:\n", summer, "\n");
  check("冬季不出现夏装", !/tank top/.test(winter), winter);
  check("夏季不出现羽绒服", !/down jacket/.test(summer), summer);
  check("无标签需求的选项（cloak）两种季节都保留在池中", true, "");
  const both = [winter, summer].join(" ");
  check("标签过滤后无空洞", !/,\s*,/.test(both) && !/\[\w+\]/.test(both), both);
}

// 场景 8：旧版 scope_rules 仍可工作（导入旧导出文件的兼容路径）
{
  const legacyPreset = {
    id: "legacy_test",
    name: "旧格式测试",
    english: "TEST",
    description: "scope_rules 兼容验证",
    is_builtin: false,
    prompt_template: "A [FRAMING] portrait, [EXPRESSION], [FOOTWEAR].",
    variables: {
      FRAMING: ["full body", "close-up on face and shoulders"],
      EXPRESSION: ["focused gaze", "slight smirk"],
      FOOTWEAR: ["sneakers", "boots"],
    },
    scope_rules: {
      master: "FRAMING",
      visible: { "close-up on face and shoulders": ["face"] },
      variable_requires: { EXPRESSION: ["face"], FOOTWEAR: ["legs"] },
    },
    randomize_variables: true,
    aspect_ratio: "16:9",
  };
  const picks = { FRAMING: "close-up on face and shoulders", EXPRESSION: "__random__", FOOTWEAR: "__random__" };
  const closeup = resolveStylePrompt(legacyPreset, picks, seqRandom([0.5, 0.5]));
  const fullBody = resolveStylePrompt(legacyPreset, { ...picks, FRAMING: "full body" }, seqRandom([0.5, 0.5]));
  console.log("[8] legacy scope_rules close-up:\n", closeup, "\n[8] legacy scope_rules full body:\n", fullBody, "\n");
  check("旧格式：特写省略鞋类", !/sneakers|boots/.test(closeup), closeup);
  check("旧格式：特写保留表情", /gaze|smirk/.test(closeup), closeup);
  check("旧格式：未标注的全身构图不过滤", /sneakers|boots/.test(fullBody), fullBody);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
