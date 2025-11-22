"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Chain } from "viem";
import { WagmiProvider, createConfig, http } from "wagmi";

export const worldchain: Chain = {
  id: 480,
  name: "Worldchain",
  nativeCurrency: { name: "Worldcoin", symbol: "WLD", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://worldchain-mainnet.g.alchemy.com/public"],
      webSocket: ["wss://worldchain.drpc.org"],
    },
    public: {
      http: ["https://worldchain-mainnet.g.alchemy.com/public"],
      webSocket: ["wss://worldchain.drpc.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://worldchain-mainnet.blockscout.com",
    },
  },
};

const queryClient = new QueryClient();

const config = createConfig({
  chains: [worldchain],
  transports: {
    [worldchain.id]: http(worldchain.rpcUrls.default.http[0]),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
