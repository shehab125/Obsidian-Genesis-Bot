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
  const [claimTimers, setClaimTimers] = useState<Record<string, number>>({});
  const [withdrawAmount, setWithdrawAmount] = useState(String(settings.minimumWithdrawalPoints));
  const [walletAddress, setWalletAddress] = useState("");
  const [purchaseProofUrl, setPurchaseProofUrl] = useState("");
  const [contractsCount, setContractsCount] = useState<number>(1);
  const scrollRef = useRef<HTMLElement | null>(null);

  const [activeMiningSession, setActiveMiningSession] = useState<{
    id: string;
    userId: string;
    startedAt: string;
    endsAt: string;
    claimed: boolean;
    rewardUsd: number;
    rewardTokens: number;
  } | null>(null);
  const [lastSessionStart, setLastSessionStart] = useState<string | null>(null);

  const fetchActiveMiningSession = async (userId: string) => {
    try {
      const res = await fetch(`/api/mining/active?userId=${userId}`);
      const payload = await res.json();
      if (payload.ok) {
        setActiveMiningSession(payload.session);
        setLastSessionStart(payload.lastSessionStart);
      }
    } catch (err) {
      console.error("Failed to fetch active mining session:", err);
    }
  };

  useEffect(() => {
    const telegramWebApp = window.Telegram?.WebApp;
    telegramWebApp?.ready?.();

    const initData = telegramWebApp?.initData;
    if (!initData) {
      if (user.id) {
        fetchActiveMiningSession(user.id);
      }
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const referrerId = urlParams.get("start_param");

    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, referrerId }),
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
        if (payload.user.walletAddress) {
          setWalletAddress(payload.user.walletAddress);
        }
        setSessionReady(true);
        setMessage("TELEGRAM SESSION VERIFIED");

        // Fetch active mining session
        fetchActiveMiningSession(payload.user.id);
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
    if (tab === "mining" && currentUser.id) {
      fetchActiveMiningSession(currentUser.id);
    }
    scrollToTop();
  }

  async function startMining() {
    if (!sessionReady || !currentUser.id) return;
    try {
      const response = await fetch("/api/mining/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const payload = await response.json();
      setMessage(payload.message);
      if (payload.ok && payload.session) {
        setActiveMiningSession(payload.session);
        // Refresh session user data
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData })
        });
        const p = await res.json();
        if (p.ok) {
          setCurrentUser(p.user);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function claimMining() {
    if (!sessionReady || !currentUser.id) return;
    try {
      const response = await fetch("/api/mining/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const payload = await response.json();
      setMessage(payload.message);
      if (payload.ok) {
        setActiveMiningSession(null);
        if (payload.balance !== undefined) setBalance(payload.balance);
        if (payload.pendingBalance !== undefined) setPendingBalance(payload.pendingBalance);
        if (payload.withdrawableBalance !== undefined) setWithdrawableBalance(payload.withdrawableBalance);
        if (payload.miningCyclesCompleted !== undefined) {
          setCurrentUser((curr) => ({
            ...curr,
            miningCyclesCompleted: payload.miningCyclesCompleted,
            balance: payload.balance ?? curr.balance,
            pendingBalance: payload.pendingBalance ?? curr.pendingBalance,
            withdrawableBalance: payload.withdrawableBalance ?? curr.withdrawableBalance,
          }));
        }
        fetchActiveMiningSession(currentUser.id);
      }
    } catch (err) {
      console.error(err);
    }
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

  async function handleBypassReferrals(taskId: string) {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    const response = await fetch("/api/tasks/referral/bypass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, taskId }),
    });
    const payload = await response.json();
    setMessage(payload.message);
    if (payload.ok) {
      setTaskRows((rows) => {
        const nextRows = rows.map((task) => (task.id === taskId ? { ...task, status: "completed" as const } : task));
        setCurrentUser((current) => ({
          ...current,
          onboardingCompleted: true,
        }));
        return nextRows;
      });
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
    scrollToTop();
  }

  const startSocialTimer = (taskId: string) => {
    if (claimTimers[taskId] !== undefined) return;
    setClaimTimers((prev) => ({ ...prev, [taskId]: 15 }));

    const interval = setInterval(() => {
      setClaimTimers((prev) => {
        const currentVal = prev[taskId];
        if (currentVal <= 1) {
          clearInterval(interval);
          return { ...prev, [taskId]: 0 };
        }
        return { ...prev, [taskId]: currentVal - 1 };
      });
    }, 1000);
  };

  async function claimSocialTask(taskId: string) {
    if (!sessionReady || !currentUser.id) {
      setMessage("Open from Telegram first.");
      return;
    }
    const response = await fetch("/api/tasks/social/claim", {
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
    if (!walletAddress.trim()) {
      setMessage("Please input your wallet address first.");
      return;
    }
    const cleanAddress = walletAddress.trim();
    if (!cleanAddress.startsWith("0x") || cleanAddress.length !== 42) {
      setMessage("تنبيه: عنوان المحفظة غير صالح. يجب أن يبدأ بـ 0x ويتكون من 42 حرفاً.");
      return;
    }
    setMessage("Verifying OBSD purchase on Polygon... Please wait.");
    try {
      const response = await fetch("/api/purchase-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          walletAddress: walletAddress.trim(),
          contractsCount: contractsCount,
        }),
      });
      const payload = await response.json();
      setMessage(payload.message);
      if (payload.ok) {
        // Refresh session to apply multiplier and withdrawal state
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData })
        });
        const p = await res.json();
        if (p.ok) {
          setCurrentUser(p.user);
          setBalance(p.user.balance);
          setPendingBalance(p.user.pendingBalance);
          setWithdrawableBalance(p.user.withdrawableBalance);
          if (p.user.walletAddress) {
            setWalletAddress(p.user.walletAddress);
          }
          // Refetch active mining session to clear locked status
          fetchActiveMiningSession(p.user.id);
        }
      }
    } catch (err) {
      setMessage("Verification failed. Please try again.");
      console.error(err);
    }
    scrollToTop();
  }

   if (appSettings && appSettings.botActive === false) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f5f5f7] grid place-items-center p-6">
        <div className="text-center space-y-6 max-w-sm rounded-[24px] border border-yellow-500/30 bg-[#0d0d0b] p-8 shadow-[0_0_50px_rgba(234,179,8,0.08)]">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-yellow-500/10 text-yellow-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="size-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Maintenance Mode / صيانة مؤقتة</h1>
          <p className="text-sm text-gray-400 leading-6">
            النظام متوقف حالياً للصيانة والترقيات المؤقتة. سنعود للعمل قريباً جداً فور الانتهاء. شكراً لتفهمكم!
          </p>
          <p className="text-sm text-gray-400 leading-6">
            The system is temporarily suspended for scheduled maintenance and upgrades. We will be back online shortly. Thank you for your patience!
          </p>
        </div>
      </main>
    );
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

  const referralLink = currentUser.telegramId ? `https://t.me/rewards_tasks_demo_bot?start=${currentUser.telegramId}` : "";

  if (!currentUser.onboardingCompleted) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f5f5f7]">
        <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col overflow-hidden bg-[#050505]">
          <section ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-12 pt-4">
            <OnboardingScreen
              tasks={taskRows}
              message={message}
              verifyTelegramTask={verifyTelegramTask}
              verifyReferralTask={verifyReferralTask}
              bypassReferralTask={handleBypassReferrals}
              claimSocialTask={claimSocialTask}
              claimTimers={claimTimers}
              startSocialTimer={startSocialTimer}
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
        <section ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-32 pt-4">
          {activeTab === "home" && (
            <HomeScreen
              tasks={taskRows}
              progress={progress}
              message={message}
              verifyTelegramTask={verifyTelegramTask}
              claimSocialTask={claimSocialTask}
              claimTimers={claimTimers}
              startSocialTimer={startSocialTimer}
              goMining={() => changeTab("mining")}
              sessionReady={sessionReady}
              miningCyclesCompleted={currentUser.miningCyclesCompleted}
              purchaseVerified={currentUser.purchaseVerified}
              referralCount={currentUser.referralCount}
              changeTab={changeTab}
            />
          )}
          {activeTab === "mining" && (
            <MiningScreen
              user={currentUser}
              activeSession={activeMiningSession}
              lastSessionStart={lastSessionStart}
              tokenUsdPrice={appSettings.tokenUsdPrice}
              onStartMining={startMining}
              onClaimMining={claimMining}
              changeTab={changeTab}
              walletAddress={walletAddress}
              setWalletAddress={setWalletAddress}
              submitPurchaseVerification={submitPurchaseVerification}
              settings={appSettings}
              contractsCount={contractsCount}
              setContractsCount={setContractsCount}
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
              changeTab={changeTab}
              contractsCount={contractsCount}
              setContractsCount={setContractsCount}
              message={message}
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


function HomeScreen({
  tasks,
  progress,
  message,
  verifyTelegramTask,
  claimSocialTask,
  claimTimers,
  startSocialTimer,
  goMining,
  sessionReady,
  miningCyclesCompleted,
  purchaseVerified,
  referralCount,
  changeTab,
}: {
  tasks: Task[];
  progress: number;
  message: string;
  verifyTelegramTask: (taskId: string) => Promise<void>;
  claimSocialTask: (taskId: string) => Promise<void>;
  claimTimers: Record<string, number>;
  startSocialTimer: (taskId: string) => void;
  goMining: () => void;
  sessionReady: boolean;
  miningCyclesCompleted: number;
  purchaseVerified: boolean;
  referralCount: number;
  changeTab: (tab: any) => void;
}) {
  const isMiningLocked = miningCyclesCompleted === 0;

  // Find social media tasks
  const socialTasks = tasks.filter((t) => t.isSocialMedia);
  const otherTasks = tasks.filter((t) => !t.isSocialMedia && !t.isOnboarding);

  const allSocialTasksDone = socialTasks.length > 0 && socialTasks.every((t) => t.status === "completed");

  return (
    <div className="pt-6">
      <div className="mx-auto mb-6 h-[70px] w-[50px] bg-[linear-gradient(135deg,#ff8a00,#31d67b)] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]">
        <div className="mx-auto h-full w-[34%] bg-black/35 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
      </div>

      <div className="text-center">
        <h1 className="text-[28px] font-black leading-none tracking-tight">OBSIDIAN GENESIS</h1>
        <p className="mt-3 text-[13px] font-black text-[#ff8a00]">POLYGON L3 NETWORK NODE</p>
      </div>

      {isMiningLocked && (
        <section className="mt-8 rounded-[20px] border border-yellow-500/20 bg-yellow-950/10 p-5 text-center">
          <p className="text-sm font-black text-yellow-500">🔒 Social Media Tasks Locked</p>
          <p className="mt-2 text-xs text-gray-400 leading-relaxed">
            You must complete your first 1-hour mining cycle to unlock these tasks and accumulate OBSD.
          </p>
          <button
            onClick={() => changeTab("mining")}
            className="mt-4 px-5 py-2.5 bg-[#d69a2d] hover:bg-[#b07e20] text-xs font-black text-white rounded-xl transition duration-200"
          >
            Start Mining Now
          </button>
        </section>
      )}

      {!isMiningLocked && !purchaseVerified && allSocialTasksDone && (
        <section className="mt-8 rounded-[20px] border border-[#ff8a00]/30 bg-[#ff8a00]/5 p-5 text-center shadow-[0_0_30px_rgba(255,138,0,0.05)]">
          <p className="text-sm font-black text-[#ff8a00]">🚀 On to the Next Step / الخطوة التالية</p>
          <p className="mt-2 text-xs text-gray-400 leading-relaxed">
            لقد أتممت مهام السوشيال ميديا! يرجى تفعيل حسابك عن طريق التحقق من شراء وحيازة الرموز لتفعيل المكافأة وسحب الأرباح.
          </p>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            You completed social tasks! Please activate your account by verifying your token purchase/hold to enable your multiplier and withdraw.
          </p>
          <button
            onClick={() => changeTab("wallet")}
            className="mt-4 px-5 py-2.5 bg-[#ff8a00] hover:bg-[#d87500] text-xs font-black text-white rounded-xl transition duration-200 animate-pulse"
          >
            Go Verify Purchase (الذهاب للتحقق والشراء)
          </button>
        </section>
      )}

      {message && <p className="mt-6 text-center text-xs font-bold text-[#ff8a00]">{message}</p>}

      <div className="mt-8 space-y-6">
        {/* Social Media Tasks */}
        {socialTasks.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-black text-[#a1a1aa] uppercase tracking-wider">Social Tasks</h3>
            {socialTasks.map((task) => {
              const complete = task.status === "completed";
              const locked = isMiningLocked;
              const timerVal = claimTimers[task.id];

              return (
                <article
                  key={task.id}
                  className={`rounded-[16px] border p-4 ${
                    complete ? "border-[#10b981] bg-[#121216]" : "border-[#23232a] bg-[#0b0b0d]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`grid size-12 shrink-0 place-items-center rounded-full ${
                        complete
                          ? "bg-[#0b3a2c] text-[#31d67b]"
                          : locked
                            ? "bg-[#1c1c24] text-gray-600"
                            : "bg-[#3a2b0b] text-[#ff8a00]"
                      }`}
                    >
                      {complete ? <Check size={24} strokeWidth={4} /> : <span className="text-2xl font-black">{locked ? "🔒" : "!"}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15px] font-black leading-tight text-white">{task.title}</h2>
                      <p className="mt-1 text-[12px] text-[#a1a1aa] font-bold">
                        +{task.reward} OBSD (~$0.10)
                      </p>
                    </div>

                    {locked ? (
                      <span className="text-xs font-black text-gray-500">Locked</span>
                    ) : complete ? (
                      <span className="rounded-full bg-[#0b3a2c] px-4 py-2 text-xs font-black text-[#31d67b]">
                        Verified
                      </span>
                    ) : task.platform === "telegram" ? (
                      <div className="flex gap-2 items-center">
                        {task.url && (
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
                        <button
                          type="button"
                          onClick={() => verifyTelegramTask(task.id)}
                          disabled={!sessionReady}
                          className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black text-white hover:bg-[#2d1f63]"
                        >
                          Verify
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        {timerVal === undefined && task.url && (
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => startSocialTimer(task.id)}
                            className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#23232a] px-3 text-xs font-black text-[#d69a2d]"
                          >
                            <ExternalLink size={16} />
                            Open
                          </a>
                        )}
                        {timerVal !== undefined && timerVal > 0 && (
                          <button
                            type="button"
                            disabled
                            className="rounded-lg bg-[#17171c] px-3 py-2 text-xs font-black text-gray-500 cursor-not-allowed"
                          >
                            Wait {timerVal}s...
                          </button>
                        )}
                        {timerVal === 0 && (
                          <button
                            type="button"
                            onClick={() => claimSocialTask(task.id)}
                            disabled={!sessionReady}
                            className="rounded-lg bg-[#d69a2d] hover:bg-[#b07e20] px-4 py-2 text-xs font-black text-black transition duration-200"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Other Tasks */}
        {otherTasks.length > 0 && (
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-black text-[#a1a1aa] uppercase tracking-wider">Other Tasks</h3>
            {otherTasks.map((task) => {
              const complete = task.status === "completed";
              const timerVal = claimTimers[task.id];
              return (
                <article
                  key={task.id}
                  className={`rounded-[16px] border p-4 ${
                    complete ? "border-[#10b981] bg-[#121216]" : "border-[#23232a] bg-[#0b0b0d]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`grid size-12 shrink-0 place-items-center rounded-full ${
                        complete ? "bg-[#0b3a2c] text-[#31d67b]" : "bg-[#17171c] text-[#a1a1aa]"
                      }`}
                    >
                      {complete ? <Check size={24} strokeWidth={4} /> : <span className="text-2xl font-black">!</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15px] font-black leading-tight text-white">{task.title}</h2>
                      <p className="mt-1 text-[12px] text-[#a1a1aa]">+{task.reward} OBSD</p>
                    </div>

                    {complete ? (
                      <span className="rounded-full bg-[#0b3a2c] px-4 py-2 text-xs font-black text-[#31d67b]">
                        Verified
                      </span>
                    ) : task.platform === "telegram" ? (
                      <div className="flex gap-2 items-center">
                        {task.url && (
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
                        <button
                          type="button"
                          onClick={() => verifyTelegramTask(task.id)}
                          disabled={!sessionReady}
                          className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black text-white hover:bg-[#2d1f63]"
                        >
                          Verify
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        {timerVal === undefined && task.url && (
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => startSocialTimer(task.id)}
                            className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#23232a] px-3 text-xs font-black text-[#d69a2d]"
                          >
                            <ExternalLink size={16} />
                            Open
                          </a>
                        )}
                        {timerVal !== undefined && timerVal > 0 && (
                          <button
                            type="button"
                            disabled
                            className="rounded-lg bg-[#17171c] px-3 py-2 text-xs font-black text-gray-500 cursor-not-allowed"
                          >
                            Wait {timerVal}s...
                          </button>
                        )}
                        {timerVal === 0 && (
                          <button
                            type="button"
                            onClick={() => claimSocialTask(task.id)}
                            disabled={!sessionReady}
                            className="rounded-lg bg-[#d69a2d] hover:bg-[#b07e20] px-4 py-2 text-xs font-black text-black transition duration-200"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={goMining}
        className="mt-10 h-16 w-full rounded-[16px] bg-[#d69a2d] hover:bg-[#b07e20] text-[17px] font-black text-white transition duration-200"
      >
        Go to Mining Node Dashboard
      </button>
    </div>
  );
}

function MiningScreen({
  user,
  activeSession,
  lastSessionStart,
  tokenUsdPrice,
  onStartMining,
  onClaimMining,
  changeTab,
  walletAddress,
  setWalletAddress,
  submitPurchaseVerification,
  settings,
  contractsCount,
  setContractsCount,
}: {
  user: AppUser;
  activeSession: any;
  lastSessionStart: string | null;
  tokenUsdPrice: number;
  onStartMining: () => Promise<void>;
  onClaimMining: () => Promise<void>;
  changeTab: (tab: any) => void;
  walletAddress: string;
  setWalletAddress: (val: string) => void;
  submitPurchaseVerification: () => Promise<void>;
  settings: AppSettings;
  contractsCount: number;
  setContractsCount: (val: number) => void;
}) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState<string | null>(null);
  const [accrued, setAccrued] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isClaimable, setIsClaimable] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let interval: any = null;

    const tick = () => {
      // 1. Cooldown checking
      if (user.purchaseVerified && lastSessionStart && !activeSession) {
        const target = new Date(lastSessionStart).getTime() + 24 * 60 * 60 * 1000;
        const now = Date.now();
        const diff = target - now;
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setCooldownTimeLeft(
            `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          );
        } else {
          setCooldownTimeLeft(null);
        }
      } else {
        setCooldownTimeLeft(null);
      }

      // 2. Active Session checking
      if (activeSession) {
        const start = new Date(activeSession.startedAt).getTime();
        const end = new Date(activeSession.endsAt).getTime();
        const now = Date.now();
        const total = end - start;
        const elapsed = now - start;
        const remaining = end - now;

        if (remaining <= 0) {
          setTimeLeft(null);
          setAccrued(activeSession.rewardTokens);
          setProgressPercent(100);
          setIsClaimable(true);
        } else {
          setIsClaimable(false);
          const minutes = Math.floor(remaining / (1000 * 60));
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
          setTimeLeft(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
          
          const computedAccrued = Math.min((elapsed / total) * activeSession.rewardTokens, activeSession.rewardTokens);
          setAccrued(Number(computedAccrued.toFixed(6)));
          setProgressPercent((elapsed / total) * 100);
        }
      } else {
        setTimeLeft(null);
        setAccrued(0);
        setProgressPercent(0);
        setIsClaimable(false);
      }
    };

    tick();
    interval = setInterval(tick, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession, lastSessionStart, user.purchaseVerified]);

  const isReferralLocked = false;
  const isPurchaseLocked = !user.purchaseVerified;
  const isMiningLocked = isReferralLocked || isPurchaseLocked;

  const isNewUser = (user.miningCyclesCompleted || 0) === 0;
  const currentPlan = isNewUser
    ? (settings.purchasePlans?.[0] || { minPurchase: 2, lockDays: 1, multiplier: 2.0 })
    : (settings.purchasePlans?.[1] || settings.purchasePlans?.[0] || { minPurchase: 5, lockDays: 5, multiplier: 2.0 });

  const displayContractsCount = isNewUser ? 1 : contractsCount;
  const totalCostUsd = displayContractsCount * currentPlan.minPurchase;
  const planLockDays = currentPlan.lockDays;
  const totalMultiplier = displayContractsCount * currentPlan.multiplier;

  const boostMultiplier = user.boostMultiplier || (user.purchaseVerified ? 2.0 : 1.0);
  const velocity = (boostMultiplier * 0.10) / (tokenUsdPrice || 0.001);
  const usdAccrued = accrued * tokenUsdPrice;

  const handleStart = async () => {
    setIsSubmitting(true);
    await onStartMining();
    setIsSubmitting(false);
  };

  const handleClaim = async () => {
    setIsSubmitting(true);
    await onClaimMining();
    setIsSubmitting(false);
  };

  return (
    <div className="pt-8 space-y-6">
      <section className="rounded-[16px] border border-[#23232a] bg-[#121216] p-5 shadow-[0_0_40px_rgba(255,138,0,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative size-10 rounded-full border-2 border-[#d69a2d] bg-black grid place-items-center font-bold text-[#d69a2d]">
              {user.purchaseVerified ? "⚡" : "N"}
            </div>
            <div>
              <h1 className="text-[15px] font-black">Obsidian Genesis Node</h1>
              <p className="text-xs font-black text-[#31d67b] uppercase tracking-wider">
                {user.purchaseVerified ? "Verified Apex Node" : "Standard Validation Node"}
              </p>
            </div>
          </div>
          <span className="rounded-xl border border-[#23232a] px-4 py-2 text-xs font-black text-[#d69a2d]">
            L3 NODE
          </span>
        </div>
      </section>

      {isReferralLocked ? (
        <section className="mt-8 rounded-[24px] border border-[#ff8a00]/30 bg-[#0c0a05] p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#ff8a00]/10 text-[#ff8a00] text-3xl">
              👥
            </div>
            <h2 className="text-xl font-black text-white">تفعيل الإحالات مطلوب</h2>
            <h3 className="text-sm font-black text-gray-300">Referrals Required</h3>
            <p className="text-xs text-gray-400 leading-relaxed px-2">
              لقد أكملت دورة التعدين الأولى بنجاح! للوصول إلى خطوة الشراء والمكافأة المضاعفة وتفعيل التعدين اللانهائي، يرجى دعوة 3 أصدقاء أولاً لتسجيل حساباتهم.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed px-2">
              You completed your first mining cycle! To proceed to the hold verification step, double your mining speed, and unlock infinite cycles, please invite at least 3 friends first.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#121216] border border-[#23232a] text-center">
            <p className="text-[10px] uppercase font-bold text-gray-500">حالة الإحالات / Invites Progress</p>
            <p className="text-2xl font-black text-[#ff8a00] mt-1">
              {user.referralCount} / 3
            </p>
            <div className="w-full bg-gray-800 rounded-full h-2 mt-3 overflow-hidden">
              <div
                className="bg-[#ff8a00] h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((user.referralCount / 3) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#120c02] border border-[#ff8a00]/30 text-xs space-y-3">
            <div>
              <p className="font-bold text-[#ff8a00]">رابط الإحالة الفريد الخاص بك:</p>
              <p className="text-[11px] text-gray-400 mt-1 leading-normal font-mono">
                {`t.me/rewards_tasks_demo_bot?start=${user.telegramId}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`t.me/rewards_tasks_demo_bot?start=${user.telegramId}`);
                  alert("Referral link copied!");
                }}
                className="flex-1 h-10 bg-[#211747] text-xs font-bold rounded-lg border border-[#ff8a00]/30 text-white"
              >
                Copy Link (نسخ الرابط)
              </button>
            </div>
            <a
              href={`https://t.me/share/url?url=https://t.me/rewards_tasks_demo_bot?start=${user.telegramId}&text=${encodeURIComponent(
                "انضم إلى بوت تعدين أوبيسيديان البسيط وحقق أكثر من 700 دولار شهرياً!\nJoin the simple Obsidian mining bot and earn over $700 per month!"
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center h-10 rounded-lg bg-[#ff8a00] hover:bg-[#e07b00] text-black font-black text-xs transition-colors"
            >
              Share on Telegram (مشاركة الرابط)
            </a>
          </div>
        </section>

      ) : isPurchaseLocked ? (
        <section className="mt-8 rounded-[24px] border border-[#ff8a00]/30 bg-[#0c0a05] p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#ff8a00]/10 text-[#ff8a00] text-3xl">
              🔒
            </div>
            <h2 className="text-xl font-black text-white">تفعيل عقد تعدين أوبيسيديان</h2>
            <h3 className="text-xs font-black text-gray-300 uppercase tracking-wider">Activate Mining Contract</h3>
            <p className="text-[12px] text-gray-400 leading-relaxed px-2">
              {isNewUser ? (
                <>
                  سعر عقد التسجيل هو <span className="text-white font-bold">${currentPlan.minPurchase} USD</span> ومكافأته مضاعف <span className="text-[#31d67b] font-bold">X{currentPlan.multiplier.toFixed(1)}</span> على مجهودك الأخير مع قفل سحب لمدة <span className="text-[#ff8a00] font-bold">{currentPlan.lockDays} يوم</span>.
                </>
              ) : (
                <>
                  سعر العقد الواحد هو <span className="text-white font-bold">${currentPlan.minPurchase} USD</span> ومكافأته مضاعف <span className="text-[#31d67b] font-bold">X{currentPlan.multiplier.toFixed(1)}</span> لكل عقد مع قفل سحب لمدة <span className="text-[#ff8a00] font-bold">{currentPlan.lockDays} أيام</span>. يرجى اختيار عدد العقود التي تريد تفعيلها.
                </>
              )}
            </p>
          </div>
          {/* Contract Selector */}
          {!isNewUser && (
            <div className="space-y-3">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider text-right">اختر عدد العقود / Select Contracts:</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 5, 10, 20]
                  .filter((num) => !settings.maxContractsLimitEnabled || num <= settings.maxContractsLimit)
                  .map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setContractsCount(num)}
                      className={`h-10 rounded-lg font-black text-xs transition-all duration-200 ${
                        contractsCount === num
                          ? "bg-[#ff8a00] text-black shadow-[0_0_15px_rgba(255,138,0,0.3)]"
                          : "bg-[#121216] border border-[#23232a] text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {num} {num === 1 ? "عقد" : "عقود"}
                    </button>
                  ))}
              </div>

              {/* Custom Input */}
              <div className="flex items-center justify-between bg-[#080808] border border-[#23232a] rounded-lg px-3 py-2">
                <span className="text-xs text-gray-400 font-bold">
                  {settings.maxContractsLimitEnabled ? `عدد مخصص (الحد الأقصى ${settings.maxContractsLimit})` : "عدد مخصص / Custom:"}
                </span>
                <input
                  type="number"
                  min="1"
                  max={settings.maxContractsLimitEnabled ? settings.maxContractsLimit : undefined}
                  value={contractsCount}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    setContractsCount(settings.maxContractsLimitEnabled ? Math.min(val, settings.maxContractsLimit) : val);
                  }}
                  className="w-20 bg-transparent text-right text-sm text-[#ff8a00] font-black outline-none"
                />
              </div>
            </div>
          )}
            {/* Price & Reward Estimation Card */}
            <div className="p-4 rounded-xl bg-[#121216] border border-[#ff8a00]/20 space-y-2 text-xs text-right">
              <div className="flex justify-between items-center">
                <span className="font-mono text-white font-black">${totalCostUsd.toFixed(2)} USD</span>
                <span className="text-gray-400">القيمة المطلوبة / Total Cost:</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[#31d67b] font-black">X{totalMultiplier.toFixed(1)}</span>
                <span className="text-gray-400">مضاعف مجهود الدورة / Cycle Multiplier:</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[#ff8a00] font-black">{planLockDays} {planLockDays === 1 ? "يوم" : "أيام"} / {planLockDays === 1 ? "Day" : "Days"}</span>
                <span className="text-gray-400">مدة الاحتفاظ بالعقد / Hold Duration:</span>
              </div>
              <div className="pt-2 border-t border-[#23232a] text-center font-mono text-[10px] text-gray-500">
                {`~${(totalCostUsd / (tokenUsdPrice || 0.001)).toLocaleString(undefined, { maximumFractionDigits: 0 })} OBSD required in wallet`}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#120c02] border border-[#ff8a00]/30 text-xs space-y-3">
            <div>
              <p className="font-bold text-[#ff8a00]">Need OBSD tokens to unlock?</p>
              <p className="text-[11px] text-gray-400 mt-1 leading-normal">
                Swap POL/ETH for OBSD directly on QuickSwap. Once you hold the tokens, enter your wallet below to verify automatically.
              </p>
            </div>
            <a
              href={settings.quickswapLink || "https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center h-10 rounded-lg bg-[#ff8a00] hover:bg-[#e07b00] text-black font-black text-xs transition-colors"
            >
              Buy OBSD on QuickSwap
            </a>
          </div>

          <div className="space-y-3">
            <div className="relative flex items-center">
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter Polygon Wallet Address (0x...)"
                className="h-12 w-full rounded-[12px] border border-[#23232a] bg-[#080808] pl-16 pr-4 text-sm font-bold text-white outline-none focus:border-[#ff8a00]"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setWalletAddress(text);
                  } catch (err) {
                    console.error("Paste failed:", err);
                  }
                }}
                className="absolute left-2 px-3 py-1 bg-[#ff8a00]/10 hover:bg-[#ff8a00]/20 text-[#ff8a00] text-xs font-black rounded-lg border border-[#ff8a00]/20 transition-all cursor-pointer"
              >
                لصق
              </button>
            </div>
            <button
              onClick={submitPurchaseVerification}
              className="w-full h-12 bg-[#31d67b]/20 hover:bg-[#31d67b]/30 text-[#31d67b] border border-[#31d67b]/30 text-sm font-black rounded-xl transition duration-200"
            >
              Verify Hold (Automatic)
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-8 grid place-items-center">
            <div
              className="relative grid size-[228px] place-items-center rounded-full p-3 shadow-[0_0_70px_rgba(255,138,0,0.10)] transition-all duration-300"
              style={{
                background: `conic-gradient(#ff8a00 0% ${progressPercent}%, #23232a ${progressPercent}% 100%)`,
              }}
            >
              <div className="grid size-full place-items-center rounded-full border border-black bg-[#060606]">
                <div className="text-center px-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#a1a1aa]">
                    {activeSession ? "Session Accrual" : "Ready to Sync"}
                  </p>
                  <p className="mt-2 text-[32px] font-black leading-none text-[#e8f4ff] font-mono truncate max-w-[190px]">
                    {activeSession ? accrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "0.00"}
                  </p>
                  <p className="mt-1.5 text-xs font-black text-[#a1a1aa]">OBSD</p>
                  {activeSession && (
                    <p className="mt-1 text-[10px] font-black text-[#31d67b] font-mono">
                      ~${usdAccrued.toFixed(4)} USD
                    </p>
                  )}
                  <p
                    className={`mt-4 mx-auto w-max rounded-full px-3 py-1 text-[10px] font-black ${
                      activeSession
                        ? isClaimable
                          ? "bg-[#0b3a2c] text-[#31d67b]"
                          : "bg-[#332306] text-[#ff8a00]"
                        : "bg-[#16161a] text-gray-500"
                    }`}
                  >
                    {activeSession
                      ? isClaimable
                        ? "SYNC COMPLETE"
                        : "SYNCING NODE"
                      : "NODE INACTIVE"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <p className="mt-4 text-center text-sm text-[#a1a1aa] font-bold">
            Mining Speed: <span className="text-white">+{velocity.toFixed(4)} OBSD/hr</span>
          </p>

          {activeSession && !isClaimable && (
            <InfoStrip label="Sync Session Ends In" value={timeLeft || "00:00"} />
          )}

          {cooldownTimeLeft && (
            <InfoStrip label="Next Sync Available In" value={cooldownTimeLeft} />
          )}

          <div className="mt-4 grid grid-cols-3 gap-3">
            <MetricCard title="Completed" value={user.miningCyclesCompleted} suffix="cycles" />
            <MetricCard title="Boost" value={boostMultiplier} suffix="x" />
            <MetricCard title="Price" value={`$${tokenUsdPrice.toFixed(4)}`} suffix="" />
          </div>

          {isClaimable ? (
            <button
              type="button"
              onClick={handleClaim}
              disabled={isSubmitting}
              className="mt-8 h-16 w-full rounded-[16px] bg-[#31d67b] hover:bg-[#25ad61] text-[17px] font-black text-black transition duration-200"
            >
              {isSubmitting ? "Claiming..." : "Claim Accrued OBSD Tokens"}
            </button>
          ) : activeSession ? (
            <button
              type="button"
              disabled
              className="mt-8 h-16 w-full rounded-[16px] bg-[#d69a2d]/30 text-[17px] font-black text-white/50 cursor-not-allowed text-center"
            >
              Syncing OBSD... ({timeLeft})
            </button>
          ) : cooldownTimeLeft ? (
            <button
              type="button"
              disabled
              className="mt-8 h-16 w-full rounded-[16px] bg-gray-800 text-[17px] font-black text-gray-500 cursor-not-allowed text-center"
            >
              Cooldown Active
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={isSubmitting}
              className="mt-8 h-16 w-full rounded-[16px] bg-[#d69a2d] hover:bg-[#b07e20] text-[17px] font-black text-white transition duration-200"
            >
              {isSubmitting ? "Synchronizing..." : "Start 1-Hour Mining Cycle"}
            </button>
          )}
        </>
      )}
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
  changeTab,
  contractsCount,
  setContractsCount,
  message,
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
  changeTab: (tab: any) => void;
  contractsCount: number;
  setContractsCount: (val: number) => void;
  message?: string;
}) {
  const referralLocked = false;
  const locked = settings.purchaseConditionEnabled && !user.purchaseVerified;
  const usdBalance = balance * settings.tokenUsdPrice;

  const isNewUser = (user.miningCyclesCompleted || 0) === 0;
  const currentPlan = isNewUser
    ? (settings.purchasePlans?.[0] || { minPurchase: 2, lockDays: 1, multiplier: 2.0 })
    : (settings.purchasePlans?.[1] || settings.purchasePlans?.[0] || { minPurchase: 5, lockDays: 5, multiplier: 2.0 });

  const displayContractsCount = isNewUser ? 1 : contractsCount;
  const totalCostUsd = displayContractsCount * currentPlan.minPurchase;
  const planLockDays = currentPlan.lockDays;
  const totalMultiplier = displayContractsCount * currentPlan.multiplier;

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

      {referralLocked ? (
        <section className="mt-8 rounded-[24px] border border-red-500/30 bg-[#0d0b0b] p-6 text-center space-y-6 shadow-[0_0_30px_rgba(239,68,68,0.05)]">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-500/10 text-red-500 text-3xl">
            🔒
          </div>
          <h2 className="text-xl font-black text-white">قفل الإحالات نشط</h2>
          <h3 className="text-sm font-black text-gray-300">Referrals Gate Active</h3>
          <p className="text-xs text-gray-400 leading-relaxed px-2">
            يرجى دعوة 3 أصدقاء أولاً لتتمكن من الوصول لربط المحفظة وإثبات الشراء وسحب الأرباح.
          </p>
          <p className="text-xs text-gray-500 leading-relaxed px-2">
            Please invite 3 friends first to unlock the wallet connection, hold verification, and withdrawal options.
          </p>
          <button
            onClick={() => changeTab("nodes")}
            className="w-full h-12 bg-[#ff8a00] text-black text-sm font-black rounded-xl hover:bg-[#e07b00] transition duration-200"
          >
            Go to Invites (صفحة الإحالات)
          </button>
        </section>
      ) : (
        <>
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
                  ? `Failed: Requires $${totalCostUsd.toFixed(2)} USD equivalent in OBSD tokens`
                  : undefined
              }
            />
            {locked && (
              <div className="space-y-4 mt-4">
                <div className="p-4 rounded-xl bg-[#120c02] border border-[#ff8a00]/30 text-xs space-y-3">
                  <div>
                    <p className="font-bold text-[#ff8a00] text-right">تفعيل عقد تعدين أوبيسيديان / Activate Contract</p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-normal text-right">
                      {isNewUser ? (
                        <>
                          سعر عقد التسجيل هو <strong>${currentPlan.minPurchase} USD</strong> ومكافأته مضاعف <strong>X{currentPlan.multiplier.toFixed(1)}</strong> على مجهودك الأخير مع قفل سحب لمدة <strong>{currentPlan.lockDays} يوم</strong>.
                        </>
                      ) : (
                        <>
                          سعر العقد الواحد هو <strong>${currentPlan.minPurchase} USD</strong> ومكافأته مضاعف <strong>X{currentPlan.multiplier.toFixed(1)}</strong> لكل عقد مع قفل سحب لمدة <strong>{currentPlan.lockDays} أيام</strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {/* Contract Selector */}
                {!isNewUser && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider text-right">اختر عدد العقود / Select Contracts:</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 5, 10, 20]
                        .filter((num) => !settings.maxContractsLimitEnabled || num <= settings.maxContractsLimit)
                        .map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setContractsCount(num)}
                            className={`h-10 rounded-lg font-black text-xs transition-all duration-200 ${
                              contractsCount === num
                                ? "bg-[#ff8a00] text-black shadow-[0_0_15px_rgba(255,138,0,0.3)]"
                                : "bg-[#121216] border border-[#23232a] text-gray-300 hover:border-gray-500"
                            }`}
                          >
                            {num} {num === 1 ? "عقد" : "عقود"}
                          </button>
                        ))}
                    </div>

                    {/* Custom Input */}
                    <div className="flex items-center justify-between bg-[#080808] border border-[#23232a] rounded-lg px-3 py-2">
                      <span className="text-xs text-gray-400 font-bold">
                        {settings.maxContractsLimitEnabled ? `عدد مخصص (الحد الأقصى ${settings.maxContractsLimit})` : "عدد مخصص / Custom:"}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max={settings.maxContractsLimitEnabled ? settings.maxContractsLimit : undefined}
                        value={contractsCount}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setContractsCount(settings.maxContractsLimitEnabled ? Math.min(val, settings.maxContractsLimit) : val);
                        }}
                        className="w-20 bg-transparent text-right text-sm text-[#ff8a00] font-black outline-none"
                      />
                    </div>
                  </div>
                )}
                  {/* Price & Reward Estimation Card */}
                  <div className="p-4 rounded-xl bg-[#121216] border border-[#ff8a00]/20 space-y-2 text-xs text-right">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-white font-black">${totalCostUsd.toFixed(2)} USD</span>
                      <span className="text-gray-400">القيمة المطلوبة / Total Cost:</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[#31d67b] font-black">X{totalMultiplier.toFixed(1)}</span>
                      <span className="text-gray-400">مضاعف مجهود الدورة / Cycle Multiplier:</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[#ff8a00] font-black">{planLockDays} {planLockDays === 1 ? "يوم" : "أيام"} / {planLockDays === 1 ? "Day" : "Days"}</span>
                      <span className="text-gray-400">مدة الاحتفاظ بالعقد / Hold Duration:</span>
                    </div>
                    <div className="pt-2 border-t border-[#23232a] text-center font-mono text-[10px] text-gray-500">
                      {`~${(totalCostUsd / (settings.tokenUsdPrice || 0.001)).toLocaleString(undefined, { maximumFractionDigits: 0 })} OBSD required in wallet`}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#120c02] border border-[#ff8a00]/30 text-xs space-y-3">
                  <div>
                    <p className="font-bold text-[#ff8a00]">Need OBSD tokens to unlock?</p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-normal text-right">
                      Swap POL/ETH for OBSD directly on QuickSwap. Once you hold the tokens, enter your wallet below to verify automatically.
                    </p>
                  </div>
                  <a
                    href={settings.quickswapLink || "https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center h-10 rounded-lg bg-[#ff8a00] hover:bg-[#e07b00] text-black font-black text-xs transition-colors text-center"
                  >
                    Buy OBSD on QuickSwap
                  </a>
                </div>
              </div>
            )}
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
            <div className="relative flex items-center">
              <input
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="Wallet address"
                className="h-12 w-full rounded-[12px] border border-[#23232a] bg-[#080808] pl-16 pr-4 text-sm font-bold outline-none focus:border-[#ff8a00]"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setWalletAddress(text);
                  } catch (err) {
                    console.error("Paste failed:", err);
                  }
                }}
                className="absolute left-2 px-3 py-1 bg-[#ff8a00]/10 hover:bg-[#ff8a00]/20 text-[#ff8a00] text-xs font-black rounded-lg border border-[#ff8a00]/20 transition-all cursor-pointer"
              >
                لصق
              </button>
            </div>
            {locked ? (
              <button
                type="button"
                onClick={submitPurchaseVerification}
                className="h-12 w-full rounded-[12px] border border-[#31d67b] bg-[#062219] text-sm font-black text-[#31d67b]"
              >
                Verify Purchase (Automatic)
              </button>
            ) : (
              (!user.walletAddress || walletAddress !== user.walletAddress) && (
                <button
                  type="button"
                  onClick={submitPurchaseVerification}
                  className="h-12 w-full rounded-[12px] border border-[#ff8a00] bg-[#120c02] text-sm font-black text-[#ff8a00] cursor-pointer"
                >
                  Link & Save Wallet / حفظ وربط المحفظة
                </button>
              )
            )}
            {message && (
              <p className="mt-4 text-center text-xs font-bold text-[#ff8a00] leading-relaxed px-2">
                {message}
              </p>
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
        </>
      )}
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
      <section className="mt-7 rounded-[18px] border border-[#d69a2d] bg-[#0b0b0d] p-5 space-y-4">
        <h2 className="text-sm font-black">UNIQUE ASSIGNMENT VECTOR URL</h2>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1 rounded-lg border border-[#d69a2d] px-3 py-3 text-sm overflow-x-auto whitespace-nowrap">
            {referralPath || "Open from Telegram first"}
          </div>
          <button
            type="button"
            onClick={() => {
              if (referralPath) {
                navigator.clipboard.writeText(`https://${referralPath}`);
                alert("Invite link copied to clipboard!");
              } else {
                alert("No link available. Open in Telegram.");
              }
            }}
            className="grid size-12 place-items-center rounded-lg bg-[#211747] text-[#ff8a00] hover:bg-[#2d225c] border border-[#d69a2d]/25 shrink-0"
          >
            <Copy size={18} />
          </button>
        </div>
        {referralPath && (
          <a
            href={`https://t.me/share/url?url=https://${referralPath}&text=${encodeURIComponent(
              "انضم إلى بوت تعدين أوبيسيديان البسيط وحقق أكثر من 700 دولار شهرياً!\nJoin the simple Obsidian mining bot and earn over $700 per month!"
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center h-11 rounded-lg bg-[#ff8a00] hover:bg-[#e07b00] text-black font-black text-xs transition-colors"
          >
            Share Link on Telegram (مشاركة الرابط)
          </a>
        )}
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
  value: number | string;
  suffix: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-[#d69a2d] bg-[#0b0b0d] p-4">
      <p className="text-sm text-[#a1a1aa]">{title}</p>
      <p className={`mt-2 text-[24px] font-black ${highlight ? "text-[#31d67b]" : "text-white"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
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
  verifyTelegramTask,
  verifyReferralTask,
  bypassReferralTask,
  claimSocialTask,
  claimTimers,
  startSocialTimer,
  sessionReady,
  referralCount,
  referralLink,
}: {
  tasks: Task[];
  message: string;
  verifyTelegramTask: (taskId: string) => Promise<void>;
  verifyReferralTask: (taskId: string) => Promise<void>;
  bypassReferralTask: (taskId: string) => Promise<void>;
  claimSocialTask: (taskId: string) => Promise<void>;
  claimTimers: Record<string, number>;
  startSocialTimer: (taskId: string) => void;
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
          const isReferral = task.platform === "referral";
          const isTelegram = task.platform === "telegram";
          const timerVal = claimTimers[task.id];

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

                {complete ? (
                  <span className="rounded-full bg-[#0b3a2c] px-4 py-2 text-xs font-black text-[#31d67b]">
                    Done
                  </span>
                ) : isTelegram ? (
                  <div className="flex gap-2 items-center">
                    {task.url && (
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
                    <button
                      type="button"
                      onClick={() => verifyTelegramTask(task.id)}
                      disabled={!sessionReady}
                      className="rounded-lg bg-[#211747] px-4 py-2 text-sm font-black text-white hover:bg-[#2d1f63]"
                    >
                      Verify
                    </button>
                  </div>
                ) : isReferral ? (
                  <span className="text-xs text-[#ff8a00] font-black shrink-0">
                    لم تكتمل
                  </span>
                ) : (
                  <div className="flex gap-2 items-center">
                    {timerVal === undefined && task.url && (
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => startSocialTimer(task.id)}
                        className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#23232a] px-3 text-xs font-black text-[#d69a2d]"
                      >
                        <ExternalLink size={16} />
                        Open
                      </a>
                    )}
                    {timerVal !== undefined && timerVal > 0 && (
                      <button
                        type="button"
                        disabled
                        className="rounded-lg bg-[#17171c] px-3 py-2 text-xs font-black text-gray-500 cursor-not-allowed"
                      >
                        Wait {timerVal}s...
                      </button>
                    )}
                    {timerVal === 0 && (
                      <button
                        type="button"
                        onClick={() => claimSocialTask(task.id)}
                        disabled={!sessionReady}
                        className="rounded-lg bg-[#d69a2d] hover:bg-[#b07e20] px-4 py-2 text-xs font-black text-black transition duration-200"
                      >
                        Claim
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isReferral && !complete && (
                <div className="mt-4 p-3 rounded-lg bg-[#121216] border border-[#23232a] space-y-3">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Your Invite Link:
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={referralLink}
                      placeholder="Open in Telegram to generate link"
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
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(
                      "انضم إلى بوت تعدين أوبيسيديان البسيط وحقق أكثر من 700 دولار شهرياً!\nJoin the simple Obsidian mining bot and earn over $700 per month!"
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center h-10 rounded-lg bg-[#ff8a00] hover:bg-[#e07b00] text-black font-black text-xs transition-colors"
                  >
                    Share on Telegram (مشاركة الرابط)
                  </a>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[#23232a] mt-2">
                    <button
                      type="button"
                      onClick={() => verifyReferralTask(task.id)}
                      disabled={!sessionReady}
                      className="w-full h-11 rounded-lg bg-gradient-to-r from-[#10b981] to-[#059669] text-white hover:opacity-90 font-black text-xs transition-opacity flex items-center justify-center gap-2"
                    >
                      ✅ تفعيل ومتابعة الخطوة التالية / Proceed to next step
                    </button>
                  </div>
                </div>
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
