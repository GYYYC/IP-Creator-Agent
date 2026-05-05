"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HistoryEntry } from "@/lib/agent/history-data";
import { postJson } from "@/lib/client-api";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function deleteHistoryEntries(sessionIds: string[]) {
  const payload = await postJson<{ deletedIds: string[] }>("/api/history/delete", { sessionIds });
  return payload.deletedIds ?? [];
}

function visibleArtifacts(artifacts: HistoryEntry["artifacts"]) {
  const frameArtifacts = artifacts.filter((artifact) => /frame\.jpg$/i.test(artifact.fileName));
  const regularArtifacts = artifacts.filter((artifact) => !/frame\.jpg$/i.test(artifact.fileName));
  const visible = regularArtifacts.slice(0, 3);
  const hiddenRegularCount = Math.max(0, regularArtifacts.length - visible.length);

  return {
    frameCount: frameArtifacts.length,
    hiddenRegularCount,
    visible
  };
}

export function HistoryStudio({ entries }: { entries: HistoryEntry[] }) {
  const [items, setItems] = useState(entries);
  const [activeModule, setActiveModule] = useState<HistoryEntry["module"] | "all">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filters = useMemo(
    () => [
      { key: "all" as const, label: "全部", count: items.length },
      { key: "director" as const, label: "脚本创作", count: items.filter((entry) => entry.module === "director").length },
      { key: "doctor" as const, label: "内容复盘", count: items.filter((entry) => entry.module === "doctor").length },
      { key: "assistant" as const, label: "评论处理", count: items.filter((entry) => entry.module === "assistant").length }
    ],
    [items]
  );
  const visibleEntries =
    activeModule === "all" ? items : items.filter((entry) => entry.module === activeModule);
  const selectedVisibleCount = visibleEntries.filter((entry) => selectedIdSet.has(entry.id)).length;

  function toggleSelected(id: string) {
    setNotice("");
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function selectVisibleEntries() {
    setNotice("");
    const visibleIds = visibleEntries.map((entry) => entry.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  function clearSelection() {
    setNotice("");
    setSelectedIds([]);
  }

  async function handleDeleteSelected() {
    if (!selectedIds.length || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `删除选中的 ${selectedIds.length} 条记录？相关附件和保存内容也会一起移除。`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setNotice("");

    try {
      const deletedIds = await deleteHistoryEntries(selectedIds);
      const deletedIdSet = new Set(deletedIds);

      setItems((current) => current.filter((entry) => !deletedIdSet.has(entry.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIdSet.has(id)));
      setNotice(deletedIds.length ? `已删除 ${deletedIds.length} 条记录。` : "没有找到可删除的记录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败，请稍后再试。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <section className="history-filter-bar" aria-label="记录分区">
        {filters.map((filter) => (
          <button
            className={`history-filter ${activeModule === filter.key ? "active" : ""}`}
            key={filter.key}
            onClick={() => setActiveModule(filter.key)}
            type="button"
          >
            <span>{filter.label}</span>
            <strong>{filter.count}</strong>
          </button>
        ))}
      </section>

      {items.length ? (
        <section className="history-selection-bar" aria-live="polite">
          <div>
            <strong>{selectedIds.length ? `已选 ${selectedIds.length} 条` : "选择记录"}</strong>
            {notice ? <span>{notice}</span> : null}
          </div>
          <div className="history-selection-actions">
            {visibleEntries.length && selectedVisibleCount < visibleEntries.length ? (
              <button className="button-secondary" onClick={selectVisibleEntries} type="button">
                选中当前列表
              </button>
            ) : null}
            {selectedIds.length ? (
              <>
                <button className="button-secondary" onClick={clearSelection} type="button">
                  取消选择
                </button>
                <button
                  className="button-danger"
                  disabled={isDeleting}
                  onClick={handleDeleteSelected}
                  type="button"
                >
                  {isDeleting ? "删除中" : "删除选中"}
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {!visibleEntries.length ? (
        <section className="surface-card glass history-empty">
          <span className="label">还没有记录</span>
          <h3>{activeModule === "all" ? "先完成一次处理" : `先完成一次${filters.find((item) => item.key === activeModule)?.label}`}</h3>
          <p>脚本、复盘结论和评论洞察会按类型放在这里。</p>
          <div className="history-empty-actions">
            <Link className="button-primary" href="/director">
              去脚本创作
            </Link>
            <Link className="button-secondary" href="/doctor">
              去内容复盘
            </Link>
            <Link className="button-secondary" href="/assistant">
              去评论助手
            </Link>
          </div>
        </section>
      ) : (
        <section className="history-list">
          {visibleEntries.map((entry) => {
            const artifactPreview = visibleArtifacts(entry.artifacts);

            return (
              <article
                className={`surface-card glass history-card ${entry.module} ${
                  selectedIdSet.has(entry.id) ? "selected" : ""
                }`}
                key={entry.id}
              >
              <div className="history-card-head">
                <button
                  aria-pressed={selectedIdSet.has(entry.id)}
                  className="history-select-control"
                  onClick={() => toggleSelected(entry.id)}
                  type="button"
                >
                  <span>{selectedIdSet.has(entry.id) ? "已选" : "选择"}</span>
                </button>
                <div>
                  <span className="label">{entry.moduleLabel}</span>
                  <h3>{entry.title}</h3>
                </div>
                <span className="muted">{formatDate(entry.updatedAt)}</span>
              </div>

              <p>{entry.summary}</p>

              {entry.writebacks.length ? (
                <div className="callout">
                  <strong>已保存到画像</strong>
                  <div className="action-bullets">
                    {entry.writebacks.map((item) => (
                      <div className="bullet-row" key={item.id}>
                        <span className="bullet-dot" />
                        <span>{item.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {entry.artifacts.length ? (
                <div className="selected-files">
                  {artifactPreview.visible.map((artifact) => (
                    <span key={artifact.id}>{artifact.fileName}</span>
                  ))}
                  {artifactPreview.frameCount ? (
                    <span>关键帧 {artifactPreview.frameCount} 张</span>
                  ) : null}
                  {artifactPreview.hiddenRegularCount ? (
                    <span>还有 {artifactPreview.hiddenRegularCount} 个素材</span>
                  ) : null}
                </div>
              ) : null}

              <div className="page-actions">
                <Link className="button-secondary" href={entry.href}>
                  回到这一条
                </Link>
              </div>
            </article>
            );
          })}
        </section>
      )}
    </>
  );
}
