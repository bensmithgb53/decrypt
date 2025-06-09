// Required imports
import { encodeBase64, decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// Function to rotate characters for decryption
function rotateString(input) {
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

// Function to decrypt AES-CTR
async function aesDecrypt(encrypted, key, iv) {
  const keyBytes = new TextEncoder().encode(key);
  const ivBytes = new TextEncoder().encode(iv);
  const encryptedBytes = decodeBase64(encrypted);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CTR",
      counter: ivBytes,
      length: 128,
    },
    cryptoKey,
    encryptedBytes
  );

  return new TextDecoder().decode(decrypted);
}

// Function to create the binary request body (simplified protobuf-like structure)
function createRequestBody(channel, streamNo) {
  // Simplified representation of the protobuf RequestBody
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  
  // Set some basic fields
  view.setUint32(0, 1, true);
  view.setUint32(4, channel.length, true);
  const channelBytes = new TextEncoder().encode(channel);
  const finalBuffer = new Uint8Array(buffer.byteLength + channelBytes.length);
  finalBuffer.set(new Uint8Array(buffer), 0);
  finalBuffer.set(channelBytes, buffer.byteLength);
  
  return finalBuffer;
}

// Main function to get the m3u8 URL
async function getM3u8Url(channelId, streamNo) {
  try {
    // Create request body
    const requestBody = createRequestBody(channelId, streamNo);

    // Make POST request to fetch endpoint
    const response = await fetch("https://embedstreams.top/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    // Get the 'What' header
    const whatHeader = response.headers.get("What");
    if (!whatHeader) {
      throw new Error("Missing 'What' header");
    }

    // Get response body as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    const responseBytes = new Uint8Array(arrayBuffer);

    // Decode base64 response
    const encodedData = encodeBase64(responseBytes);
    const rotatedData = rotateString(encodedData);

    // Decrypt the rotated data
    const decrypted = await aesDecrypt(
      rotatedData,
      whatHeader,
      "STOPSTOPSTOPSTOP"
    );

    // Construct final URL
    const finalUrl = `https://rr.buytommy.top${decrypted}`;
    return finalUrl;
  } catch (error) {
    console.error("Error generating m3u8 URL:", error);
    throw error;
  }
}

// Example usage
async function main() {
  const channelId = "alpha-wwe-network-1";
  const streamNo = 1;
  
  try {
    const m3u8Url = await getM3u8Url(channelId, streamNo);
    console.log("Generated m3u8 URL:", m3u8Url);
  } catch (error) {
    console.error("Failed to generate URL:", error);
  }
}

main();