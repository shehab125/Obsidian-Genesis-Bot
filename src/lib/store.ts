import { unstable_noStore as noStore } from "next/cache";
import { appSettings as mockSettings } from "./mock-data";
import { getSupabaseServerClient } from "./supabase";
import { verifyTelegramInitData, sendTelegramMessage } from "./telegram";
import type {
  AppSettings,
  AppUser,
  LeaderboardUser,
  PurchaseVerificationRequest,
  ReviewStatus,
  ReviewSubmission,
  Task,
  TaskPlatform,
  TelegramInitUser,
  WithdrawalRequest,
  WithdrawalStatus,
} from "./types";

const emptyUser: AppUser = {
  id: "",
  telegramId: "",
  name: "Telegram User",
  username: "",
  balance: 0,
  pendingBalance: 0,
  withdrawableBalance: 0,
  purchaseVerified: false,
  completedTasks: 0,
  frozen: false,
  joinedAt: "",
  onboardingCompleted: false,
  referredBy: null,
  referralCount: 0,
  unlockAt: null,
  miningCyclesCompleted: 0,
  cooldownBypassed: false,
  walletAddress: null,
};

type DbUser = {
  id: string;
  telegram_id: string;
  username: string | null;
  display_name: string;
  balance: number;
  balance_pending: number;
  balance_withdrawable: number;
  purchase_verified: boolean;
  frozen: boolean;
  created_at: string;
  onboarding_completed: boolean;
  referred_by: string | null;
  referral_count: number;
  unlock_at: string | null;
  mining_cycles_completed?: number;
  cooldown_bypassed?: boolean;
  influencer_code?: string | null;
  wallet_address?: string | null;
  boost_multiplier?: number;
  last_cycle_earned_tokens?: number;
  last_cycle_doubled?: boolean;
};

type DbTask = {
  id: string;
  title: string;
  description: string;
  platform: TaskPlatform;
  target_url: string;
  reward: number;
  proof_required: boolean;
  is_onboarding: boolean;
  reward_usd?: number | null;
  is_social_media: boolean;
};

type ReviewSubmissionRow = {
  id: string;
  task_id: string;
  user_id: string;
  proof_url: string;
  note: string | null;
  status: ReviewStatus;
  created_at: string;
  app_users?: { display_name: string } | null;
  tasks?: { title: string; platform: TaskPlatform } | null;
};

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string;
  status: WithdrawalStatus;
  created_at: string;
  app_users?: { display_name: string } | null;
};

type PurchaseVerificationRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  proof_url: string;
  status: ReviewStatus;
  created_at: string;
  app_users?: { display_name: string } | null;
};

type SubmissionWithReward = {
  user_id: string;
  task_id: string;
  tasks?: { reward: number } | { reward: number }[] | null;
};

type DbSettings = {
  minimum_withdrawal_points: number;
  required_purchase_usd: number;
  purchase_condition_enabled: boolean;
  token_usd_price?: number;
  withdrawal_lock_days?: number;
  token_contract_address?: string;
  quickswap_link?: string;
  owner_wallet?: string;
  base_reward_usd?: number;
  bot_active?: boolean;
  purchase_plans?: any;
  max_contracts_limit_enabled?: boolean;
  max_contracts_limit?: number;
};

export async function getDashboardData() {
  noStore();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      user: emptyUser,
      users: [],
      tasks: [],
      submissions: [],
      withdrawals: [],
      purchaseVerifications: [],
      leaderboard: [],
      settings: mockSettings,
      stats: {
        users: 0,
      },
    };
  }

  return getAdminData();
}

export async function getMiniAppBootstrapData() {
  noStore();
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      user: emptyUser,
      tasks: [],
      settings: mockSettings,
      leaderboard: [],
    };
  }

  const settings = await getAppSettings();
  const [{ data: tasks }, leaderboard] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    getLeaderboard(),
  ]);

  return {
    user: emptyUser,
    tasks: mapTasks((tasks ?? []) as DbTask[], new Set(), new Set(), settings.tokenUsdPrice),
    settings,
    leaderboard,
  };
}

export async function getMiniAppDataFromInitData(initData: string, referrerId?: string | null) {
  noStore();
  const user = await getUserFromTelegramInitData(initData, referrerId);
  if (!user) {
    return null;
  }

  return getDataForUser(user);
}

async function getAdminData() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      user: emptyUser,
      users: [],
      tasks: [],
      submissions: [],
      withdrawals: [],
      purchaseVerifications: [],
      leaderboard: [],
      settings: mockSettings,
      stats: {
        users: 0,
      },
    };
  }

  try {
    await checkAllHolders();
  } catch (err) {
    console.error("Failed to run hold check in getAdminData:", err);
  }

  const settings = await getAppSettings();

  const [{ data: tasks }, { data: users }, { count: usersCount }] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    supabase.from("app_users").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("app_users").select("id", { count: "exact", head: true }),
  ]);

  const mappedUsers = ((users ?? []) as DbUser[]).map((user) => mapUser(user, 0));

  return {
    user: mappedUsers[0] ?? emptyUser,
    users: mappedUsers,
    tasks: mapTasks((tasks ?? []) as DbTask[], new Set(), new Set(), settings.tokenUsdPrice),
    submissions: await getReviewSubmissions(),
    withdrawals: await getWithdrawals(),
    purchaseVerifications: await getPurchaseVerificationRequests(),
    leaderboard: await getLeaderboard(),
    settings,
    stats: {
      users: usersCount ?? 0,
    },
  };
}

async function getDataForUser(user: AppUser) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      user,
      tasks: [],
      submissions: [],
      withdrawals: [],
      purchaseVerifications: [],
      leaderboard: [],
      settings: mockSettings,
      stats: {
        users: 1,
      },
    };
  }

  let currentUser = user;
  try {
    const isHoldOk = await checkUserHoldStatus(user.id);
    if (!isHoldOk) {
      const reloadedUser = await getUserById(user.id);
      if (reloadedUser) {
        currentUser = reloadedUser;
      }
    }
  } catch (err) {
    console.error("Failed checkUserHoldStatus in getDataForUser:", err);
  }

  const settings = await getAppSettings();

  const [
    { data: tasks },
    { data: completions },
    { data: pendingSubmissions },
    { count: usersCount },
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    supabase.from("task_completions").select("task_id").eq("user_id", currentUser.id),
    supabase
      .from("review_submissions")
      .select("task_id,status")
      .eq("user_id", currentUser.id)
      .eq("status", "pending"),
    supabase.from("app_users").select("id", { count: "exact", head: true }),
  ]);

  return {
    user: currentUser,
    tasks: mapTasks(
      (tasks ?? []) as DbTask[],
      new Set((completions ?? []).map((item) => item.task_id as string)),
      new Set((pendingSubmissions ?? []).map((item) => item.task_id as string)),
      settings.tokenUsdPrice,
    ),
    submissions: await getReviewSubmissions(),
    withdrawals: await getWithdrawals(),
    purchaseVerifications: await getPurchaseVerificationRequests(),
    leaderboard: await getLeaderboard(),
    settings,
    stats: {
      users: usersCount ?? 0,
    },
  };
}

