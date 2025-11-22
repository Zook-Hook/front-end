"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, parseUnits } from "viem";
import {
  TickMath,
  nearestUsableTick,
  maxLiquidityForAmounts,
} from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { Pool, V4PositionPlanner } from "@uniswap/v4-sdk";
import { Token } from "@uniswap/sdk-core";
import { useWriteContract } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { worldchain } from "./providers";

/* -------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------- */
const POOL_ID =
  "0x132db01ffd6a7d8446666c5fa5689a9556a384bdaa6bf68aecce7949efba649c" as const;
const POOL_MANAGER_ADDRESS =
  "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33" as const;
const STATE_VIEW = "0x51d394718bc09297262e368c1a481217fdeb71eb" as const;
const POSITION_MANAGER =
  "0xc585E0F504613b5FBf874F21aF14c65260Fb41fA" as const;

const TICK_SPACING = 28;
const DECIMALS0 = 18; // WLD
const DECIMALS1 = 6; // USDC.e

const WLD = new Token(
  480,
  "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
  DECIMALS0,
  "WLD"
);
const USDC = new Token(
  480,
  "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
  DECIMALS1,
  "USDC.e"
);

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

/* -------------------------------------------------------------
   COMPONENT
------------------------------------------------------------- */
export default function Home() {
  const [selectedRange, setSelectedRange] = useState<"A" | "B" | "C">("B");
  const [amountWLD, setAmountWLD] = useState("");
  const [amountUSDC, setAmountUSDC] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [onChainPrice, setOnChainPrice] = useState(2.5);
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
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address ?? "";

  /* -------------------------------------------------------------
     FETCH ON-CHAIN PRICE + TICK
  ------------------------------------------------------------- */
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const [sqrtPX96, tick] = (await publicClient.readContract({
          address: STATE_VIEW,
          abi: STATE_VIEW_ABI,
          functionName: "getSlot0",
          args: [POOL_ID],
        })) as [bigint, number, number, number];

        const ratio = Number(sqrtPX96) / 2 ** 96;
        const derivedPrice = ratio * ratio;
        const adjustedPrice = derivedPrice * 10 ** (DECIMALS0 - DECIMALS1);

        if (adjustedPrice > 0) {
          setOnChainPrice(adjustedPrice);
          setOnChainTick(tick);
          setSqrtPriceX96(sqrtPX96);
        }
      } catch (err) {
        console.error("StateView error:", err);
      }
    };

    fetchPrice();
  }, [publicClient]);

  useEffect(() => setSuccess(""), [amountWLD, amountUSDC, selectedRange]);

  /* -------------------------------------------------------------
     FIXED computeRange — NO MÁS TICK_BOUND
  ------------------------------------------------------------- */
  const computeRange = (range: "A" | "B" | "C") => {
    const factors = {
      A: { lower: 0.98, upper: 1.02 },
      B: { lower: 0.9, upper: 1.1 },
      C: { lower: 0.7, upper: 1.3 },
    } as const;

    const { lower, upper } = factors[range];

    if (!onChainTick) {
      const fallback = nearestUsableTick(0, TICK_SPACING);
      return {
        tickLower: fallback - TICK_SPACING,
        tickUpper: fallback + TICK_SPACING,
        lowerPrice: 0,
        upperPrice: 0,
      };
    }

    const safeBase = nearestUsableTick(
      Math.max(TickMath.MIN_TICK, Math.min(TickMath.MAX_TICK, onChainTick)),
      TICK_SPACING
    );

    const LOG_BASE = Math.log(1.0001);
    const lowerDelta = Math.floor(Math.log(lower) / LOG_BASE);
    const upperDelta = Math.floor(Math.log(upper) / LOG_BASE);

    let tickLower = nearestUsableTick(safeBase + lowerDelta, TICK_SPACING);
    let tickUpper = nearestUsableTick(safeBase + upperDelta, TICK_SPACING);

    if (tickLower >= tickUpper) tickUpper = tickLower + TICK_SPACING;

    const sqrtLower = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtUpper = TickMath.getSqrtRatioAtTick(tickUpper);

    const priceFromSqrt = (sqrt: bigint) =>
      (Number(sqrt) / 2 ** 96) ** 2 * 10 ** (DECIMALS0 - DECIMALS1);

    return {
      tickLower,
      tickUpper,
      lowerPrice: priceFromSqrt(sqrtLower),
      upperPrice: priceFromSqrt(sqrtUpper),
    };
  };

  /* -------------------------------------------------------------
     prepareDeposit — FIXED
  ------------------------------------------------------------- */
  const prepareDeposit = (range: "A" | "B" | "C") => {
    const { tickLower, tickUpper, lowerPrice, upperPrice } =
      computeRange(range);

    return {
      rangeId: range,
      lowerPrice,
      upperPrice,
      currentPrice: onChainPrice,
      amountWLD: wldNum,
      amountUSDC: usdcNum,
      lowerTick: tickLower,
      upperTick: tickUpper,
      poolId: POOL_ID,
      poolManager: POOL_MANAGER_ADDRESS,
      stateView: STATE_VIEW,
    };
  };

  /* -------------------------------------------------------------
     DEPOSIT HANDLER
  ------------------------------------------------------------- */
  const handleDeposit = async () => {
    if (!canDeposit) {
      setError("Enter both WLD and USDC.");
      return;
    }

    if (!isConnected) {
      setError("Connect wallet first.");
      return;
    }

    if (!sqrtPriceX96 || onChainTick === null) {
      setError("On-chain price not ready.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");
    setTxHash(null);

    try {
      const slippageBps = 50;
      const amount0 = parseUnits(amountWLD, DECIMALS0);
      const amount1 = parseUnits(amountUSDC, DECIMALS1);

      const amount0Max = (amount0 * BigInt(10000 + slippageBps)) / BigInt(10000);
      const amount1Max = (amount1 * BigInt(10000 + slippageBps)) / BigInt(10000);

      const baseTick = nearestUsableTick(
        TickMath.getTickAtSqrtRatio(sqrtPriceX96),
        TICK_SPACING
      );

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
        "0x0000000000000000000000000000000000000000",
        sqrtPriceX96,
        JSBI.BigInt(0),
        baseTick
      );

      const planner = new V4PositionPlanner();
      planner.addMint(
        pool,
        tickLower,
        tickUpper,
        liquidity,
        amount0Max,
        amount1Max,
        address!,
        "0x"
      );
      planner.addSettlePair(WLD, USDC);
      planner.addSweep(WLD, address!);
      planner.addSweep(USDC, address!);

      const unlockData = planner.finalize();
      const deadline = Math.floor(Date.now() / 1000) + 600;

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
      setSuccess(`Deposit sent: ${hash.slice(0, 8)}...${hash.slice(-6)}`);
    } catch (err: any) {
      console.error(err);
      setError(err?.shortMessage || err?.message || "Deposit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* -------------------------------------------------------------
     UI
  ------------------------------------------------------------- */
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-500">
              Zook Liquidity
            </p>
            <h1 className="text-3xl font-semibold">
              WLD/USDC Liquidity Manager
            </h1>
            <p className="text-sm text-slate-600">
              Deposit liquidity into preset ranges.
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              On-chain price: {onChainPrice.toFixed(4)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="rounded-full bg-black/70 px-3 py-1 text-xs text-emerald-200">
                  {shortAddress}
                </span>
                <button
                  onClick={disconnectAsync}
                  className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200 bg-black/60"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => connectAsync({ connector: injected() })}
                className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200 bg-black/60"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* RANGE CARDS */}
        <div className="flex gap-4">
          {(["A", "B", "C"] as const).map((value) => {
            const isSelected = selectedRange === value;
            const { lowerPrice, upperPrice } = computeRange(value);

            return (
              <div
                key={value}
                onClick={() => setSelectedRange(value)}
                className={`flex-1 rounded-xl p-4 cursor-pointer ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-zinc-800 bg-zinc-900/70"
                } border`}
              >
                <p className="text-sm font-semibold text-zinc-200">
                  Range {value}
                </p>
                <p className="text-xs text-zinc-400">
                  Lower: {lowerPrice.toFixed(4)}
                </p>
                <p className="text-xs text-zinc-400">
                  Upper: {upperPrice.toFixed(4)}
                </p>
              </div>
            );
          })}
        </div>

        {/* INPUTS */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-200">WLD Amount</span>
              <input
                type="number"
                value={amountWLD}
                onChange={(e) => {
                  setLastEdited("WLD");
                  setAmountWLD(e.target.value);
                  if (Number(e.target.value)) {
                    setAmountUSDC(
                      (Number(e.target.value) * onChainPrice).toFixed(6)
                    );
                  }
                }}
                className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 text-lg text-zinc-50"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-200">USDC Amount</span>
              <input
                type="number"
                value={amountUSDC}
                onChange={(e) => {
                  setLastEdited("USDC");
                  setAmountUSDC(e.target.value);
                  if (Number(e.target.value)) {
                    setAmountWLD(
                      (Number(e.target.value) / onChainPrice).toFixed(6)
                    );
                  }
                }}
                className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 text-lg text-zinc-50"
              />
            </label>
          </div>

          <button
            onClick={handleDeposit}
            disabled={!canDeposit || isSubmitting || !isConnected}
            className="w-full mt-4 rounded-xl py-3 bg-emerald-500 text-black font-bold disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Deposit"}
          </button>

          <button
            onClick={() =>
              console.log("debug payload:", prepareDeposit(selectedRange))
            }
            className="w-full mt-2 rounded-xl border border-zinc-700 bg-zinc-900/50 py-2 text-xs text-zinc-300"
          >
            Prepare Deposit (Debug)
          </button>

          <div className="mt-4">
            {error && <p className="text-rose-400">{error}</p>}
            {success && <p className="text-emerald-400">{success}</p>}
          </div>
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}
