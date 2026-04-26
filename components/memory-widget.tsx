"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { creatorMemory } from "@/lib/demo-data";

type BrainSnapshot = {
  title: string;
  subtitle: string;
  tags: string[];
  notes: Array<{ title: string; body: string }>;
};

type BootstrapResponse =
  | { ok: true; data: { brain: BrainSnapshot } }
  | { ok: false; error: string };

export function MemoryWidget() {
  const [collapsed, setCollapsed] = useState(true);
  const [brain, setBrain] = useState<BrainSnapshot>({
    title: creatorMemory.title,
    subtitle: creatorMemory.subtitle,
    tags: creatorMemory.tags,
    notes: creatorMemory.notes
  });

  useEffect(() => {
    let active = true;

    async function loadBrain() {
      try {
        const response = await fetch("/api/bootstrap");
        const payload = (await response.json()) as BootstrapResponse;
        if (active && payload.ok) {
          setBrain(payload.data.brain);
        }
      } catch {
        // Keep demo memory visible when the API is unavailable.
      }
    }

    loadBrain();

    return () => {
      active = false;
    };
  }, []);

  if (collapsed) {
    return (
      <aside className="memory-launcher glass">
        <button
          aria-expanded="false"
          className="memory-launcher-button"
          onClick={() => setCollapsed(false)}
          type="button"
        >
          <span>画像</span>
          <strong>{brain.title}</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className="memory-widget glass">
      <div className="memory-widget-header">
        <div className="memory-widget-title">
          <span className="label">当前画像</span>
          <h3>{brain.title}</h3>
        </div>
        <button
          aria-expanded="true"
          className="memory-toggle"
          onClick={() => setCollapsed(true)}
          type="button"
        >
          收起
        </button>
      </div>

      <div className="memory-widget-body">
        <p className="muted">{brain.subtitle}</p>

        <div className="mode-switch">
          {brain.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>

        <div className="data-list">
          {brain.notes.map((note) => (
            <div className="data-row" key={`${note.title}-${note.body}`}>
              <div>
                <strong>{note.title}</strong>
                <div>{note.body}</div>
              </div>
            </div>
          ))}
        </div>

        <Link className="button-secondary" href="/profile">
          编辑画像
        </Link>
      </div>
    </aside>
  );
}
