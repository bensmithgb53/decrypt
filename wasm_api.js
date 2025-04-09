// server.ts
import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

console.log("Starting WASM API server...");

globalThis.window = globalThis;
globalThis.document = { 
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }), 
    createElement: () => ({ remove: () => {}, style: {} })
};

const wasmExecResponse = await fetch("https://embedstreams.top/plr/wasm_exec.js");
eval(await wasmExecResponse.text());

const go = new Go();
const wasmResponse = await fetch("https://embedstreams.top/plr/main.wasm");
const wasmModule = await WebAssembly.instantiate(await wasmResponse.arrayBuffer(), go.importObject);
go.run(wasmModule.instance);

setInterval(() => {
    if (go._inst && typeof go._inst.exports.go_scheduler === "function") {
        go._inst.exports.go_scheduler();
    }
}, 100);

serve(async (req) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Original /decrypt endpoint
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
            return new Response(JSON.stringify({ error: e.message }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // New /fetch-m3u8 endpoint (no Brotli for now)
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
            "Cookie": cookies || "",
        };

        try {
            const response = await fetch(m3u8Url, { headers });
            const m3u8Text = await response.text();
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
