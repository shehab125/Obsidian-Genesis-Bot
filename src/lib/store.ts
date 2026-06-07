import { unstable_noStore as noStore } from "next/cache";
import { appSettings as mockSettings } from "./mock-data";
import { getSupabaseServerClient } from "./supabase";
import { verifyTelegramInitData } from "./telegram";
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

  const [{ data: tasks }, settings, leaderboard] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    getAppSettings(),
    getLeaderboard(),
  ]);

  return {
    user: emptyUser,
    tasks: mapTasks((tasks ?? []) as DbTask[], new Set(), new Set()),
    settings,
    leaderboard,
  };
}

export async function getMiniAppDataFromInitData(initData: string) {
  noStore();
  const user = await getUserFromTelegramInitData(initData);
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

  const [{ data: tasks }, { data: users }, { count: usersCount }] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    supabase.from("app_users").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("app_users").select("id", { count: "exact", head: true }),
  ]);

  const mappedUsers = ((users ?? []) as DbUser[]).map((user) => mapUser(user, 0));

  return {
    user: mappedUsers[0] ?? emptyUser,
    users: mappedUsers,
    tasks: mapTasks((tasks ?? []) as DbTask[], new Set(), new Set()),
    submissions: await getReviewSubmissions(),
    withdrawals: await getWithdrawals(),
    purchaseVerifications: await getPurchaseVerificationRequests(),
    leaderboard: await getLeaderboard(),
    settings: await getAppSettings(),
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

  const [
    { data: tasks },
    { data: completions },
    { data: pendingSubmissions },
    { count: usersCount },
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at"),
    supabase.from("task_completions").select("task_id").eq("user_id", user.id),
    supabase
      .from("review_submissions")
      .select("task_id,status")
      .eq("user_id", user.id)
      .eq("status", "pending"),
    supabase.from("app_users").select("id", { count: "exact", head: true }),
  ]);

  return {
    user,
    tasks: mapTasks(
      (tasks ?? []) as DbTask[],
      new Set((completions ?? []).map((item) => item.task_id as string)),
      new Set((pendingSubmissions ?? []).map((item) => item.task_id as string)),
    ),
    submissions: await getReviewSubmissions(),
    withdrawals: await getWithdrawals(),
    purchaseVerifications: await getPurchaseVerificationRequests(),
    leaderboard: await getLeaderboard(),
    settings: await getAppSettings(),
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
    .update({ balance: nextBalance, balance_withdrawable: nextWithdrawable })
    .eq("id", input.userId);

  return {
    ok: true,
    message: "تم تسجيل طلب السحب.",
    balance: nextBalance,
    withdrawableBalance: nextWithdrawable,
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
    return { ok: false, message: "تعذر تحديث المهمة." };
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
    return { ok: false, message: "Could not create task." };
  }

  return {
    ok: true,
    message: "Task created.",
    task: mapTasks([data as DbTask], new Set(), new Set())[0],
  };
}

export async function updateAppSettings(input: AppSettings) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "قاعدة البيانات غير متصلة." };
  }

  const { error } = await supabase.from("app_settings").upsert(
    {
      id: true,
      minimum_withdrawal_points: input.minimumWithdrawalPoints,
      required_purchase_usd: input.requiredPurchaseUsd,
      purchase_condition_enabled: input.purchaseConditionEnabled,
      token_usd_price: input.tokenUsdPrice,
      withdrawal_lock_days: input.withdrawalLockDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return { ok: false, message: "تعذر تحديث الإعدادات." };
  }

  return { ok: true, message: "تم تحديث إعدادات السحب والشراء والتعليق." };
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

  const settings = await getAppSettings();
  const lockDays = settings.withdrawalLockDays || 0;

  let unlockAt: string | null = null;
  if (lockDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + lockDays);
    unlockAt = d.toISOString();
  }

  const nextWithdrawable = user.withdrawableBalance + user.pendingBalance;
  await supabase
    .from("app_users")
    .update({
      purchase_verified: true,
      purchase_verified_at: new Date().toISOString(),
      balance_pending: 0,
      balance_withdrawable: nextWithdrawable,
      unlock_at: unlockAt,
    })
    .eq("id", userId);

  return {
    ok: true,
    message: lockDays > 0
      ? `تم تفعيل الشراء بنجاح. تم تعليق السحب مؤقتاً لمدة ${lockDays} أيام.`
      : "تم تفعيل الرصيد القابل للسحب للمستخدم.",
  };
}

