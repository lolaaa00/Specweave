import { NextRequest, NextResponse } from "next/server";

// Proxy for fetching commit-pinned GitHub raw files.
// This is a convenience read-only cache proxy; it is not authoritative.
// The contract validators fetch evidence independently.

const MAX_SIZE = 100_000; // 100 KB limit

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  // Allow only commit-pinned raw GitHub URLs
  if (!url.startsWith("https://raw.githubusercontent.com/") && !url.startsWith("https://github.com/")) {
    return NextResponse.json({ error: "Only GitHub raw URLs are allowed." }, { status: 400 });
  }

  // Ensure it looks commit-pinned (40-char SHA in path)
  const SHA_RE = /\/[0-9a-f]{40}\//i;
  if (!SHA_RE.test(url)) {
    return NextResponse.json({ error: "URL must be commit-pinned (40-char SHA in path)." }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "SpecWeave/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream returned ${upstream.status}` }, { status: 502 });
    }

    const text = await upstream.text();
    if (text.length > MAX_SIZE) {
      return NextResponse.json({ error: "Response too large for proxy." }, { status: 413 });
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
