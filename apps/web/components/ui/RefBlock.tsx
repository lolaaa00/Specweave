"use client";

import { useState } from "react";

export function RefBlock({
  label,
  url,
  digest,
}: {
  label: string;
  url: string;
  digest: string;
}) {
  const [copied, setCopied] = useState<"url" | "digest" | null>(null);

  const copy = (text: string, which: "url" | "digest") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="ref-block" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="spec-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono-spec"
          style={{ fontSize: "11px", color: "var(--cobalt)", wordBreak: "break-all" }}
        >
          {url}
        </a>
        <button
          className="btn-secondary"
          style={{ fontSize: "10px", padding: "1px 5px" }}
          onClick={() => copy(url, "url")}
        >
          {copied === "url" ? "Copied" : "Copy URL"}
        </button>
      </div>
      {digest && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="digest">{digest}</span>
          <button
            className="btn-secondary"
            style={{ fontSize: "10px", padding: "1px 5px" }}
            onClick={() => copy(digest, "digest")}
          >
            {copied === "digest" ? "Copied" : "Copy digest"}
          </button>
        </div>
      )}
    </div>
  );
}
