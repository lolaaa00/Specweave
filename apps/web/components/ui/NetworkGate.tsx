"use client";

import { useWallet } from "@/lib/wallet-provider";

export function NetworkGate({ children }: { children: React.ReactNode }) {
  const { account, isCorrectNetwork, isConnecting, hasProvider, connect, switchNetwork } = useWallet();

  if (!account) {
    return (
      <div className="network-warning" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>Connect a wallet to make writes to StudioNet.</span>
        <button className="btn-primary" style={{ fontSize: "12px", padding: "0.25rem 0.75rem" }} onClick={connect} disabled={isConnecting || !hasProvider}>
          {isConnecting ? "Connecting…" : !hasProvider ? "No wallet detected" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <div className="network-warning" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>Wallet is on the wrong network. SpecWeave requires StudioNet (chain 61999).</span>
        <button className="btn-secondary" style={{ fontSize: "12px", padding: "0.25rem 0.75rem" }} onClick={switchNetwork}>
          Switch to StudioNet
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
