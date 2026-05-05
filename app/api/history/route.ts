import { getHistoryData } from "@/lib/agent/history-data";
import { jsonOk } from "@/lib/agent/http";

export const runtime = "nodejs";

export async function GET() {
  const data = await getHistoryData({ createProfile: true }).catch((error) => {
    console.error("[History API] failed to load data", error);
    return { entries: [] };
  });

  return jsonOk(data);
}
