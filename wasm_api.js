// server.ts
import { serve } from "https://deno.land/std@0.231.0/http/server.ts"; // Updated to latest std version and correct path
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

// Import CryptoJS components from jsdelivr
import CryptoJS from "https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/index.js";
const { AES, enc: { Utf8, Base64 }, mode: { CTR }, pad: { NoPadding } } = CryptoJS;

console.log("Starting Deno decryption server...");

// Mock window and document for build.js compatibility
globalThis.window = globalThis;
globalThis.document = {
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }),
    createElement: () => ({ remove: () => {}, style: {} })
};

// Load build.js
const buildJsResponse = await fetch("https://embedstreams.top/plr/build.js");
const buildJsText = await buildJsResponse.text();
eval(buildJsText); // Exposes globalThis.decrypt for character shift

// AES decryption configuration
const AES_KEY = "ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT";
const AES_IV = "STOPSTOPSTOPSTOP";
const BASE_URL = "https://rr.buytommy.top";

serve(async (req) => {
    // Handle /decrypt endpoint
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        const data = await req.json();
        const encrypted = data.encrypted; // Expecting the 'd' variable from website debugger
        const referer = data.referer || "https://embedstreams.top/embed/alpha/wwe-network/1";

        if (!encrypted || !globalThis.decrypt) {
            return new Response(JSON.stringify({ error: "Missing data or decrypt function" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        try {
            // Step 1: Apply character shift decryption (+47) from build.js
            const shifted = globalThis.decrypt(encrypted);
            console.log("Shifted:", shifted);

            // Step 2: Apply AES decryption
            const decrypted = AES.decrypt(
                { ciphertext: Base64.parse(shifted) },
                Utf8.parse(AES_KEY),
                { iv: Utf8.parse(AES_IV), mode: CTR, padding: NoPadding }
            ).toString(Utf8);

            console.log("Decrypted:", decrypted);

            // Step 3: Construct full M3U8 URL
            const m3u8Url = `${BASE_URL}${decrypted}`;
            console.log("Final M3U8 URL:", m3u8Url);

            return new Response(JSON.stringify({ decrypted: m3u8Url }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("Decryption error:", e.message);
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // Handle /fetch-m3u8 endpoint
    if (req.method === "POST" && req.url.endsWith("/fetch-m3u8")) {
        const { m3u8Url, cookies, referer } = await req.json();
        console.log("Request data:", { m3u8Url, cookies, referer });

        if (!m3u8Url) {
            console.log("Missing m3u8Url");
            return new Response(JSON.stringify({ error: "Missing m3u8Url" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Origin": "https://embedstreams.top",
            "Referer": referer || "https://embedstreams.top/",
            "Accept-Encoding": "br",
            "Cookie": cookies || "",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site"
        };
        console.log("Fetching with headers:", headers);

        try {
            const response = await fetch(m3u8Url, { headers });
            console.log("Response status:", response.status);
            console.log("Response headers:", Object.fromEntries(response.headers.entries()));
            const contentEncoding = response.headers.get("Content-Encoding")?.toLowerCase();
            console.log("Content-Encoding:", contentEncoding);
            const rawBytes = new Uint8Array(await response.arrayBuffer());
            console.log("Raw bytes (0):", rawBytes.slice(0, 100));

            let m3u8;
            if (contentEncoding == "br") {
                console.log("Decompressing Brotli:");
                const decompressed = decompress(rawBytes);
                m3u8 = new TextDecoder().decode(decompressed);
                console.log("Decompressed M3U8 (first 200 chars):", m3u8u8.slice(0, 200));
            } else {
                m3u8 = new TextDecoder().decode(rawBytes);
                console.log("Uncompressed M3U8 (first 200 chars):", m3u8Text.slice(0, 8, 200));
            });

            if (!m3u8.startsWith("#EXTM3U")) {
                console.error("Error Invalid M3U8 content:", m3u8.slice(0, 6, 200));
                return new Response(JSON.stringify({ "m3u8": m3u8, warning: "Invalid M3U8 content" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            console.log("Returning M3U8:", "m3u8.slice(0, 200));
            return new Response(JSON.stringify({ m3u8: m3u8 }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("Fetch error:", e.message);
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
    });
}, { port: 8000 });

console.log("Server running on Deno Deploy");