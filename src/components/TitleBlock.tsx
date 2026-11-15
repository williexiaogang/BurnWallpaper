import type { Wallpaper } from "../types";

export function TitleBlock({ wallpaper }: { wallpaper: Wallpaper }) {
  return (
    <section className="title-block chrome" aria-labelledby="wallpaper-title">
      <div className="issue" aria-label={`第 ${Number(wallpaper.issue)} 期`}>{wallpaper.issue}</div>
      <h1 id="wallpaper-title" className="move-name">{wallpaper.title}</h1>
      <p className="english-name">{wallpaper.english}</p>
      <ul className="tag-list" aria-label="作品题材">
        {wallpaper.tags.map((tag) => <li className="tag" key={tag}>{tag}</li>)}
      </ul>
    </section>
  );
}
