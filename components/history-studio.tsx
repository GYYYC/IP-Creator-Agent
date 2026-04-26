"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HistoryEntry } from "@/lib/agent/history-data";

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

export function HistoryStudio({ entries }: { entries: HistoryEntry[] }) {
  const [activeModule, setActiveModule] = useState<HistoryEntry["module"] | "all">("all");
  const filters = useMemo(
    () => [
      { key: "all" as const, label: "全部", count: entries.length },
      { key: "director" as const, label: "脚本创作", count: entries.filter((entry) => entry.module === "director").length },
      { key: "doctor" as const, label: "内容复盘", count: entries.filter((entry) => entry.module === "doctor").length },
      { key: "assistant" as const, label: "评论处理", count: entries.filter((entry) => entry.module === "assistant").length }
    ],
    [entries]
  );
  const visibleEntries =
    activeModule === "all" ? entries : entries.filter((entry) => entry.module === activeModule);

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
          {visibleEntries.map((entry) => (
            <article className={`surface-card glass history-card ${entry.module}`} key={entry.id}>
              <div className="history-card-head">
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
                  {entry.artifacts.map((artifact) => (
                    <span key={artifact.id}>{artifact.fileName}</span>
                  ))}
                </div>
              ) : null}

              <div className="page-actions">
                <Link className="button-secondary" href={entry.href}>
                  回到这一条
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
