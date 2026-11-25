import { useState } from "react";
import { Shuffle } from "lucide-react";
import { normalizePromptText, type Block, type PromptLocks, type Result, type Variable } from "../v4/engine";

interface PreviewPart {
  text: string;
  variable?: string;
  title?: string;
}

function normalizeEnglishParts(parts: PreviewPart[]): PreviewPart[] {
  const owners = parts.flatMap((part, index) => Array<number>(part.text.length).fill(index));
  const text = normalizePromptText(parts.map((part) => part.text).join(""), (start, length, retained) => {
    if (retained === undefined) owners.splice(start, length);
    else owners.splice(start, length, owners[retained]);
  });

  const normalized: PreviewPart[] = [];
  let start = 0;
  for (let end = 1; end <= owners.length; end++) {
    if (owners[end] === owners[start]) continue;
    normalized.push({ ...parts[owners[start]], text: text.slice(start, end) });
    start = end;
  }
  return normalized;
}

function previewParts(result: Result, language: "zh" | "en"): PreviewPart[] {
  const english = language === "en";
  const render = (template: Block[], variables: Record<string, Variable>, prefix: string) => {
    const resolve = (name: string) => {
      const key = prefix + name;
      const text = result.customValues?.[key];
      return text ? { label: text, value: text } : variables[name]?.options.find((option) => option.id === result.selections[key]);
    };
    const parts: PreviewPart[] = [];
    const appendText = (text: string) => {
      const previous = parts.at(-1);
      if (previous && !previous.variable) previous.text += text;
      else if (text) parts.push({ text });
    };

    for (const block of template) {
      if (block.if && !resolve(block.if)?.value) continue;
      const text = english ? block.text : block.text_zh ?? block.text;
      for (const [index, part] of text.split(/\{([A-Z][A-Z0-9_]*)\}/g).entries()) {
        if (index % 2 === 0) appendText(part);
        else {
          const option = resolve(part);
          if (option?.value) parts.push({
            text: english ? option.value : option.label,
            variable: prefix + part,
            title: variables[part].label + " · " + (english ? option.label : option.value),
          });
        }
      }
    }

    if (english) return normalizeEnglishParts(parts);
    for (const part of parts) {
      if (!part.variable) part.text = part.text.replace(/[ \t]{2,}/g, " ").replace(/[,，](?:\s*[,，])+/g, "，").replace(/\s+([,.，。])/g, "$1").replace(/[,，]\s*([.。])/g, "$1");
    }
    if (parts[0] && !parts[0].variable) parts[0].text = parts[0].text.trimStart().replace(/^[,，]\s*/, "");
    const last = parts.at(-1);
    if (last && !last.variable) last.text = last.text.trimEnd().replace(/[,，]\s*$/, "");
    return parts.filter((part) => part.text);
  };

  const theme = result.themeSnapshot;
  const style = result.styleSnapshot;
  const parts = render(theme.template, theme.variables, "");
  const styleParts = style ? render(style.template, style.variables, "style.") : [];
  return parts.length && styleParts.length ? [...parts, { text: english ? ", " : "；" }, ...styleParts] : [...parts, ...styleParts];
}

interface Props {
  preview: Result | null;
  active: string;
  locks: PromptLocks;
  onEdit: (key: string) => void;
  onReroll: () => void;
}

export function V4PromptPreview({ preview, active, locks, onEdit, onReroll }: Props) {
  const [language, setLanguage] = useState<"zh" | "en">("zh");

  return (
    <div className="live-prompt-panel">
      <div className="live-prompt-language">
        <div className="prompt-language-options" role="group" aria-label="预览语言">
          <button className="btn ghost-button prompt-language-toggle" type="button" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文预览</button>
          <button className="btn ghost-button prompt-language-toggle" type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>英文 Prompt</button>
        </div>
        <button className="btn ghost-button reroll-preview-button" type="button" onClick={onReroll} title="保留已固定的变量，重新抽取随机项">
          <Shuffle size={14} aria-hidden="true" /> {preview ? "换一组" : "抽取预览"}
        </button>
      </div>
      <div className="live-prompt-text" lang={preview && language === "en" ? "en" : "zh-CN"}>
        {!preview ? "抽取后在这里查看 Prompt。" : previewParts(preview, language).map(({ text, variable, title }, index) => (
          variable ? (
            <button
              className={"prompt-token" + (variable in locks ? " is-manual" : "") + (active === variable ? " is-active" : "")}
              key={index}
              type="button"
              title={title}
              aria-pressed={active === variable}
              onClick={() => onEdit(variable)}
            >{text}</button>
          ) : <span key={index}>{text}</span>
        ))}
      </div>
      {preview && <p className="live-prompt-omitted">点击高亮词编辑变量。</p>}
    </div>
  );
}
