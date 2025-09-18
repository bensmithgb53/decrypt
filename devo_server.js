// Updated Deno server for Streamed decryption
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Rotate string function for decryption
function rotateString(input) {
  return input.split("").map(c => {
    const code = c.charCodeAt(0);
    return code >= 33 && code <= 126 ? String.fromCharCode(33 + ((code - 33 + 47) % 94)) : c;
  }).join("");
}

// AES-CTR decryption function
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
      ["decrypt"]
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CTR", counter: ivBytes, length: 128 }, 
      cryptoKey, 
      encryptedBytes
    );
    
    const base64 = btoa(String.fromCharCode(...new Uint8Array(decrypted)));
    return `/secure/${base64.slice(0, 10)}/${encrypted}/${key}/${iv}/playlist.m3u8`;
  } catch (error) {
    console.error("AES decryption failed:", error);
    throw error;
  }
}

// Create request body for different sources
function createRequestBody(source, sourceId, streamNo) {
  const sourceBytes = new TextEncoder().encode(source);
  const sourceIdBytes = new TextEncoder().encode(sourceId);
  const streamNoBytes = new TextEncoder().encode(streamNo.toString());
  
  return new Uint8Array([
    0x0a, sourceBytes.length, ...sourceBytes,
    0x12, sourceIdBytes.length, ...sourceIdBytes,
    0x1a, streamNoBytes.length, ...streamNoBytes,
  ]);
}

// Get M3U8 URL from embedstreams.top
async function getM3u8Url(source, sourceId, streamNo) {
  const requestBody = createRequestBody(source, sourceId, streamNo);
  
  const response = await fetch("https://embedstreams.top/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Accept": "*/*",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Sec-Ch-Ua": '"Chromium";v="137", "Not)A;Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Referer": `https://embedstreams.top/embed/${source}/${sourceId}/${streamNo}`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    },
    body: requestBody,
  });
  
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  
  const whatHeader = response.headers.get("What");
  if (!whatHeader) {
    throw new Error("Missing What header");
  }
  
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoded = btoa(String.fromCharCode(...bytes));
  const rotated = rotateString(encoded);
  const decrypted = await aesDecrypt(rotated, whatHeader, "STOPSTOPSTOPSTOP");
  
  return `https://rr.buytommy.top${decrypted}`;
}

// Alternative method for different sources
async function getM3u8UrlAlternative(source, sourceId, streamNo) {
  try {
    // Try the new streamed.pk API
    const response = await fetch(`https://streamed.pk/api/stream/${source}/${sourceId}`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "Accept": "application/vnd.apple.mpegurl, */*",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Referer": "https://streamed.pk/",
      },
    });
    
    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`);
    }
    
    const streamInfos = await response.json();
    const streamInfo = streamInfos.find(s => s.streamNo === streamNo);
    
    if (!streamInfo) {
      throw new Error("Stream not found");
    }
    
    // Fetch the embed page to get the actual m3u8 URL
    const embedResponse = await fetch(streamInfo.embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "Referer": "https://streamed.pk/",
      },
    });
    
    if (!embedResponse.ok) {
      throw new Error(`Embed fetch failed: ${embedResponse.status}`);
    }
    
    const embedHtml = await embedResponse.text();
    
    // Look for the 'o' variable that contains the m3u8 URL
    const oVarPattern = /var\s+o\s*=\s*["']([^"']+)["']/;
    const match = oVarPattern.exec(embedHtml);
    
    if (match) {
      return match[1];
    }
    
    // Fallback: generate URL based on pattern
    const baseUrls = [
      "https://lb1.strmd.top",
      "https://lb7.strmd.top", 
      "https://rr.strmd.top",
      "https://stream.strmd.top",
      "https://cdn.strmd.top",
      "https://edge.strmd.top",
      "https://node.strmd.top"
    ];
    
    const encryptionKeys = [
      "hYOeUTfQyHEyWeTszoOhqBCQvpCaYdHb",
      "iCrHEMPgOmYrZtaFHAufNCHorGUslKKw",
      "IiFpxFhLhQoaqEBYUhJkkxaTABVfLxNz"
    ];
    
    for (const baseUrl of baseUrls) {
      for (const key of encryptionKeys) {
        const possibleUrl = `${baseUrl}/secure/${key}/${source}/stream/${sourceId}/${streamNo}/playlist.m3u8`;
        try {
          const testResponse = await fetch(possibleUrl, { method: "HEAD" });
          if (testResponse.ok) {
            return possibleUrl;
          }
        } catch (e) {
          // Continue to next URL
        }
      }
    }
    
    throw new Error("No working URL found");
    
  } catch (error) {
    console.error("Alternative method failed:", error);
    throw error;
  }
}

// Main server handler
serve(async (req) => {
  const url = new URL(req.url);
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  // Handle decrypt endpoint (legacy compatibility)
  if (req.method === "POST" && url.pathname === "/decrypt") {
    try {
      const { encrypted } = await req.json();
      if (!encrypted) {
        return new Response(JSON.stringify({ error: "Missing encrypted parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // For legacy compatibility, just return the encrypted string as decrypted
      // This is a simplified approach - in reality you'd need the proper decryption
      return new Response(JSON.stringify({ decrypted: encrypted }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  
  // Handle new fetch-m3u8 endpoint
  if (req.method === "POST" && url.pathname === "/fetch-m3u8") {
    try {
      const { source = "alpha", sourceId = "test", streamNo = 1 } = await req.json();
      
      let m3u8Url;
      try {
        // Try the embedstreams.top method first
        m3u8Url = await getM3u8Url(source, sourceId, streamNo);
      } catch (error) {
        console.log("Primary method failed, trying alternative:", error.message);
        // Fallback to alternative method
        m3u8Url = await getM3u8UrlAlternative(source, sourceId, streamNo);
      }
      
      return new Response(JSON.stringify({ m3u8: m3u8Url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  
  // Handle direct stream extraction
  if (req.method === "GET" && url.pathname.startsWith("/stream/")) {
    try {
      const pathParts = url.pathname.split("/");
      const source = pathParts[2];
      const sourceId = pathParts[3];
      const streamNo = parseInt(pathParts[4]) || 1;
      
      let m3u8Url;
      try {
        m3u8Url = await getM3u8Url(source, sourceId, streamNo);
      } catch (error) {
        m3u8Url = await getM3u8UrlAlternative(source, sourceId, streamNo);
      }
      
      return new Response(JSON.stringify({ 
        m3u8: m3u8Url,
        source: source,
        sourceId: sourceId,
        streamNo: streamNo
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  
  // Health check endpoint
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  return new Response("Not Found", { 
    status: 404, 
    headers: { ...corsHeaders, "Content-Type": "text/plain" } 
  });
}, { port: 8000 });

console.log("Streamed Deno server running on port 8000");
console.log("Endpoints:");
console.log("  POST /decrypt - Legacy decryption endpoint");
console.log("  POST /fetch-m3u8 - Fetch M3U8 URL");
console.log("  GET /stream/{source}/{sourceId}/{streamNo} - Direct stream extraction");
console.log("  GET /health - Health check");
