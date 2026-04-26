import { getDashboardData } from "@/lib/agent/dashboard-data";
import { jsonOk } from "@/lib/agent/http";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getDashboardData({ createProfile: true }));
}
