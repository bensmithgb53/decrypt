// server.ts - Adding CORS Headers and Full Decryption Logic
// Updated Deno Standard Library version to improve compatibility.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"; // <--- UPDATED HERE
import { decompress } from "https://deno.land/x/brotli@0.1.7/mod.ts";
import * as CryptoJS from "https://deno.land/x/crypto_js@v1.0.1/mod.ts"; // Import CryptoJS

console.log("Starting API server (with full decryption and updated std version)...");

// Mock window and document for compatibility, though not strictly needed for this specific decryption logic.
globalThis.window = globalThis;
globalThis.document = {
    querySelector: (selector) => {
        if (selector === "button") return { remove: () => {}, addEventListener: () => {} };
        return { appendChild: () => {}, offsetHeight: 100, offsetWidth: 100 };
    },
    createElement: () => ({ remove: () => {}, style: {} }),
    body: { insertAdjacentHTML: () => {}, appendChild: () => {} }
};

// --- First Decryption Step: Character Shift (mimicking 'r' from bundle.js) ---
globalThis.decryptShift = function(encryptedString) {
    return encryptedString.split("").map((char) => {
        const charCode = char.charCodeAt(0);
        if (charCode >= 33 && charCode <= 126) {
            return String.fromCharCode(33 + ((charCode - 33 + 47) % 94));
        }
        return char;
    }).join("");
};

console.log("Decryption function 'globalThis.decryptShift' loaded.");

// --- Constants for AES Decryption ---
// The AES Key ('Y' value you found during debugging)
const AES_KEY = CryptoJS.enc.Utf8.parse("ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT");
// The AES Initialization Vector (IV) from bundle.js
const AES_IV = CryptoJS.enc.Utf8.parse("STOPSTOPSTOPSTOP");

console.log("AES Key and IV loaded.");

serve(async (req) => {
    // Define common CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight requests (OPTIONS method)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204, // No Content
            headers: corsHeaders,
        });
    }

    // --- /decrypt endpoint (Performs both character shift and AES decryption) ---
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        try {
            const data = await req.json();
            // Expected input 'encrypted' is the 'd' variable you get from the breakpoint:
            // "QGARe3+7JBJpnozS+u9dBS2ptzbgmiz3gOVsLd40z8+9tstoTMj5lj9gvB9RTdsTQ+jSGMxBoSmPCCU="
            const d_variable_from_breakpoint = data.encrypted;

            if (!d_variable_from_breakpoint) {
                return new Response(JSON.stringify({ error: "Missing 'encrypted' payload for decryption." }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            console.log("Attempting AES decryption...");

            // Perform the AES decryption
            // The input 'd_variable_from_breakpoint' is Base64 encoded, so we parse it as such.
            const decryptedWords = CryptoJS.AES.decrypt(
                { ciphertext: CryptoJS.enc.Base64.parse(d_variable_from_breakpoint) },
                AES_KEY,
                {
                    mode: CryptoJS.mode.CTR,
                    iv: AES_IV,
                    padding: CryptoJS.pad.NoPadding
                }
            );

            // Convert the decrypted data to a UTF-8 string
            const finalDecryptedPath = decryptedWords.toString(CryptoJS.enc.Utf8);

            // Construct the final M3U8 URL
            const baseUrl = "https://rr.buytommy.top";
            const finalM3U8Url = baseUrl + finalDecryptedPath;

            console.log("Decrypted M3U8 URL:", finalM3U8Url);

            return new Response(JSON.stringify({ decryptedM3U8Url: finalM3U8Url }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("Error processing /decrypt request:", e.message);
            return new Response(JSON.stringify({ error: "Failed to perform AES decryption. Ensure correct 'd' value.", details: e.message }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
    }

    // --- /fetch-m3u8 endpoint (Unchanged, for directly fetching M3U8 content) ---
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
        headers: corsHeaders
    });
}, { port: 8000 });

console.log("Server running on http://localhost:8000");
