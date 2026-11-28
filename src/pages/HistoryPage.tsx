import { useEffect, useState } from "react";
import { Copy, Download, DownloadCloud, Eye, FolderInput, MonitorUp, RotateCcw, Search, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri, type FolderInfo, type GenRecord, type PendingRequest } from "../backend";
import { useThumbnailUrl, type ImageLoadError } from "../hooks/useThumbnailUrl";

interface HistoryPageProps {
  records: GenRecord[];
  pendings: PendingRequest[];
  recoveringId: string | null;
  folders: FolderInfo[];
  onRecover: (requestId: string, singleCheck?: boolean) => void;
  onDiscard: (requestId: string) => void;
  onRetry: (pending: PendingRequest) => void;
  onOpen: (record: GenRecord) => void;
  onImageError: ImageLoadError;
  onApply: (record: GenRecord) => void;
  onCopyPrompt: (prompt: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onAssignFolder: (wallpaperId: string, folderId: string | null) => void;
}

const shortModel = (model: string) => model.replace(/^bytedance\//, "").replace(/\/text-to-image$/, "");

function HistoryThumb({ record, onImageError }: { record: GenRecord; onImageError: ImageLoadError }) {
  const image = convertFileSrc(record.imagePath);
  const thumb = useThumbnailUrl(image, record.id, onImageError);
  if (!thumb) return <div className="history-thumb is-empty" aria-hidden="true" />;
  return <img className="history-thumb" src={thumb} alt={`${record.title} 缩略图`} width="160" height="90" loading="lazy" decoding="async" draggable="false" />;
}

const formatTime = (epochSeconds: number) => {
  if (!epochSeconds) return "—";
  const date = new Date(epochSeconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function HistoryPage({ records, pendings, recoveringId, folders, onRecover, onDiscard, onRetry, onOpen, onImageError, onApply, onCopyPrompt, onBatchDelete, onAssignFolder }: HistoryPageProps) {
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRetry, setConfirmingRetry] = useState<string | null>(null);
  const [batchFolder, setBatchFolder] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const latestRecords = records.slice(0, 10);
  const models = Array.from(new Set(latestRecords.map((record) => record.model)));
  const keyword = search.trim().toLowerCase();
  const filtered = latestRecords.filter((record) => {
    if (modelFilter !== "all" && record.model !== modelFilter) return false;
    if (!keyword) return true;
    return record.prompt.toLowerCase().includes(keyword)
      || record.title.toLowerCase().includes(keyword)
      || record.english.toLowerCase().includes(keyword);
  });
  const deletableFiltered = filtered.filter((record) => record.model !== "bundled");
  const allSelected = deletableFiltered.length > 0 && deletableFiltered.every((record) => selected.has(record.id));

  useEffect(() => {
    if (!pendings.some((pending) => pending.active)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendings]);

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((current) => {
      if (allSelected) {
        const next = new Set(current);
        deletableFiltered.forEach((record) => next.delete(record.id));
        return next;
      }
      const next = new Set(current);
      deletableFiltered.forEach((record) => next.add(record.id));
      return next;
    });
    setConfirmingDelete(false);
  };

  const runBatchDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    onBatchDelete(Array.from(selected));
    setSelected(new Set());
    setConfirmingDelete(false);
  };

  const folderSelect = (record: GenRecord) => isTauri && (
    <select
      className="select history-folder-select"
      aria-label={`${record.title} 所在文件夹`}
      value={record.folder}
      onChange={(event) => onAssignFolder(record.id, event.target.value || null)}
    >
      <option value="">根目录</option>
      {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
    </select>
  );

  return (
    <main id="main-content" className="history-page page-enter">
      <div className="page-heading">
        <div><h1>记录</h1><p>最新 10 张与未完成任务。</p></div>
        <span className="preset-count"><b>{latestRecords.length + pendings.length}</b> 条</span>
      </div>

      {pendings.length > 0 && (
        <section className="history-pending" aria-labelledby="pending-title">
          <h2 id="pending-title">待取回 · {pendings.length}</h2>
          <p>生成中的会自动入库；100 秒后可手动查询。已停止轮询的，可以取回、按原参数重投，或放弃。</p>
          {pendings.map((pending) => (
            <article className="history-row is-pending" key={pending.requestId}>
              <div className="history-thumb is-empty" aria-hidden="true"><DownloadCloud size={20} /></div>
              <div className="history-main">
                <div className="history-title-line">
                  <b>{pending.styleName}</b>
                  <small>{shortModel(pending.model)} · {pending.resolution} · {pending.aspectRatio} · {formatTime(pending.createdAt)}</small>
                </div>
                <p className="history-prompt">{pending.prompt}</p>
                <small className="history-request" title={pending.requestId}>{pending.requestId.startsWith("local-") ? "提交状态未知：未收到服务端请求 ID，请先检查账户记录。" : `req ${pending.requestId.slice(0, 8)}…`}</small>
              </div>
              <div className="history-actions">
                {pending.active ? (
                  now - pending.createdAt * 1000 >= 100_000 ? (
                    <button className="btn primary-button" disabled={recoveringId !== null} onClick={() => onRecover(pending.requestId, true)}>
                      <Search size={15} /> {recoveringId === pending.requestId ? "查询中…" : "手动查询"}
                    </button>
                  ) : (
                    <span className="history-active-note">生成中 · 100 秒后可手动查询</span>
                  )
                ) : (
                  <>
                    <button className="btn primary-button" disabled={recoveringId !== null || pending.requestId.startsWith("local-")} title={pending.requestId.startsWith("local-") ? "没有服务端请求 ID，无法自动取回" : undefined} onClick={() => onRecover(pending.requestId)}>
                      {recoveringId === pending.requestId ? "取回中…" : "取回"}
                    </button>
                    <button className="btn ghost-button" disabled={recoveringId !== null} onClick={() => { if (confirmingRetry === pending.requestId) { setConfirmingRetry(null); onRetry(pending); } else setConfirmingRetry(pending.requestId); }}><RotateCcw size={15} /> {confirmingRetry === pending.requestId ? "可能重复计费，再点确认重投" : "重试"}</button>
                    <button className="btn ghost-button" disabled={recoveringId !== null} onClick={() => onDiscard(pending.requestId)}><Trash2 size={15} /> 忽略</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {records.length > 10 && <p className="source-empty">{isTauri ? "仅显示最新 10 张；较早作品请到存储文件夹维护，位置见「设置 → 存储位置」。" : "当前仅显示最新 10 张；下载需要的作品到设备保存。"}</p>}

      <section className="history-filters" aria-label="记录筛选">
        <input
          className="input"
          aria-label="搜索记录"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜 prompt、标题或英文副标"
          autoComplete="off"
        />
        <select className="select" aria-label="按模型筛选" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
          <option value="all">全部模型</option>
          {models.map((model) => <option value={model} key={model}>{shortModel(model)}</option>)}
        </select>
      </section>

      {selected.size > 0 && (
        <div className="history-batch-bar" role="toolbar" aria-label="批量操作">
          <span>已选 {selected.size} 条</span>
          <button className="btn ghost-button" onClick={toggleSelectAll}>{allSelected ? "取消全选" : "全选当前"}</button>
          <button className="btn ghost-button" onClick={() => { setSelected(new Set()); setConfirmingDelete(false); }}>清除选择</button>
          {isTauri && <div className="batch-folder">
            <FolderInput size={15} aria-hidden="true" />
            <select className="select" aria-label="批量移动到文件夹" value={batchFolder} onChange={(event) => setBatchFolder(event.target.value)}>
              <option value="">移动到…</option>
              {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
            </select>
            <button
              className="btn ghost-button"
              disabled={!batchFolder}
              onClick={() => {
                Array.from(selected).forEach((id) => onAssignFolder(id, batchFolder));
                setSelected(new Set());
                setBatchFolder("");
              }}
            >
              执行
            </button>
          </div>}
          <button className={`btn ${confirmingDelete ? "danger-button" : "ghost-button"}`} onClick={runBatchDelete}>
            <Trash2 size={15} /> {confirmingDelete ? `确认删除 ${selected.size} 条？` : "批量删除"}
          </button>
        </div>
      )}

      <section aria-label="生成记录">
        <label className="history-select-all">
          <input type="checkbox" checked={allSelected} disabled={deletableFiltered.length === 0} onChange={toggleSelectAll} aria-label="选择当前筛选的全部记录" />
          选择当前可删除记录（{deletableFiltered.length}）
        </label>
        {filtered.length === 0 && <p className="source-empty">{records.length ? "没有匹配的记录。" : "还没有生成记录，回「此刻」来一张。"}</p>}
        {filtered.map((record) => (
          <article className={`history-row${selected.has(record.id) ? " is-selected" : ""}`} key={record.id}>
            <input
              className="history-check"
              type="checkbox"
              checked={selected.has(record.id)}
              disabled={record.model === "bundled"}
              title={record.model === "bundled" ? "内置壁纸不可删除" : undefined}
              onChange={() => toggleSelect(record.id)}
              aria-label={`选择记录 ${record.title} ${record.issue}`}
            />
            <HistoryThumb record={record} onImageError={onImageError} />
            <div className="history-main">
              <div className="history-title-line">
                <b>№{String(record.issue).padStart(2, "0")} {record.title}</b>
                <small>{shortModel(record.model)} · {record.resolution} · {record.aspectRatio} · {formatTime(record.createdAt)}</small>
              </div>
              <p className="history-prompt">{record.prompt}</p>
            </div>
            <div className="history-actions">
              {folderSelect(record)}
              <button className="btn ghost-button" onClick={() => onOpen(record)}><Eye size={15} /> 查看</button>
              <button className="btn ghost-button" onClick={() => onApply(record)}>
                {isTauri ? <MonitorUp size={15} /> : <Download size={15} />} {isTauri ? "上墙" : "下载"}
              </button>
              <button className="btn ghost-button" onClick={() => onCopyPrompt(record.prompt)}><Copy size={15} /> 复制 Prompt</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

