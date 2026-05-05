import { DashboardStudio } from "@/components/dashboard-studio";
import { emptyDashboardData, getDashboardData } from "@/lib/agent/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData().catch((error) => {
    console.error("[Dashboard] failed to load data", error);
    return emptyDashboardData();
  });

  return (
    <main>
      <DashboardStudio data={data} />
    </main>
  );
}
