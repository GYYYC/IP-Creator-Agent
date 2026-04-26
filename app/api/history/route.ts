import { getHistoryData } from "@/lib/agent/history-data";
import { jsonOk } from "@/lib/agent/http";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getHistoryData({ createProfile: true }));
}
