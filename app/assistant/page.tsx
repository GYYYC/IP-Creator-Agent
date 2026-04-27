import { PageIntro } from "@/components/page-intro";
import { AssistantStudio } from "@/components/assistant-studio";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSessionId(params: Record<string, string | string[] | undefined> | undefined) {
  return typeof params?.sessionId === "string" ? params.sessionId : undefined;
}

export default async function AssistantPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main>
      <div className="container">
        <PageIntro
          label="评论助手"
          title="从作品里看懂评论"
          description="先选作品，再拆单条评论或评论区方向。"
        />

        <AssistantStudio initialSessionId={getSessionId(params)} />
      </div>
    </main>
  );
}
