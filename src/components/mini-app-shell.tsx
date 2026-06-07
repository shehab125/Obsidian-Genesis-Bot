"use client";

import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Home,
  Lock,
  Pickaxe,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, AppUser, LeaderboardUser, Task } from "@/lib/types";

type Props = {
  user: AppUser;
  tasks: Task[];
  settings: AppSettings;
  leaderboard: LeaderboardUser[];
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
      };
    };
  }
}

type Tab = "home" | "mining" | "wallet" | "nodes" | "ranks";

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "mining", label: "Mining", icon: Pickaxe },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "nodes", label: "Nodes", icon: UserRound },
  { id: "ranks", label: "Ranks", icon: BarChart3 },
];

export function MiniAppShell({ user, tasks, settings, leaderboard }: Props) {
  const [currentUser, setCurrentUser] = useState(user);
  const [taskRows, setTaskRows] = useState(tasks);
  const [appSettings, setAppSettings] = useState(settings);
  const [leaderboardRows, setLeaderboardRows] = useState(leaderboard);
  const [sessionReady, setSessionReady] = useState(Boolean(user.id));
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [balance, setBalance] = useState(user.balance);
  const [pendingBalance, setPendingBalance] = useState(user.pendingBalance);
  const [withdrawableBalance, setWithdrawableBalance] = useState(user.withdrawableBalance);
  const [message, setMessage] = useState("Open this app from Telegram to load your real account.");
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [withdrawAmount, setWithdrawAmount] = useState(String(settings.minimumWithdrawalPoints));
  const [walletAddress, setWalletAddress] = useState("");
  const [purchaseProofUrl, setPurchaseProofUrl] = useState("");
  const scrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const telegramWebApp = window.Telegram?.WebApp;
    telegramWebApp?.ready?.();

    const initData = telegramWebApp?.initData;
    if (!initData) {
      return;
    }

    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.ok) {
          setMessage(payload.message ?? "Telegram session could not be verified.");
          return;
        }

        setCurrentUser(payload.user);
        setTaskRows(payload.tasks);
        setAppSettings(payload.settings);
        setLeaderboardRows(payload.leaderboard ?? []);
        setBalance(payload.user.balance);
        setPendingBalance(payload.user.pendingBalance);
        setWithdrawableBalance(payload.user.withdrawableBalance);
        setWithdrawAmount(String(payload.settings.minimumWithdrawalPoints));
        setSessionReady(true);
        setMessage("TELEGRAM SESSION VERIFIED");
      })
      .catch(() => setMessage("Could not load Telegram session."));
  }, []);

  const completedCount = useMemo(
    () => taskRows.filter((task) => task.status === "completed").length,
    [taskRows],
  );
  const progress = taskRows.length ? Math.round((completedCount / taskRows.length) * 100) : 0;

  function scrollToTop() {
    window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  }

  function changeTab(tab: Tab) {
    setActiveTab(tab);
    scrollToTop();
  }

  async function verifyTelegramTask(taskId: string) {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    const response = await fetch("/api/tasks/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, taskId }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    if (payload.balance !== undefined) setBalance(payload.balance);
    if (payload.pendingBalance !== undefined) setPendingBalance(payload.pendingBalance);
    if (payload.withdrawableBalance !== undefined) {
      setWithdrawableBalance(payload.withdrawableBalance);
    }
    if (payload.ok) {
      setTaskRows((rows) => {
        const nextRows = rows.map((task) => (task.id === taskId ? { ...task, status: "completed" as const } : task));
        const allOnboardingDone = nextRows.filter(t => t.isOnboarding).every(t => t.status === "completed");
        setCurrentUser((current) => ({
          ...current,
          balance: payload.balance ?? current.balance,
          pendingBalance: payload.pendingBalance ?? current.pendingBalance,
          withdrawableBalance: payload.withdrawableBalance ?? current.withdrawableBalance,
          completedTasks: current.completedTasks + 1,
          onboardingCompleted: allOnboardingDone || current.onboardingCompleted,
        }));
        return nextRows;
      });
    }
    scrollToTop();
  }

  async function verifyReferralTask(taskId: string) {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    const response = await fetch("/api/tasks/referral/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, taskId }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    if (payload.balance !== undefined) setBalance(payload.balance);
    if (payload.pendingBalance !== undefined) setPendingBalance(payload.pendingBalance);
    if (payload.withdrawableBalance !== undefined) {
      setWithdrawableBalance(payload.withdrawableBalance);
    }
    if (payload.ok) {
      setTaskRows((rows) => {
        const nextRows = rows.map((task) => (task.id === taskId ? { ...task, status: "completed" as const } : task));
        const allOnboardingDone = nextRows.filter(t => t.isOnboarding).every(t => t.status === "completed");
        setCurrentUser((current) => ({
          ...current,
          balance: payload.balance ?? current.balance,
          pendingBalance: payload.pendingBalance ?? current.pendingBalance,
          withdrawableBalance: payload.withdrawableBalance ?? current.withdrawableBalance,
          completedTasks: current.completedTasks + 1,
          onboardingCompleted: allOnboardingDone || current.onboardingCompleted,
        }));
        return nextRows;
      });
    }
    scrollToTop();
  }

  async function submitProof(taskId: string) {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    if (!proofs[taskId]?.trim()) {
      setMessage("Paste the proof image/link URL first.");
      return;
    }
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        taskId,
        proofUrl: proofs[taskId] ?? "",
        note: "Proof submitted from mini app.",
      }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    if (payload.ok && payload.taskId) {
      setTaskRows((rows) =>
        rows.map((task) =>
          task.id === payload.taskId ? { ...task, status: "pending_review" } : task,
        ),
      );
      setProofs((current) => ({ ...current, [taskId]: "" }));
    }
    scrollToTop();
  }

  async function requestWithdrawal() {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    const response = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        amount: Number(withdrawAmount),
        walletAddress,
      }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    if (payload.balance !== undefined) setBalance(payload.balance);
    if (payload.withdrawableBalance !== undefined) {
      setWithdrawableBalance(payload.withdrawableBalance);
    }
    scrollToTop();
  }

  async function submitPurchaseVerification() {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    if (!walletAddress.trim() || !purchaseProofUrl.trim()) {
      setMessage("Add wallet address and proof image/link URL first.");
      return;
    }
    const response = await fetch("/api/purchase-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        walletAddress,
        proofUrl: purchaseProofUrl,
      }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    scrollToTop();
  }

  if (currentUser.frozen) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f5f5f7] grid place-items-center p-6">
        <div className="text-center space-y-6 max-w-sm rounded-[24px] border border-red-500/30 bg-[#0d0b0b] p-8 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-red-500/10 text-red-500">
            <Lock size={40} />
          </div>
          <h1 className="text-2xl font-black text-white">Account Frozen</h1>
          <p className="text-sm text-gray-400 leading-6">
            Your account has been suspended for violating terms (such as leaving mandatory channels after claiming rewards). If you believe this is an error, please contact support.
          </p>
          <p className="text-xs text-red-400 font-bold">
            Telegram ID: {currentUser.telegramId}
          </p>
        </div>
      </main>
    );
  }

  const referralLink = currentUser.telegramId ? `t.me/rewards_tasks_demo_bot?start=${currentUser.telegramId}` : "";

  if (!currentUser.onboardingCompleted) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f5f5f7]">
        <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col overflow-hidden bg-[#050505]">
          <StatusBar />
          <section ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-12 pt-4">
            <OnboardingScreen
              tasks={taskRows}
              message={message}
              proofs={proofs}
              setProofs={setProofs}
              verifyTelegramTask={verifyTelegramTask}
              verifyReferralTask={verifyReferralTask}
              submitProof={submitProof}
              sessionReady={sessionReady}
              referralCount={currentUser.referralCount}
              referralLink={referralLink}
            />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#f5f5f7]">
      <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col overflow-hidden bg-[#050505]">
        <StatusBar />
        <section ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-32 pt-4">
          {activeTab === "home" && (
            <HomeScreen
              tasks={taskRows}
              progress={progress}
              message={message}
              proofs={proofs}
              setProofs={setProofs}
              verifyTelegramTask={verifyTelegramTask}
              submitProof={submitProof}
              goMining={() => changeTab("mining")}
              sessionReady={sessionReady}
            />
          )}
          {activeTab === "mining" && (
            <MiningScreen
              balance={balance}
              pendingBalance={pendingBalance}
              withdrawableBalance={withdrawableBalance}
              purchaseVerified={currentUser.purchaseVerified}
              tokenUsdPrice={appSettings.tokenUsdPrice}
            />
          )}
          {activeTab === "wallet" && (
            <WalletScreen
              user={currentUser}
              settings={appSettings}
              balance={balance}
              pendingBalance={pendingBalance}
              withdrawableBalance={withdrawableBalance}
              withdrawAmount={withdrawAmount}
              walletAddress={walletAddress}
              purchaseProofUrl={purchaseProofUrl}
              setWithdrawAmount={setWithdrawAmount}
              setWalletAddress={setWalletAddress}
              setPurchaseProofUrl={setPurchaseProofUrl}
              requestWithdrawal={requestWithdrawal}
              submitPurchaseVerification={submitPurchaseVerification}
            />
          )}
          {activeTab === "nodes" && <NodesScreen user={currentUser} />}
          {activeTab === "ranks" && (
            <RanksScreen user={currentUser} balance={balance} leaderboard={leaderboardRows} />
          )}
        </section>
        <BottomNav activeTab={activeTab} setActiveTab={changeTab} />
      </div>
    </main>
  );
}

