// server.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function rotateString(input) {
  console.log("Input to rotate:", input);
  const result = input
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(33 + ((code - 33 + 47) % 94));
      }
      return char;
    })
    .join("");
  console.log("Rotated:", result);
  return result;
}

async function aesDecrypt(encrypted, key, iv) {
  try {
    const keyBytes = new TextEncoder().encode(key);
    const ivBytes = new TextEncoder().encode(iv);
    const encryptedBytes = new TextEncoder().encode(encrypted);

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

    const decryptedBytes = new Uint8Array(decrypted);
    console.log("Decrypted bytes (hex):", Array.from(decryptedBytes).map(b => b.toString(16).padStart(2, "0")).join(""));

    // Base64 encode to match token
    const base64 = btoa(String.fromCharCode(...decryptedBytes));
    console.log("Decrypted base64:", base64);
    // Truncate to 10 chars (adjust if VLC tests show full token works)
    const token = base64.slice(0, 10);
    console.log("Truncated token:", token);
    return `/secure/${token}/alpha/stream/wwe-network/1/playlist.m3u8`;
  } catch (error) {
    console.error("AES decrypt error:", error.message);
    throw error;
  }
}

function createRequestBody(channelPart1, channelPart2, streamNo) {
  const part1Bytes = new TextEncoder().encode(channelPart1);
  const part2Bytes = new TextEncoder().encode(channelPart2);
  const streamNoBytes = new TextEncoder().encode(streamNo);
  const payload = new Uint8Array([
    0x0a, part1Bytes.length, ...part1Bytes,
    0x12, part2Bytes.length, ...part2Bytes,
    0x1a, streamNoBytes.length, ...streamNoBytes,
  ]);
  console.log("Request body (hex):", Array.from(payload).map(b => b.toString(16).padStart(2, "0")).join(" "));
  return payload;
}

async function getM3u8Url(channelPart1 = "alpha", channelPart2 = "wwe-network", streamNo = "1") {
  try {
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
    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Error text:", errorText);
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const whatHeader = response.headers.get("What");
    if (!whatHeader) {
      throw new Error("Missing What header");
    }
    console.log("What header:", whatHeader);

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    console.log("Bytes:", bytes.length);
    const encodedData = btoa(String.fromCharCode(...bytes));
    console.log("Base64 encoded:", encodedData);
    const rotatedData = rotateString(encodedData);
    const decrypted = await aesDecrypt(rotatedData, whatHeader, "STOPSTOPSTOPSTOPPUT");
    console.log("Decrypted path:", decrypted);
    return new Blob([decryptedBytes], {type: 'video/mp2t'});");
    return decrypted;
  } catch (error) {
    console.error("getM3u8Url error:", error.message);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "POST" && req.url.endsWith("/fetch-m3u8")) {
    try {
      const { channelPart1 = "alpha", channelPart2 = "wwe-network", streamNo = "1" } = await req.json();
      console.log("Request params:", { channelPart1, channelPart2, streamNo });
      const m3u8Url = await getM3u8Url(channelPart1, channelPart2, streamNo);
      console.log("Generated M3u8 URL:", m3u8Url);
      return new Response(JSON.stringify({ m3u8: m3u8Url }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
}, { port: 8000 });

console.log("Server running on Deno Deploy");