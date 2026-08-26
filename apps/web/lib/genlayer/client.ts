"use client";

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CHAIN_ID, RPC_ENDPOINT } from "./config";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const GENERATED_KEY_STORAGE = "specweave:generated_pk";
const GENERATED_ADDR_STORAGE = "specweave:generated_addr";

// ---------------------------------------------------------------------------
// Generated wallet (localStorage-persisted)
// ---------------------------------------------------------------------------

export function getGeneratedAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(GENERATED_ADDR_STORAGE);
  } catch {
    return null;
  }
}

export function createGeneratedAccount(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const pk = generatePrivateKey();
    const acct = createAccount(pk);
    localStorage.setItem(GENERATED_KEY_STORAGE, pk);
    localStorage.setItem(GENERATED_ADDR_STORAGE, acct.address);
    return acct.address;
  } catch {
    return null;
  }
}

export function exportGeneratedKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(GENERATED_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function importGeneratedKey(privateKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const trimmed = privateKey.trim() as `0x${string}`;
    const acct = createAccount(trimmed);
    localStorage.setItem(GENERATED_KEY_STORAGE, trimmed);
    localStorage.setItem(GENERATED_ADDR_STORAGE, acct.address);
    return acct.address;
  } catch {
    return null;
  }
}

export function clearGeneratedKey(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GENERATED_KEY_STORAGE);
    localStorage.removeItem(GENERATED_ADDR_STORAGE);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Injected wallet helpers
// ---------------------------------------------------------------------------

export async function getAccounts(): Promise<string[]> {
  if (typeof window === "undefined" || !window.ethereum) return [];
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return (accounts as string[]) ?? [];
}

export async function requestAccounts(): Promise<string[]> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet detected. Please install MetaMask or a compatible wallet.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return (accounts as string[]) ?? [];
}

export async function getChainId(): Promise<number> {
  if (typeof window === "undefined" || !window.ethereum) return 0;
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  return parseInt(chainIdHex as string, 16);
}

export async function switchToStudioNet(): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) return;
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
  });
}

// ---------------------------------------------------------------------------
// genlayer-js clients
// ---------------------------------------------------------------------------

export function createReadClient() {
  return createClient({ chain: studionet, endpoint: RPC_ENDPOINT });
}

export function createWriteClient(account: string, mode: "injected" | "generated" = "injected") {
  if (mode === "generated") {
    if (typeof window === "undefined") throw new Error("Generated wallet unavailable on server.");
    try {
      const pk = localStorage.getItem(GENERATED_KEY_STORAGE) as `0x${string}` | null;
      if (!pk) throw new Error("Generated wallet key not found in storage.");
      const acct = createAccount(pk);
      return createClient({ chain: studionet, endpoint: RPC_ENDPOINT, account: acct });
    } catch (err) {
      throw new Error("Failed to load generated wallet: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Injected wallet
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet available for writes.");
  }
  return createClient({
    chain: studionet,
    endpoint: RPC_ENDPOINT,
    account: account as `0x${string}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: window.ethereum as any,
  });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function onAccountsChanged(handler: (accounts: string[]) => void) {
  window.ethereum?.on("accountsChanged", handler as (...args: unknown[]) => void);
}
export function offAccountsChanged(handler: (accounts: string[]) => void) {
  window.ethereum?.removeListener("accountsChanged", handler as (...args: unknown[]) => void);
}
export function onChainChanged(handler: (chainId: string) => void) {
  window.ethereum?.on("chainChanged", handler as (...args: unknown[]) => void);
}
export function offChainChanged(handler: (chainId: string) => void) {
  window.ethereum?.removeListener("chainChanged", handler as (...args: unknown[]) => void);
}
export function onDisconnect(handler: () => void) {
  window.ethereum?.on("disconnect", handler);
}
export function offDisconnect(handler: () => void) {
  window.ethereum?.removeListener("disconnect", handler);
}
