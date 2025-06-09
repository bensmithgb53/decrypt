// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

// Load CryptoJS components
let CryptoJS = {};
try {
    await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/core.min.js");
    await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/lib-typedarrays.min.js");
    CryptoJS.AES = (await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/aes.min.js")).default;
    CryptoJS.enc = {
        Utf8: (await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/enc-utf8.min.js")).default,
        Base64: (await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/enc-base64.min.js")).default
    };
    CryptoJS.mode = (await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/mode-ctr.min.js")).default;
    CryptoJS.pad = (await import("https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/pad-nopadding.min.js")).default;
    console.log("CryptoJS loaded successfully, AES available:", !!CryptoJS.AES);
} catch (e) {
    console.error("CryptoJS import error:", e.message);
}

console.log("Starting Deno decryption server...");

// Mock window and document for build.js compatibility
globalThis.window = globalThis;
globalThis.document = {
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }),
    createElement: () => ({ remove: () => {}, style: {} })
};

// Fallback character shift function (if build.js fails)
globalThis.decrypt = globalThis.decrypt || function(str) {
    return str.split('')
        .map(char => String.fromCharCode(char.charCodeAt(0) + 47))
        .join('');
};

// Load build.js
try {
    const buildJsResponse = await fetch("https://embedstreams.top/plr/build.js", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            "Accept": "*/*"
        }
    });
    if (!buildJsResponse.ok) {
        throw new Error(`HTTP error: ${buildJsResponse.status} ${buildJsResponse.statusText}`);
    }
    const buildJsText = await buildJsResponse.text();
    console.log("build.js content (first 200 chars):", buildJsText.slice(0, 200));
    eval(buildJsText); // Exposes globalThis.decrypt
    console.log("build.js loaded successfully, decrypt available:", !!globalThis.decrypt);
} catch (e) {
    console.error("build.js fetch/eval error:", e.message);
    console.log("Using fallback decrypt function");
}

serve(async (req) => {
    // Handle /decrypt endpoint
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        const data = await req.json();
        const encrypted = data.encrypted; // Expecting the 'd' variable
        const referer = data.referer || "https://embedstreams.top/embed/alpha/wwe-network/1";

        if (!encrypted || !globalThis.decrypt || !CryptoJS.AES) {
            return new Response(JSON.stringify({ error: "Missing data, decrypt function, or CryptoJS" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        try {
            // Step 1: Apply character shift decryption (+47)
            const shifted = globalThis.decrypt(encrypted);
            console.log("Shifted:", shifted);

            // Step 2: Apply AES decryption
            const decrypted = CryptoJS.AES.decrypt(
                { ciphertext: CryptoJS.enc.Base64.parse(shifted) },
                CryptoJS.enc.Utf8.parse("ISEEYOUmIQeEjoCgCnZFaKCgkqIlanYe"),
                { iv: CryptoJS.enc.Utf8.parse("STOPSTOPSTOPSTOP"), mode: CryptoJS.mode, padding: CryptoJS.pad }
            ).toString(CryptoJS.enc.Utf8);

            console.log("Decrypted:", decrypted);

            // Step 3: Construct full M3U8 URL
            const m3u8Url = `https://rr.buytommy.top${decrypted}`;
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
            return new Response(JSON.stringify({ error: "Missing m3u8Url" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0",
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
        try {
            const response = await fetch(m3u8Url, { headers });
            console.log("Response status:", response.status);
            console.log("Response headers:", Object.fromEntries(response.headers));
            const contentEncoding = response.headers.get("Content-Encoding")?.toLowerCase();
            console.log("Content-Encoding:", contentEncoding);
            const rawBytes = new Uint8Array(await response.arrayBuffer());
            console.log("Raw bytes (first 100):", rawBytes.slice(0, 100));

            let m3u8Text;
            if (contentEncoding === "br") {
                console.log("Decompressing Brotli...");
                const decompressed = decompress(rawBytes);
                m3u8Text = new TextDecoder().decode(decompressed);
                console.log("Decompressed M3U8 (first 200):", m3u8Text.slice(0, 200));
            } else {
                m3u8Text = new TextDecoder().decode(rawBytes);
                console.log("Uncompressed M3U8 (first 200):", m3u8Text.slice(0, 200));
            }

            if (!m3u8Text.startsWith("#EXTM3U")) {
                console.error("Invalid M3U8 content:", m3u8Text.slice(0, 200));
                return new Response(JSON.stringify({ m3u8: m3u8Text, warning: "Invalid M3U8 content" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            console.log("Returning M3U8:", m3u8Text.slice(0, 200));
            return new Response(JSON.stringify({ m3u8: m3u8Text }), {
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