export async function completeTelegramTask(userId: string, taskId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المخدم غير متصل أو المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك بسبب مخالفة القوانين." };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("platform", "telegram")
    .eq("status", "active")
    .maybeSingle();

  if (!task) {
    return { ok: false, message: "المهمة غير متاحة للتحقق الآلي." };
  }

  // Real Telegram channel membership verification check
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && task.target_url) {
    const chatId = extractTelegramChatId(task.target_url);
    if (chatId) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${user.telegramId}`
        );
        const data = await response.json();
        if (data.ok) {
          const status = data.result.status;
          const isMember = ["member", "creator", "administrator", "restricted"].includes(status);
          if (!isMember) {
            return {
              ok: false,
              message: "يجب عليك الانضمام إلى القناة أو المجموعة أولاً والانتظار قليلاً قبل التحقق.",
            };
          }
        } else {
          console.warn("Telegram check failed with description: ", data.description);
        }
      } catch (err) {
        console.error("Error verifying Telegram membership:", err);
      }
    }
  }

  const { error: completionError } = await supabase.from("task_completions").insert({
    user_id: userId,
    task_id: taskId,
    reward: task.reward,
  });

  if (completionError) {
    return { ok: false, message: "تم صرف مكافأة هذه المهمة من قبل." };
  }

  const updatedUser = await awardRewardToUser(userId, task.reward);

  // Referral overrides (10%)
  if (user.referredBy) {
    await awardReferralBonus(user.referredBy, userId, taskId, task.reward);
  }

  // Check onboarding completed trigger
  await checkAndCompleteOnboarding(userId);

  const settings = await getAppSettings();

  return {
    ok: true,
    message:
      settings.purchaseConditionEnabled && !user.purchaseVerified
        ? "تمت إضافة المكافأة إلى الرصيد المعلق لحين تحقق شرط الشراء."
        : "تم التحقق وإضافة المكافأة.",
    balance: updatedUser?.balance ?? user.balance,
    pendingBalance: updatedUser?.pendingBalance ?? user.pendingBalance,
    withdrawableBalance: updatedUser?.withdrawableBalance ?? user.withdrawableBalance,
  };
}

export async function completeSocialTask(userId: string, taskId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك بسبب مخالفة القوانين." };
  }

  // 1. Anti-bot: Rate limiting check (max 10 tasks in the last 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("task_completions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("completed_at", oneHourAgo);

  if (!countError && count !== null && count >= 10) {
    return {
      ok: false,
      message: "أنت تقوم بإكمال المهام بسرعة كبيرة. يرجى الانتظار بعض الوقت.",
    };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .neq("platform", "telegram") // Social tasks (x, website, etc.)
    .eq("status", "active")
    .maybeSingle();

  if (!task) {
    return { ok: false, message: "المهمة غير متوفرة أو غير صالحة." };
  }

  const { error: completionError } = await supabase.from("task_completions").insert({
    user_id: userId,
    task_id: taskId,
    reward: task.reward,
  });

  if (completionError) {
    return { ok: false, message: "تم صرف مكافأة هذه المهمة من قبل." };
  }

  const updatedUser = await awardRewardToUser(userId, task.reward);

  // Referral overrides (10%)
  if (user.referredBy) {
    await awardReferralBonus(user.referredBy, userId, taskId, task.reward);
  }

  // Check onboarding completed trigger
  await checkAndCompleteOnboarding(userId);

  const settings = await getAppSettings();

  return {
    ok: true,
    message:
      settings.purchaseConditionEnabled && !user.purchaseVerified
        ? "تمت إضافة المكافأة إلى الرصيد المعلق لحين تحقق شرط الشراء."
        : "تم التحقق وإضافة المكافأة.",
    balance: updatedUser?.balance ?? user.balance,
    pendingBalance: updatedUser?.pendingBalance ?? user.pendingBalance,
    withdrawableBalance: updatedUser?.withdrawableBalance ?? user.withdrawableBalance,
  };
}

export async function createXSubmission(input: {
  taskId: string;
  userId: string;
  proofUrl: string;
  note?: string;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(input.userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك بسبب مخالفة القوانين." };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", input.taskId)
    .eq("platform", "x")
    .eq("status", "active")
    .maybeSingle();

  if (!task) {
    return { ok: false, message: "مهمة X غير موجودة." };
  }

  const { data: existing } = await supabase
    .from("review_submissions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("task_id", input.taskId)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "تم إرسال هذه المهمة من قبل." };
  }

  const { data, error } = await supabase
    .from("review_submissions")
    .insert({
      user_id: input.userId,
      task_id: input.taskId,
      proof_url: input.proofUrl,
      note: input.note ?? "",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: "تعذر إرسال المهمة للمراجعة." };
  }

  return { ok: true, message: "Submitted. Waiting for admin review.", taskId: input.taskId, status: "pending_review", submission: data };
}

export async function createWithdrawal(input: {
  userId: string;
  amount: number;
  walletAddress: string;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(input.userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك بسبب مخالفة القوانين." };
  }

  // Check lock period cooldown
  if (user.unlockAt && new Date() < new Date(user.unlockAt)) {
    const diff = new Date(user.unlockAt).getTime() - Date.now();
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    return {
      ok: false,
      message: `السحب معلق حالياً خلال فترة الانتظار. يتبقى حوالي ${hours} ساعة لفك القفل.`,
    };
  }

  const settings = await getAppSettings();
  if (input.amount < settings.minimumWithdrawalPoints) {
    return {
      ok: false,
      message: `الحد الأدنى للسحب هو ${settings.minimumWithdrawalPoints} نقطة.`,
    };
  }

  if (settings.purchaseConditionEnabled && !user.purchaseVerified) {
    return {
      ok: false,
      message: `الرصيد معلق حتى يتم التحقق من شراء بقيمة $${settings.requiredPurchaseUsd}.`,
    };
  }

  if (input.amount > user.withdrawableBalance) {
    return { ok: false, message: "الرصيد القابل للسحب غير كاف." };
  }

  const nextBalance = user.balance - input.amount;
  const nextWithdrawable = user.withdrawableBalance - input.amount;
  const { error } = await supabase.from("withdrawal_requests").insert({
    user_id: input.userId,
    amount: input.amount,
    wallet_address: input.walletAddress,
  });

  if (error) {
    return { ok: false, message: "تعذر تسجيل طلب السحب." };
  }

  await supabase
    .from("app_users")
    .update({ 
      balance: nextBalance, 
      balance_withdrawable: nextWithdrawable,
      wallet_address: input.walletAddress
    })
    .eq("id", input.userId);

  return {
    ok: true,
    message: "تم تسجيل طلب السحب.",
    balance: nextBalance,
    withdrawableBalance: nextWithdrawable,
  };
}

async function getErc20Balance(tokenAddress: string, walletAddress: string, decimals = 18): Promise<number> {
  const rpcUrls = [
    "https://polygon-rpc.com",
    "https://rpc.ankr.com/polygon",
    "https://polygon.llamarpc.com",
    "https://polygon-bor.publicnode.com",
    "https://polygon.drpc.org",
    "https://1rpc.io/matic"
  ];
  
  const cleanWallet = walletAddress.trim().toLowerCase().replace(/^0x/, "");
  const paddedWallet = cleanWallet.padStart(64, "0");
  const data = "0x70a08231" + paddedWallet;
  
  for (const rpcUrl of rpcUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [
            {
              to: tokenAddress,
              data: data
            },
            "latest"
          ],
          id: 1
        })
      });
      
      if (!response.ok) continue;
      const json = await response.json();
      if (json.error) continue;
      
      const result = json.result;
      if (result && result !== "0x") {
        const rawBalance = BigInt(result);
        const balance = Number(rawBalance) / Math.pow(10, decimals);
        return balance;
      }
    } catch (err) {
      console.error(`RPC error on ${rpcUrl}:`, err);
    }
  }
  return 0;
}

export async function verifyUserPurchaseAutomatic(userId: string, walletAddress: string, contractsCount: number = 1) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "حسابك مجمد حالياً." };
  }

  if (user.purchaseVerified) {
    if (!user.walletAddress || user.walletAddress !== walletAddress) {
      // Check duplicate wallet usage
      const { data: duplicate } = await supabase
        .from("app_users")
        .select("id")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (duplicate && duplicate.id !== userId) {
        return { ok: false, message: "عنوان هذه المحفظة مستخدم بالفعل لتفعيل حساب آخر." };
      }

      // Update wallet address
      const { error: updateErr } = await supabase
        .from("app_users")
        .update({ wallet_address: walletAddress })
        .eq("id", userId);

      if (updateErr) {
        return { ok: false, message: "تعذر تحديث عنوان المحفظة: " + updateErr.message };
      }

      // Log it
      await supabase.from("purchase_verification_requests").insert({
        user_id: userId,
        wallet_address: walletAddress,
        proof_url: "manual_link_relink",
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });

      return { ok: true, message: "تم ربط وتحديث عنوان محفظتك بنجاح!" };
    }
    return { ok: true, message: "حسابك مفعل بالفعل ومحفظتك مربوطة." };
  }

  const settings = await getAppSettings();
  const contractAddress = settings.tokenContractAddress || "0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f";
  
  if (!contractAddress) {
    return { ok: false, message: "عنوان عقد العملة غير متوفر في الإعدادات." };
  }

  // 1. Check duplicate wallet usage
  const { data: duplicate } = await supabase
    .from("purchase_verification_requests")
    .select("user_id")
    .eq("wallet_address", walletAddress)
    .eq("status", "approved")
    .maybeSingle();

  if (duplicate && duplicate.user_id !== userId) {
    return { ok: false, message: "عنوان هذه المحفظة مستخدم بالفعل لتفعيل حساب آخر." };
  }

  // Choose plan dynamically based on whether user is new or pre-registered
  const isNewUser = (user.miningCyclesCompleted || 0) === 0;
  const plan = isNewUser
    ? (settings.purchasePlans[0] || { minPurchase: 2, lockDays: 1, multiplier: 2.0 })
    : (settings.purchasePlans[1] || settings.purchasePlans[0] || { minPurchase: 5, lockDays: 5, multiplier: 2.0 });

  const finalContractsCount = isNewUser ? 1 : contractsCount;
  const requiredUsd = finalContractsCount * plan.minPurchase;

  // 2. Fetch balance
  const balance = await getErc20Balance(contractAddress, walletAddress);
  const usdValue = balance * settings.tokenUsdPrice;

  if (usdValue < requiredUsd) {
    return {
      ok: false,
      message: `لم نجد رصيد كافٍ من العملة في محفظتك لتفعيل عدد ${finalContractsCount} عقود. رصيدك الحالي: ${balance.toFixed(2)} OBSD (ما يعادل $${usdValue.toFixed(2)} USD). القيمة المطلوبة لتفعيل ${finalContractsCount} عقود هي $${requiredUsd.toFixed(2)} USD. يرجى الشراء من QuickSwap وإعادة المحاولة.`
    };
  }

  // 3. Log approved purchase verification
  const cleanWalletAddress = walletAddress.trim().toLowerCase();
  await supabase.from("purchase_verification_requests").insert({
    user_id: userId,
    wallet_address: cleanWalletAddress,
    proof_url: "Contracts: " + finalContractsCount,
    status: "approved",
    reviewed_at: new Date().toISOString()
  });

  // 4. Verify purchase in users record
  const verifyResult = await verifyUserPurchase(userId);
  if (!verifyResult.ok) {
    return verifyResult;
  }

  return {
    ok: true,
    message: `تهانينا! تم التحقق من محفظتك وتفعيل عدد ${finalContractsCount} عقود بنجاح! رصيدك: ${balance.toFixed(2)} OBSD (ما يعادل $${usdValue.toFixed(2)} USD). تم تفعيل مضاعف التعدين، السحب وبدء دورة تعدين جديدة.`,
  };
}

export async function createPurchaseVerification(input: {
  userId: string;
  walletAddress: string;
  proofUrl: string;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "Database is not connected." };
  }

  const user = await getUserById(input.userId);
  if (!user) {
    return { ok: false, message: "User was not found." };
  }

  if (user.frozen) {
    return { ok: false, message: "Your account is frozen." };
  }

  if (user.purchaseVerified) {
    return { ok: false, message: "Purchase condition is already active for this user." };
  }

  const { data: existing } = await supabase
    .from("purchase_verification_requests")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "A purchase proof is already waiting for admin review." };
  }

  const { error } = await supabase.from("purchase_verification_requests").insert({
    user_id: input.userId,
    wallet_address: input.walletAddress,
    proof_url: input.proofUrl,
  });

  if (error) {
    return { ok: false, message: "Could not submit purchase proof." };
  }

  return { ok: true, message: "Purchase proof sent to admin review." };
}

export async function updateSubmissionStatus(id: string, status: ReviewStatus) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { data: submission } = await supabase
    .from("review_submissions")
    .select("id,user_id,task_id,tasks(reward)")
    .eq("id", id)
    .maybeSingle();

  if (!submission) {
    return { ok: false, message: "طلب المراجعة غير موجود." };
  }

  await supabase
    .from("review_submissions")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (status === "approved") {
    const reward = getJoinedReward(submission);
    const user = await getUserById(submission.user_id);

    if (user && reward > 0) {
      await supabase.from("task_completions").upsert(
        {
          user_id: submission.user_id,
          task_id: submission.task_id,
          reward,
        },
        { onConflict: "user_id,task_id", ignoreDuplicates: true },
      );
      
      const updatedUser = await awardRewardToUser(submission.user_id, reward);

      // Referral overrides (10%)
      if (user.referredBy) {
        await awardReferralBonus(user.referredBy, submission.user_id, submission.task_id, reward);
      }

      // Check onboarding completed trigger
      await checkAndCompleteOnboarding(submission.user_id);
    }
  }
  if (status === "rejected") {
    await supabase.from("review_submissions").delete().eq("id", id);
  }

  return { ok: true, message: "تم تحديث حالة المراجعة." };
}

export async function updateTask(input: {
  id: string;
  title: string;
  description: string;
  reward: number;
  targetUrl: string;
  proofRequired: boolean;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      description: input.description,
      reward: input.reward,
      target_url: input.targetUrl,
      proof_required: input.proofRequired,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "تعذر تحديث المهمة." + (error ? ` : ${error.message}` : "") };
  }

  return { ok: true, message: "تم تحديث المهمة." };
}

export async function createTask(input: {
  title: string;
  description: string;
  platform: TaskPlatform;
  reward: number;
  targetUrl: string;
  proofRequired: boolean;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "Database is not connected." };
  }

  const settings = await getAppSettings();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description,
      platform: input.platform,
      reward: input.reward,
      target_url: input.targetUrl,
      proof_required: input.proofRequired,
      status: "active",
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, message: "Could not create task: " + (error ? error.message : "") };
  }

  return {
    ok: true,
    message: "Task created.",
    task: mapTasks([data as DbTask], new Set(), new Set(), settings.tokenUsdPrice)[0],
  };
}

export async function updateAppSettings(input: AppSettings) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  let updateObj: any = {
    id: true,
    minimum_withdrawal_points: input.minimumWithdrawalPoints,
    required_purchase_usd: input.requiredPurchaseUsd,
    purchase_condition_enabled: input.purchaseConditionEnabled,
    token_usd_price: input.tokenUsdPrice,
    withdrawal_lock_days: input.withdrawalLockDays,
    token_contract_address: input.tokenContractAddress,
    quickswap_link: input.quickswapLink,
    owner_wallet: input.ownerWallet,
    base_reward_usd: input.baseRewardUsd,
    bot_active: input.botActive,
    max_contracts_limit_enabled: input.maxContractsLimitEnabled,
    max_contracts_limit: input.maxContractsLimit,
    updated_at: new Date().toISOString(),
  };

  if (input.purchasePlans) {
    updateObj.purchase_plans = input.purchasePlans;
  }

  const { error } = await supabase.from("app_settings").upsert(updateObj, { onConflict: "id" });

  if (error) {
    if (
      error.message.includes("purchase_plans") ||
      error.message.includes("max_contracts") ||
      error.code === "P0002" ||
      error.message.includes("does not exist")
    ) {
      delete updateObj.purchase_plans;
      delete updateObj.max_contracts_limit_enabled;
      delete updateObj.max_contracts_limit;
      const { error: retryError } = await supabase.from("app_settings").upsert(updateObj, { onConflict: "id" });
      if (retryError) {
        return { ok: false, message: "تعذر تحديث الإعدادات: " + retryError.message };
      }
      return { ok: true, message: "تم تحديث الإعدادات (لكن يرجى تشغيل أمر الهجرة SQL لإتاحة ميزة خطط الشراء والحد الأقصى لعقود التعدين)." };
    }
    return { ok: false, message: "تعذر تحديث الإعدادات: " + error.message };
  }

  return { ok: true, message: "تم تحديث إعدادات السحب والشراء والتعليق والحد الأقصى بنجاح." };
}

export async function updatePurchaseVerificationStatus(id: string, status: ReviewStatus) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "Database is not connected." };
  }

  const { data: request } = await supabase
    .from("purchase_verification_requests")
    .select("id,user_id")
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return { ok: false, message: "Purchase verification request was not found." };
  }

  await supabase
    .from("purchase_verification_requests")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (status === "approved") {
    return verifyUserPurchase(request.user_id as string);
  }

  return { ok: true, message: "Purchase verification request was updated." };
}

export async function verifyUserPurchase(userId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.purchaseVerified) {
    return { ok: true, message: "تم التفعيل مسبقاً." };
  }

  const settings = await getAppSettings();

  // 1. Fetch wallet address from approved verification requests
  const { data: latestRequest } = await supabase
    .from("purchase_verification_requests")
    .select("wallet_address, proof_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const walletAddress = latestRequest?.wallet_address || "";
  let contractsCount = 1;
  if (latestRequest?.proof_url && latestRequest.proof_url.startsWith("Contracts: ")) {
    contractsCount = parseInt(latestRequest.proof_url.replace("Contracts: ", ""), 10) || 1;
  }

  // 2. Fetch actual hold balance on chain
  let balance = 0;
  if (walletAddress && settings.tokenContractAddress) {
    try {
      balance = await getErc20Balance(settings.tokenContractAddress, walletAddress);
    } catch (err) {
      console.error("Failed to fetch balance in verifyUserPurchase:", err);
    }
  }

  // 3. Dynamic Plan Selection & Scaling
  const isNewUser = (user.miningCyclesCompleted || 0) === 0;
  const plan = isNewUser
    ? (settings.purchasePlans[0] || { minPurchase: 2, lockDays: 1, multiplier: 2.0 })
    : (settings.purchasePlans[1] || settings.purchasePlans[0] || { minPurchase: 5, lockDays: 5, multiplier: 2.0 });

  const finalContractsCount = isNewUser ? 1 : contractsCount;
  const nextBoostMultiplier = Number((finalContractsCount * plan.multiplier).toFixed(2));
  const computedLockDays = plan.lockDays || 0;

  let unlockAt: string | null = null;
  if (computedLockDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + computedLockDays);
    unlockAt = d.toISOString();
  }

  // Double reward logic: (multiplier - 1) * last cycle earned tokens
  const rewardTokens = Math.max(0, Math.floor((nextBoostMultiplier - 1.0) * (user.lastCycleEarnedTokens || 0)));

  // 4. Update user record (add doubled reward to balance and withdrawable)
  const nextWithdrawable = user.withdrawableBalance + user.pendingBalance + rewardTokens;
  const nextBalance = user.balance + rewardTokens;

  const userUpdateObj: any = {
    purchase_verified: true,
    purchase_verified_at: new Date().toISOString(),
    balance: nextBalance,
    balance_pending: 0,
    balance_withdrawable: nextWithdrawable,
    unlock_at: unlockAt,
    cooldown_bypassed: true,
    wallet_address: walletAddress || null,
    last_cycle_doubled: true,
    boost_multiplier: nextBoostMultiplier,
  };

  // Try updating with all fields first, then progressively strip optional columns on schema errors
  const optionalColumns = ["boost_multiplier", "wallet_address", "last_cycle_doubled"];
  let lastError: any = null;

  // Attempt 1: all fields
  const { error: userUpdateError } = await supabase
    .from("app_users")
    .update(userUpdateObj)
    .eq("id", userId);

  if (!userUpdateError) {
    lastError = null;
  } else if (
    userUpdateError.message.includes("does not exist") ||
    userUpdateError.message.includes("schema cache") ||
    userUpdateError.message.includes("column")
  ) {
    // Strip optional columns one-by-one and retry
    console.error("verifyUserPurchase: first update failed, stripping optional columns:", userUpdateError.message);
    for (const col of optionalColumns) {
      delete userUpdateObj[col];
    }
    const { error: retryError } = await supabase
      .from("app_users")
      .update(userUpdateObj)
      .eq("id", userId);
    lastError = retryError;
  } else {
    lastError = userUpdateError;
  }

  if (lastError) {
    console.error("verifyUserPurchase: final update error:", lastError.message);
    return { ok: false, message: "تعذر تحديث رصيد المستخدم: " + lastError.message };
  }

  // 5. Influencer Commission Logic (Only on the very first purchase verification/onboarding)
  const isFirstVerification = (user.miningCyclesCompleted || 0) === 0;
  if (user.influencerCode && isFirstVerification) {
    const { data: influencer } = await supabase
      .from("influencer_links")
      .select("*")
      .eq("code", user.influencerCode)
      .maybeSingle();

    if (influencer && influencer.user_id) {
      const commissionUsd = Number(influencer.commission_usd || 0.50);
      const commissionTokens = Math.round(commissionUsd / (settings.tokenUsdPrice || 0.001));

      if (commissionTokens > 0) {
        const { data: influencerUser } = await supabase
          .from("app_users")
          .select("balance, balance_withdrawable")
          .eq("id", influencer.user_id)
          .maybeSingle();

        if (influencerUser) {
          const nextInfBalance = (influencerUser.balance || 0) + commissionTokens;
          const nextInfWithdrawable = (influencerUser.balance_withdrawable || 0) + commissionTokens;

          await supabase
            .from("app_users")
            .update({
              balance: nextInfBalance,
              balance_withdrawable: nextInfWithdrawable,
            })
            .eq("id", influencer.user_id);

          await supabase
            .from("influencer_links")
            .update({
              completions: (influencer.completions || 0) + 1,
              total_commission_paid_usd: Number(influencer.total_commission_paid_usd || 0) + commissionUsd,
            })
            .eq("code", user.influencerCode);
        }
      }
    }
  }

  // 6. Auto-start 1-hour mining session, resetting any active timer
  try {
    await supabase
      .from("mining_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("claimed", false);

    const durationMs = 1 * 60 * 60 * 1000; // 1 hour
    const endsAt = new Date(Date.now() + durationMs).toISOString();
    const miningRewardUsd = 0.10 * nextBoostMultiplier;
    const miningRewardTokens = Number((miningRewardUsd / (settings.tokenUsdPrice || 0.001)).toFixed(6));

    await supabase.from("mining_sessions").insert({
      user_id: userId,
      ends_at: endsAt,
      reward_usd: miningRewardUsd,
      reward_tokens: miningRewardTokens,
    });
  } catch (err) {
    console.error("Auto-start mining failed:", err);
  }

  return {
    ok: true,
    message: computedLockDays > 0
      ? `تم تفعيل الشراء بنجاح ومكافأة قدرها ${rewardTokens} OBSD. تم تعليق السحب مؤقتاً لمدة ${computedLockDays} أيام وتصفير عداد التعدين لساعة جديدة (بمضاعف سرعة قدره ${nextBoostMultiplier}x).`
      : `تم تفعيل الرصيد القابل للسحب بنجاح ومكافأة قدرها ${rewardTokens} OBSD. تم تصفير عداد التعدين لساعة جديدة (بمضاعف سرعة قدره ${nextBoostMultiplier}x).`,
  };
}

async function getUserFromTelegramInitData(initData: string, referrerId?: string | null) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !verifyTelegramInitData(initData, botToken)) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");
  // Check start_param from initData first, then fallback to referrerId from WebApp URL query
  const startParam = params.get("start_param") || referrerId;
  if (!rawUser) {
    return null;
  }

  return getOrCreateTelegramUser(JSON.parse(rawUser) as TelegramInitUser, startParam);
}

export async function updateWithdrawalStatus(id: string, status: WithdrawalStatus) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { data, error } = await supabase
    .from("withdrawal_requests")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "طلب السحب غير موجود." };
  }

  return { ok: true, message: "تم تحديث حالة السحب." };
}

async function getOrCreateTelegramUser(telegramUser: TelegramInitUser, referrerTelegramId?: string | null) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return emptyUser;
  }

  const telegramId = String(telegramUser.id);
  const displayName =
    [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") ||
    telegramUser.username ||
    `Telegram ${telegramId}`;

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from("app_users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  let data = existingUser;

  if (!existingUser) {
    // Determine if we have a referrer
    let referredById: string | null = null;
    let influencerCode: string | null = null;
    if (referrerTelegramId && referrerTelegramId !== telegramId) {
      const { data: referrer } = await supabase
        .from("app_users")
        .select("id")
        .eq("telegram_id", referrerTelegramId)
        .maybeSingle();
      if (referrer) {
        referredById = referrer.id;
      } else {
        // Check if referrerTelegramId matches an influencer code
        const { data: influencer } = await supabase
          .from("influencer_links")
          .select("code")
          .eq("code", referrerTelegramId.trim().toLowerCase())
          .maybeSingle();
        if (influencer) {
          influencerCode = influencer.code;
        }
      }
    }

    const { data: newUser, error } = await supabase
      .from("app_users")
      .insert({
        telegram_id: telegramId,
        username: telegramUser.username ?? null,
        display_name: displayName,
        referred_by: referredById,
        influencer_code: influencerCode,
      })
      .select("*")
      .single();

    if (!error && newUser) {
      data = newUser;
      
      // Increment referrer's referral_count immediately and award referral points (100 OBSD) instantly!
      if (referredById) {
        const { data: referrer } = await supabase
          .from("app_users")
          .select("referral_count, balance, balance_pending, balance_withdrawable, purchase_verified")
          .eq("id", referredById)
          .maybeSingle();

        if (referrer) {
          const newReferralCount = (referrer.referral_count || 0) + 1;
          const inviteReward = 100;
          const settings = await getAppSettings();
          const nextBalance = referrer.balance + inviteReward;
          
          const isVerified = referrer.purchase_verified ?? false;
          const nextPending = settings.purchaseConditionEnabled && !isVerified
            ? (referrer.balance_pending ?? 0) + inviteReward
            : (referrer.balance_pending ?? 0);
            
          const nextWithdrawable = settings.purchaseConditionEnabled && !isVerified
            ? (referrer.balance_withdrawable ?? referrer.balance)
            : (referrer.balance_withdrawable ?? referrer.balance) + inviteReward;

          await supabase
            .from("app_users")
            .update({
              referral_count: newReferralCount,
              balance: nextBalance,
              balance_pending: nextPending,
              balance_withdrawable: nextWithdrawable,
            })
            .eq("id", referredById);

          // Log in referral_rewards
          await supabase.from("referral_rewards").insert({
            referrer_id: referredById,
            referred_user_id: newUser.id,
            amount: inviteReward,
          });
        }
      }

      // Increment influencer's click/registration count
      if (influencerCode) {
        const { data: inf } = await supabase
          .from("influencer_links")
          .select("clicks")
          .eq("code", influencerCode)
          .maybeSingle();
        if (inf) {
          await supabase
            .from("influencer_links")
            .update({ clicks: (inf.clicks || 0) + 1 })
            .eq("code", influencerCode);
        }
      }
    }
  } else {
    // update details if changed
    const { data: updatedUser } = await supabase
      .from("app_users")
      .update({
        username: telegramUser.username ?? null,
        display_name: displayName,
      })
      .eq("telegram_id", telegramId)
      .select("*")
      .single();
    if (updatedUser) {
      data = updatedUser;
    }
  }

  if (!data) {
    return emptyUser;
  }

  const { count } = await supabase
    .from("task_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.id);

  return mapUser(data as DbUser, count ?? 0);
}

export async function registerReferralFromTelegramBot(
  telegramId: number,
  firstName?: string,
  lastName?: string,
  username?: string,
  referrerTelegramId?: string | null
) {
  return getOrCreateTelegramUser(
    {
      id: telegramId,
      first_name: firstName,
      last_name: lastName,
      username: username,
    },
    referrerTelegramId
  );
}

async function getUserById(userId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const [{ data: user }, { count }] = await Promise.all([
    supabase.from("app_users").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("task_completions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  return user ? mapUser(user as DbUser, count ?? 0) : null;
}

let priceCache: { price: number; timestamp: number } | null = null;

async function getOnChainTokenPrice(tokenAddress: string, defaultPrice: number): Promise<number> {
  if (!tokenAddress) return defaultPrice;
  const now = Date.now();
  if (priceCache && (now - priceCache.timestamp < 60000)) {
    return priceCache.price;
  }

  const rpcUrls = [
    "https://polygon-rpc.com",
    "https://rpc.ankr.com/polygon",
    "https://polygon.llamarpc.com",
    "https://polygon-bor.publicnode.com",
    "https://polygon.drpc.org",
    "https://1rpc.io/matic"
  ];

  const OBSD = tokenAddress.toLowerCase();
  const WPOL = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
  const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  const QUICK_V2_FACTORY = "0x5757371414417b8c6caad45baef941abc7d3ab32";

  async function ethCall(to: string, data: string): Promise<string | null> {
    for (const rpcUrl of rpcUrls) {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_call",
            params: [{ to, data }, "latest"],
            id: 1
          })
        });
        if (response.ok) {
          const json = await response.json();
          if (json.result && json.result !== "0x") {
            return json.result;
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  function padAddress(addr: string): string {
    return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  }

  try {
    // 1. Get Pair(OBSD, WPOL)
    const pairObsdPolData = "0xe6a43905" + padAddress(OBSD) + padAddress(WPOL);
    const obsdPolPairRes = await ethCall(QUICK_V2_FACTORY, pairObsdPolData);
    if (!obsdPolPairRes) throw new Error("OBSD-WPOL pair call failed");
    const obsdPolPair = "0x" + obsdPolPairRes.slice(-40);
    if (obsdPolPair === "0x0000000000000000000000000000000000000000") {
      throw new Error("OBSD-WPOL pair not found");
    }

    // 2. Get Reserves of Pair(OBSD, WPOL)
    const obsdPolReservesRes = await ethCall(obsdPolPair, "0x0902f1ac");
    if (!obsdPolReservesRes) throw new Error("OBSD-WPOL reserves call failed");
    const r0_obsd_pol = BigInt("0x" + obsdPolReservesRes.slice(2, 66));
    const r1_obsd_pol = BigInt("0x" + obsdPolReservesRes.slice(66, 130));

    // Get token0 of Pair(OBSD, WPOL)
    const obsdPolT0Res = await ethCall(obsdPolPair, "0x0dfe1681");
    if (!obsdPolT0Res) throw new Error("OBSD-WPOL token0 call failed");
    const obsdPolT0 = "0x" + obsdPolT0Res.slice(-40);

    let obsdReserve, polReserve;
    if (obsdPolT0.toLowerCase() === OBSD) {
      obsdReserve = r0_obsd_pol;
      polReserve = r1_obsd_pol;
    } else {
      obsdReserve = r1_obsd_pol;
      polReserve = r0_obsd_pol;
    }

    if (obsdReserve === BigInt(0)) throw new Error("OBSD reserve is zero");
    const wpolPerObsd = Number(polReserve) / Number(obsdReserve);

    // 3. Get Pair(WPOL, USDC)
    const pairPolUsdcData = "0xe6a43905" + padAddress(WPOL) + padAddress(USDC);
    const polUsdcPairRes = await ethCall(QUICK_V2_FACTORY, pairPolUsdcData);
    if (!polUsdcPairRes) throw new Error("WPOL-USDC pair call failed");
    const polUsdcPair = "0x" + polUsdcPairRes.slice(-40);
    if (polUsdcPair === "0x0000000000000000000000000000000000000000") {
      throw new Error("WPOL-USDC pair not found");
    }

    // 4. Get Reserves of Pair(WPOL, USDC)
    const polUsdcReservesRes = await ethCall(polUsdcPair, "0x0902f1ac");
    if (!polUsdcReservesRes) throw new Error("WPOL-USDC reserves call failed");
    const r0_pol_usdc = BigInt("0x" + polUsdcReservesRes.slice(2, 66));
    const r1_pol_usdc = BigInt("0x" + polUsdcReservesRes.slice(66, 130));

    // Get token0 of Pair(WPOL, USDC)
    const polUsdcT0Res = await ethCall(polUsdcPair, "0x0dfe1681");
    if (!polUsdcT0Res) throw new Error("WPOL-USDC token0 call failed");
    const polUsdcT0 = "0x" + polUsdcT0Res.slice(-40);

    let wpolReserveForUsdc, usdcReserve;
    if (polUsdcT0.toLowerCase() === WPOL) {
      wpolReserveForUsdc = r0_pol_usdc;
      usdcReserve = r1_pol_usdc;
    } else {
      wpolReserveForUsdc = r1_pol_usdc;
      usdcReserve = r0_pol_usdc;
    }

    if (wpolReserveForUsdc === BigInt(0)) throw new Error("WPOL reserve for USDC is zero");
    const wpolAmount = Number(wpolReserveForUsdc) / 1e18;
    const usdcAmount = Number(usdcReserve) / 1e6;
    const usdcPerWpol = usdcAmount / wpolAmount;

    const price = wpolPerObsd * usdcPerWpol;
    if (price > 0) {
      priceCache = { price, timestamp: now };
      const supabase = getSupabaseServerClient();
      if (supabase) {
        supabase.from("app_settings").update({ token_usd_price: price }).eq("id", true).then();
      }
      return price;
    }
  } catch (err) {
    console.error("On-chain price fetch failed, falling back to db:", err);
  }
  return defaultPrice;
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ...mockSettings, withdrawalLockDays: 0, tokenContractAddress: "", quickswapLink: "", ownerWallet: "" };
  }

  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (!data) {
    return { ...mockSettings, withdrawalLockDays: 0, tokenContractAddress: "", quickswapLink: "", ownerWallet: "" };
  }

  const settings = data as DbSettings;
  const dbPrice = Number(settings.token_usd_price ?? mockSettings.tokenUsdPrice);
  const contractAddress = settings.token_contract_address ?? "";
  
  const tokenUsdPrice = await getOnChainTokenPrice(contractAddress, dbPrice);

  return {
    minimumWithdrawalPoints: settings.minimum_withdrawal_points,
    requiredPurchaseUsd: Number(settings.required_purchase_usd),
    purchaseConditionEnabled: settings.purchase_condition_enabled,
    tokenUsdPrice,
    withdrawalLockDays: settings.withdrawal_lock_days ?? 0,
    tokenContractAddress: contractAddress,
    quickswapLink: settings.quickswap_link ?? "",
    ownerWallet: settings.owner_wallet ?? "",
    baseRewardUsd: Number(settings.base_reward_usd ?? 1.00),
    botActive: Boolean(settings.bot_active ?? true),
    purchasePlans: (settings.purchase_plans ? (typeof settings.purchase_plans === 'string' ? JSON.parse(settings.purchase_plans) : settings.purchase_plans) : [
      { minPurchase: 3, lockDays: 1, multiplier: 2.0 },
      { minPurchase: 5, lockDays: 5, multiplier: 3.0 }
    ]).map((p: any) => ({
      minPurchase: Number(p.minPurchase ?? p.min_purchase ?? 0),
      lockDays: Number(p.lockDays ?? p.lock_days ?? 0),
      multiplier: Number(p.multiplier ?? p.boost_multiplier ?? 1.00),
    })),
    maxContractsLimitEnabled: Boolean(settings.max_contracts_limit_enabled ?? false),
    maxContractsLimit: Number(settings.max_contracts_limit ?? 10),
  };
}

async function getReviewSubmissions(): Promise<ReviewSubmission[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("review_submissions")
    .select("*, app_users(display_name), tasks(title,platform)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as ReviewSubmissionRow[]).map((item) => ({
    id: item.id,
    taskId: item.task_id,
    userId: item.user_id,
    userName: item.app_users?.display_name ?? "مستخدم",
    taskTitle: item.tasks?.title ?? "مهمة",
    platform: item.tasks?.platform ?? "x",
    proofUrl: item.proof_url,
    note: item.note ?? "",
    status: item.status,
    createdAt: item.created_at,
  }));
}

async function getWithdrawals(): Promise<WithdrawalRequest[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("withdrawal_requests")
    .select("*, app_users(display_name)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as WithdrawalRow[]).map((item) => ({
    id: item.id,
    userId: item.user_id,
    userName: item.app_users?.display_name ?? "مستخدم",
    amount: item.amount,
    walletAddress: item.wallet_address,
    status: item.status,
    createdAt: item.created_at,
  }));
}

async function getPurchaseVerificationRequests(): Promise<PurchaseVerificationRequest[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("purchase_verification_requests")
    .select("*, app_users(display_name)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as PurchaseVerificationRow[]).map((item) => ({
    id: item.id,
    userId: item.user_id,
    userName: item.app_users?.display_name ?? "User",
    walletAddress: item.wallet_address,
    proofUrl: item.proof_url,
    status: item.status,
    createdAt: item.created_at,
  }));
}

async function getLeaderboard(): Promise<LeaderboardUser[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("app_users")
    .select("id,display_name,username,balance")
    .order("balance", { ascending: false })
    .limit(20);

  return ((data ?? []) as Array<Pick<DbUser, "id" | "display_name" | "username" | "balance">>).map(
    (user, index) => ({
      id: user.id,
      name: user.display_name,
      username: user.username ?? "",
      balance: user.balance,
      rank: index + 1,
    }),
  );
}

function mapUser(user: DbUser, completedTasks: number): AppUser {
  return {
    id: user.id,
    telegramId: user.telegram_id,
    name: user.display_name,
    username: user.username ?? "",
    balance: user.balance,
    pendingBalance: user.balance_pending ?? 0,
    withdrawableBalance: user.balance_withdrawable ?? user.balance,
    purchaseVerified: user.purchase_verified ?? false,
    completedTasks,
    frozen: user.frozen,
    joinedAt: user.created_at,
    onboardingCompleted: user.onboarding_completed ?? false,
    referredBy: user.referred_by,
    referralCount: user.referral_count ?? 0,
    unlockAt: user.unlock_at,
    miningCyclesCompleted: user.mining_cycles_completed ?? 0,
    cooldownBypassed: user.cooldown_bypassed ?? false,
    influencerCode: user.influencer_code,
    walletAddress: user.wallet_address,
    boostMultiplier: Number(user.boost_multiplier ?? 1.00),
    lastCycleEarnedTokens: user.last_cycle_earned_tokens ?? 0,
    lastCycleDoubled: user.last_cycle_doubled ?? false,
  };
}

async function awardRewardToUser(userId: string, amount: number) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  const settings = await getAppSettings();
  const nextBalance = user.balance + amount;
  
  const nextPending =
    settings.purchaseConditionEnabled && !user.purchaseVerified
      ? user.pendingBalance + amount
      : user.pendingBalance;
      
  const nextWithdrawable =
    settings.purchaseConditionEnabled && !user.purchaseVerified
      ? user.withdrawableBalance
      : user.withdrawableBalance + amount;

  const nextLastCycleEarned = (user.lastCycleDoubled)
    ? (user.lastCycleEarnedTokens ?? 0)
    : (user.lastCycleEarnedTokens ?? 0) + amount;

  const { data } = await supabase
    .from("app_users")
    .update({
      balance: nextBalance,
      balance_pending: nextPending,
      balance_withdrawable: nextWithdrawable,
      last_cycle_earned_tokens: nextLastCycleEarned,
    })
    .eq("id", userId)
    .select("*")
    .single();

  return data ? mapUser(data as DbUser, user.completedTasks + 1) : null;
}

export async function getUserActiveMiningSession(userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("claimed", false)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    startedAt: data.started_at,
    endsAt: data.ends_at,
    claimed: data.claimed,
    rewardUsd: Number(data.reward_usd),
    rewardTokens: Number(data.reward_tokens),
  };
}

export async function startMiningSession(userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك، لا يمكنك التعدين." };
  }

  if (!user.onboardingCompleted) {
    return { ok: false, message: "يجب إكمال المهام الإلزامية أولاً." };
  }

  if (user.miningCyclesCompleted > 0) {
    if (!user.purchaseVerified) {
      return { ok: false, message: "يجب عليك تفعيل التعدين بالتحقق من شراء الرموز أولاً." };
    }
  }

  // Check if there is already an active session (running or unclaimed)
  const activeSession = await getUserActiveMiningSession(userId);
  if (activeSession) {
    return { ok: false, message: "لديك دورة تعدين نشطة بالفعل أو بانتظار المطالبة." };
  }

  // Check 24-hour limit on starting sessions unless cooldown_bypassed is true
  if (!user.cooldownBypassed) {
    const { data: lastSession } = await supabase
      .from("mining_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSession) {
      const lastStart = new Date(lastSession.started_at).getTime();
      const diffHours = (Date.now() - lastStart) / (1000 * 60 * 60);
      if (diffHours < 24) {
        const remainingMs = (24 * 60 * 60 * 1000) - (Date.now() - lastStart);
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        return {
          ok: false,
          message: `يمكنك بدء دورة تعدين واحدة كل 24 ساعة. يرجى الانتظار ${hours} ساعة و ${minutes} دقيقة.`,
          cooldownRemainingMs: remainingMs
        };
      }
    }
  }

  // Fetch token price to calculate exact OBSD amount
  const settings = await getAppSettings();
  const price = settings.tokenUsdPrice || 0.001;

  const multiplier = user.boostMultiplier || (user.purchaseVerified ? 2.0 : 1.0);
  const rewardUsd = 0.10 * multiplier;
  const rewardTokens = Number((rewardUsd / price).toFixed(6));

  const durationMs = 1 * 60 * 60 * 1000; // 1 hour
  const endsAt = new Date(Date.now() + durationMs).toISOString();

  const { data: newSession, error: insertError } = await supabase
    .from("mining_sessions")
    .insert({
      user_id: userId,
      ends_at: endsAt,
      reward_usd: rewardUsd,
      reward_tokens: rewardTokens,
    })
    .select("*")
    .single();

  if (insertError || !newSession) {
    return { ok: false, message: "فشل بدء دورة التعدين." };
  }

  // If cooldown was bypassed, reset it to false
  if (user.cooldownBypassed) {
    await supabase
      .from("app_users")
      .update({ cooldown_bypassed: false })
      .eq("id", userId);
  }

  return {
    ok: true,
    message: "تم بدء دورة التعدين بنجاح لمدة ساعة.",
    session: {
      id: newSession.id,
      userId: newSession.user_id,
      startedAt: newSession.started_at,
      endsAt: newSession.ends_at,
      claimed: newSession.claimed,
      rewardUsd: Number(newSession.reward_usd),
      rewardTokens: Number(newSession.reward_tokens),
    }
  };
}

export async function claimMiningSession(userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك، لا يمكنك المطالبة." };
  }

  const { data: session, error } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("claimed", false)
    .maybeSingle();

  if (error || !session) {
    return { ok: false, message: "لا توجد دورة تعدين نشطة للمطالبة بها." };
  }

  const now = new Date().getTime();
  const ends = new Date(session.ends_at).getTime();
  if (now < ends) {
    return { ok: false, message: "دورة التعدين لم تنتهِ بعد." };
  }

  // Claim it
  const { error: claimError } = await supabase
    .from("mining_sessions")
    .update({
      claimed: true,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (claimError) {
    return { ok: false, message: "فشل تسجيل المطالبة بالنقاط." };
  }

  // Award the OBSD reward to the user
  const amount = Number(session.reward_tokens);
  await awardRewardToUser(userId, amount);

  // Delete non-onboarding social task completions and submissions so they are unlocked for the next cycle
  const { data: socialTasks } = await supabase
    .from("tasks")
    .select("id")
    .eq("is_social_media", true)
    .eq("is_onboarding", false);

  if (socialTasks && socialTasks.length > 0) {
    const socialTaskIds = socialTasks.map((t) => t.id);
    await supabase
      .from("task_completions")
      .delete()
      .eq("user_id", userId)
      .in("task_id", socialTaskIds);

    await supabase
      .from("review_submissions")
      .delete()
      .eq("user_id", userId)
      .in("task_id", socialTaskIds);
  }

  // Increment completed mining cycles and lock user
  const nextCycles = (user.miningCyclesCompleted || 0) + 1;
  const { data: updatedUser, error: updateError } = await supabase
    .from("app_users")
    .update({
      mining_cycles_completed: nextCycles,
      purchase_verified: false,
      last_cycle_earned_tokens: amount,
      last_cycle_doubled: false,
    })
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    console.error("claimMiningSession: update app_users error:", updateError.message);
    return { ok: false, message: "فشل تحديث بيانات المستخدم: " + updateError.message };
  }

  return {
    ok: true,
    message: "تمت المطالبة بنقاط التعدين بنجاح.",
    balance: updatedUser ? updatedUser.balance : user.balance,
    pendingBalance: updatedUser ? updatedUser.balance_pending : user.pendingBalance,
    withdrawableBalance: updatedUser ? updatedUser.balance_withdrawable : user.withdrawableBalance,
    miningCyclesCompleted: nextCycles,
  };
}

export async function awardReferralBonus(referrerId: string, referredUserId: string, taskId: string | null, amount: number) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const referrer = await getUserById(referrerId);
  if (!referrer || referrer.frozen) return;

  const bonusAmount = Math.max(1, Math.floor(amount * 0.1));

  const settings = await getAppSettings();
  const nextBalance = referrer.balance + bonusAmount;
  
  const nextPending =
    settings.purchaseConditionEnabled && !referrer.purchaseVerified
      ? referrer.pendingBalance + bonusAmount
      : referrer.pendingBalance;
      
  const nextWithdrawable =
    settings.purchaseConditionEnabled && !referrer.purchaseVerified
      ? referrer.withdrawableBalance
      : referrer.withdrawableBalance + bonusAmount;

  await supabase
    .from("app_users")
    .update({
      balance: nextBalance,
      balance_pending: nextPending,
      balance_withdrawable: nextWithdrawable,
    })
    .eq("id", referrerId);

  await supabase.from("referral_rewards").insert({
    referrer_id: referrerId,
    referred_user_id: referredUserId,
    task_id: taskId,
    amount: bonusAmount,
  });
}

export async function checkAndCompleteOnboarding(userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const user = await getUserById(userId);
  if (!user || user.onboardingCompleted) return;

  const { data: onboardingTasks } = await supabase
    .from("tasks")
    .select("id")
    .eq("is_onboarding", true)
    .eq("status", "active");

  if (!onboardingTasks || onboardingTasks.length === 0) {
    await supabase.from("app_users").update({ onboarding_completed: true }).eq("id", userId);
    return;
  }

  const onboardingTaskIds = onboardingTasks.map((t) => t.id);
  const { count } = await supabase
    .from("task_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("task_id", onboardingTaskIds);

  if (count === onboardingTasks.length) {
    await supabase.from("app_users").update({ onboarding_completed: true }).eq("id", userId);
  }
}

export async function completeReferralTask(userId: string, taskId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, message: "المستخدم غير موجود." };
  }

  if (user.frozen) {
    return { ok: false, message: "تم تجميد حسابك بسبب مخالفة القوانين." };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("platform", "referral")
    .eq("status", "active")
    .maybeSingle();

  if (!task) {
    return { ok: false, message: "المهمة غير متاحة للتحقق." };
  }

  const { data: existing } = await supabase
    .from("task_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "تم إكمال هذه المهمة بالفعل." };
  }

  const { error: completionError } = await supabase.from("task_completions").insert({
    user_id: userId,
    task_id: taskId,
    reward: 0, // 0 reward from task completion itself, because rewards are given instantly per friend join!
  });

  if (completionError) {
    return { ok: false, message: "تعذر تسجيل إكمال المهمة." };
  }

  await checkAndCompleteOnboarding(userId);

  return {
    ok: true,
    message: "تم تفعيل خطوة الإحالة ومتابعة التنشيط! ستحصل على مكافأة مباشرة لكل صديق يدخل فعلياً.",
    balance: user.balance,
    pendingBalance: user.pendingBalance,
    withdrawableBalance: user.withdrawableBalance,
  };
}

export async function toggleUserFreeze(userId: string, frozen: boolean) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { error } = await supabase
    .from("app_users")
    .update({ frozen })
    .eq("id", userId);

  if (error) {
    return { ok: false, message: "تعذر تحديث حالة تجميد الحساب: " + error.message };
  }

  return { ok: true, message: frozen ? "تم تجميد حساب المستخدم بنجاح." : "تم إلغاء تجميد حساب المستخدم بنجاح." };
}

function extractTelegramChatId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "t.me" || parsed.hostname.endsWith(".t.me")) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        const mainPart = pathParts[0];
        if (mainPart === "c" && pathParts.length > 1) {
          return `-100${pathParts[1]}`;
        }
        return `@${mainPart}`;
      }
    }
  } catch {
    if (url.startsWith("@")) {
      return url;
    }
  }
  return null;
}

function mapTasks(tasks: DbTask[], completedIds: Set<string>, pendingIds: Set<string>, tokenUsdPrice: number): Task[] {
  return tasks.map((task) => {
    let reward = task.reward;
    if (task.reward_usd) {
      reward = Math.round(Number(task.reward_usd) / (tokenUsdPrice || 0.001));
    }
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      platform: task.platform,
      reward,
      url: task.target_url,
      status: completedIds.has(task.id)
        ? "completed"
        : pendingIds.has(task.id)
          ? "pending_review"
          : "available",
      proofRequired: task.proof_required,
      isOnboarding: task.is_onboarding ?? false,
      rewardUsd: task.reward_usd ? Number(task.reward_usd) : null,
      isSocialMedia: task.is_social_media ?? false,
    };
  });
}

function getJoinedReward(submission: SubmissionWithReward) {
  const task = Array.isArray(submission.tasks) ? submission.tasks[0] : submission.tasks;
  return Number(task?.reward ?? 0);
}

export async function runMembershipAntiCheatCheck() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Database is not connected." };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, message: "Telegram bot token is not configured." };
  }

  const { data: telegramTasks } = await supabase
    .from("tasks")
    .select("id, target_url, title")
    .eq("platform", "telegram")
    .eq("status", "active");

  if (!telegramTasks || telegramTasks.length === 0) {
    return { ok: true, message: "No active Telegram tasks to check." };
  }

  const taskMap = new Map(telegramTasks.map((t) => [t.id, t]));
  const taskIds = telegramTasks.map((t) => t.id);

  const { data: completions } = await supabase
    .from("task_completions")
    .select("user_id, task_id")
    .in("task_id", taskIds);

  if (!completions || completions.length === 0) {
    return { ok: true, message: "No completions to evaluate." };
  }

  const userIds = [...new Set(completions.map((c) => c.user_id))];
  const { data: users } = await supabase
    .from("app_users")
    .select("id, telegram_id, display_name, frozen")
    .in("id", userIds)
    .eq("frozen", false);

  if (!users || users.length === 0) {
    return { ok: true, message: "No unfrozen users to check." };
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const frozenUsers: string[] = [];

  for (const completion of completions) {
    const user = userMap.get(completion.user_id);
    const task = taskMap.get(completion.task_id);

    if (!user || !task || user.frozen) continue;

    const chatId = extractTelegramChatId(task.target_url);
    if (!chatId) continue;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${user.telegram_id}`
      );
      const data = await response.json();
      
      if (data.ok) {
        const status = data.result.status;
        const isMember = ["member", "creator", "administrator", "restricted"].includes(status);
        if (!isMember) {
          await supabase
            .from("app_users")
            .update({ frozen: true })
            .eq("id", user.id);
          
          user.frozen = true;
          frozenUsers.push(user.display_name);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`Error checking membership for user ${user.id} on task ${task.id}:`, err);
    }
  }

  return {
    ok: true,
    message: `Membership check completed. Frozen ${frozenUsers.length} users.`,
    frozenList: frozenUsers,
  };
}

