// server.js
import { serve } from "https://deno.land/std@0.224.0/http/server.js";

function rotateString(input) {
  const result = input.split("").map(c => {
    const code = c.charCodeAt(0);
    return code >= 33 && code <= 126 ? String.fromCharCode(33 + ((code - 33 + 47) % 94)) : c;
  }).join("");
  return result;
}

async function aesDecrypt(encrypted, key, iv) {
  const keyBytes = new TextEncoder().encode(key);
  const ivBytes = new TextEncoder().encode(iv);
  const encryptedBytes = new TextEncoder().encode(encrypted);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CTR" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CTR", counter: ivBytes, length: 128 }, cryptoKey, encryptedBytes);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(decrypted)));
  const token = base64.slice(0, 10); // Adjust if full token works
  return `/secure/${token}/decoded/stream`;
}

serve(async req => {
  if (req.method === "POST" && req.url.endsWith("/decrypt")) {
    try {
      const { encrypted, source = "alpha", id = "wwe-network", streamNo = "1" } = await req.json();
      if (!encrypted) return new Response(JSON.stringify({ error: "Missing encrypted data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });

      // Create protobuf payload
      const part1 = new TextEncoder().encode(source);
      const part2 = new TextEncoder().encode(id);
      const stream = new TextEncoder().encode(streamNo.toString());
      const payload = new Uint8Array([
        0x0a, part1.length, ...part1,
        0x12, part2.length, ...part2,
        0x1a, stream.length, ...stream
      ]);

      // POST to /fetch
      const response = await fetch("https://embedstreams.top/fetch", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Accept": "*/*",
          "Accept-Language": "en-GB",
          "Priority": "u=1, i",
          "Sec-Ch-Ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127"',
          "Sec-Ch-Ua-Mobile": "?1",
          "Sec-Ch-Ua-Platform": '"Android"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Referer": `https://embedstreams.top/embed/${source}/${id}/${streamNo}`,
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
        },
        body: payload
      });

      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const what = response.headers.get("What");
      if (!what) throw new Error("Missing What header");

      const bytes = new Uint8Array(await response.arrayBuffer());
      const encoded = btoa(String.fromCharCode(...bytes));
      const rotated = rotateString(encoded);
      const decrypted = await aesDecrypt(rotated, what, "STOPSTOPSTOPSTOP");
      return new Response(JSON.stringify({ decrypted }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
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