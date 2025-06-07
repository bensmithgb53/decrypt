import { serve } from "https://deno.land/std@0.223.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { m3u8Url, referer, cookies } = await req.json();
  const headers = new Headers({
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    "Accept": "application/vnd.apple.mpegurl, */*",
    "Referer": referer,
    "Cookie": cookies || "",
  });

  try {
    const response = await fetch(m3u8Url, { headers });
    if (!response.ok) {
      return new Response("Failed to fetch m3u8", { status: response.status });
    }
    const m3u8Content = await response.text();
    // Optionally rewrite m3u8 URLs to proxy through this server
    const proxiedUrl = `https://${req.headers.get("host")}/stream?m3u8=${encodeURIComponent(m3u8Url)}`;
    return new Response(JSON.stringify({ proxiedUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}, { port: 8000 });
