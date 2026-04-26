import Link from "next/link";
import { DoctorStudio } from "@/components/doctor-studio";
import { PageIntro } from "@/components/page-intro";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSessionId(params: Record<string, string | string[] | undefined> | undefined) {
  return typeof params?.sessionId === "string" ? params.sessionId : undefined;
}

export default async function DoctorPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main>
      <div className="container">
        <PageIntro
          label="内容复盘"
          title="把这条内容的问题找出来"
          description="先上传内容和数据，再直接看修改方向。"
          actions={
            <>
              <Link className="button-primary" href="/director">
                按结论重写脚本
              </Link>
              <Link className="button-secondary" href="/assistant">
                去处理评论区
              </Link>
            </>
          }
        />

        <DoctorStudio initialSessionId={getSessionId(params)} />
      </div>
    </main>
  );
}
