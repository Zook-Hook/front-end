"use client";

import { useState } from "react";

export default function Home() {
  const [selectedRange, setSelectedRange] = useState<"A" | "B" | "C">("B");
  const [amountWLD, setAmountWLD] = useState("");
  const [amountUSDC, setAmountUSDC] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const wldNum = Number(amountWLD);
  const usdcNum = Number(amountUSDC);
  const canDeposit = wldNum > 0 && usdcNum > 0;

  const handleDeposit = () => {
    if (!canDeposit) {
      setError("Enter both WLD and USDC amounts.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess(`Deposit submitted (demo). Range ${selectedRange} selected.`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
            Zook Liquidity
          </p>
          <h1 className="text-3xl font-semibold">WLD/USDC Liquidity Manager</h1>
          <p className="text-sm text-slate-600">
            Deposit liquidity into preset ranges. Rehypothecation keeps IL exposure identical.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            {[
              { value: "A" as const, label: "Range A", description: "Tighter range" },
              { value: "B" as const, label: "Range B", description: "Balanced" },
              { value: "C" as const, label: "Range C", description: "Wider range" },
            ].map(({ value, label, description }) => {
              const isSelected = selectedRange === value;

              return (
                <div
                  key={value}
                  onClick={() => setSelectedRange(value)}
                  className={`flex-1 min-h-[120px] flex flex-col justify-between rounded-xl border p-6 shadow-sm transition cursor-pointer ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40"
                      : "border-zinc-800 bg-zinc-900/60 hover:ring-1 hover:ring-emerald-400/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-50">{label}</p>
                  <p className="text-xs text-zinc-400">{description}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  label: "WLD Amount",
                  name: "wld-amount",
                  value: amountWLD,
                  onChange: (value: string) => {
                    setAmountWLD(value);
                    setError("");
                    setSuccess("");
                  },
                },
                {
                  label: "USDC Amount",
                  name: "usdc-amount",
                  value: amountUSDC,
                  onChange: (value: string) => {
                    setAmountUSDC(value);
                    setError("");
                    setSuccess("");
                  },
                },
              ].map(({ label, name, value, onChange }) => (
                <label key={name} className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-200">{label}</span>
                  <input
                    name={name}
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-lg text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="0.00"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={handleDeposit}
                disabled={!canDeposit}
                className={`w-full rounded-xl py-3 text-black font-semibold transition ${
                  canDeposit
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-emerald-500 opacity-50 cursor-not-allowed"
                }`}
              >
                Deposit
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {error && <p className="text-sm text-rose-400">{error}</p>}
              {success && <p className="text-sm text-emerald-400">{success}</p>}
            </div>
          </div>

          <div className="h-14 rounded-lg border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
