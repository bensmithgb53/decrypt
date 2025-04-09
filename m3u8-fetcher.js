// m3u8-fetcher.ts
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { m3u8Url, cookies, referer } = await req.json();

  if (!m3u8Url) {
    return new Response(JSON.stringify({ error: "Missing m3u8Url" }), { status: 400 });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    "Accept": "*/*",
    "Origin": "https://embedstreams.top",
    "Referer": referer || "https://embedstreams.top/",
    "Accept-Encoding": "br",
    "Cookie": cookies || "",
  };

  try {
    const response = await fetch(m3u8Url, { headers });
    const contentEncoding = response.headers.get("Content-Encoding")?.toLowerCase();
    const rawBytes = new Uint8Array(await response.arrayBuffer());

    let m3u8Text;
    if (contentEncoding === "br") {
      console.log("Decompressing Brotli...");
      const decompressed = decompress(rawBytes);
      m3u8Text = new TextDecoder().decode(decompressed);
    } else {
      m3u8Text = new TextDecoder().decode(rawBytes);
    }

    if (!m3u8Text.startsWith("#EXTM3U")) {
      throw new Error("Invalid M3U8 content");
    }

    return new Response(JSON.stringify({ m3u8: m3u8Text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, { port: 8001 });

console.log("M3U8 fetcher running on http://localhost:8001");
