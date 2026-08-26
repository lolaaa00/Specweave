"use client";

import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from "react";
import {
  getAccounts, requestAccounts, getChainId, switchToStudioNet,
  onAccountsChanged, offAccountsChanged, onChainChanged, offChainChanged,
  onDisconnect, offDisconnect,
  createGeneratedAccount, getGeneratedAddress, exportGeneratedKey,
  importGeneratedKey, clearGeneratedKey,
} from "./genlayer/client";
import { CHAIN_ID } from "./genlayer/config";

export type WalletMode = "injected" | "generated" | "none";

export interface WalletState {
  account: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  hasProvider: boolean;
  mode: WalletMode;
  connect: () => Promise<void>;
  useGeneratedWallet: () => void;
  switchNetwork: () => Promise<void>;
  disconnect: () => void;
  exportKey: () => string | null;
  importKey: (key: string) => boolean;
}

const WalletContext = createContext<WalletState>({
  account: null,
  chainId: null,
  isCorrectNetwork: false,
  isConnecting: false,
  connectionError: null,
  hasProvider: false,
  mode: "none",
  connect: async () => {},
  useGeneratedWallet: () => {},
  switchNetwork: async () => {},
  disconnect: () => {},
  exportKey: () => null,
  importKey: () => false,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  const [mode, setMode] = useState<WalletMode>("none");

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Check for injected provider and restore any active session
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasProvider(!!window.ethereum);

    // Restore generated wallet if one exists
    const addr = getGeneratedAddress();
    if (addr) {
      setAccount(addr);
      setMode("generated");
      setChainId(CHAIN_ID); // Generated wallet always targets StudioNet
      return;
    }

    // Restore injected wallet if already approved
    if (window.ethereum) {
      getAccounts().then((accounts) => {
        if (mounted.current && accounts.length > 0) {
          setAccount(accounts[0]);
          setMode("injected");
          getChainId().then((cid) => {
            if (mounted.current) setChainId(cid);
          });
        }
      });
    }
  }, []);

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accs = accounts as string[];
    if (accs.length === 0) {
      setAccount(null);
      setMode("none");
    } else {
      setAccount(accs[0]);
      setMode("injected");
    }
  }, []);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    setChainId(parseInt(chainIdHex as string, 16));
  }, []);

  const handleDisconnect = useCallback(() => {
    if (mode === "injected") {
      setAccount(null);
      setChainId(null);
      setMode("none");
    }
  }, [mode]);

  useEffect(() => {
    onAccountsChanged(handleAccountsChanged as (a: string[]) => void);
    onChainChanged(handleChainChanged as (c: string) => void);
    onDisconnect(handleDisconnect);
    return () => {
      offAccountsChanged(handleAccountsChanged as (a: string[]) => void);
      offChainChanged(handleChainChanged as (c: string) => void);
      offDisconnect(handleDisconnect);
    };
  }, [handleAccountsChanged, handleChainChanged, handleDisconnect]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const accounts = await requestAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setMode("injected");
        const cid = await getChainId();
        setChainId(cid);
        // If a generated wallet was active, keep it in storage but defer to injected
      }
    } catch (err: unknown) {
      setConnectionError(err instanceof Error ? err.message : "Connection refused.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const useGeneratedWallet = useCallback(() => {
    const addr = createGeneratedAccount();
    if (addr) {
      setAccount(addr);
      setMode("generated");
      setChainId(CHAIN_ID);
      setConnectionError(null);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (mode === "generated") return; // generated wallet always targets StudioNet
    try {
      await switchToStudioNet();
      const cid = await getChainId();
      setChainId(cid);
    } catch (err: unknown) {
      setConnectionError(err instanceof Error ? err.message : "Network switch failed.");
    }
  }, [mode]);

  const disconnect = useCallback(() => {
    if (mode === "generated") {
      clearGeneratedKey();
    }
    setAccount(null);
    setChainId(null);
    setMode("none");
    setConnectionError(null);
  }, [mode]);

  const exportKey = useCallback((): string | null => {
    return exportGeneratedKey();
  }, []);

  const importKey = useCallback((key: string): boolean => {
    const addr = importGeneratedKey(key);
    if (addr) {
      setAccount(addr);
      setMode("generated");
      setChainId(CHAIN_ID);
      return true;
    }
    return false;
  }, []);

  const isCorrectNetwork = mode === "generated" ? true : chainId === CHAIN_ID;

  return (
    <WalletContext.Provider value={{
      account, chainId, isCorrectNetwork, isConnecting, connectionError,
      hasProvider, mode,
      connect, useGeneratedWallet, switchNetwork, disconnect, exportKey, importKey,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
