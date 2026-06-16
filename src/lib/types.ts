export type TaskPlatform = "telegram" | "x" | "referral";

export type TaskStatus = "available" | "pending_review" | "completed";

export type WithdrawalStatus = "pending" | "paid" | "rejected";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type AppUser = {
  id: string;
  telegramId: string;
  name: string;
  username: string;
  balance: number;
  pendingBalance: number;
  withdrawableBalance: number;
  purchaseVerified: boolean;
  completedTasks: number;
  frozen: boolean;
  joinedAt: string;
  onboardingCompleted: boolean;
  referredBy?: string | null;
  referralCount: number;
  unlockAt?: string | null;
  miningCyclesCompleted: number;
  cooldownBypassed: boolean;
  influencerCode?: string | null;
  walletAddress?: string | null;
};

export type TelegramInitUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type DbTask = {
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

export type Task = {
  id: string;
  title: string;
  description: string;
  platform: TaskPlatform;
  reward: number;
  url: string;
  status: TaskStatus;
  proofRequired: boolean;
  isOnboarding: boolean;
  rewardUsd?: number | null;
  isSocialMedia: boolean;
};

export type AppSettings = {
  minimumWithdrawalPoints: number;
  requiredPurchaseUsd: number;
  purchaseConditionEnabled: boolean;
  tokenUsdPrice: number;
  withdrawalLockDays: number;
  tokenContractAddress: string;
  quickswapLink: string;
  ownerWallet: string;
  baseRewardUsd: number;
  botActive: boolean;
};

export type ReviewSubmission = {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  taskTitle: string;
  platform: TaskPlatform;
  proofUrl: string;
  note: string;
  status: ReviewStatus;
  createdAt: string;
};

export type WithdrawalRequest = {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  walletAddress: string;
  status: WithdrawalStatus;
  createdAt: string;
};

export type LeaderboardUser = {
  id: string;
  name: string;
  username: string;
  balance: number;
  rank: number;
};

export type PurchaseVerificationRequest = {
  id: string;
  userId: string;
  userName: string;
  walletAddress: string;
  proofUrl: string;
  status: ReviewStatus;
  createdAt: string;
};
