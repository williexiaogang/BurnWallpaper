import type { Wallpaper } from "../types";

export function TitleBlock({ wallpaper }: { wallpaper: Wallpaper }) {
  return (
    /* 刻意不帶 .chrome：閒置時控件全部消失，期號/招式名作為壁紙的一部分保留 */
    <section className="title-block" aria-labelledby="wallpaper-title">
      <div className="issue" aria-label={`第 ${Number(wallpaper.issue)} 期`}>{wallpaper.issue}</div>
      <h1 id="wallpaper-title" className="move-name">{wallpaper.title}</h1>
      <p className="english-name">{wallpaper.english}</p>
      <ul className="tag-list" aria-label="作品题材">
        {wallpaper.tags.map((tag) => <li className="tag" key={tag}>{tag}</li>)}
      </ul>
    </section>
  );
}
