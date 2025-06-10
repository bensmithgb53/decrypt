// server.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function rotateString(input) {
  return input.split("").map(c => {
    const code = c.charCodeAt(0);
    return code >= 33 && code <= 126 ? String.fromCharCode(33 + ((code - 33 + 47) % 94)) : c;
  }).join("");
}

async function aesDecrypt(encrypted, key, iv) {
  const keyBytes = new TextEncoder().encode(key);
  const ivBytes = new TextEncoder().encode(iv);
  const encryptedBytes = new TextEncoder().encode(encrypted);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CTR" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CTR", counter: ivBytes, length: 128 }, cryptoKey, encryptedBytes);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(decrypted)));
  return `/secure/${base64.slice(0, 10)}/${encrypted}/${key}/${iv}/playlist.m3u8`;
}

function createRequestBody(channelPart1, channelPart2, streamNo) {
  const part1Bytes = new TextEncoder().encode(channelPart1);
  const part2Bytes = new TextEncoder().encode(channelPart2);
  const streamNoBytes = new TextEncoder().encode(streamNo);
  return new Uint8Array([
    0x0a, part1Bytes.length, ...part1Bytes,
    0x12, part2Bytes.length, ...part2Bytes,
    0x1a, streamNoBytes.length, ...streamNoBytes,
  ]);
}

async function getM3u8Url(channelPart1 = "alpha", channelPart2 = "wwe-network", streamNo = "1") {
  const requestBody = createRequestBody(channelPart1, channelPart2, streamNo);
  const response = await fetch("https://embedstreams.top/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Accept": "*/*",
      "Accept-Language": "en-GB",
      "Priority": "u=1, i",
      "Sec-Ch-Ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Referer": `https://embedstreams.top/embed/${channelPart1}/${channelPart2}/${streamNo}`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    },
    body: requestBody,
  });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const whatHeader = response.headers.get("What");
  if (!whatHeader) throw new Error("Missing What header");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoded = btoa(String.fromCharCode(...bytes));
  const rotated = rotateString(encoded);
  const decrypted = await aesDecrypt(rotated, whatHeader, "STOPSTOPSTOPSTOP");
  return `https://rr.buytommy.top${decrypted}`;
}

serve(async (req) => {
  if (req.method === "POST" && req.url.endsWith("/fetch-m3u8")) {
    try {
      const { channelPart1 = "alpha", channelPart2 = "wwe-network", streamNo = "1" } = await req.json();
      const m3u8 = await getM3u8Url(channelPart1, channelPart2, streamNo);
      return new Response(JSON.stringify({ m3u8 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
}, { port: 8000 });