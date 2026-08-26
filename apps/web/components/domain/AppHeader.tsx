"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet-provider";
import { CONTRACT_ADDRESS, IS_LIVE, CHAIN_ID } from "@/lib/genlayer/config";

const NAV_LINKS = [
  { href: "/", label: "Standard" },
  { href: "/clauses", label: "Clauses" },
  { href: "/releases/new", label: "Propose" },
  { href: "/versions", label: "Versions" },
  { href: "/graph", label: "Graph" },
  { href: "/canonical", label: "Canonical" },
];

export function AppHeader() {
  const pathname = usePathname();
  const {
    account, chainId, isCorrectNetwork, isConnecting, hasProvider,
    mode, connect, switchNetwork, disconnect, useGeneratedWallet, exportKey, importKey,
  } = useWallet();

  const [showGenMenu, setShowGenMenu] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState("");
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const shortAddr = account
    ? account.slice(0, 6) + "…" + account.slice(-4)
    : null;

  const networkLabel = (() => {
    if (!account) return null;
    if (mode === "generated") return `StudioNet (generated)`;
    if (isCorrectNetwork) return `StudioNet (${CHAIN_ID})`;
    return `Wrong network (${chainId ?? "?"})`;
  })();

  const handleUseGenerated = async () => {
    await useGeneratedWallet();
    setShowGenMenu(false);
  };

  const handleExport = () => {
    const key = exportKey();
    setExportedKey(key);
  };

  const handleImport = () => {
    setImportError("");
    if (!importInput.startsWith("0x") || importInput.length < 64) {
      setImportError("Must be a 0x-prefixed hex private key.");
      return;
    }
    const addr = importKey(importInput.trim());
    if (!addr) {
      setImportError("Invalid private key.");
      return;
    }
    setImportInput("");
    setShowGenMenu(false);
  };

  return (
    <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="app-header" role="banner">
      <div style={{ display: "flex", alignItems: "center", padding: "0 1.25rem", height: "2.75rem", gap: "1.5rem" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "-0.025em" }}>SpecWeave</span>
          <span
            className="provenance-tag"
            style={{
              fontSize: "9px",
              padding: "1px 6px",
              borderRadius: "3px",
              background: IS_LIVE && CONTRACT_ADDRESS ? "rgba(13,77,26,0.1)" : "var(--surface)",
              color: IS_LIVE && CONTRACT_ADDRESS ? "var(--status-canonical)" : "var(--ink-faint)",
              border: `1px solid ${IS_LIVE && CONTRACT_ADDRESS ? "rgba(13,77,26,0.2)" : "var(--border)"}`,
              fontWeight: 600,
            }}
          >
            {IS_LIVE && CONTRACT_ADDRESS ? "live" : IS_LIVE ? "no contract" : "dev"}
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="nav-desktop" aria-label="Main navigation" style={{ display: "flex", gap: "0.1rem", flex: 1 }}>
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                style={{
                  padding: "0.25rem 0.6rem",
                  fontSize: "12px",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  textDecoration: "none",
                  borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
                  marginBottom: "-1px",
                  transition: "color 0.1s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Hamburger (mobile only) */}
        <button
          className="nav-hamburger btn-secondary"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav"
          style={{ fontSize: "16px", padding: "0.2rem 0.5rem", marginLeft: "auto" }}
          onClick={() => setMobileNavOpen(v => !v)}
        >
          {mobileNavOpen ? "✕" : "☰"}
        </button>

        {/* Wallet chrome */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, position: "relative" }}>
          {account && networkLabel && (
            <span
              className="provenance-tag"
              style={{ color: (isCorrectNetwork || mode === "generated") ? "var(--status-canonical)" : "var(--redline)" }}
            >
              {networkLabel}
            </span>
          )}
          {account && !isCorrectNetwork && mode === "injected" && (
            <button className="btn-secondary" style={{ fontSize: "11px", padding: "0.2rem 0.5rem" }} onClick={switchNetwork}>
              Switch
            </button>
          )}
          {account ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span
                className="font-mono-spec"
                style={{ fontSize: "11px", color: "var(--ink-muted)" }}
                title={account}
              >
                {shortAddr}
              </span>
              {mode === "generated" && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: "10px", padding: "0.1rem 0.4rem" }}
                  onClick={() => { setShowGenMenu(v => !v); setExportedKey(null); setImportError(""); }}
                  title="Generated wallet options"
                >
                  ⚙
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ fontSize: "10px", padding: "0.1rem 0.4rem" }}
                onClick={disconnect}
                title="Disconnect"
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {hasProvider && (
                <button
                  className="btn-primary"
                  style={{ fontSize: "12px", padding: "0.25rem 0.75rem" }}
                  onClick={connect}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ fontSize: "11px", padding: "0.2rem 0.5rem" }}
                onClick={() => setShowGenMenu(v => !v)}
              >
                {hasProvider ? "or generate" : "Use generated wallet"}
              </button>
            </div>
          )}

          {/* Generated wallet dropdown */}
          {showGenMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 0.5rem)",
                right: 0,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.75rem",
                width: "300px",
                zIndex: 100,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ fontSize: "11px", color: "var(--status-review)", marginBottom: "0.5rem", fontWeight: 600 }}>
                ⚠ Generated wallet — no passphrase protection
              </div>
              <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: "0 0 0.5rem", lineHeight: 1.5 }}>
                A private key is generated in-browser and stored in localStorage. It is not encrypted. Anyone with access to your browser storage can spend from it. Export your key and keep it safe. For higher security, use an injected wallet.
              </p>

              {!account && (
                <button className="btn-primary" style={{ fontSize: "11px", width: "100%", marginBottom: "0.5rem" }} onClick={handleUseGenerated}>
                  Generate &amp; use wallet
                </button>
              )}

              {mode === "generated" && (
                <>
                  <button className="btn-secondary" style={{ fontSize: "11px", width: "100%", marginBottom: "0.4rem" }} onClick={handleExport}>
                    Export private key
                  </button>
                  {exportedKey && (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <div className="font-mono-spec" style={{ fontSize: "10px", wordBreak: "break-all", background: "var(--cobalt-bg)", padding: "0.4rem", borderRadius: "2px", userSelect: "all" }}>
                        {exportedKey}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--redline)", marginTop: "0.25rem" }}>Copy and store this securely. Never share it.</div>
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: "0.25rem" }}>
                <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginBottom: "0.25rem" }}>Import existing key:</div>
                <input
                  className="spec-input font-mono-spec"
                  style={{ fontSize: "10px", marginBottom: "0.25rem" }}
                  placeholder="0x…"
                  value={importInput}
                  onChange={e => setImportInput(e.target.value.trim())}
                  type="password"
                />
                {importError && <div style={{ fontSize: "10px", color: "var(--redline)", marginBottom: "0.2rem" }}>{importError}</div>}
                <button className="btn-secondary" style={{ fontSize: "11px", width: "100%" }} onClick={handleImport}>
                  Import &amp; use key
                </button>
              </div>

              <button
                style={{ marginTop: "0.5rem", fontSize: "10px", color: "var(--ink-faint)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                onClick={() => setShowGenMenu(false)}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </header>

    {/* Mobile navigation drawer */}
    {mobileNavOpen && (
      <nav id="mobile-nav" className="mobile-nav-drawer" aria-label="Mobile navigation">
        {NAV_LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileNavOpen(false)}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    )}
    </>
  );
}