async function getUserFromTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !verifyTelegramInitData(initData, botToken)) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");
  const startParam = params.get("start_param"); // Referrer Telegram ID
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
    if (referrerTelegramId && referrerTelegramId !== telegramId) {
      const { data: referrer } = await supabase
        .from("app_users")
        .select("id")
        .eq("telegram_id", referrerTelegramId)
        .maybeSingle();
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const { data: newUser, error } = await supabase
      .from("app_users")
      .insert({
        telegram_id: telegramId,
        username: telegramUser.username ?? null,
        display_name: displayName,
        referred_by: referredById,
      })
      .select("*")
      .single();

    if (!error && newUser) {
      data = newUser;
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

async function getAppSettings(): Promise<AppSettings> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { ...mockSettings, withdrawalLockDays: 0 };
  }

  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (!data) {
    return { ...mockSettings, withdrawalLockDays: 0 };
  }

  const settings = data as DbSettings;
  return {
    minimumWithdrawalPoints: settings.minimum_withdrawal_points,
    requiredPurchaseUsd: Number(settings.required_purchase_usd),
    purchaseConditionEnabled: settings.purchase_condition_enabled,
    tokenUsdPrice: Number(settings.token_usd_price ?? mockSettings.tokenUsdPrice),
    withdrawalLockDays: settings.withdrawal_lock_days ?? 0,
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

  const { data } = await supabase
    .from("app_users")
    .update({
      balance: nextBalance,
      balance_pending: nextPending,
      balance_withdrawable: nextWithdrawable,
    })
    .eq("id", userId)
    .select("*")
    .single();

  return data ? mapUser(data as DbUser, user.completedTasks + 1) : null;
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

    if (user.referredBy) {
      const { data: referrer } = await supabase
        .from("app_users")
        .select("referral_count")
        .eq("id", user.referredBy)
        .maybeSingle();

      if (referrer) {
        await supabase
          .from("app_users")
          .update({ referral_count: (referrer.referral_count || 0) + 1 })
          .eq("id", user.referredBy);
      }
    }
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

  if (user.referralCount < 3) {
    return {
      ok: false,
      message: `تحتاج إلى دعوة 3 مستخدمين على الأقل لإكمال هذه المهمة. (لديك حالياً: ${user.referralCount}/3)`,
    };
  }

  const { error: completionError } = await supabase.from("task_completions").insert({
    user_id: userId,
    task_id: taskId,
    reward: task.reward,
  });

  if (completionError) {
    return { ok: false, message: "تعذر تسجيل إكمال المهمة." };
  }

  const updatedUser = await awardRewardToUser(userId, task.reward);

  if (user.referredBy) {
    await awardReferralBonus(user.referredBy, userId, taskId, task.reward);
  }

  await checkAndCompleteOnboarding(userId);

  return {
    ok: true,
    message: "تم التحقق وإضافة مكافأة الإحالة بنجاح!",
    balance: updatedUser?.balance ?? user.balance,
    pendingBalance: updatedUser?.pendingBalance ?? user.pendingBalance,
    withdrawableBalance: updatedUser?.withdrawableBalance ?? user.withdrawableBalance,
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
    return { ok: false, message: "تعذر تحديث حالة تجميد الحساب." };
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

function mapTasks(tasks: DbTask[], completedIds: Set<string>, pendingIds: Set<string>): Task[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    platform: task.platform,
    reward: task.reward,
    url: task.target_url,
    status: completedIds.has(task.id)
      ? "completed"
      : pendingIds.has(task.id)
        ? "pending_review"
        : "available",
    proofRequired: task.proof_required,
    isOnboarding: task.is_onboarding ?? false,
  }));
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
