export default function Home() {
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
              { label: "Range A", description: "Tighter range" },
              { label: "Range B", description: "Balanced" },
              { label: "Range C", description: "Wider range" },
            ].map(({ label, description }) => (
              <div
                key={label}
                className="flex-1 min-h-[120px] flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm transition hover:ring-1 hover:ring-emerald-400/40 cursor-pointer"
              >
                <p className="text-sm font-semibold text-zinc-50">{label}</p>
                <p className="text-xs text-zinc-400">{description}</p>
              </div>
            ))}
          </div>
          <div className="h-40 rounded-lg border border-slate-200 bg-white shadow-sm" />
          <div className="h-14 rounded-lg border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
