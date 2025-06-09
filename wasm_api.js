// server.ts - Corrected for Deno Deploy type annotation parsing in function signature
import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

console.log("Starting API server (using direct JS decryption)...");

// Mock window and document (still good practice as some JS might rely on them,
// e.g., the Clappr player setup and body.insertAdjacentHTML)
globalThis.window = globalThis;
globalThis.document = { 
    // Fix: Removed ': string' type annotation for 'selector' parameter
    querySelector: (selector) => { 
        if (selector === "button") return { remove: () => {}, addEventListener: () => {} };
        return { appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 };
    },
    createElement: () => ({ remove: () => {}, style: {} }),
    body: { insertAdjacentHTML: () => {}, appendChild: () => {} } // Crucial for player HTML
};

// --- DIRECT JAVASCRIPT DECRYPTION FUNCTION ---
// Replicating the 'r' function found in bundle.js snippet
// FIX: Removed ': string' type annotations from both parameter and return type
globalThis.decrypt = function(encryptedString) { 
    // console.log("Decrypting string:", encryptedString); // Uncomment for debugging
    return encryptedString.split("").map((char) => { // Fix: Removed ': string' type annotation for 'char'
        const charCode = char.charCodeAt(0);
        // Only shift characters within ASCII printable range 33-126 (inclusive)
        if (charCode >= 33 && charCode <= 126) {
            // Formula: 33 + ( (current_code - 33) + 47 ) % 94
            // 94 is the number of printable ASCII characters from 33 to 126 (126 - 33 + 1 = 94)
            // 47 is the shift amount
            return String.fromCharCode(33 + ((charCode - 33 + 47) % 94));
        }
        // Return character unchanged if it's outside the specified range
        return char;
    }).join("");
};

console.log("Decryption function 'globalThis.decrypt' loaded successfully.");

// --- No WASM loading needed anymore for decryption! ---
// All previous WASM-related `fetch`, `eval`, `new Go()`, `go.run()`, and `setInterval`
// for `go_scheduler` have been removed, as they are no longer necessary for decryption.

serve(async (req) => {
    // Handle /decrypt endpoint
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        const data = await req.json();
        const encrypted = data.encrypted;
        // Referer is primarily for the browser's context, less critical for the decrypt function itself
        const referer = data.referer || "https://embedstreams.top/embed/alpha/sky-sports-darts/1"; 
        
        if (!encrypted || typeof globalThis.decrypt !== 'function') {
            console.error("Missing data or decrypt function not available:", typeof globalThis.decrypt);
            return new Response(JSON.stringify({ error: "Missing data or decrypt function" }), { 
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        try {
            console.log("Attempting decryption...");
            const decrypted = globalThis.decrypt(encrypted); // Call our direct JS decrypt function
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

    // Handle /fetch-m3u8 endpoint (remains largely the same as its logic was fine)
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36", // Slightly updated User-Agent
            "Accept": "*/*",
            "Origin": "https://embedstreams.top",
            "Referer": referer || "https://embedstreams.top/",
            "Accept-Encoding": "br", // Brotli compression
            "Cookie": cookies || "",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
            // Add other headers that your browser sends if necessary (e.g., Sec-Ch-Ua, etc.)
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
                console.error("Invalid M3U8 content (does not start with #EXTM3U):", m3u8Text.slice(0, 200));
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

console.log("Server running on http://localhost:8000");
