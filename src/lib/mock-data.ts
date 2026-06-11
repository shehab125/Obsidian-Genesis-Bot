import type {
  AppUser,
  PurchaseVerificationRequest,
  ReviewSubmission,
  Task,
  WithdrawalRequest,
} from "./types";

export const demoUser: AppUser = {
  id: "user_ahmed_demo",
  telegramId: "789456123",
  name: "Ahmed Mohamed",
  username: "ahmed_m",
  balance: 1280,
  pendingBalance: 1280,
  withdrawableBalance: 0,
  purchaseVerified: false,
  completedTasks: 9,
  frozen: false,
  joinedAt: "2026-06-06T14:40:00.000Z",
  onboardingCompleted: true,
  referredBy: null,
  referralCount: 2,
  unlockAt: null,
  miningCyclesCompleted: 3,
  cooldownBypassed: false,
};

export const appSettings = {
  minimumWithdrawalPoints: 500,
  requiredPurchaseUsd: 3,
  purchaseConditionEnabled: true,
  tokenUsdPrice: 0.001,
  withdrawalLockDays: 0,
  tokenContractAddress: "0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f",
  quickswapLink: "https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F",
  ownerWallet: "0x7167C08FD45021c68993057d73f3b35944682635",
};

export const tasks: Task[] = [
  {
    id: "task_tg_join_news",
    title: "انضم لقناة الأخبار",
    description: "اضغط فتح، انضم للقناة، ثم ارجع للتطبيق واضغط تحقق.",
    platform: "telegram",
    reward: 120,
    url: "https://t.me/example_channel",
    status: "available",
    proofRequired: false,
    isOnboarding: false,
    isSocialMedia: false,
    rewardUsd: null,
  },
  {
    id: "task_tg_group",
    title: "انضم لمجموعة المجتمع",
    description: "يتم التحقق من وجودك في المجموعة عبر Telegram Bot API.",
    platform: "telegram",
    reward: 180,
    url: "https://t.me/example_group",
    status: "completed",
    proofRequired: false,
    isOnboarding: false,
    isSocialMedia: false,
    rewardUsd: null,
  },
  {
    id: "task_x_repost",
    title: "إعادة نشر تغريدة الحملة",
    description: "ارفع رابط التغريدة أو Screenshot ليتم اعتمادها من الإدارة.",
    platform: "x",
    reward: 260,
    url: "https://x.com/example/status/123",
    status: "pending_review",
    proofRequired: true,
    isOnboarding: false,
    isSocialMedia: false,
    rewardUsd: null,
  },
  {
    id: "task_x_like",
    title: "إعجاب بتغريدة الإعلان",
    description: "المراجعة يدوية في نسخة MVP بدون X API مدفوع.",
    platform: "x",
    reward: 90,
    url: "https://x.com/example/status/456",
    status: "available",
    proofRequired: true,
    isOnboarding: false,
    isSocialMedia: false,
    rewardUsd: null,
  },
];

export const submissions: ReviewSubmission[] = [
  {
    id: "sub_1001",
    taskId: "task_x_repost",
    userId: demoUser.id,
    userName: demoUser.name,
    taskTitle: "إعادة نشر تغريدة الحملة",
    platform: "x",
    proofUrl: "https://x.com/ahmed_m/status/987",
    note: "تمت إعادة النشر من نفس الحساب.",
    status: "pending",
    createdAt: "2026-06-06T15:02:00.000Z",
  },
];

export const withdrawals: WithdrawalRequest[] = [
  {
    id: "wd_2101",
    userId: demoUser.id,
    userName: demoUser.name,
    amount: 500,
    walletAddress: "USDT-TRC20 demo wallet",
    status: "pending",
    createdAt: "2026-06-06T15:10:00.000Z",
  },
];

export const purchaseVerificationRequests: PurchaseVerificationRequest[] = [
  {
    id: "pv_1001",
    userId: demoUser.id,
    userName: demoUser.name,
    walletAddress: "0xDemoWallet",
    proofUrl: "https://example.com/purchase-proof.png",
    status: "pending",
    createdAt: "2026-06-06T15:12:00.000Z",
  },
];

export const stats = {
  users: 184,
  activeToday: 61,
  pendingReviews: submissions.filter((item) => item.status === "pending").length,
  pendingWithdrawals: withdrawals.filter((item) => item.status === "pending").length,
};
