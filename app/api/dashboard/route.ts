import { emptyDashboardData, getDashboardData } from "@/lib/agent/dashboard-data";
import { jsonOk } from "@/lib/agent/http";

export const runtime = "nodejs";

export async function GET() {
  const data = await getDashboardData({ createProfile: true }).catch((error) => {
    console.error("[Dashboard API] failed to load data", error);
    return emptyDashboardData();
  });

  return jsonOk(data);
}
