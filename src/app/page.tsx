"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export default function Home() {
  const [selectedRange, setSelectedRange] = useState<"A" | "B" | "C">("B");
  const [amountWLD, setAmountWLD] = useState("");
  const [amountUSDC, setAmountUSDC] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [price, setPrice] = useState(2.5); // 1 WLD = 2.5 USDC (mock)
  const [lastEdited, setLastEdited] = useState<"WLD" | "USDC">("WLD");
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const wldNum = Number(amountWLD);
  const usdcNum = Number(amountUSDC);
  const canDeposit = wldNum > 0 && usdcNum > 0;
  const shortAddress =
    address && address.length > 8
      ? `${address.slice(0, 6)}…${address.slice(address.length - 4)}`
      : address ?? "";

  useEffect(() => {
    // Placeholder for when we hook a live price feed.
    setPrice((prev) => prev);
  }, []);

  const handleConnect = async () => {
    try {
      await connectAsync({ connector: injected() });
      setError("");
    } catch (err) {
      setError("Failed to connect wallet.");
    }
  };

  const handleWLDChange = (value: string) => {
    setAmountWLD(value);
    setLastEdited("WLD");
    setError("");
    setSuccess("");

    if (!value) {
      setAmountUSDC("");
      return;
    }

    const num = Number(value);
    if (Number.isFinite(num)) {
      setAmountUSDC((num * price).toFixed(6));
    }
  };

  const handleUSDCChange = (value: string) => {
    setAmountUSDC(value);
    setLastEdited("USDC");
    setError("");
    setSuccess("");

    if (!value) {
      setAmountWLD("");
      return;
    }

    const num = Number(value);
    if (Number.isFinite(num) && price !== 0) {
      setAmountWLD((num / price).toFixed(6));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAsync();
    } catch (err) {
      setError("Failed to disconnect wallet.");
    }
  };

  const handleDeposit = () => {
    if (!canDeposit) {
      setError("Enter both WLD and USDC amounts.");
      setSuccess("");
      return;
    }

    if (!isConnected) {
      setError("Connect wallet to deposit.");
      setSuccess("");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    // Simulate async submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccess(
        `Deposit submitted (demo). Range ${selectedRange} selected. Tx: 0x9f3a...c21b`
      );
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
              Zook Liquidity
            </p>
            <h1 className="text-3xl font-semibold">WLD/USDC Liquidity Manager</h1>
            <p className="text-sm text-slate-600">
              Deposit liquidity into preset ranges. Rehypothecation keeps IL exposure identical.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="rounded-full bg-zinc-900/70 px-3 py-1 text-xs font-medium text-emerald-200">
                  {shortAddress}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-full border border-emerald-400/60 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="rounded-full border border-emerald-400/60 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                Connect Wallet
              </button>
            )}
          </div>
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
                  onChange: handleWLDChange,
                },
                {
                  label: "USDC Amount",
                  name: "usdc-amount",
                  value: amountUSDC,
                  onChange: handleUSDCChange,
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
            <p className="mt-3 text-xs text-zinc-500">
              Estimated using current price. Final amounts depend on selected range. Last edited:
              {` ${lastEdited}`}.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={handleDeposit}
                disabled={!canDeposit || isSubmitting || !isConnected}
                className={`w-full rounded-xl py-3 text-black font-semibold transition ${
                  canDeposit && !isSubmitting && isConnected
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-emerald-500 opacity-50 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "Submitting…" : "Deposit"}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Idle liquidity is rehypothecated into the exact same range, keeping IL exposure
                identical.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {error && <p className="text-sm text-rose-400">{error}</p>}
              {isSubmitting && (
                <p className="text-sm text-zinc-400">Submitting transaction…</p>
              )}
              {success && <p className="text-sm text-emerald-400">{success}</p>}
            </div>
          </div>

          <div className="h-14 rounded-lg border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
