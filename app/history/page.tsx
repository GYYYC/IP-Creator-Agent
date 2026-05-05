import { HistoryStudio } from "@/components/history-studio";
import { PageIntro } from "@/components/page-intro";
import { getHistoryData } from "@/lib/agent/history-data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { entries } = await getHistoryData().catch((error) => {
    console.error("[History] failed to load data", error);
    return { entries: [] };
  });

  return (
    <main>
      <div className="container">
        <PageIntro
          label="创作记录"
          title="回到之前做过的每一步"
          description="脚本、复盘和评论处理会按类型放好。"
        />

        <HistoryStudio entries={entries} />
      </div>
    </main>
  );
}
