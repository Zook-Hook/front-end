 "use client";

import { useState } from "react";

export default function Home() {
  const [selectedRange, setSelectedRange] = useState<"A" | "B" | "C">("B");

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
          <div className="h-40 rounded-lg border border-slate-200 bg-white shadow-sm" />
          <div className="h-14 rounded-lg border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
