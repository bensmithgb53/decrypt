import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity",
  "Cookie": "__ddg8_=5Ql4W19U75au1omU; __ddg10_=1744345197; __ddg9_=82.46.16.114; __ddg1_=CXWkM9IjfJXcFutkGKsS"
};

// Cache successful M3U8 URLs per matchId
const M3U8_CACHE = new Map();
// Store segment maps per stream ID
const SEGMENT_MAPS = new Map();

async function fetchUrl(url, streamId) {
  const urlObj = new URL(url);
  const expiry = urlObj.searchParams.get("expiry");
  const md5 = urlObj.searchParams.get("md5");
  if (expiry && Date.now() / 1000 > parseInt(expiry)) {
    throw new Error(`URL expired: ${url} | MD5: ${md5} | Stream: ${streamId}`);
  }

  console.log(`Fetching: ${url} | MD5: ${md5} | Stream: ${streamId}`);
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Failed: ${url} | Status: ${response.status} | MD5: ${md5} | Stream: ${streamId}`);
  }

  const content = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  const text = new TextDecoder().decode(content);

  if (url.endsWith(".m3u8") && !text.startsWith("#EXTM3U")) {
    throw new Error(`Invalid M3U8 content: ${url} | Content-Type: ${contentType} | MD5: ${md5} | Stream: ${streamId}`);
  }

  console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.byteLength} bytes | MD5: ${md5} | Stream: ${streamId}`);
  return { content, contentType, text };
}

const handler = async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/+/, "/");
  const streamId = `${url.searchParams.get("matchId") || Date.now()}-${url.searchParams.get("streamNo") || "0"}`;
  const matchId = url.searchParams.get("matchId") || "unknown";
  const source = url.searchParams.get("source") || "unknown";
  console.log(`Request path: ${pathname}${url.search} | Stream: ${streamId} | Source: ${source}`);

  if (pathname === "/playlist.m3u8") {
    let m3u8Url = url.searchParams.get("url");
    if (!m3u8Url) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    // Temporary workaround: Skip 'bravo' source due to consistent failures
    if (source === "bravo") {
      console.warn(`Skipping source 'bravo' due to known issues | Stream: ${streamId}`);
      return new Response("Stream source unavailable", { status: 503 });
    }

    try {
      const { content: m3u8Content, text: m3u8Text } = await fetchUrl(m3u8Url, streamId);
      console.log(`M3U8 preview: ${m3u8Text.slice(0, 100)} | Stream: ${streamId}`);

      // Cache successful M3U8 URL
      M3U8_CACHE.set(matchId, m3u8Url);

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

      // Fallback to cached M3U8 URL if available
      if (e.message.includes("Status: 404") && M3U8_CACHE.has(matchId)) {
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

// Clean up old caches periodically
setInterval(() => {
  const now = Date.now();
  for (const [streamId] of SEGMENT_MAPS) {
    const [id, _] = streamId.split("-");
    if (parseInt(id) < now - 3600_000) {
      SEGMENT_MAPS.delete(streamId);
    }
  }
  for (const [matchId] of M3U8_CACHE) {
    if (parseInt(matchId.split("-").pop()) < now - 3600_000) {
      M3U8_CACHE.delete(matchId);
    }
  }
}, 600_000);

serve(handler, { port: 8000 });