function StatusBar() {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between px-7 pt-2">
      <span className="text-[15px] font-black">9:41</span>
      <span className="h-[22px] w-[146px] rounded-full bg-[#17171c]" />
      <span className="w-10" />
    </div>
  );
}

function HomeScreen({
  tasks,
  progress,
  message,
  proofs,
  setProofs,
  verifyTelegramTask,
  submitProof,
  goMining,
  sessionReady,
}: {
  tasks: Task[];
  progress: number;
  message: string;
  proofs: Record<string, string>;
  setProofs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  verifyTelegramTask: (taskId: string) => Promise<void>;
  submitProof: (taskId: string) => Promise<void>;
  goMining: () => void;
  sessionReady: boolean;
}) {
  return (
    <div className="pt-6">
      <div className="mx-auto mb-6 h-[70px] w-[50px] bg-[linear-gradient(135deg,#ff8a00,#31d67b)] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]">
        <div className="mx-auto h-full w-[34%] bg-black/35 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
      </div>

      <div className="text-center">
        <h1 className="text-[28px] font-black leading-none tracking-tight">OBSIDIAN GENESIS</h1>
        <p className="mt-3 text-[13px] font-black text-[#ff8a00]">POLYGON LAYER-3 ECOSYSTEM</p>
      </div>

      <section className="mt-10 rounded-[20px] bg-[#17171c] p-5">
        <div className="flex items-center justify-between text-[15px] font-black">
          <span>Onboarding Progress</span>
          <span>{progress}% Complete</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[#241a42]">
          <div
            className="h-2 rounded-full bg-[linear-gradient(90deg,#f5f5f7,#ff8a00)]"
            style={{ width: `${Math.max(progress, 8)}%` }}
          />
        </div>
      </section>

      <p className="mt-4 text-center text-xs font-bold text-[#6b7280]">{message}</p>

      <div className="mt-5 space-y-3">
        {tasks.map((task) => {
          const complete = task.status === "completed";
          const pending = task.status === "pending_review";
          return (
            <article
              key={task.id}
              className={`rounded-[16px] border p-4 ${
                complete
                  ? "border-[#10b981] bg-[#121216]"
                  : "border-[#ff8a00] bg-[#0b0b0d]"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`grid size-12 shrink-0 place-items-center rounded-full ${
                    complete ? "bg-[#0b3a2c] text-[#31d67b]" : "bg-[#3a2b0b] text-[#ff8a00]"
                  }`}
                >
                  {complete ? <Check size={24} strokeWidth={4} /> : <span className="text-2xl">!</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-black leading-tight">{task.title}</h2>
                  <p className="mt-1 text-[12px] text-[#a1a1aa]">+{task.reward} OBSD</p>
                </div>
                <a
                  href={task.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#23232a] px-3 text-xs font-black text-[#d69a2d]"
                  title="Open task"
                >
                  <ExternalLink size={17} />
                  Open
                </a>
                {complete ? (
                  <span className="rounded-full bg-[#0b3a2c] px-4 py-2 text-xs font-black text-[#31d67b]">
                    Verified
                  </span>
                ) : task.platform === "telegram" ? (
                  <button
                    type="button"
                    onClick={() => verifyTelegramTask(task.id)}
                    disabled={!sessionReady}
                    className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black"
                  >
                    Verify
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => submitProof(task.id)}
                    disabled={!sessionReady || pending}
                    className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black"
                  >
                    {pending ? "Submitted" : "Submit"}
                  </button>
                )}
              </div>
              {task.proofRequired && !complete && !pending && (
                <input
                  value={proofs[task.id] ?? ""}
                  onChange={(event) =>
                    setProofs((current) => ({ ...current, [task.id]: event.target.value }))
                  }
                  placeholder="Paste proof image/link URL"
                  className="mt-3 h-10 w-full rounded-lg border border-[#23232a] bg-[#050505] px-3 text-xs text-[#f5f5f7] outline-none focus:border-[#ff8a00]"
                />
              )}
              {pending && (
                <p className="mt-3 rounded-lg border border-[#d69a2d] bg-[#211747]/40 px-3 py-2 text-center text-xs font-black text-[#d69a2d]">
                  Submitted. Waiting for admin review.
                </p>
              )}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={goMining}
        className="mt-9 h-16 w-full rounded-[16px] bg-[#d69a2d] text-[17px] font-black text-white"
      >
        Complete Tasks to Unlock App
      </button>
    </div>
  );
}

function MiningScreen({
  balance,
  pendingBalance,
  withdrawableBalance,
  purchaseVerified,
  tokenUsdPrice,
}: {
  balance: number;
  pendingBalance: number;
  withdrawableBalance: number;
  purchaseVerified: boolean;
  tokenUsdPrice: number;
}) {
  const multiplier = purchaseVerified ? 3 : 1;
  const velocity = 1.25 * multiplier;
  const usdBalance = balance * tokenUsdPrice;

  return (
    <div className="pt-8">
      <section className="rounded-[16px] border border-[#23232a] bg-[#121216] p-5 shadow-[0_0_40px_rgba(255,138,0,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="size-10 rounded-full border-2 border-[#d69a2d]" />
            <div>
              <h1 className="text-[15px] font-black">Obsidian Node #481</h1>
              <p className="text-xs font-black text-[#31d67b]">NETWORK SYNCED</p>
            </div>
          </div>
          <span className="rounded-xl border border-[#23232a] px-5 py-3 text-sm font-black text-[#d69a2d]">
            L3 APEX
          </span>
        </div>
      </section>

      <section className="mt-12 grid place-items-center">
        <div className="relative grid size-[228px] place-items-center rounded-full bg-[conic-gradient(#ff8a00_0_62%,#353300_62%_82%,#070707_82%_100%)] p-3 shadow-[0_0_70px_rgba(255,138,0,0.10)]">
          <div className="grid size-full place-items-center rounded-full border-2 border-[#ff8a00] bg-[#060606]">
            <div className="text-center">
              <p className="text-sm font-black text-[#a1a1aa]">ACCRUED ASSETS</p>
              <p className="mt-4 text-[44px] font-black leading-none text-[#e8f4ff]">
                {balance.toLocaleString()}
              </p>
              <p className="mt-2 text-sm font-black">OBSD</p>
              <p className="mt-1 text-xs font-black text-[#a1a1aa]">
                ${usdBalance.toFixed(2)} USD
              </p>
              <p className="mt-4 rounded-full bg-[#063326] px-4 py-2 text-xs font-black text-[#31d67b]">
                ENGINE ACTIVE
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 text-center text-[15px] text-[#a1a1aa]">
        Velocity: <span className="font-black text-white">+{velocity.toFixed(2)} OBSD/hr</span>
      </p>

      <InfoStrip label="Egress Window Closes In" value="04h 18m 32s" />

      <div className="mt-7 grid grid-cols-3 gap-3">
        <MetricCard title="Pending" value={pendingBalance} suffix="OBSD" />
        <MetricCard title="Ready" value={withdrawableBalance} suffix="OBSD" />
        <MetricCard title="Boost" value={multiplier} suffix="x" />
      </div>

      <button
        type="button"
        className="mt-10 h-16 w-full rounded-[16px] bg-[#d69a2d] text-[17px] font-black text-white"
      >
        Claim Accrued OBSD Tokens
      </button>
    </div>
  );
}

function WalletScreen({
  user,
  settings,
  balance,
  pendingBalance,
  withdrawableBalance,
  withdrawAmount,
  walletAddress,
  purchaseProofUrl,
  setWithdrawAmount,
  setWalletAddress,
  setPurchaseProofUrl,
  requestWithdrawal,
  submitPurchaseVerification,
}: {
  user: AppUser;
  settings: AppSettings;
  balance: number;
  pendingBalance: number;
  withdrawableBalance: number;
  withdrawAmount: string;
  walletAddress: string;
  purchaseProofUrl: string;
  setWithdrawAmount: (value: string) => void;
  setWalletAddress: (value: string) => void;
  setPurchaseProofUrl: (value: string) => void;
  requestWithdrawal: () => Promise<void>;
  submitPurchaseVerification: () => Promise<void>;
}) {
  const locked = settings.purchaseConditionEnabled && !user.purchaseVerified;
  const usdBalance = balance * settings.tokenUsdPrice;

  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!user.unlockAt) return;
    
    const updateTimer = () => {
      const target = new Date(user.unlockAt!).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [user.unlockAt]);

  const cooldownActive = Boolean(timeLeft);

  return (
    <div className="pt-6">
      <div className="flex items-center gap-8">
        <div className="grid size-12 place-items-center rounded-[14px] border border-[#ff8a00] text-[#ff8a00]">
          {locked ? <Lock size={20} fill="currentColor" /> : <Check size={24} />}
        </div>
        <div>
          <h1 className="text-[24px] font-black leading-tight">Ecosystem Verification</h1>
          <p className="text-sm font-black text-[#ff8a00]">
            Withdraw Engine: {locked ? "Locked" : cooldownActive ? "Cooldown" : "Unlocked"}
          </p>
        </div>
      </div>

      {cooldownActive && (
        <section className="mt-6 rounded-[16px] border border-red-500/30 bg-red-950/10 p-4 shadow-[0_0_20px_rgba(239,68,68,0.05)]">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider">
            Withdrawal Cooldown Hold Active
          </p>
          <p className="mt-1 text-sm text-gray-300">
            Your withdrawable balance is subject to a security hold period. It will unlock in:
          </p>
          <p className="mt-3 text-2xl font-black text-red-500 font-mono tracking-widest">
            {timeLeft}
          </p>
        </section>
      )}

      <section className="mt-6 rounded-[20px] border border-[#241747] bg-[#17171c] p-5">
        <p className="text-sm uppercase tracking-wide text-[#a1a1aa]">
          Critical system unlock requirement
        </p>
        <h2 className="mt-4 text-[21px] font-black">Connect Polygon Web3 Node</h2>
        <p className="mt-3 text-[15px] leading-6 text-[#a1a1aa]">
          Verifies account authenticity and unlocks withdrawable balance.
        </p>
      </section>

      <section className="mt-7 rounded-[20px] border border-dashed border-[#ff8a00] bg-[#0b0b0d] p-5">
        <h2 className="text-lg font-black">Verification Steps</h2>
        <Step ok label="Secure Handshake Protocol" />
        <Step
          ok={!locked}
          label="Minimum Balance Evaluation"
          error={
            locked
              ? `Failed: Requires $${settings.requiredPurchaseUsd.toFixed(2)} USD equivalent in OBSD tokens`
              : undefined
          }
        />
      </section>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <MetricCard title="Total" value={balance} suffix="" />
        <MetricCard title="Pending" value={pendingBalance} suffix="" />
        <MetricCard title="Ready" value={withdrawableBalance} suffix="" />
      </div>
      <p className="mt-3 text-center text-xs font-black text-[#a1a1aa]">
        OBSD price: ${settings.tokenUsdPrice.toFixed(6)} | Balance: ${usdBalance.toFixed(2)}
      </p>

      <section className="mt-6 space-y-3">
        <input
          value={withdrawAmount}
          onChange={(event) => setWithdrawAmount(event.target.value)}
          inputMode="numeric"
          className="h-12 w-full rounded-[12px] border border-[#ff8a00] bg-[#080808] px-4 text-sm font-bold outline-none"
        />
        <input
          value={walletAddress}
          onChange={(event) => setWalletAddress(event.target.value)}
          placeholder="Wallet address"
          className="h-12 w-full rounded-[12px] border border-[#23232a] bg-[#080808] px-4 text-sm font-bold outline-none focus:border-[#ff8a00]"
        />
        {locked && (
          <>
            <input
              value={purchaseProofUrl}
              onChange={(event) => setPurchaseProofUrl(event.target.value)}
              placeholder="Purchase proof link or screenshot URL"
              className="h-12 w-full rounded-[12px] border border-[#23232a] bg-[#080808] px-4 text-sm font-bold outline-none focus:border-[#ff8a00]"
            />
            <button
              type="button"
              onClick={submitPurchaseVerification}
              className="h-12 w-full rounded-[12px] border border-[#31d67b] bg-[#062219] text-sm font-black text-[#31d67b]"
            >
              Submit Purchase Proof
            </button>
          </>
        )}
      </section>

      <button
        type="button"
        onClick={requestWithdrawal}
        disabled={cooldownActive}
        className={`mt-7 h-16 w-full rounded-[16px] text-[17px] font-black text-white ${
          cooldownActive
            ? "bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-700"
            : "bg-[#d69a2d]"
        }`}
      >
        {cooldownActive ? `Cooldown Active (${timeLeft})` : "Execute RPC Validation Protocol"}
      </button>
    </div>
  );
}

function NodesScreen({ user }: { user: AppUser }) {
  const referralPath = user.telegramId ? `t.me/rewards_tasks_demo_bot?start=${user.telegramId}` : "";

  return (
    <div className="pt-5">
      <h1 className="text-[28px] font-black">Network Nucleus</h1>
      <p className="mt-4 text-[13px] leading-6 text-[#d4d4d8]">
        Scale your pipeline node to earn 10% structural ecosystem overrides.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <MetricCard title="Completed" value={user.completedTasks} suffix="" />
        <MetricCard title="Invites" value={user.referralCount} suffix="" highlight />
        <MetricCard title="Balance" value={user.balance} suffix="OBSD" />
      </div>
      <section className="mt-7 rounded-[18px] border border-[#d69a2d] bg-[#0b0b0d] p-5">
        <h2 className="text-sm font-black">UNIQUE ASSIGNMENT VECTOR URL</h2>
        <div className="mt-4 flex gap-3">
          <div className="min-w-0 flex-1 rounded-lg border border-[#d69a2d] px-3 py-3 text-sm overflow-x-auto whitespace-nowrap">
            {referralPath || "Open from Telegram first"}
          </div>
          <button
            type="button"
            onClick={() => {
              if (referralPath) {
                navigator.clipboard.writeText(referralPath);
                alert("Invite link copied to clipboard!");
              } else {
                alert("No link available. Open in Telegram.");
              }
            }}
            className="grid size-12 place-items-center rounded-lg bg-[#211747] text-[#ff8a00] hover:bg-[#2d225c]"
          >
            <Copy size={18} />
          </button>
        </div>
      </section>
      <section className="mt-6 rounded-[18px] border border-[#d69a2d] bg-[#0b0b0d] p-5">
        <h2 className="text-lg font-black">Weekly Pipeline Velocity</h2>
        <div className="mt-8 h-32 rounded-lg bg-[linear-gradient(180deg,rgba(49,214,123,.22),transparent)] [clip-path:polygon(0_80%,16%_60%,32%_70%,50%_35%,66%_20%,82%_30%,100%_0,100%_100%,0_100%)]" />
        <div className="mt-3 flex justify-between text-xs text-[#6b7280]">
          <span>MON</span>
          <span>THU</span>
          <span>SUN</span>
          <span>MON</span>
          <span>THU</span>
          <span>SUN</span>
        </div>
      </section>
      <h2 className="mt-7 text-sm font-black">ACCOUNT NODE</h2>
      <div className="mt-3 rounded-[14px] bg-[#0b0b0d] p-4">
        <p className="font-black">@{user.username || user.name || "Telegram user"}</p>
        <p className="mt-1 text-xs text-[#6b7280]">Telegram ID: {user.telegramId || "pending session"}</p>
      </div>
    </div>
  );
}

function RanksScreen({
  user,
  balance,
  leaderboard,
}: {
  user: AppUser;
  balance: number;
  leaderboard: LeaderboardUser[];
}) {
  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3, 10);
  const currentRank =
    leaderboard.find((leader) => leader.id === user.id)?.rank ??
    (user.id ? leaderboard.filter((leader) => leader.balance > balance).length + 1 : 0);
  return (
    <div className="pt-4">
      <h1 className="text-[28px] font-black">Apex Vector Tiers</h1>
      <p className="mt-4 text-[15px] leading-6 text-[#a1a1aa]">
        Top-tier operational network miners on Polygon network nodes.
      </p>
      {topThree.length > 0 ? (
        <div className="mt-9 grid grid-cols-3 items-end gap-3">
          {topThree.map((leader) => (
            <div
              key={leader.id}
              className={`rounded-[16px] border bg-[#0b0b0d] p-4 text-center ${
                leader.rank === 1 ? "min-h-[146px] border-[#d69a2d]" : "min-h-[126px] border-[#a1a1aa]"
              }`}
            >
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#d69a2d] font-black text-black">
                {leader.rank}
              </div>
              <p className="mt-5 truncate text-sm font-black">
                @{leader.username || leader.name}
              </p>
              <p className="mt-2 text-sm font-black text-[#f59e0b]">{leader.balance} OBSD</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-[14px] bg-[#0b0b0d] p-5 text-center text-sm text-[#a1a1aa]">
          No real users ranked yet.
        </p>
      )}
      <div className="mt-10 space-y-3">
        {rest.map((leader) => (
          <RankRow
            key={leader.id}
            rank={leader.rank}
            name={`@${leader.username || leader.name}`}
            score={`${leader.balance} OBSD`}
          />
        ))}
      </div>
      <section className="mt-16 rounded-[18px] border-2 border-[#ff8a00] bg-[#0b0b0d] p-5">
        <div className="flex items-center gap-5">
          <span className="text-sm font-black">YOU</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-black">@{user.username || user.name || "Telegram user"}</h2>
            <p className="mt-1 truncate text-xs font-black text-[#d69a2d]">
              Tier Status: Elite Miner
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-[#31d67b]">
              {currentRank ? `Rank #${currentRank}` : "Unranked"}
            </p>
            <p className="text-xs text-[#a1a1aa]">{balance.toLocaleString()} OBSD</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (tab: Tab) => void }) {
  return (
    <nav className="fixed bottom-5 left-1/2 z-20 grid w-[342px] -translate-x-1/2 grid-cols-5 rounded-[24px] border border-[#23232a] bg-[#121216] px-3 py-4 shadow-2xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-2 text-xs font-black ${
              active ? "text-[#d69a2d]" : "text-[#a1a1aa]"
            }`}
          >
            <Icon size={26} fill={active && tab.id === "home" ? "currentColor" : "none"} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-7 flex items-center justify-between rounded-[12px] border border-[#ff8a00] bg-[#080808] px-4 py-4">
      <span className="text-sm text-[#a1a1aa]">{label}</span>
      <span className="text-sm font-black">{value}</span>
    </div>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  highlight,
}: {
  title: string;
  value: number;
  suffix: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-[#d69a2d] bg-[#0b0b0d] p-4">
      <p className="text-sm text-[#a1a1aa]">{title}</p>
      <p className={`mt-2 text-[24px] font-black ${highlight ? "text-[#31d67b]" : "text-white"}`}>
        {value.toLocaleString()}
        {suffix && <span className="ml-1 text-xs">{suffix}</span>}
      </p>
    </div>
  );
}

function Step({ ok, label, error }: { ok: boolean; label: string; error?: string }) {
  return (
    <div className="mt-5 flex items-start gap-4">
      <div
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          ok ? "bg-[#063326] text-[#31d67b]" : "bg-[#3a2b0b] text-[#ff8a00]"
        }`}
      >
        {ok ? <Check size={20} strokeWidth={4} /> : "!"}
      </div>
      <div>
        <p className={`text-[15px] font-black ${ok ? "text-[#a1a1aa]" : "text-white"}`}>{label}</p>
        {error && (
          <p className="mt-3 rounded-sm bg-[#351417] px-4 py-2 text-xs font-black text-[#ff4b5c]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function NodeRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-[14px] bg-[#0b0b0d] p-4">
      <div className="flex items-center gap-4">
        <span className="grid size-10 place-items-center rounded-full bg-[#d69a2d] font-black text-white">
          α
        </span>
        <span className="font-black">{name}</span>
      </div>
      <span className="text-sm font-black text-[#31d67b]">{value}</span>
    </div>
  );
}

function RankRow({ rank, name, score }: { rank: number; name: string; score: string }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] bg-[#0b0b0d] px-5 py-5">
      <div className="flex items-center gap-6">
        <span className="text-lg font-black text-[#a1a1aa]">{rank}</span>
        <span className="text-[17px] font-black">{name}</span>
      </div>
      <span className="text-sm font-black text-[#d69a2d]">{score}</span>
    </div>
  );
}

function OnboardingScreen({
  tasks,
  message,
  proofs,
  setProofs,
  verifyTelegramTask,
  verifyReferralTask,
  submitProof,
  sessionReady,
  referralCount,
  referralLink,
}: {
  tasks: Task[];
  message: string;
  proofs: Record<string, string>;
  setProofs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  verifyTelegramTask: (taskId: string) => Promise<void>;
  verifyReferralTask: (taskId: string) => Promise<void>;
  submitProof: (taskId: string) => Promise<void>;
  sessionReady: boolean;
  referralCount: number;
  referralLink: string;
}) {
  const onboardingTasks = tasks.filter((t) => t.isOnboarding);

  return (
    <div className="pt-6 space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-[70px] w-[50px] bg-[linear-gradient(135deg,#ff8a00,#31d67b)] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]">
          <div className="mx-auto h-full w-[34%] bg-black/35 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
        </div>
        <h1 className="text-2xl font-black text-white">System Activation</h1>
        <p className="mt-2 text-xs font-black text-[#ff8a00]">ONBOARDING MANDATORY GATE</p>
        <p className="mt-3 text-sm text-[#a1a1aa] px-4">
          You must complete all onboarding tasks below to unlock mining and withdrawals.
        </p>
      </div>

      <div className="space-y-4">
        {onboardingTasks.map((task) => {
          const complete = task.status === "completed";
          const pending = task.status === "pending_review";
          const isReferral = task.platform === "referral";

          return (
            <article
              key={task.id}
              className={`rounded-[16px] border p-4 ${
                complete
                  ? "border-[#10b981] bg-[#121216]"
                  : "border-[#ff8a00] bg-[#0b0b0d]"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`grid size-12 shrink-0 place-items-center rounded-full ${
                    complete ? "bg-[#0b3a2c] text-[#31d67b]" : "bg-[#3a2b0b] text-[#ff8a00]"
                  }`}
                >
                  {complete ? <Check size={24} strokeWidth={4} /> : <span className="text-2xl">!</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-black leading-tight">{task.title}</h2>
                  <p className="mt-1 text-[12px] text-[#a1a1aa]">+{task.reward} OBSD</p>
                  {isReferral && (
                    <p className="mt-1 text-xs text-[#ff8a00] font-bold">
                      Invites: {referralCount}/3
                    </p>
                  )}
                </div>
                {!isReferral && task.url && (
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#23232a] px-3 text-xs font-black text-[#d69a2d]"
                  >
                    <ExternalLink size={16} />
                    Open
                  </a>
                )}
                {complete ? (
                  <span className="rounded-full bg-[#0b3a2c] px-4 py-2 text-xs font-black text-[#31d67b]">
                    Done
                  </span>
                ) : task.platform === "telegram" ? (
                  <button
                    type="button"
                    onClick={() => verifyTelegramTask(task.id)}
                    disabled={!sessionReady}
                    className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black"
                  >
                    Verify
                  </button>
                ) : isReferral ? (
                  <button
                    type="button"
                    onClick={() => verifyReferralTask(task.id)}
                    disabled={!sessionReady}
                    className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black"
                  >
                    Verify
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => submitProof(task.id)}
                    disabled={!sessionReady || pending}
                    className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black"
                  >
                    {pending ? "Submitted" : "Submit"}
                  </button>
                )}
              </div>

              {isReferral && !complete && (
                <div className="mt-4 p-3 rounded-lg bg-[#121216] border border-[#23232a] space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Your Invite Link:
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={referralLink}
                      className="flex-1 bg-[#050505] border border-[#23232a] rounded px-2 py-1 text-xs text-gray-300 outline-none"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(referralLink);
                        alert("Referral link copied!");
                      }}
                      className="px-3 py-1 bg-[#211747] text-xs font-bold rounded"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {task.proofRequired && !complete && !pending && (
                <input
                  value={proofs[task.id] ?? ""}
                  onChange={(event) =>
                    setProofs((current) => ({ ...current, [task.id]: event.target.value }))
                  }
                  placeholder="Paste proof image/link URL"
                  className="mt-3 h-10 w-full rounded-lg border border-[#23232a] bg-[#050505] px-3 text-xs text-[#f5f5f7] outline-none focus:border-[#ff8a00]"
                />
              )}
              {pending && (
                <p className="mt-3 rounded-lg border border-[#d69a2d] bg-[#211747]/40 px-3 py-2 text-center text-xs font-black text-[#d69a2d]">
                  Submitted. Waiting for admin review.
                </p>
              )}
            </article>
          );
        })}
      </div>

      {message && <p className="text-center text-xs font-bold text-[#ff8a00]">{message}</p>}

      <button
        type="button"
        disabled
        className="h-16 w-full rounded-[16px] bg-[#d69a2d]/40 text-[17px] font-black text-white/50 cursor-not-allowed text-center"
      >
        Complete All Tasks to Enter App
      </button>
    </div>
  );
}
