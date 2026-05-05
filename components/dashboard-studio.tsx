import Link from "next/link";
import { DashboardData } from "@/lib/agent/dashboard-data";

const featureCards = [
  {
    href: "/director",
    label: "脚本创作",
    title: "把一个想法写成完整内容",
    description: "选图文或视频，补齐关键信息，再拿到可继续改的完整稿。",
    action: "开始写",
    tone: "blue",
    iconPath: "M5 19 19 5M14 5h5v5M6 15l3 3M4 21l5-2-4-4-1 6Z"
  },
  {
    href: "/doctor",
    label: "内容复盘",
    title: "看清这条内容该先改哪里",
    description: "上传图文、视频、数据截图或关键时间点，先定位掉点和机会。",
    action: "去复盘",
    tone: "green",
    iconPath: "M4 19V5h16v14H4Zm3-4 3-3 3 2 4-6M7 8h4"
  },
  {
    href: "/assistant",
    label: "评论助手",
    title: "把评论区变成下一期选题",
    description: "识别高价值评论、风险评论和回复方向，顺手沉淀受众需求。",
    action: "处理评论",
    tone: "cyan",
    iconPath: "M4 5h16v11H8l-4 4V5Zm5 5h.01M12 10h.01M15 10h.01"
  }
];

const kpis = [
  { label: "今日创作", value: "23", unit: "篇" },
  { label: "播放量", value: "8.7w", unit: "" },
  { label: "互动数", value: "1,387", unit: "" },
  { label: "粉丝净增", value: "92", unit: "" }
];

function CardIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" className="dashboard-card-icon" viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  );
}

export function DashboardStudio({ data }: { data: DashboardData }) {
  const profile = data.profileSnapshot;

  return (
    <div className="dashboard-shell">
      <section className="dashboard-hero">
        <div>
          <span className="label">工作台</span>
          <h1>晚上好，糖糖的日常</h1>
          <p>先选今天最值得推进的一步，再把内容、复盘和评论串起来。</p>
        </div>
        <div className="dashboard-kpis">
          {kpis.map((item) => (
            <div className="kpi-tile" key={item.label}>
              <strong>
                {item.value}
                <small>{item.unit}</small>
              </strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-feature-grid">
        {featureCards.map((card) => (
          <Link className={`feature-card ${card.tone}`} href={card.href} key={card.href}>
            <div className="feature-card-head">
              <CardIcon path={card.iconPath} />
              <span>{card.label}</span>
              <b aria-hidden="true">→</b>
            </div>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
            <div className="feature-card-preview">
              <span>{card.action}</span>
              <i aria-hidden="true" />
            </div>
          </Link>
        ))}
      </section>

      <section className="dashboard-bottom-grid">
        <div className="surface-card glass">
          <div className="section-line-head">
            <span className="label">创作记录</span>
            <Link href="/history">全部记录</Link>
          </div>
          <div className="record-strip">
            {data.recentItems.length ? (
              data.recentItems.map((item) => (
                <Link className="record-card" href={item.href} key={item.id}>
                  <span>{item.moduleLabel}</span>
                  <strong>{item.title}</strong>
                  <p>{item.content}</p>
                </Link>
              ))
            ) : (
              <article className="record-card record-empty">
                <span>还没有记录</span>
                <strong>先完成一条内容</strong>
                <p>脚本、复盘和评论处理完成后会自动出现在这里。</p>
              </article>
            )}
            <Link className="record-add" href="/director">
              <span>+</span>
              <strong>开始新创作</strong>
            </Link>
          </div>
        </div>

        <aside className="surface-card glass profile-snapshot-card">
          <div className="section-line-head">
            <span className="label">个人画像</span>
            <Link href="/profile">查看详情</Link>
          </div>
          <div className="profile-mini-head">
            <div className="profile-orb" aria-hidden="true" />
            <div>
              <h3>{profile.title}</h3>
              <p>{profile.subtitle}</p>
            </div>
          </div>
          <div className="profile-tags">
            {profile.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="radar-card" aria-label="画像能力概览">
            <div className="radar-shape" />
            <div className="radar-copy">
              <strong>{profile.highlightTitle}</strong>
              <span>{profile.highlightBody}</span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
