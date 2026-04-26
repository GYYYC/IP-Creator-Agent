"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/demo-data";
import { ThemeToggle } from "@/components/theme-toggle";

const navIconPaths: Record<string, string> = {
  "/dashboard": "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z",
  "/director": "M5 4h10l4 4v12H5V4Zm9 0v5h5M8 13h8M8 17h6",
  "/doctor": "M4 19V5h16v14H4Zm3-4 3-3 3 2 4-6M7 8h4",
  "/assistant": "M4 5h16v11H8l-4 4V5Zm5 5h.01M12 10h.01M15 10h.01",
  "/history": "M6 5h12v16H6V5Zm3-2h6M9 10h6M9 14h6M9 18h4"
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d={navIconPaths[href] ?? navIconPaths["/dashboard"]} />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <>
      <aside className="app-sidebar">
        <Link className="app-brand" href="/dashboard">
          <span className="app-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M7 16c0-5 4-9 9-9s9 4 9 9v5c0 3-2 5-5 5h-8c-3 0-5-2-5-5v-5Z" />
              <path d="M12 15h.01M20 15h.01M13 21h6" />
              <path d="M16 7V3M9 9 6 6M23 9l3-3" />
            </svg>
          </span>
          <span className="app-brand-copy">
            <strong>IP Creator Agent</strong>
            <span>KOC 专属版</span>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`app-nav-link ${active ? "active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <NavIcon href={item.href} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-priority-card">
          <span>今日优先</span>
          <strong>先写一条能发的内容</strong>
          <p>写完再复盘，最后处理评论区。</p>
          <Link href="/director">开始创作</Link>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="search-command">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          </svg>
          <span>搜索脚本、内容、功能...</span>
          <kbd>⌘ K</kbd>
        </div>

        <div className="topbar-actions">
          <span className="assistant-state">
            <span />
            在线
          </span>
          <Link className="profile-entry" href="/profile">
            个人画像
          </Link>
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