export async function runMiningNotificationsCheck() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Database is not connected." };
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "rewards_tasks_demo_bot";

  const { data: sessions, error } = await supabase
    .from("mining_sessions")
    .select("*, app_users(telegram_id, display_name)")
    .eq("claimed", false)
    .eq("notified", false)
    .lte("ends_at", new Date().toISOString());

  if (error) {
    console.error("Failed to query ended mining sessions:", error);
    return { ok: false, message: "Failed to query sessions." };
  }

  let notifiedCount = 0;

  for (const session of (sessions ?? [])) {
    const user = session.app_users as unknown as { telegram_id: string; display_name: string } | null;
    if (!user || !user.telegram_id) continue;

    const messageText = `⚠️ <b>انتهت دورة التعدين الخاصة بك!</b>\n\nلقد جمعت ما يعادل 0.1$ من رموز OBSD.\n\nللمطالبة بالرموز والبدء في دورة جديدة، يرجى إكمال مهام السوشيال ميديا وتفعيل حسابك بالشراء.\n\n<a href="https://t.me/${botUsername}">افتح التطبيق الآن للمتابعة</a>`;

    const ok = await sendTelegramMessage(user.telegram_id, messageText);
    if (ok) {
      await supabase
        .from("mining_sessions")
        .update({ notified: true })
        .eq("id", session.id);
      notifiedCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Run hold check
  let holdCheckMsg = "";
  try {
    const holdResult = await checkAllHolders();
    holdCheckMsg = ` Checked ${holdResult.checked} holders, revoked ${holdResult.revoked}.`;
  } catch (err) {
    console.error("Failed to run hold check in runMiningNotificationsCheck:", err);
    holdCheckMsg = " Failed hold check execution.";
  }

  return {
    ok: true,
    message: `Mining check completed. Notified ${notifiedCount} users.${holdCheckMsg}`,
  };
}

export async function deleteTask(id: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) {
    return { ok: false, message: "تعذر حذف المهمة: " + error.message };
  }

  return { ok: true, message: "تم حذف المهمة بنجاح." };
}

