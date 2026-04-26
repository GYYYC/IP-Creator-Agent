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
          title="先把评论区里最值得处理的内容拎出来"
          description="把评论贴进来，先挑出最值得回复和置顶的内容。"
        />

        <AssistantStudio initialSessionId={getSessionId(params)} />
      </div>
    </main>
  );
}
