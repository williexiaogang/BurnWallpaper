import type { Wallpaper } from "../types";

const TITLE_LAYOUTS = ["classic", "ruled", "rail", "poster"] as const;

export function TitleBlock({ wallpaper }: { wallpaper: Wallpaper }) {
  const issue = Number(wallpaper.issue);
  const fallback = Array.from(wallpaper.id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const layout = TITLE_LAYOUTS[(Number.isFinite(issue) ? issue : fallback) % TITLE_LAYOUTS.length];
  return (
    /* 刻意不帶 .chrome：閒置時控件全部消失，期號/招式名作為壁紙的一部分保留 */
    <section className="title-block" data-layout={layout} aria-labelledby="wallpaper-title">
      <div className="issue-lockup">
        <span className="issue-label">ISSUE NO.</span>
        <div className="issue" aria-label={`第 ${Number(wallpaper.issue)} 期`}>{wallpaper.issue}</div>
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
