"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, isAddress, parseUnits } from "viem";
import { TickMath, nearestUsableTick, maxLiquidityForAmounts } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { Pool, V4PositionPlanner } from "@uniswap/v4-sdk";
import { Token } from "@uniswap/sdk-core";
import { useWriteContract } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { worldchain } from "./providers";

const POOL_ID = "0x132db01ffd6a7d8446666c5fa5689a9556a384bdaa6bf68aecce7949efba649c" as const;
const POOL_MANAGER_ADDRESS = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33" as const;
const STATE_VIEW = "0x51d394718bc09297262e368c1a481217fdeb71eb" as const;
const TICK_SPACING = 28;
const LOG_BASE = Math.log(1.0001);
const DECIMALS0 = 18; // WLD
const DECIMALS1 = 6; // USDC.e
const POSITION_MANAGER = "0xc585E0F504613b5FBf874F21aF14c65260Fb41fA" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const WLD = new Token(480, "0x2cFc85d8E48F8EAB294be644d9E25C3030863003", DECIMALS0, "WLD");
const USDC = new Token(480, "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1", DECIMALS1, "USDC.e");

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const POSITION_MANAGER_ABI = [
  {
    type: "function",
    name: "modifyLiquidities",
    stateMutability: "payable",
    inputs: [
      { name: "unlockData", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const STATE_VIEW_ABI = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

export default function Home() {
  const [selectedRange, setSelectedRange] = useState<"A" | "B" | "C">("B");
  const [amountWLD, setAmountWLD] = useState("");
  const [amountUSDC, setAmountUSDC] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [onChainPrice, setOnChainPrice] = useState(2.5); // default until fetched from StateView
  const [onChainTick, setOnChainTick] = useState<number | null>(null);
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint | null>(null);
  const [lastEdited, setLastEdited] = useState<"WLD" | "USDC">("WLD");
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: worldchain,
        transport: http(worldchain.rpcUrls.default.http[0]),
      }),
    []
  );
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const wldNum = Number(amountWLD);
  const usdcNum = Number(amountUSDC);
  const canDeposit = wldNum > 0 && usdcNum > 0;
  const shortAddress =
    address && address.length > 8
      ? `${address.slice(0, 6)}...${address.slice(address.length - 4)}`
      : address ?? "";

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const [sqrtPriceX96Value, tick] = (await publicClient.readContract({
          address: STATE_VIEW,
          abi: STATE_VIEW_ABI,
          functionName: "getSlot0",
          args: [POOL_ID],
        })) as [bigint, number, number, number];

        const ratio = Number(sqrtPriceX96Value) / 2 ** 96;
        const derivedPrice = ratio * ratio;
        // token0 = WLD (18 decimals), token1 = USDC.e (6 decimals)
        const adjustedPrice = derivedPrice * 10 ** (DECIMALS0 - DECIMALS1);

        if (Number.isFinite(adjustedPrice) && adjustedPrice > 0) {
          setOnChainPrice(adjustedPrice);
          setOnChainTick(tick);
          setSqrtPriceX96(sqrtPriceX96Value);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("StateView: error fetching slot0", err);
      }
    };

    fetchPrice();
  }, [publicClient]);

  useEffect(() => {
    setSuccess("");
  }, [amountWLD, amountUSDC, selectedRange]);

  const computeRange = (range: "A" | "B" | "C") => {
    const factors = {
      A: { lower: 0.98, upper: 1.02 },
      B: { lower: 0.9, upper: 1.1 },
      C: { lower: 0.7, upper: 1.3 },
    } as const;

    const { lower, upper } = factors[range];
    const baseTick =
      onChainTick ??
      (sqrtPriceX96 ? TickMath.getTickAtSqrtRatio(sqrtPriceX96) : TickMath.MIN_TICK);

    const rawLowerTick = Math.floor(baseTick + Math.log(lower) / LOG_BASE);
    const rawUpperTick = Math.floor(baseTick + Math.log(upper) / LOG_BASE);
    const tickLower = nearestUsableTick(rawLowerTick, TICK_SPACING);
    const tickUpper = nearestUsableTick(rawUpperTick, TICK_SPACING);

    const sqrtLower = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtUpper = TickMath.getSqrtRatioAtTick(tickUpper);
    const priceFromSqrt = (sqrt: bigint) =>
      (Number(sqrt) / 2 ** 96) ** 2 * 10 ** (DECIMALS0 - DECIMALS1);

    return {
      lowerPrice: priceFromSqrt(sqrtLower),
      upperPrice: priceFromSqrt(sqrtUpper),
      tickLower,
      tickUpper,
    };
  };

  const prepareDeposit = (range: "A" | "B" | "C") => {
    const { lowerPrice, upperPrice } = computeRange(range);
    return {
      rangeId: range,
      lowerPrice,
      upperPrice,
      currentPrice: onChainPrice,
      amountWLD: wldNum,
      amountUSDC: usdcNum,
      lowerTick: rangeTicks.tickLower,
      upperTick: rangeTicks.tickUpper,
      poolId: POOL_ID,
      poolManager: POOL_MANAGER_ADDRESS,
      stateView: STATE_VIEW || undefined,
    };
  };

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
      setAmountUSDC((num * onChainPrice).toFixed(6));
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
    if (Number.isFinite(num) && onChainPrice !== 0) {
      setAmountWLD((num / onChainPrice).toFixed(6));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAsync();
    } catch (err) {
      setError("Failed to disconnect wallet.");
    }
  };

  const handleDeposit = async () => {
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

    if (!sqrtPriceX96 || onChainTick === null) {
      setError("On-chain price not ready. Try again in a moment.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");
    setTxHash(null);

    try {
      const slippageBps = 50; // 0.5%
      const amount0 = parseUnits(amountWLD || "0", DECIMALS0);
      const amount1 = parseUnits(amountUSDC || "0", DECIMALS1);
      const amount0Max = (amount0 * BigInt(10000 + slippageBps)) / BigInt(10000);
      const amount1Max = (amount1 * BigInt(10000 + slippageBps)) / BigInt(10000);

      const baseTick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
      const currentTickUsable = nearestUsableTick(baseTick, TICK_SPACING);
      const { tickLower, tickUpper } = computeRange(selectedRange);
      const sqrtLower = TickMath.getSqrtRatioAtTick(tickLower);
      const sqrtUpper = TickMath.getSqrtRatioAtTick(tickUpper);

      const liquidity = maxLiquidityForAmounts(
        JSBI.BigInt(sqrtPriceX96),
        JSBI.BigInt(sqrtLower),
        JSBI.BigInt(sqrtUpper),
        JSBI.BigInt(amount0),
        JSBI.BigInt(amount1),
        true
      );

      const pool = new Pool(
        WLD,
        USDC,
        1400,
        TICK_SPACING,
        ZERO_ADDRESS,
        sqrtPriceX96,
        JSBI.BigInt(0),
        currentTickUsable
      );

      const planner = new V4PositionPlanner();
      planner.addMint(
        pool,
        tickLower,
        tickUpper,
        liquidity,
        amount0Max,
        amount1Max,
        address as string,
        "0x"
      );
      planner.addSettlePair(WLD, USDC);
      planner.addSweep(WLD, address as string);
      planner.addSweep(USDC, address as string);

      const unlockData = planner.finalize();
      const deadline = Math.floor(Date.now() / 1000) + 600;

      // Approvals
      await writeContractAsync({
        address: WLD.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [POSITION_MANAGER, amount0Max],
      });

      await writeContractAsync({
        address: USDC.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [POSITION_MANAGER, amount1Max],
      });

      const hash = await writeContractAsync({
        address: POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "modifyLiquidities",
        args: [unlockData as `0x${string}`, BigInt(deadline)],
      });

      setTxHash(hash);

      setSuccess(
        `Deposit submitted. Tx: ${hash.slice(0, 8)}...${hash.slice(-6)} (Range ${selectedRange})`
      );
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Deposit failed", err);
      setError(err?.shortMessage || err?.message || "Deposit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
              Zook Liquidity
            </p>
            <h1 className="text-3xl font-semibold">WLD/USDC Liquidity Manager</h1>
            <p className="text-sm text-slate-600">
              Deposit liquidity into preset ranges. Rehypothecation keeps IL exposure identical.
            </p>
            <p className="text-sm text-white/70 mt-1">
              Concentrated liquidity with rehypothecation on idle capital.
            </p>
            {onChainPrice !== null && (
              <p className="text-sm text-zinc-400 mt-1">
                On-chain price (WLD/USDC): {onChainPrice.toFixed(4)}
              </p>
            )}
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
                  className="rounded-full border border-emerald-500/30 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition-all hover:bg-emerald-500/20"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="rounded-full border border-emerald-500/30 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition-all hover:bg-emerald-500/20"
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
              const { lowerPrice, upperPrice } = computeRange(value);

              return (
                <div
                  key={value}
                  onClick={() => setSelectedRange(value)}
                  className={`flex-1 min-h-[120px] flex flex-col justify-between rounded-xl border p-6 shadow-lg shadow-black/20 transition-all hover:shadow-emerald-400/10 cursor-pointer ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40"
                      : "border-zinc-800 bg-zinc-900/60 hover:ring-1 hover:ring-emerald-400/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-50">{label}</p>
                  <p className="text-xs text-zinc-400">{description}</p>
                  <div className="mt-3 space-y-1 text-[11px] text-zinc-400">
                    <p>
                      Lower: <span className="text-zinc-200">{lowerPrice.toFixed(4)}</span>
                    </p>
                    <p>
                      Upper: <span className="text-zinc-200">{upperPrice.toFixed(4)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm">
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                isSubmitting ? "opacity-50 pointer-events-none" : ""
              }`}
            >
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
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-lg text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
                {isSubmitting ? "Submitting..." : "Deposit"}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Debug-only: preview prepared deposit payload.
                  // eslint-disable-next-line no-console
                  console.log(prepareDeposit(selectedRange));
                }}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
              >
                Prepare Deposit (Debug)
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Idle liquidity is rehypothecated into the exact same range, keeping IL exposure
                identical.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {error && <p className="text-sm text-rose-400">{error}</p>}
              {isSubmitting && (
                <p className="text-sm text-zinc-400">Submitting transaction...</p>
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
