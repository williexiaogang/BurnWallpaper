import type { Wallpaper } from "../types";

export const TITLE_LAYOUTS = ["classic", "ruled", "rail", "poster", "editorial", "stamp"] as const;
export type TitleLayout = typeof TITLE_LAYOUTS[number];
export type TitleLayoutPreference = "auto" | "hidden" | TitleLayout;
export const TITLE_LAYOUT_OPTIONS: { value: TitleLayoutPreference; label: string }[] = [
  { value: "auto", label: "自动变化" },
  { value: "classic", label: "经典叠字" },
  { value: "ruled", label: "杂志分栏" },
  { value: "rail", label: "侧边竖排" },
  { value: "poster", label: "海报大字" },
  { value: "editorial", label: "编辑手记" },
  { value: "stamp", label: "编号印章" },
  { value: "hidden", label: "隐藏文字" },
];

export function TitleBlock({ wallpaper, preference = "auto" }: { wallpaper: Wallpaper; preference?: TitleLayoutPreference }) {
  const issue = Number(wallpaper.issue);
  const fallback = Array.from(wallpaper.id).reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 0);
  const layout = preference === "auto" ? TITLE_LAYOUTS[(Number.isSafeInteger(issue) && issue >= 0 ? issue : fallback) % TITLE_LAYOUTS.length] : preference;
  if (layout === "hidden") return null;
  return (
    /* 刻意不帶 .chrome：閒置時控件全部消失，期號/招式名作為壁紙的一部分保留 */
    <section className="title-block" data-layout={layout} aria-labelledby="wallpaper-title">
      <div className="issue-lockup">
        <span className="issue-label">ISSUE NO.</span>
        <div className="issue" aria-label={`第 ${wallpaper.issue} 期`}>{wallpaper.issue}</div>
        <span className="issue-mark">BURN</span>
      </div>
      <h1 id="wallpaper-title" className="move-name">{wallpaper.title}</h1>
      <div className="english-line">
        <p className="english-name">{wallpaper.english}</p>
        <span className="title-resolution">{wallpaper.resolution}</span>
      </div>
      <ul className="tag-list" aria-label="作品题材">
        {wallpaper.tags.map((tag) => <li className="tag" key={tag}>{tag}</li>)}
      </ul>
    </section>
  );
}

