import { AdminDashboard } from "@/components/admin-dashboard";
import { getDashboardData } from "@/lib/store";

export default async function AdminPage() {
  const data = await getDashboardData();

  return <AdminDashboard {...data} />;
}
