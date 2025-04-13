import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity",
  "Cookie": "__ddg8_=5Ql4W19U75au1omU; __ddg10_=1744345197; __ddg9_=82.46.16.114; __ddg1_=CXWkM9IjfJXcFutkGKsS"
};

// Cache successful M3U8 URLs and track failures
const M3U8_CACHE = new Map();
const FAILURE_COUNT = new Map(); // Track failures per matchId-pathPrefix
const SEGMENT_MAPS = new Map();

// Source priority (higher number = higher priority)
const SOURCE_PRIORITY = {
  "delta": 3,
  "alpha": 2,
  "bravo": 1,
  "unknown": 0
};

// Fallback M3U8 (replace with a real stream URL if available)
const FALLBACK_M3U8_URL = "https://example.com/fallback.m3u8"; // Placeholder
const FALLBACK_M3U8 = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
/fallback.ts`;

async function fetchUrl(url, streamId, retries = 2, delay = 1000) {
  const urlObj = new URL(url);
  const expiry = urlObj.searchParams.get("expiry");
  const md5 = urlObj.searchParams.get("md5");
  const path = urlObj.pathname;
  const pathPrefix = path.split("/").slice(0, 3).join("/"); // e.g., /s/B5Iv5eHPExCirRLhastT3mZ2rtt8x_NO4K0BdZXvoLeNBtqPQtho8K5r3yEILN9Z

  if (expiry && Date.now() / 1000 > parseInt(expiry)) {
    throw new Error(`URL expired: ${url} | Path: ${path} | MD5: ${md5} | Stream: ${streamId}`);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Fetching (attempt ${attempt}): ${url} | Path: ${path} | MD5: ${md5} | Stream: ${streamId}`);
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "No response body");
        throw new Error(`Failed: ${url} | Status: ${response.status} | Path: ${path} | MD5: ${md5} | Stream: ${streamId} | Response: ${errorBody.slice(0, 100)}`);
      }

      const content = await response.arrayBuffer();
      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      const text = new TextDecoder().decode(content);

      if (url.endsWith(".m3u8") && !text.startsWith("#EXTM3U")) {
        throw new Error(`Invalid M3U8 content: ${url} | Content-Type: ${contentType} | Path: ${path} | MD5: ${md5} | Stream: ${streamId}`);
      }

      console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.byteLength} bytes | Path: ${path} | MD5: ${md5} | Stream: ${streamId}`);
      return { content, contentType, text };
    } catch (e) {
      if (attempt < retries && (e.message.includes("Status: 404") || e.message.includes("Status: 500"))) {
        console.warn(`Retry ${attempt}/${retries} failed: ${e.message} | Stream: ${streamId}. Retrying after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw e;
      }
    }
  }
}

