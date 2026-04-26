import { DashboardStudio } from "@/components/dashboard-studio";
import { getDashboardData } from "@/lib/agent/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main>
      <DashboardStudio data={data} />
    </main>
  );
}
