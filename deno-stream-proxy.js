import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

console.log("Starting WASM API server...");

// Mock window/document for WASM compatibility
globalThis.window = globalThis;
globalThis.document = { 
    querySelector: () => ({ appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 }), 
    createElement: () => ({ remove: () => {}, style: {} })
};

// Load WASM exec and module
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

// Headers from your Python script
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    "Referer": "https://embedstreams.top/",
    "Cookie": "__ddg1_=Vi3RmtqoQRb8DffOJ28q; __ddg8_=1iCJjqg0w3AzTvUP; __ddg9_=82.46.16.114; __ddg10_=1744124631"
};

// Target URL from your Python script
const TARGET_URL = "https://rr.buytommy.top/s/jRwpGkyCKixMn0_IvGQwSIRPS3AwmORsOtxNwb7Zk7kON1bB48UseifrZNs3LF3Y/wFy8dycpF4kOjorpSKe2x5evFOqvlux9l22PedN1FY83gL5R4EN75OTbPchEFvE0mFOTKk-oQgQsqPkX4ceOlNHG4G4GKyfL7E8WJNqdnHA/-bqMzx-wDPy1f-QIeIsYEqPkoNpFrOkTq2rWqQqRV6jUdUSJU382DsMStbO58P6g/strm.m3u8?md5=ZN7hQor2a8LYg0KzDv9Oig&expiry=1744136845";
const BASE_URL = "http://localhost:8000";

serve(async (req) => {
    const url = new URL(req.url, `http://${req.headers.get("host")}`);

    // Serve the .m3u8 playlist
    if (url.pathname === "/stream") {
        try {
            const response = await fetch(TARGET_URL, { headers: HEADERS });
            const data = await response.text();
            const lines = data.split("\n");
            const rewrittenLines = lines.map(line => {
                if (line.startsWith("#EXT-X-KEY:")) {
                    const keyMatch = line.match(/URI="([^"]+)"/);
                    if (keyMatch) {
                        const keyUrl = keyMatch[1];
                        const newKeyUrl = `${BASE_URL}/key${keyUrl.startsWith("/") ? keyUrl : "/" + keyUrl}`;
                        return line.replace(keyMatch[1], newKeyUrl);
                    }
                } else if (line.trim() && !line.startsWith("#")) {
                    const segmentUrl = line.includes("corsproxy.io") ? line.split("url=")[1] : line;
                    return `${BASE_URL}/segments/${encodeURIComponent(segmentUrl)}`;
                }
                return line;
            });
            const rewrittenData = rewrittenLines.join("\n");
            console.log("Serving rewritten m3u8:\n", rewrittenData);

            return new Response(rewrittenData, {
                status: 200,
                headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Access-Control-Allow-Origin": "*",
                    "Connection": "keep-alive"
                }
            });
        } catch (e) {
            console.error("Error fetching m3u8:", e);
            return new Response("Error fetching playlist", { status: 500 });
        }
    }

    // Serve the key
    if (url.pathname.startsWith("/key/")) {
        try {
            const keyPath = url.pathname.replace("/key", "");
            const keyUrl = `https://rr.buytommy.top${keyPath}`;
            const response = await fetch(keyUrl, { headers: HEADERS });
            const data = await response.arrayBuffer();
            console.log(`Fetched key: ${keyUrl}, size: ${data.byteLength} bytes`);

            return new Response(data, {
                status: 200,
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Access-Control-Allow-Origin": "*",
                    "Content-Length": data.byteLength.toString()
                }
            });
        } catch (e) {
            console.error("Error fetching key:", e);
            return new Response("Error fetching key", { status: 500 });
        }
    }

    // Serve segments
    if (url.pathname.startsWith("/segments/")) {
        try {
            const segmentUrl = decodeURIComponent(url.pathname.replace("/segments/", ""));
            const response = await fetch(segmentUrl, { headers: HEADERS });
            const data = await response.arrayBuffer();
            console.log(`Fetched segment: ${segmentUrl}, size: ${data.byteLength} bytes`);

            return new Response(data, {
                status: 200,
                headers: {
                    "Content-Type": "video/mp2t",
                    "Access-Control-Allow-Origin": "*",
                    "Content-Length": data.byteLength.toString()
                }
            });
        } catch (e) {
            console.error("Error fetching segment:", e);
            return new Response("Error fetching segment", { status: 500 });
        }
    }

    // Existing decrypt endpoint
    if (req.method === "POST" && url.pathname === "/decrypt") {
        const data = await req.json();
        const encrypted = data.encrypted;
        const referer = data.referer || "https://embedstreams.top/embed/alpha/sky-sports-darts/1";
        if (!encrypted || !globalThis.decrypt) {
            return new Response(JSON.stringify({ error: "Missing data or decrypt function" }), { status: 400 });
        }
        try {
            const decrypted = globalThis.decrypt(encrypted);
            return new Response(JSON.stringify({ decrypted: decrypted }), { status: 200 });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response("Not Found", { status: 404 });
}, { port: 8000 });

console.log("Server running on Deno Deploy at http://localhost:8000");
