// main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as CryptoJS from "https://deno.land/x/crypto_js@v1.0.1/mod.ts"; // Import CryptoJS

// This is the character shifting function, matching 'r' from the website's bundle.js
// It's used internally by the website before the AES step.
globalThis.decrypt = (t: string): string => {
    return t.split("").map(function(e) {
        var n = e.charCodeAt(0);
        // This performs a character shift by 47, wrapping around printable ASCII characters (33 to 126)
        return n >= 33 && n <= 126 ? String.fromCharCode(33 + (n - 33 + 47) % 94) : e;
    }).join("");
};

// Main request handler for your Deno server
const handler = async (req) => { // Removed type annotations for smoother deployment
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        try {
            // The 'encrypted' value in the request body is expected to be the 'd' variable
            // from the website's JavaScript, which is the result of the first decryption (char shift).
            const { encrypted } = await req.json();

            // Define the AES Key ('Y' value you found during debugging)
            const aesKey = CryptoJS.enc.Utf8.parse("ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT");
            // Define the AES Initialization Vector (IV) from bundle.js
            const aesIv = CryptoJS.enc.Utf8.parse("STOPSTOPSTOPSTOP");

            // Perform the AES decryption
            // The 'encrypted' input (the 'd' variable) is Base64 encoded, so we parse it as such.
            const decryptedWords = CryptoJS.AES.decrypt(
                { ciphertext: CryptoJS.enc.Base64.parse(encrypted) },
                aesKey,
                {
                    mode: CryptoJS.mode.CTR, // Counter mode
                    iv: aesIv,               // Initialization Vector
                    padding: CryptoJS.pad.NoPadding // No padding expected
                }
            );

            // Convert the decrypted data (Words object) into a UTF-8 string
            const finalDecryptedPath = decryptedWords.toString(CryptoJS.enc.Utf8);

            // Construct the final M3U8 URL using the base URL found in bundle.js
            const baseUrl = "https://rr.buytommy.top";
            const finalM3U8Url = baseUrl + finalDecryptedPath;

            // Return the decrypted URL in a JSON response
            return new Response(JSON.stringify({ decrypted: finalM3U8Url }), {
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

    // Return a 404 Not Found response for any other requests
    return new Response("Not Found", { status: 404 });
};

// Start the Deno server
serve(handler);
