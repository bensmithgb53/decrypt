// server.ts
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

console.log("Starting WASM API server...");

// Mock window and document for WASM compatibility
globalThis.window = globalThis;
globalThis.document = { 
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }), 
    createElement: () => ({ remove: () => {}, style: {} })
};

// Load wasm_exec.js
try {
    const wasmExecResponse = await fetch("https://embedstreams.top/plr/wasm_exec.js");
    eval(await wasmExecResponse.text());
} catch (e) {
    console.error("Failed to load wasm_exec.js:", e.message);
}

// Initialize and run Go WASM
const go = new Go();
try {
    const wasmResponse = await fetch("https://embedstreams.top/plr/main.wasm");
    const wasmModule = await WebAssembly.instantiate(await wasmResponse.arrayBuffer(), go.importObject);
    go.run(wasmModule.instance);
} catch (e) {
    console.error("Failed to load or run WASM:", e.message);
}

// Scheduler for Go runtime
setInterval(() => {
    if (go._inst && typeof go._inst.exports.go_scheduler === "function") {
        go._inst.exports.go_scheduler();
    }
}, 100);

serve(async (req) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle /decrypt endpoint
    if (req.method === "POST" && path === "/decrypt") {
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
    if (req.method === "POST" && path === "/fetch-m3u8") {
        const { m3u8Url, cookies, referer } = await req.json();

        if (!m3u8Url) {
            return new Response(JSON.stringify({ error: "Missing m3u8Url" }), { 
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
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
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("M3U8 fetch error:", e.message);
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
