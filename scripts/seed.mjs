import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tasks = [
  {
    title: "انضم لقناة الأخبار",
    description: "اضغط فتح، انضم للقناة، ثم ارجع للتطبيق واضغط تحقق.",
    platform: "telegram",
    target_url: "https://t.me/example_channel",
    reward: 120,
    proof_required: false,
  },
  {
    title: "انضم لمجموعة المجتمع",
    description: "يتم التحقق من وجودك في المجموعة عبر Telegram Bot API.",
    platform: "telegram",
    target_url: "https://t.me/example_group",
    reward: 180,
    proof_required: false,
  },
  {
    title: "إعادة نشر تغريدة الحملة",
    description: "ارفع رابط التغريدة أو Screenshot ليتم اعتمادها من الإدارة.",
    platform: "x",
    target_url: "https://x.com/example/status/123",
    reward: 260,
    proof_required: true,
  },
  {
    title: "إعجاب بتغريدة الإعلان",
    description: "المراجعة يدوية في نسخة MVP بدون X API مدفوع.",
    platform: "x",
    target_url: "https://x.com/example/status/456",
    reward: 90,
    proof_required: true,
  },
];

for (const task of tasks) {
  const { error } = await supabase
    .from("tasks")
    .update({
      title: task.title,
      description: task.description,
      platform: task.platform,
      reward: task.reward,
      proof_required: task.proof_required,
      status: "active",
    })
    .eq("target_url", task.target_url);

  if (error) {
    throw error;
  }
}

const { error: settingsError } = await supabase.from("app_settings").upsert(
  {
    id: true,
    minimum_withdrawal_points: 500,
    required_purchase_usd: 3,
    purchase_condition_enabled: true,
    token_usd_price: 0.001,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "id" },
);

if (settingsError) {
  throw settingsError;
}

console.log(`Seed synced: ${tasks.length} tasks`);
