// Function to rotate characters for decryption
function rotateString(input) {
  try {
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
  } catch (error) {
    console.error("Error in rotateString:", error.message);
    throw error;
  }
}

// Function to decrypt AES-CTR
async function aesDecrypt(encrypted, key, iv) {
  try {
    const keyBytes = new TextEncoder().encode(key);
    const ivBytes = new TextEncoder().encode(iv);
    const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

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
  } catch (error) {
    console.error("Error in aesDecrypt:", error.message);
    throw error;
  }
}

// Function to create the binary request body
function createRequestBody(channel, streamNo) {
  try {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint32(0, 1, true);
    view.setUint32(4, channel.length, true);
    const channelBytes = new TextEncoder().encode(channel);
    const finalBuffer = new Uint8Array(buffer.byteLength + channelBytes.length);
    finalBuffer.set(new Uint8Array(buffer), 0);
    finalBuffer.set(channelBytes, buffer.byteLength);
    return finalBuffer;
  } catch (error) {
    console.error("Error in createRequestBody:", error.message);
    throw error;
  }
}

// Main function to get the m3u8 URL
async function getM3u8Url(channelId, streamNo) {
  try {
    // Create request body
    const requestBody = createRequestBody(channelId, streamNo);

    // Make POST request
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

    // Encode to base64
    const encodedData = btoa(String.fromCharCode(...responseBytes));
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
    console.error("Error generating m3u8 URL:", error.message);
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
    console.error("Failed to generate URL:", error.message);
  }
}

main();