// server.ts - Adding CORS Headers
import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";

console.log("Starting API server (using direct JS decryption)...");

// Mock window and document for compatibility
globalThis.window = globalThis;
globalThis.document = { 
    querySelector: (selector) => {
        if (selector === "button") return { remove: () => {}, addEventListener: () => {} };
        return { appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 };
    },
    createElement: () => ({ remove: () => {}, style: {} }),
    body: { insertAdjacentHTML: () => {}, appendChild: () => {} }
};

// --- DIRECT JAVASCRIPT DECRYPTION FUNCTION ---
globalThis.decrypt = function(encryptedString) {
    return encryptedString.split("").map((char) => {
        const charCode = char.charCodeAt(0);
        if (charCode >= 33 && charCode <= 126) {
            return String.fromCharCode(33 + ((charCode - 33 + 47) % 94));
        }
        return char;
    }).join("");
};

console.log("Decryption function 'globalThis.decrypt' loaded successfully.");

serve(async (req) => {
    // Define common CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*", // Allows requests from any origin. For production, consider specific origins.
        "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and OPTIONS methods
        "Access-Control-Allow-Headers": "Content-Type", // Allow Content-Type header
    };

    // Handle CORS preflight requests (OPTIONS method)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204, // No Content
            headers: corsHeaders,
        });
    }

    // --- /decrypt endpoint ---
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        try {
            const data = await req.json();
            const encrypted = data.encrypted;
            
            if (!encrypted || typeof globalThis.decrypt !== 'function') {
                return new Response(JSON.stringify({ error: "Invalid request payload." }), { 
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" } // Add CORS headers to error response
                });
            }

            console.log("Attempting decryption...");
            const decrypted = globalThis.decrypt(encrypted);
            console.log("Decrypted:", decrypted);

            return new Response(JSON.stringify({ decrypted: decrypted }), { 
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" } // Add CORS headers to success response
            });
        } catch (e) {
            console.error("Error processing /decrypt request:", e.message);
            return new Response(JSON.stringify({ error: "Failed to parse request JSON. Ensure valid JSON is sent.", details: e.message }), { 
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" } // Add CORS headers to error response
            });
        }
    }

    // --- /fetch-m3u8 endpoint ---
    if (req.method === "POST" && req.url.endsWith("/fetch-m3u8")) {
        try {
            const { m3u8Url, cookies, referer } = await req.json();
            console.log("Request data for /fetch-m3u8:", { m3u8Url, cookies, referer });

            if (!m3u8Url) {
                return new Response(JSON.stringify({ error: "Missing m3u8Url" }), { 
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Origin": "https://embedstreams.top",
                "Referer": referer || "https://embedstreams.top/",
                "Accept-Encoding": "br",
                "Cookie": cookies || "",
                "Connection": "keep-alive",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
            };
            console.log("Fetching M3U8 with headers:", headers);

            const response = await fetch(m3u8Url, { headers });
            const contentEncoding = response.headers.get("Content-Encoding")?.toLowerCase();
            const rawBytes = new Uint8Array(await response.arrayBuffer());

            let m3u8Text;
            if (contentEncoding === "br") {
                m3u8Text = new TextDecoder().decode(decompress(rawBytes));
            } else {
                m3u8Text = new TextDecoder().decode(rawBytes);
            }

            if (!m3u8Text.startsWith("#EXTM3U")) {
                console.warn("Fetched content does not start with #EXTM3U:", m3u8Text.slice(0, 100));
                return new Response(JSON.stringify({ m3u8: m3u8Text, warning: "Content might not be a valid M3U8." }), { 
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({ m3u8: m3u8Text }), { 
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("Error processing /fetch-m3u8 request:", e.message);
            return new Response(JSON.stringify({ error: "Failed to fetch M3U8.", details: e.message }), { 
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
    }

    // Default response for unhandled paths
    return new Response("Not Found", { 
        status: 404,
        headers: corsHeaders // Even for 404, include CORS headers to avoid browser console noise
    });
}, { port: 8000 });

console.log("Server running on http://localhost:8000");

