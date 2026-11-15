import { useState } from "react";
import { Copy, DownloadCloud, Eye, FolderInput, MonitorUp, RotateCcw, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FolderInfo, GenRecord, PendingRequest } from "../backend";

interface HistoryPageProps {
  records: GenRecord[];
  pendings: PendingRequest[];
  recoveringId: string | null;
  folders: FolderInfo[];
  onRecover: (requestId: string) => void;
  onDiscard: (requestId: string) => void;
  onRetry: (pending: PendingRequest) => void;
  onOpen: (record: GenRecord) => void;
  onApply: (record: GenRecord) => void;
  onCopyPrompt: (prompt: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onAssignFolder: (wallpaperId: string, folderId: string | null) => void;
}

const shortModel = (model: string) => model.replace(/^bytedance\//, "").replace(/\/text-to-image$/, "");

const formatTime = (epochSeconds: number) => {
  if (!epochSeconds) return "—";
  const date = new Date(epochSeconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function HistoryPage({ records, pendings, recoveringId, folders, onRecover, onDiscard, onRetry, onOpen, onApply, onCopyPrompt, onBatchDelete, onAssignFolder }: HistoryPageProps) {
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [batchFolder, setBatchFolder] = useState("");
  const models = Array.from(new Set(records.map((record) => record.model)));
  const keyword = search.trim().toLowerCase();
  const filtered = records.filter((record) => {
    if (modelFilter !== "all" && record.model !== modelFilter) return false;
    if (!keyword) return true;
    return record.prompt.toLowerCase().includes(keyword)
      || record.title.toLowerCase().includes(keyword)
      || record.english.toLowerCase().includes(keyword);
  });
  const allSelected = filtered.length > 0 && filtered.every((record) => selected.has(record.id));

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
        filtered.forEach((record) => next.delete(record.id));
        return next;
      }
      const next = new Set(current);
      filtered.forEach((record) => next.add(record.id));
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

  const folderSelect = (record: GenRecord) => (
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
        <div><h1>记录</h1><p>每一张的来路，都查得到。</p></div>
        <span className="preset-count"><b>{records.length + pendings.length}</b> 条</span>
      </div>

      {pendings.length > 0 && (
        <section className="history-pending" aria-labelledby="pending-title">
          <h2 id="pending-title">待取回 · {pendings.length}</h2>
          <p>生成中的会自动入库；本地没拿到结果的，可以取回、按原参数重投，或放弃。</p>
          {pendings.map((pending) => (
            <article className="history-row is-pending" key={pending.requestId}>
              <div className="history-thumb is-empty" aria-hidden="true"><DownloadCloud size={20} /></div>
              <div className="history-main">
                <div className="history-title-line">
                  <b>{pending.styleName}</b>
                  <small>{shortModel(pending.model)} · {pending.resolution} · {pending.aspectRatio} · {formatTime(pending.createdAt)}</small>
                </div>
                <p className="history-prompt">{pending.prompt}</p>
                <small className="history-request" title={pending.requestId}>req {pending.requestId.slice(0, 8)}…</small>
              </div>
              <div className="history-actions">
                {pending.active ? (
                  <span className="history-active-note">生成中 · 完成后自动入库</span>
                ) : (
                  <>
                    <button className="btn primary-button" disabled={recoveringId !== null} onClick={() => onRecover(pending.requestId)}>
                      {recoveringId === pending.requestId ? "取回中…" : "取回"}
                    </button>
                    <button className="btn ghost-button" disabled={recoveringId !== null} onClick={() => onRetry(pending)}><RotateCcw size={15} /> 重试</button>
                    <button className="btn ghost-button" disabled={recoveringId !== null} onClick={() => onDiscard(pending.requestId)}><Trash2 size={15} /> 忽略</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

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
          <div className="batch-folder">
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
          </div>
          <button className={`btn ${confirmingDelete ? "danger-button" : "ghost-button"}`} onClick={runBatchDelete}>
            <Trash2 size={15} /> {confirmingDelete ? `确认删除 ${selected.size} 条？` : "批量删除"}
          </button>
        </div>
      )}

      <section aria-label="生成记录">
        <label className="history-select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="选择当前筛选的全部记录" />
          选择当前筛选结果（{filtered.length}）
        </label>
        {filtered.length === 0 && <p className="source-empty">{records.length ? "没有匹配的记录。" : "还没有生成记录，回「此刻」来一张。"}</p>}
        {filtered.map((record) => (
          <article className={`history-row${selected.has(record.id) ? " is-selected" : ""}`} key={record.id}>
            <input
              className="history-check"
              type="checkbox"
              checked={selected.has(record.id)}
              onChange={() => toggleSelect(record.id)}
              aria-label={`选择记录 ${record.title} ${record.issue}`}
            />
            <img className="history-thumb" src={convertFileSrc(record.imagePath)} alt={`${record.title} 缩略图`} width="160" height="90" draggable="false" />
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
              <button className="btn ghost-button" onClick={() => onApply(record)}><MonitorUp size={15} /> 上墙</button>
              <button className="btn ghost-button" onClick={() => onCopyPrompt(record.prompt)}><Copy size={15} /> 复制 Prompt</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
