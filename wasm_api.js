// main.ts (or app.ts)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as CryptoJS from "https://deno.land/x/crypto_js@v1.0.1/mod.ts"; // Import CryptoJS

// Your existing character shifting function (globalThis.decrypt from the pastebin)
globalThis.decrypt = (t) => {
    // ... (paste your character shifting function here) ...
    // Make sure it matches the exact function 'r' from bundle.js
    // For example, if 'r' is:
    // return x.split("").map((function(x){var i = x.charCodeAt(0); return i >= 33 && i <= 126 ? String.fromCharCode(33 + (i - 33 + 47) % 94) : x })).join("")
    // Ensure this is what globalThis.decrypt does.
    return t.split("").map(function(e) {
        var n = e.charCodeAt(0);
        return n >= 33 && n <= 126 ? String.fromCharCode(33 + (n - 33 + 47) % 94) : e;
    }).join("");
};


const handler = async (req: Request): Promise<Response> => {
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        try {
            const { encrypted } = await req.json();

            // STEP 1: Base64 decode the input from the "What" header if it's the full flow
            // From your console: "ISEEYOUmUwWHQgXyQbGDcmBEYvcVPnsH" was Base64 decoded to your Uint8Array
            // But the 'd' value we got from the breakpoint is already after the first shift.
            // So, 'encrypted' here is the 'd' variable from the breakpoint:
            // "QGARe3+7JBJpnozS+u9dBS2ptzbgmiz3gOVsLd40z8+9tstoTMj5lj9gvB9RTdsTQ+jSGMxBoSmPCCU="

            // Your existing decryption (character shift)
            // This assumes 'encrypted' coming into this function IS the result of Base64 -> Deserialize -> B.getU() -> r()
            // In the breakpoint, 'd' was already the result of the char shift.
            // So, for this specific request, the 'encrypted' value should be 'd'.
            const intermediateDecrypted = encrypted; // The 'd' value from breakpoint

            // Define the AES Key and IV
            const aesKey = CryptoJS.enc.Utf8.parse("ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT"); // The 'Y' value you found!
            const aesIv = CryptoJS.enc.Utf8.parse("STOPSTOPSTOPSTOP"); // The static IV from bundle.js

            // Perform the AES decryption
            const decryptedWords = CryptoJS.AES.decrypt(
                { ciphertext: CryptoJS.enc.Base64.parse(intermediateDecrypted) }, // Input 'd' is Base64 encoded
                aesKey,
                {
                    mode: CryptoJS.mode.CTR,
                    iv: aesIv,
                    padding: CryptoJS.pad.NoPadding
                }
            );

            // Convert decrypted words to UTF8 string
            const finalDecrypted = decryptedWords.toString(CryptoJS.enc.Utf8);

            // Construct the final URL (from bundle.js: "https://rr.buytommy.top" I.toString(b.enc.Utf8);)
            const baseUrl = "https://rr.buytommy.top";
            const finalUrl = baseUrl + finalDecrypted;


            return new Response(JSON.stringify({ decrypted: finalUrl }), {
                headers: { "Content-Type": "application/json" },
            });

        } catch (error) {
            console.error("Error during decryption:", error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    return new Response("Not Found", { status: 404 });
};

serve(handler);
