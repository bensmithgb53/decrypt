// server.ts
import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

console.log("Starting WASM API server...");

// Mock window and document for WASM compatibility
globalThis.window = globalThis;
globalThis.document = { 
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }), 
    createElement: () => ({ remove: () => {}, style: {} })
};

// Load wasm_exec.js
const wasmExecResponse = await fetch("https://embedstreams.top/plr/wasm_exec.js");
eval(await wasmExecResponse.text());

// Initialize and run Go WASM
const go = new Go();
const wasmResponse = await fetch("https://embedstreams.top/plr/main.wasm");
const wasmModule = await WebAssembly.instantiate(await wasmResponse.arrayBuffer(), go.importObject);
go.run(wasmModule.instance);

// Scheduler for Go runtime
setInterval(() => {
    if (go._inst && typeof go._inst.exports.go_scheduler === "function") {
        go._inst.exports.go_scheduler();
    }
}, 100);

serve(async (req) => {
    // Handle /decrypt endpoint
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        const data = await req.json();
        const encrypted = data.encrypted;
        const referer = data.referer || "https://embedstreams.top/embed/alpha/sky-sports-darts/1";
        if (!encrypted || !globalThis.decrypt) {
            return new Response(JSON.stringify({ error: "Missing data or decrypt function" }), { 
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        try {
            const decrypted = globalThis.decrypt(encrypted);
            console.log("Decrypted:", decrypted);
            return new Response(JSON.stringify({ decrypted: decrypted }), { 
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

            // Pass through even if not perfect, for debugging
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
