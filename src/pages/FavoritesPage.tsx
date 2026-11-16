import { useState } from "react";
import { Bookmark, MoreHorizontal } from "lucide-react";
import type { Wallpaper } from "../types";
import { ContextMenu } from "../components/ContextMenu";
import { useThumbnailUrl } from "../hooks/useThumbnailUrl";

interface FavoritesPageProps {
  items: Wallpaper[];
  onOpen: (id: string) => void;
  onApply: (id: string) => void;
  onRemove: (id: string) => void;
  onSimilar: (wallpaper: Wallpaper) => void;
  onToast: (text: string) => void;
}

/** 列表縮略圖：480px webp，生成期間回退 4K 原圖（僅首次會話）。 */
function FavoriteThumb({ image, title }: { image: string; title: string }) {
  const thumb = useThumbnailUrl(image);
  return <img src={thumb ?? image} alt={`${title} 动漫壁纸`} width="1600" height="900" loading="lazy" decoding="async" />;
}

export function FavoritesPage({ items, onOpen, onApply, onRemove, onSimilar, onToast }: FavoritesPageProps) {
  const [topic, setTopic] = useState("全部题材");
  const [tone, setTone] = useState("全部色调");
  const [light, setLight] = useState("全部明暗");
  const [menu, setMenu] = useState<{ wallpaper: Wallpaper; x: number; y: number } | null>(null);
  const filtered = items.filter((item) =>
    (topic === "全部题材" || item.tags.includes(topic)) &&
    (tone === "全部色调" || item.tone === tone) &&
    (light === "全部明暗" || item.light === light),
  );

  const openMenu = (wallpaper: Wallpaper, x: number, y: number) => setMenu({ wallpaper, x, y });

  return (
    <main id="main-content" className="library-page page-enter">
      <div className="page-heading">
        <div><h1>收藏</h1><p>把想再看一眼的招式留下来。</p></div>
        <span className="collection-count"><b>{filtered.length}</b> 张在场</span>
      </div>
      <form className="filters" aria-label="收藏筛选" onSubmit={(event) => event.preventDefault()}>
        <label>题材<select className="select" value={topic} onChange={(event) => setTopic(event.target.value)}><option>全部题材</option><option>拳击</option><option>战斗</option><option>格斗</option><option>篮球</option></select></label>
        <label>色调<select className="select" value={tone} onChange={(event) => setTone(event.target.value)}><option>全部色调</option><option>暖色</option><option>原色</option><option>冷色</option></select></label>
        <label>明暗<select className="select" value={light} onChange={(event) => setLight(event.target.value)}><option>全部明暗</option><option>明亮</option><option>暗色</option></select></label>
      </form>
      {filtered.length > 0 ? (
        <section className="favorite-grid" aria-label="收藏的壁纸">
          {filtered.map((wallpaper) => (
            <article
              className={`favorite-item ratio-${wallpaper.ratio}`}
              key={wallpaper.id}
              onContextMenu={(event) => { event.preventDefault(); openMenu(wallpaper, event.clientX, event.clientY); }}
            >
              <button className="favorite-art" onClick={() => onOpen(wallpaper.id)} aria-label={`查看 ${wallpaper.title}`}>
                <FavoriteThumb image={wallpaper.image} title={wallpaper.title} />
                <span className="favorite-number">{wallpaper.issue}</span>
                <span className="favorite-caption"><strong>{wallpaper.title}</strong><small>{wallpaper.english}</small></span>
              </button>
              <button className="favorite-more" aria-label={`${wallpaper.title} 更多操作`} onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu(wallpaper, rect.left - 180, rect.bottom);
              }}><MoreHorizontal size={19} /></button>
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <Bookmark size={44} strokeWidth={1.5} />
          <h2>{items.length === 0 ? "还没开打" : "这一格没有作品"}</h2>
          <p>{items.length === 0 ? "看到喜欢的，就收进来。" : "换个筛选，其他招式还在。"}</p>
          {(topic !== "全部题材" || tone !== "全部色调" || light !== "全部明暗") && <button className="btn ghost-button" onClick={() => { setTopic("全部题材"); setTone("全部色调"); setLight("全部明暗"); }}>清空筛选</button>}
        </section>
      )}
      {menu && <ContextMenu
        {...menu}
        onClose={() => setMenu(null)}
        onApply={() => { onApply(menu.wallpaper.id); setMenu(null); }}
        onSimilar={() => { onSimilar(menu.wallpaper); setMenu(null); }}
        onRemove={() => { onRemove(menu.wallpaper.id); setMenu(null); }}
        onToast={onToast}
      />}
    </main>
  );
}
