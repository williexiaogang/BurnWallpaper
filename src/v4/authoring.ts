import themeExample from "../../design/prompt-scheme-v4.example.json";
import libraryExample from "../../design/style-library-v4.example.json";

const instructions = `# Burn Wallpaper · v4 AI 制作模板

为 Burn Wallpaper 制作可导入的 schema v4 JSON。

用户需求：[填写主体、构图、场景、可选变化，以及要输出主题还是画风库。]

## 交付格式

- 每个文件由一个完整的 JSON 对象组成。请直接返回 JSON，每份按独立文件处理。
- 主题使用 \`schema_version: 4\` 和 \`kind: "prompt_scheme"\`，填写 \`id\`、\`name\`、\`aspect_ratio\`、\`template\`、\`variables\`。构图、姿势、主体和实际场景写进主题。
- 画风库使用 \`schema_version: 4\` 和 \`kind: "style_library"\`，填写 \`id\`、\`name\`、\`styles\`。每个画风各有 \`id\`、\`name\`、\`template\`、\`variables\`，优先描述媒介、材质、笔触和光线。
- 主题搭配画风库时使用 \`style.mode: "external"\`，用 \`style.recommended\` 列出默认启用的 \`library_id/style_id\`。同时制作两份时先导入画风库，再导入主题。主题自带画风时使用 \`style.mode: "embedded"\`，省略 \`recommended\`。
- 文件、画风和选项 ID 以小写英文字母开头，可含小写字母、数字、下划线和连字符。制作新方案时使用新的文件 ID，修改已有自订方案时保留仍适用的选项 ID。

## 双语 Prompt

- 变量名使用大写英文字母开头，可含大写字母、数字和下划线。每个变量填写 \`label\`、\`required\`、\`options\`，每个选项填写 \`id\`、中文 \`label\` 和英文 \`value\`。
- 模板由 \`text\`、可选的 \`text_zh\` 和可选的 \`if\` 组成。\`{VARIABLE}\` 引用当前主题或当前画风自己的变量。英文预览和出图用 \`text\` 与英文 \`value\`，中文预览用 \`text_zh\` 与中文标签。
- 含可选描述的片段用 \`if: "VARIABLE"\` 控制整段是否出现。变量的值非空时才显示该片段。只提供约束的选项可以用空字符串作为 \`value\`。
- 主体和构图放在英文模板开头。选项写成可以直接拼入句子的片段，并检查分隔符和占位符。

## 兼容、抽取与测试

- 用 \`tags\` 提供 \`namespace:value\` 格式的标签。用 \`requires_all\` 要求全部命中，用 \`requires_any\` 要求至少一个命中，用 \`excludes\` 排除命中的标签。每个依赖标签都要由相应主题或画风的选项提供。
- 需要按题材限制画风时，可让主题的 \`CONTENT_TYPE\` 选项提供 \`type:human\`、\`type:anthropomorphic\` 或 \`type:abstract\`，再在画风上写相应规则。构图可提供可见部位标签供姿势、衣着等选项使用。
- 可选变量可用 0 至 1 的 \`probability\`。随机候选用非负 \`weight\`（默认 1），合法候选的软偏好用 \`prefer\`。可用 \`sampling.history_window\`、\`repeat_penalty\` 和 \`diversity_keys\` 控制近期避重。
- 主题可加入 \`tests\`。用 \`select\` 记录变量到选项 ID 的映射，用 \`expect.selected\`、\`include\`、\`omit\`、\`prompt_contains\`、\`prompt_excludes\` 或 \`error: "incompatible_selection"\` 断言结果。验证随机可省略的选项时，显式选中要验证的值。
- 交付前检查所有模板变量、选项 ID、画风引用和约束标签。导入或测试失败时，根据具体错误修正并重新给出完整 JSON。
`;

export function buildAiAuthoringTemplate(): string {
  const example = (title: string, data: unknown) =>
    "## " + title + "\n\n```json\n" + JSON.stringify(data, null, 2) + "\n```\n";

  return [
    instructions,
    example("主题示例 · prompt_scheme", themeExample),
    example("画风库示例 · style_library", libraryExample),
  ].join("\n");
}