export async function bypassReferralTask(userId: string, taskId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { ok: false, message: "قاعدة البيانات غير متصلة." };

  const user = await getUserById(userId);
  if (!user) return { ok: false, message: "المستخدم غير موجود." };

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { ok: false, message: "المهمة غير موجودة." };

  // Check if already completed
  const { data: existing } = await supabase
    .from("task_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("task_completions").insert({
      user_id: userId,
      task_id: taskId,
      reward: 0,
    });
  }

  // Update onboarding completed state directly
  await supabase.from("app_users").update({ onboarding_completed: true }).eq("id", userId);

  return { ok: true, message: "تم تخطي شرط الدعوات بنجاح. يمكنك الآن تفعيل محفظتك للشراء." };
}

export async function checkUserHoldStatus(userId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return true;

  // 1. Fetch user from DB
  const { data: userRaw, error: fetchErr } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (fetchErr || !userRaw) {
    return true; 
  }

  // Map to AppUser interface
  const user = mapUser(userRaw as DbUser, 0);

  if (!user || !user.unlockAt || !user.walletAddress) {
    return true; // No active hold
  }

  // 2. Check if lock timer has expired
  const now = new Date();
  const unlockDate = new Date(user.unlockAt);
  if (now >= unlockDate) {
    return true; // Lock expired, hold successfully completed!
  }

  // 3. Get settings to know token price and contract address
  const settings = await getAppSettings();
  const contractAddress = settings.tokenContractAddress || "0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f";

  // 4. Get latest approved purchase request to find contractsCount
  const { data: latestRequest } = await supabase
    .from("purchase_verification_requests")
    .select("id, proof_url")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRequest) {
    return true; // No approved purchase found, nothing to check/revoke
  }

  let contractsCount = 1;
  if (latestRequest.proof_url && latestRequest.proof_url.startsWith("Contracts: ")) {
    contractsCount = parseInt(latestRequest.proof_url.replace("Contracts: ", ""), 10) || 1;
  }

  const verificationCycle = user.purchaseVerified ? user.miningCyclesCompleted : Math.max(0, user.miningCyclesCompleted - 1);
  const plan = verificationCycle === 0
    ? (settings.purchasePlans[0] || { minPurchase: 2, lockDays: 1, multiplier: 2.0 })
    : (settings.purchasePlans[1] || settings.purchasePlans[0] || { minPurchase: 5, lockDays: 5, multiplier: 2.0 });

  const finalContractsCount = verificationCycle === 0 ? 1 : contractsCount;
  const requiredUsd = finalContractsCount * plan.minPurchase;
  const requiredTokens = requiredUsd / (settings.tokenUsdPrice || 0.001);

  // 5. Fetch actual balance on chain
  let balance = 0;
  try {
    balance = await getErc20Balance(contractAddress, user.walletAddress);
  } catch (err) {
    console.error("Failed to fetch balance in checkUserHoldStatus:", err);
    return true; // RPC error, assume ok to avoid false revokes
  }

  // If they hold less than required (allowing 2% tolerance for safety)
  if (balance < requiredTokens * 0.98) {
    console.log(`[HOLD CHECK] User ${user.name} (${userId}) failed hold check! Has ${balance} OBSD, needs ${requiredTokens} OBSD.`);

    // Calculate reward tokens to revoke
    const rewardTokens = Math.max(0, Math.floor(((user.boostMultiplier ?? 1.0) - 1.0) * (user.lastCycleEarnedTokens ?? 0)));

    // Reject the latest approved request
    await supabase
      .from("purchase_verification_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", latestRequest.id);

    // Deduct from user balance
    const nextBalance = Math.max(0, user.balance - rewardTokens);
    const nextWithdrawable = Math.max(0, user.withdrawableBalance - rewardTokens);

    await supabase
      .from("app_users")
      .update({
        purchase_verified: false,
        unlock_at: null,
        boost_multiplier: 1.0,
        cooldown_bypassed: false,
        balance: nextBalance,
        balance_withdrawable: nextWithdrawable,
      })
      .eq("id", userId);

    // Log the revocation in audit_logs
    try {
      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: "hold_failed_revoke_reward",
        details: `Failed hold check. Balance: ${balance} OBSD, Required: ${requiredTokens} OBSD. Revoked ${rewardTokens} OBSD reward.`,
      });
    } catch {}

    return false; // Hold failed
  }

  return true; // Hold is fine
}

export async function checkAllHolders() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Database not connected" };

  const now = new Date().toISOString();
  const { data: users, error } = await supabase
    .from("app_users")
    .select("id")
    .not("unlock_at", "is", null)
    .gt("unlock_at", now);

  if (error) {
    console.error("Error fetching active holders:", error.message);
    return { ok: false, message: error.message };
  }

  let failedCount = 0;
  for (const user of (users || [])) {
    const ok = await checkUserHoldStatus(user.id);
    if (!ok) {
      failedCount++;
    }
  }

  return { ok: true, checked: users?.length || 0, revoked: failedCount };
}
