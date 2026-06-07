import { MiniAppShell } from "@/components/mini-app-shell";
import { getMiniAppBootstrapData } from "@/lib/store";

export default async function Home() {
  const { user, tasks, settings, leaderboard } = await getMiniAppBootstrapData();

  return <MiniAppShell user={user} tasks={tasks} settings={settings} leaderboard={leaderboard} />;
}
