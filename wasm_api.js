// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

console.log("Starting m3u8 API server...");

function rotateString(input: string): string {
  return input
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(33 + ((code - 33 + 47) % 94));
      }
      return char;
    })
    .join("");
}

async function aesDecrypt(encrypted: string, key: string, iv: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const ivBytes = new TextEncoder().encode(iv);
  const encryptedBytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CTR",
      counter: ivBytes,
      length: 128,
    },
    cryptoKey,
    encryptedBytes,
  );

  return new TextDecoder().decode(decrypted);
}

function createRequestBody(channelPart1: string, channelPart2: string, streamNo: string): Uint8Array {
  const rawPayload = [
    0x0a, 0x05, 0x61, 0x6c, 0x70, 0x68, 0x61, // part1: "alpha"
    0x12, 0x0b, 0x77, 0x77, 0x65, 0x2d, 0x6e, 0x65, 0x74, 0x77, 0x6f, 0x72, 0x6b, // part2: "wwe-network"
    0x1a, 0x01, 0x31, // streamNo: "1"
  ];
  return new Uint8Array(rawPayload);
}

async function getM3u8Url(channelPart1: string, channelPart2: string, streamNo: string): Promise<string> {
  const requestBody = createRequestBody(channelPart1, channelPart2, streamNo);
  console.log("Request body (hex):", Array.from(requestBody).map((b) => b.toString(16).padStart(2, "0")).join(" "));
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
      "Referer": "https://embedstreams.top/embed/alpha/wwe-network/1",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    },
    body: requestBody,
  });
  console.log("Response status:", response.status);
  console.log("Response headers:", [...response.headers]);
  if (!response.ok) {
    const errorText = await response.text();
    console.log("Response error text:", errorText);
    throw new Error(`Fetch failed: ${response.status}`);
  }
  const whatHeader = response.headers.get("What");
  if (!whatHeader) {
    throw new Error("Missing What header");
  }
  const arrayBuffer = await response.arrayBuffer();
  console.log("Response bytes:", new Uint8Array(arrayBuffer).length);
  const encodedData = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const rotatedData = rotateString(encodedData);
  const decrypted = await aesDecrypt(rotatedData, whatHeader, "STOPSTOPSTOPSTOP");
  return `https://rr.buytommy.top${decrypted}`;
}

serve(async (req: Request) => {
  if (req.method === "POST" && req.url.endsWith("/fetch-m3u8")) {
    try {
      const { channelPart1 = "alpha", channelPart2 = "wwe-network", streamNo = "1" } = await req.json();
      const m3u8Url = await getM3u8Url(channelPart1, channelPart2, streamNo);
      return new Response(JSON.stringify({ m3u8: m3u8Url }), {
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
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
});