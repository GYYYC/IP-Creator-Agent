import Link from "next/link";
import { DirectorStudio } from "@/components/director-studio";
import { PageIntro } from "@/components/page-intro";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSessionId(params: Record<string, string | string[] | undefined> | undefined) {
  return typeof params?.sessionId === "string" ? params.sessionId : undefined;
}

export default async function DirectorPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main>
      <div className="container">
        <PageIntro
          label="脚本创作"
          title="把一个想法写成能发的内容"
          description="先选图文或视频，再把关键信息补齐。"
          actions={
            <>
              <Link className="button-primary" href="/doctor">
                写完去复盘
              </Link>
              <span className="status-badge">支持图文 / 视频</span>
            </>
          }
        />

        <DirectorStudio initialSessionId={getSessionId(params)} />
      </div>
    </main>
  );
}