const handler = async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/+/, "/");
  const streamId = `${url.searchParams.get("matchId") || Date.now()}-${url.searchParams.get("streamNo") || "0"}`;
  const matchId = url.searchParams.get("matchId") || "unknown";
  const source = url.searchParams.get("source") || "unknown";
  const streamNo = url.searchParams.get("streamNo") || "0";
  console.log(`Request path: ${pathname}${url.search} | Stream: ${streamId} | Source: ${source}`);

  if (pathname === "/playlist.m3u8") {
    let m3u8Url = url.searchParams.get("url");
    if (!m3u8Url) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    const urlObj = new URL(m3u8Url);
    const pathPrefix = urlObj.pathname.split("/").slice(0, 3).join("/");
    const failureKey = `${matchId}-${pathPrefix}`;

    // Check if URL pattern is blocked
    const failures = FAILURE_COUNT.get(failureKey) || 0;
    if (failures >= 5) {
      console.warn(`URL pattern ${pathPrefix} blocked for ${matchId} due to ${failures} failures | Stream: ${streamId}`);
      return new Response(`Stream unavailable for ${source}`, { status: 503 });
    }

    // Prioritize source
    const sourcePriority = SOURCE_PRIORITY[source] || 0;
    if (sourcePriority < 2 && failures > 0) {
      console.log(`Low-priority source ${source} (${sourcePriority}) with ${failures} failures; consider switching | Stream: ${streamId}`);
    }

    try {
      const { content: m3u8Content, text: m3u8Text } = await fetchUrl(m3u8Url, streamId);
      console.log(`M3U8 preview: ${m3u8Text.slice(0, 100)} | Stream: ${streamId}`);

      // Cache successful URL and reset failure count
      M3U8_CACHE.set(matchId, m3u8Url);
      FAILURE_COUNT.set(failureKey, 0);

      // Initialize segment map
      const segmentMap = new Map();
      SEGMENT_MAPS.set(streamId, segmentMap);

      const m3u8Lines = m3u8Text.split("\n");
      for (let i = 0; i < m3u8Lines.length; i++) {
        if (m3u8Lines[i].startsWith("#EXT-X-KEY") && m3u8Lines[i].includes("URI=")) {
          const originalUri = m3u8Lines[i].split('URI="')[1].split('"')[0];
          const newUri = `${url.origin}/${originalUri.replace(/^\//, "")}`;
          m3u8Lines[i] = m3u8Lines[i].replace(originalUri, newUri);
          segmentMap.set(originalUri.replace(/^\//, ""), new URL(originalUri, m3u8Url).href);
          console.log(`Key mapping: ${originalUri} -> ${newUri} | Stream: ${streamId}`);
        } else if (m3u8Lines[i].startsWith("https://")) {
          const originalUrl = m3u8Lines[i].trim();
          const segmentName = originalUrl.split("/").pop().replace(".js", ".ts");
          const newUrl = `${url.origin}/${segmentName}`;
          m3u8Lines[i] = newUrl;
          segmentMap.set(segmentName, originalUrl);
          console.log(`Segment mapping: ${segmentName} -> ${originalUrl} | Stream: ${streamId}`);
        }
      }

      const rewrittenM3u8 = m3u8Lines.join("\n");
      console.log(`Rewritten M3U8 content:\n${rewrittenM3u8} | Stream: ${streamId}`);

      return new Response(rewrittenM3u8, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error(`Error: ${e.message} | Stream: ${streamId}`);

      // Increment failure count
      FAILURE_COUNT.set(failureKey, failures + 1);

      // Try cached URL
      if (e.message.includes("Status: 404") || e.message.includes("Status: 500")) {
        if (M3U8_CACHE.has(matchId)) {
          console.log(`Retrying with cached URL: ${M3U8_CACHE.get(matchId)} | Stream: ${streamId}`);
          try {
            const { content: m3u8Content, text: m3u8Text } = await fetchUrl(M3U8_CACHE.get(matchId), streamId);
            console.log(`M3U8 preview: ${m3u8Text.slice(0, 100)} | Stream: ${streamId}`);

            const segmentMap = new Map();
            SEGMENT_MAPS.set(streamId, segmentMap);

            const m3u8Lines = m3u8Text.split("\n");
            for (let i = 0; i < m3u8Lines.length; i++) {
              if (m3u8Lines[i].startsWith("#EXT-X-KEY") && m3u8Lines[i].includes("URI=")) {
                const originalUri = m3u8Lines[i].split('URI="')[1].split('"')[0];
                const newUri = `${url.origin}/${originalUri.replace(/^\//, "")}`;
                m3u8Lines[i] = m3u8Lines[i].replace(originalUri, newUri);
                segmentMap.set(originalUri.replace(/^\//, ""), new URL(originalUri, m3u8Url).href);
              } else if (m3u8Lines[i].startsWith("https://")) {
                const originalUrl = m3u8Lines[i].trim();
                const segmentName = originalUrl.split("/").pop().replace(".js", ".ts");
                const newUrl = `${url.origin}/${segmentName}`;
                m3u8Lines[i] = newUrl;
                segmentMap.set(segmentName, originalUrl);
                console.log(`Segment mapping: ${segmentName} -> ${originalUrl} | Stream: ${streamId}`);
              }
            }

            const rewrittenM3u8 = m3u8Lines.join("\n");
            console.log(`Rewritten M3U8 content:\n${rewrittenM3u8} | Stream: ${streamId}`);

            return new Response(rewrittenM3u8, {
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (retryError) {
            console.error(`Retry failed: ${retryError.message} | Stream: ${streamId}`);
          }
        }

        // Try fallback URL
        if (FAILURE_COUNT.get(failureKey) >= 3) {
          console.warn(`Attempting fallback URL: ${FALLBACK_M3U8_URL} due to ${failures + 1} failures | Stream: ${streamId}`);
          try {
            const { content: m3u8Content, text: m3u8Text } = await fetchUrl(FALLBACK_M3U8_URL, streamId);
            console.log(`Fallback M3U8 preview: ${m3u8Text.slice(0, 100)} | Stream: ${streamId}`);
            return new Response(m3u8Content, {
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (fallbackError) {
            console.error(`Fallback URL failed: ${fallbackError.message} | Stream: ${streamId}`);
            console.warn(`Serving static fallback M3U8 due to repeated failures (${failures + 1}) | Stream: ${streamId}`);
            return new Response(FALLBACK_M3U8, {
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }
        }
      }

      return new Response(`Error fetching M3U8: ${e.message}`, { status: 500 });
    }
  }

  const requestedPath = pathname.replace(/^\//, "");
  if (!requestedPath) {
    return new Response("Not found", { status: 404 });
  }

  const segmentMap = SEGMENT_MAPS.get(streamId) || new Map();
  let fetchUrlResult = segmentMap.get(requestedPath);

  if (!fetchUrlResult) {
    const segmentPrefix = url.searchParams.get("segmentPrefix") || "";
    if (segmentPrefix && requestedPath.startsWith(segmentPrefix)) {
      fetchUrlResult = new URL(requestedPath.replace(".ts", ".js"), "https://rr.buytommy.top/").href;
      console.log(`Unmapped request, trying fallback: ${fetchUrlResult} | Stream: ${streamId}`);
    } else if (requestedPath === "fallback.ts") {
      console.log(`Serving fallback segment | Stream: ${streamId}`);
      return new Response(new Uint8Array([]), {
        headers: {
          "Content-Type": "video/mp2t",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } else {
      console.error(`Segment not found: ${requestedPath} | Stream: ${streamId}`);
      return new Response(`Segment not found: ${requestedPath}`, { status: 404 });
    }
  }

  try {
    const { content, contentType } = await fetchUrl(fetchUrlResult, streamId);
    return new Response(content, {
      headers: {
        "Content-Type": contentType === "text/css" ? "video/mp2t" : contentType,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error(`Error: ${e.message} | Stream: ${streamId}`);
    return new Response(`Error fetching resource: ${e.message}`, { status: 500 });
  }
};

// Clean up caches
setInterval(() => {
  const now = Date.now();
  for (const [streamId] of SEGMENT_MAPS) {
    const [id] = streamId.split("-");
    if (parseInt(id) < now - 3600_000) {
      SEGMENT_MAPS.delete(streamId);
    }
  }
  for (const [matchId] of M3U8_CACHE) {
    if (parseInt(matchId.split("-").pop()) < now - 3600_000) {
      M3U8_CACHE.delete(matchId);
    }
  }
  for (const [key] of FAILURE_COUNT) {
    const [id] = key.split("-");
    if (parseInt(id.split("-").pop()) < now - 3600_000) {
      FAILURE_COUNT.delete(key);
    }
  }
}, 600_000);

serve(handler, { port: 8000 });
