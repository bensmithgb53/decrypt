import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { AesCtr } from "https://deno.land/x/crypto@v0.11.0/aes.ts";

console.log("Starting M3U8 decryption server...");

// AES decryption parameters from bundle.js findings
const AES_KEY = new TextEncoder().encode("ISEEYOUzXnwlulEpMNtMvQZQsVZmJpXT");
const AES_IV = new TextEncoder().encode("STOPSTOPSTOPSTOP");
const BASE_URL = "https://rr.buytommy.top";

// Character-shifting decryption (shift by +47 for printable ASCII)
function shiftDecrypt(input) {
  return input
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(((code - 33 + 47) % 94) + 33);
      }
      return char;
    })
    .join("");
}

async function decryptM3u8Url(encrypted) {
  if (!encrypted) {
    throw new Error("Missing encrypted data");
  }

  // Step 1: Base64 decode
  let decoded;
  try {
    decoded = atob(encrypted);
  } catch (e) {
    throw new Error("Base64 decoding failed: " + e.message);
  }

  // Step 2: Character-shifting decryption
  const shifted = shiftDecrypt(decoded);

  // Step 3: AES-CTR decryption
  try {
    const cipher = new AesCtr(AES_KEY, AES_IV);
    const encryptedBytes = new TextEncoder().encode(shifted);
    const decryptedBytes = cipher.decrypt(encryptedBytes);
    const decrypted = new TextDecoder().decode(decryptedBytes);

    // Step 4: Append to base URL
    return BASE_URL + decrypted;
  } catch (e) {
    throw new Error("AES decryption failed: " + e.message);
  }
}

serve(async (req) => {
  if (req.method === "POST" && req.url.endsWith("/decrypt")) {
    try {
      const data = await req.json();
      const encrypted = data.encrypted;
      if (!encrypted) {
        return new Response(JSON.stringify({ error: "Missing encrypted data" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const decryptedUrl = await decryptM3u8Url(encrypted);
      console.log("Decrypted M3U8 URL:", decryptedUrl);
      return new Response(JSON.stringify({ m3u8Url: decryptedUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Decryption error:", e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
}, { port: 8000 });

console.log("Server running on Deno Deploy");