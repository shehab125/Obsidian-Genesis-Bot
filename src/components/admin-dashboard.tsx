"use client";

import {
  Check,
  CircleDollarSign,
  ExternalLink,
  ListChecks,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppSettings,
  AppUser,
  PurchaseVerificationRequest,
  ReviewSubmission,
  Task,
  TaskPlatform,
  WithdrawalRequest,
} from "@/lib/types";

type Props = {
  user: AppUser;
  users: AppUser[];
  tasks: Task[];
  submissions: ReviewSubmission[];
  withdrawals: WithdrawalRequest[];
  purchaseVerifications: PurchaseVerificationRequest[];
  settings: AppSettings;
  stats: {
    users: number;
  };
};

type NewTask = {
  title: string;
  description: string;
  platform: TaskPlatform;
  reward: number;
  targetUrl: string;
  proofRequired: boolean;
};

const blankTask: NewTask = {
  title: "",
  description: "",
  platform: "telegram",
  reward: 100,
  targetUrl: "",
  proofRequired: false,
};

export function AdminDashboard({
  users,
  tasks,
  submissions,
  withdrawals,
  purchaseVerifications,
  settings,
  stats,
}: Props) {
  const [taskRows, setTaskRows] = useState(tasks);
  const [userRows, setUserRows] = useState(users);
  const [newTask, setNewTask] = useState<NewTask>(blankTask);
  const [reviewRows, setReviewRows] = useState(submissions);
  const [withdrawalRows, setWithdrawalRows] = useState(withdrawals);
  const [purchaseRows, setPurchaseRows] = useState(purchaseVerifications);
  const [settingsForm, setSettingsForm] = useState(settings);
  const [status, setStatus] = useState("Dashboard ready.");
  const [rewardVaultBalance, setRewardVaultBalance] = useState("...");

  useEffect(() => {
    fetch("/api/admin/reward-vault")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setRewardVaultBalance(data.balance);
        } else {
          setRewardVaultBalance("Error");
          if (data.message) {
            setStatus("Reward Vault: " + data.message);
          }
        }
      })
      .catch(() => {
        setRewardVaultBalance("Error");
        setStatus("Failed to connect to Reward Vault API.");
      });
  }, []);

  async function toggleUserFreezeState(id: string, currentFrozen: boolean) {
    const nextFrozen = !currentFrozen;
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frozen: nextFrozen }),
    });
    const payload = await response.json();
    setStatus(payload.message);
    if (payload.ok) {
      setUserRows((rows) =>
        rows.map((row) => (row.id === id ? { ...row, frozen: nextFrozen } : row)),
      );
    }
  }

  async function createNewTask() {
    const response = await fetch("/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTask),
    });
    const payload = await response.json();
    setStatus(payload.message);
    if (payload.ok) {
      setTaskRows((rows) => [payload.task, ...rows]);
      setNewTask(blankTask);
    }
  }

  async function saveTask(task: Task) {
    const response = await fetch(`/api/admin/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        reward: task.reward,
        targetUrl: task.url,
        proofRequired: task.proofRequired,
      }),
    });
    const payload = await response.json();
    setStatus(payload.message);
  }

  async function deleteTask(id: string) {
    if (!window.confirm("هل أنت متأكد من رغبتك في حذف هذه المهمة نهائياً؟")) {
      return;
    }
    const response = await fetch(`/api/admin/tasks/${id}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setStatus(payload.message);
    if (payload.ok) {
      setTaskRows((rows) => rows.filter((row) => row.id !== id));
    }
  }

  async function saveSettings() {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    const payload = await response.json();
    setStatus(payload.message);
  }

  async function updateReview(id: string, nextStatus: "approved" | "rejected") {
    const response = await fetch(`/api/admin/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const payload = await response.json();
    setStatus(payload.message);
    setReviewRows((rows) =>
      nextStatus === "rejected"
        ? rows.filter((row) => row.id !== id)
        : rows.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
  }

  async function updatePurchaseVerification(id: string, nextStatus: "approved" | "rejected") {
    const response = await fetch(`/api/admin/purchase-verifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const payload = await response.json();
    setStatus(payload.message);
    setPurchaseRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
  }

  async function updateWithdrawal(id: string, nextStatus: "paid" | "rejected") {
    const response = await fetch(`/api/admin/withdrawals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const payload = await response.json();
    setStatus(payload.message);
    setWithdrawalRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
  }

  const pendingReviews = reviewRows.filter((row) => row.status === "pending").length;
  const pendingPurchases = purchaseRows.filter((row) => row.status === "pending").length;

  return (
    <main className="min-h-screen bg-[#0b0d12] text-[#e5e7eb]">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-[#242a36] bg-[#11151d] p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-[#d69a2d] text-[#0b0d12]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="font-black">Obsidian Admin</h1>
              <p className="text-xs text-[#94a3b8]">Protected dashboard</p>
            </div>
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <NavItem icon={<ListChecks size={17} />} label="Tasks" />
            <NavItem icon={<Users size={17} />} label="Users" />
            <NavItem icon={<CircleDollarSign size={17} />} label="Withdrawals" />
            <NavItem icon={<LockKeyhole size={17} />} label="Security" />
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#242a36] bg-[#11151d] p-5">
            <div>
              <p className="text-sm text-[#94a3b8]">Live operations</p>
              <h2 className="text-2xl font-black text-white">Rewards Tasks Bot</h2>
            </div>
            <p className="rounded-lg border border-[#2d3646] bg-[#0b0d12] px-4 py-2 text-sm text-[#cbd5e1]">
              {status}
            </p>
          </header>

          <section className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <Stat label="Users" value={stats.users} icon={<Users size={19} />} />
            <Stat label="Active tasks" value={taskRows.length} icon={<ListChecks size={19} />} />
            <Stat label="Task reviews" value={pendingReviews} icon={<Check size={19} />} />
            <Stat label="Purchase proofs" value={pendingPurchases} icon={<ShieldCheck size={19} />} />
            <Stat label="Reward Vault" value={rewardVaultBalance} icon={<Wallet size={19} />} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel title="Create Task" action={<Plus size={18} />}>
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-[1fr_130px]">
                  <TextInput
                    value={newTask.title}
                    onChange={(value) => setNewTask((current) => ({ ...current, title: value }))}
                    placeholder="Task title"
                  />
                  <NumberInput
                    value={newTask.reward}
                    onChange={(value) => setNewTask((current) => ({ ...current, reward: value }))}
                  />
                </div>
                <TextInput
                  value={newTask.targetUrl}
                  onChange={(value) => setNewTask((current) => ({ ...current, targetUrl: value }))}
                  placeholder="https://..."
                />
                <textarea
                  value={newTask.description}
                  onChange={(event) =>
                    setNewTask((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What should the user do?"
                  className="min-h-24 rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 py-3 text-sm outline-none focus:border-[#d69a2d]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <select
                    value={newTask.platform}
                    onChange={(event) =>
                      setNewTask((current) => ({
                        ...current,
                        platform: event.target.value as TaskPlatform,
                      }))
                    }
                    className="h-10 rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 text-sm outline-none"
                  >
                    <option value="telegram">Telegram</option>
                    <option value="x">X / Social</option>
                  </select>
                  <button
                    type="button"
                    onClick={createNewTask}
                    className="h-10 rounded-lg bg-[#d69a2d] px-4 text-sm font-black text-[#0b0d12]"
                  >
                    Add task
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="System Settings" action={<Save size={18} />}>
              <div className="grid gap-3">
                <SettingNumber
                  label="Minimum withdrawal"
                  value={settingsForm.minimumWithdrawalPoints}
                  step="1"
                  onChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      minimumWithdrawalPoints: value,
                    }))
                  }
                />
                <SettingNumber
                  label="Required purchase USD"
                  value={settingsForm.requiredPurchaseUsd}
                  step="0.01"
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, requiredPurchaseUsd: value }))
                  }
                />
                <SettingNumber
                  label="OBSD price USD"
                  value={settingsForm.tokenUsdPrice}
                  step="0.000001"
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, tokenUsdPrice: value }))
                  }
                />
                <SettingText
                  label="OBSD Token Contract Address (Polygon)"
                  value={settingsForm.tokenContractAddress || ""}
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, tokenContractAddress: value }))
                  }
                />
                <SettingText
                  label="QuickSwap OBSD Swap Link"
                  value={settingsForm.quickswapLink || ""}
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, quickswapLink: value }))
                  }
                />
                <SettingText
                  label="Owner Wallet Address"
                  value={settingsForm.ownerWallet || ""}
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, ownerWallet: value }))
                  }
                />
                <SettingNumber
                  label="Withdrawal lock days"
                  value={settingsForm.withdrawalLockDays || 0}
                  step="1"
                  onChange={(value) =>
                    setSettingsForm((current) => ({ ...current, withdrawalLockDays: value }))
                  }
                />
                <label className="flex items-center justify-between rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 py-3 text-sm">
                  Hold rewards until purchase proof
                  <input
                    type="checkbox"
                    checked={settingsForm.purchaseConditionEnabled}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        purchaseConditionEnabled: event.target.checked,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={saveSettings}
                  className="h-10 rounded-lg bg-white px-4 text-sm font-black text-[#0b0d12]"
                >
                  Save settings
                </button>
              </div>
            </Panel>
          </section>

          <Panel title="Task Management" action={<ListChecks size={18} />}>
            <div className="grid gap-3">
              {taskRows.map((task) => (
                <div key={task.id} className="rounded-lg border border-[#242a36] bg-[#0d1118] p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_120px]">
                    <TextInput
                      value={task.title}
                      onChange={(value) =>
                        setTaskRows((rows) =>
                          rows.map((row) => (row.id === task.id ? { ...row, title: value } : row)),
                        )
                      }
                    />
                    <NumberInput
                      value={task.reward}
                      onChange={(value) =>
                        setTaskRows((rows) =>
                          rows.map((row) => (row.id === task.id ? { ...row, reward: value } : row)),
                        )
                      }
                    />
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <TextInput
                      value={task.url}
                      onChange={(value) =>
                        setTaskRows((rows) =>
                          rows.map((row) => (row.id === task.id ? { ...row, url: value } : row)),
                        )
                      }
                    />
                    <a
                      href={task.url}
                      target="_blank"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#2d3646] px-3 text-sm text-[#cbd5e1]"
                    >
                      <ExternalLink size={16} />
                      Open
                    </a>
                  </div>
                  <textarea
                    value={task.description}
                    onChange={(event) =>
                      setTaskRows((rows) =>
                        rows.map((row) =>
                          row.id === task.id ? { ...row, description: event.target.value } : row,
                        ),
                      )
                    }
                    className="mt-3 min-h-20 w-full rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 py-3 text-sm outline-none focus:border-[#d69a2d]"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full border border-[#2d3646] px-3 py-1 text-xs text-[#94a3b8]">
                      {task.platform}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="h-10 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/40 px-4 text-sm font-black"
                      >
                        حذف المهمة
                      </button>
                      <button
                        type="button"
                        onClick={() => saveTask(task)}
                        className="h-10 rounded-lg bg-[#1f6f57] px-4 text-sm font-black text-white"
                      >
                        Save task
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {taskRows.length === 0 && <Empty text="No active tasks yet." />}
            </div>
          </Panel>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel title="Real Users" action={<Users size={18} />}>
              <DataList
                rows={userRows}
                empty="No real Telegram users yet."
                render={(row) => (
                  <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    row.frozen ? "border-red-500/20 bg-red-950/10" : "border-[#242a36] bg-[#0d1118]"
                  }`}>
                    <div className="min-w-0">
                      <p className="truncate font-bold flex items-center gap-2">
                        {row.name}
                        {row.frozen && (
                          <span className="rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                            FROZEN
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#94a3b8]">Telegram ID: {row.telegramId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="font-black text-[#d69a2d]">{row.balance} OBSD</p>
                        <p className="text-[10px] text-[#31d67b] font-bold">
                          {row.miningCyclesCompleted || 0} cycles
                        </p>
                        <p className="text-xs text-[#94a3b8]">
                          {row.purchaseVerified ? "Verified purchase" : "Purchase pending"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleUserFreezeState(row.id, row.frozen)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                          row.frozen
                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                            : "bg-[#242a36] text-gray-300 hover:bg-[#2d3646]"
                        }`}
                      >
                        {row.frozen ? "Unfreeze" : "Freeze"}
                      </button>
                    </div>
                  </div>
                )}
              />
            </Panel>

            <Panel title="Purchase Proofs" action={<ShieldCheck size={18} />}>
              <DataList
                rows={purchaseRows}
                empty="No purchase proofs yet."
                render={(row) => (
                  <ReviewCard
                    title={row.userName}
                    subtitle={row.walletAddress}
                    link={row.proofUrl}
                    status={row.status}
                    onApprove={() => updatePurchaseVerification(row.id, "approved")}
                    onReject={() => updatePurchaseVerification(row.id, "rejected")}
                  />
                )}
              />
            </Panel>

            <Panel title="Task Proofs" action={<Check size={18} />}>
              <DataList
                rows={reviewRows}
                empty="No task proofs yet."
                render={(row) => (
                  <ReviewCard
                    title={row.userName}
                    subtitle={row.taskTitle}
                    link={row.proofUrl}
                    status={row.status}
                    onApprove={() => updateReview(row.id, "approved")}
                    onReject={() => updateReview(row.id, "rejected")}
                  />
                )}
              />
            </Panel>

            <Panel title="Withdrawals" action={<CircleDollarSign size={18} />}>
              <DataList
                rows={withdrawalRows}
                empty="No withdrawals yet."
                render={(row) => (
                  <ReviewCard
                    title={`${row.userName} - ${row.amount} OBSD`}
                    subtitle={row.walletAddress}
                    status={row.status}
                    onApprove={() => updateWithdrawal(row.id, "paid")}
                    onReject={() => updateWithdrawal(row.id, "rejected")}
                  />
                )}
              />
            </Panel>
          </section>
        </section>
      </div>
    </main>
  );
}

function NavItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-[#cbd5e1]">
      <span className="text-[#d69a2d]">{icon}</span>
      {label}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#242a36] bg-[#11151d] p-4">
      <div className="flex items-center justify-between text-[#94a3b8]">
        <span className="text-sm">{label}</span>
        <span className="text-[#d69a2d]">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#242a36] bg-[#11151d]">
      <div className="flex items-center justify-between border-b border-[#242a36] px-4 py-3">
        <h3 className="font-black text-white">{title}</h3>
        <span className="text-[#d69a2d]">{action}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 text-sm outline-none focus:border-[#d69a2d]"
    />
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-10 w-full rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 text-sm outline-none focus:border-[#d69a2d]"
    />
  );
}

function SettingNumber({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#cbd5e1]">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 outline-none focus:border-[#d69a2d]"
      />
    </label>
  );
}

function SettingText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#cbd5e1]">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3 outline-none focus:border-[#d69a2d]"
      />
    </label>
  );
}

function DataList<T>({
  rows,
  empty,
  render,
}: {
  rows: T[];
  empty: string;
  render: (row: T) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <Empty text={empty} />;
  }

  return <div className="grid gap-3">{rows.map((row) => render(row))}</div>;
}

function ReviewCard({
  title,
  subtitle,
  link,
  status,
  onApprove,
  onReject,
}: {
  title: string;
  subtitle: string;
  link?: string;
  status: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#242a36] bg-[#0d1118] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{title}</p>
          <p className="mt-1 truncate text-sm text-[#94a3b8]">{subtitle}</p>
          {link && (
            <a className="mt-2 inline-flex items-center gap-1 text-sm text-[#d69a2d]" href={link} target="_blank">
              Open proof
              <ExternalLink size={14} />
            </a>
          )}
        </div>
        <span className="rounded-full border border-[#2d3646] px-2 py-1 text-xs text-[#cbd5e1]">
          {status}
        </span>
      </div>
      {status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="grid size-9 place-items-center rounded-lg bg-[#123625] text-[#31d67b]"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className="grid size-9 place-items-center rounded-lg bg-[#351417] text-[#ff4b5c]"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#2d3646] bg-[#0b0d12] p-5 text-sm text-[#94a3b8]">
      {text}
    </div>
  );
}
