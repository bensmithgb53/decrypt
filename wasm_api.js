// main.ts

// Import necessary modules from Deno's standard library and the CryptoJS library
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as CryptoJS from "https://deno.land/x/crypto_js@v1.0.1/mod.ts";

// Define the global decryption function (character shifting by 47).
// This function mimics the 'r' function found in the website's bundle.js.
// Type annotations have been removed to ensure smoother deployment on Deno Deploy.
globalThis.decrypt = (t) => {
    // Split the input string into an array of characters, map each character, and then join them back.
    return t.split("").map(function(e) {
        var n = e.charCodeAt(0); // Get the ASCII/Unicode value of the character

        // Apply the character shift:
        // If the character is a printable ASCII character (between ASCII 33 '!' and 126 '~'),
        // shift it by 47 positions, wrapping around within that range using the modulo operator (%).
        // Otherwise, keep the character as is.
        return n >= 33 && n <= 126 ? String.fromCharCode(33 + (n - 33 + 47) % 94) : e;
    }).join(""); // Join the processed characters back into a single string
};

// Define the main request handler for your Deno server.
// This function processes incoming POST requests to the /decrypt endpoint.
// Type annotations have been removed for compatibility with Deno Deploy's transpiler.
const handler = async (req) => {
    // Check if the request is a POST method and targets the '/decrypt' endpoint
    if (req.method === "POST" && req.url.endsWith("/decrypt")) {
        try {
            // Parse the request body as JSON.
            // We expect a JSON object with an 'encrypted' property.
            // This 'encrypted' value should be the 'd' variable obtained from the website's debugger.
            const { encrypted } = await req.json();

            // Define the AES Key (which was the 'Y' value found during debugging).
            // It's parsed as UTF-8 as required by CryptoJS.
            const aesKey = CryptoJS.enc.Utf8.parse("ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT");

            // Define the AES Initialization Vector (IV), which was statically found in bundle.js.
            // Also parsed as UTF-8.
            const aesIv = CryptoJS.enc.Utf8.parse("STOPSTOPSTOPSTOP");

            // Perform the final AES decryption step.
            // The 'encrypted' input (the 'd' variable) is Base64 encoded, so we instruct CryptoJS
            // to parse its ciphertext from Base64.
            const decryptedWords = CryptoJS.AES.decrypt(
                { ciphertext: CryptoJS.enc.Base64.parse(encrypted) }, // Input ciphertext (from 'd' variable)
                aesKey, // The AES key
                {
                    mode: CryptoJS.mode.CTR,         // AES Counter Mode (CTR)
                    iv: aesIv,                       // The Initialization Vector
                    padding: CryptoJS.pad.NoPadding  // No padding scheme
                }
            );

            // Convert the decrypted data (which is a CryptoJS WordArray object) into a UTF-8 string.
            const finalDecryptedPath = decryptedWords.toString(CryptoJS.enc.Utf8);

            // Construct the complete M3U8 URL.
            // The base URL was also found in the website's bundle.js.
            const baseUrl = "https://rr.buytommy.top";
            const finalM3U8Url = baseUrl + finalDecryptedPath;

            // Return the final decrypted M3U8 URL in a JSON response.
            return new Response(JSON.stringify({ decrypted: finalM3U8Url }), {
                headers: { "Content-Type": "application/json" },
            });

        } catch (error) {
            // If any error occurs during the decryption process, log it and return a 500 Internal Server Error.
            console.error("Error during decryption:", error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    // For any requests that are not POST to /decrypt, return a 404 Not Found response.
    return new Response("Not Found", { status: 404 });
};

// Start the Deno HTTP server using the defined handler function.
// It will listen for incoming requests.
serve(handler);
