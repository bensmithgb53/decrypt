import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity"
};

const NETLIFY_HOST = "https://flixy-proxy.netlify.app";
const SEGMENT_MAP = new Map();

async function fetchUrl(url, headers, retries = 2) {
  console.log(`Fetching: ${url}`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt} headers: ${JSON.stringify(headers)}`);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "No body");
        throw new Error(`Failed: ${url} | Status: ${response.status} | Body: ${errorBody.slice(0, 100)}`);
      }
      const content = await response.arrayBuffer();
      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.byteLength} bytes`);
      return { content, contentType };
    } catch (e) {
      console.error(`Fetch error (attempt ${attempt}): ${e.message}`);
      if (attempt === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

const handler = async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/+/, "");
  const streamType = url.searchParams.get("streamType") || "unknown";
  const matchId = url.searchParams.get("matchId") || "unknown";
  const source = url.searchParams.get("source") || "unknown";
  const streamNo = url.searchParams.get("streamNo") || "unknown";
  const segmentPrefix = url.searchParams.get("segmentPrefix") || "unknown";
  console.log(`Request: /${pathname}, streamType: ${streamType}, matchId: ${matchId}, source: ${source}, streamNo: ${streamNo}, segmentPrefix: ${segmentPrefix}`);

  if (pathname === "playlist.m3u8") {
    const m3u8Url = url.searchParams.get("url");
    const cookies = url.searchParams.get("cookies") || "";
    if (!m3u8Url) {
      console.error("Missing 'url' parameter");
      return new Response("Missing 'url' parameter", { status: 400 });
    }

    try {
      const headers = { ...BASE_HEADERS, ...(cookies && { Cookie: cookies }), "X-Stream-Type": streamType };
      const result = await fetchUrl(m3u8Url, headers);

      const m3u8Text = new TextDecoder().decode(result.content);
      SEGMENT_MAP.clear();
      const m3u8Lines = m3u8Text.split("\n");
      for (let i = 0; i < m3u8Lines.length; i++) {
        if (m3u8Lines[i].startsWith("#EXT-X-KEY") && m3u8Lines[i].includes("URI=")) {
          let originalUri = m3u8Lines[i].split('URI="')[1].split('"')[0];
          if (!originalUri.startsWith("http")) {
            originalUri = new URL(originalUri, m3u8Url).href;
          }
          const keyPath = originalUri.split("/").slice(-3).join("/");
          const newUri = `${url.origin}/key/${keyPath}?cookies=${encodeURIComponent(cookies)}&streamType=${encodeURIComponent(streamType)}&matchId=${encodeURIComponent(matchId)}&source=${encodeURIComponent(source)}&streamNo=${encodeURIComponent(streamNo)}&segmentPrefix=${encodeURIComponent(segmentPrefix)}`;
          m3u8Lines[i] = m3u8Lines[i].replace(originalUri, newUri);
          SEGMENT_MAP.set(`key/${keyPath}`, originalUri);
          console.log(`Mapped key: key/${keyPath} to ${originalUri}`);
        } else if (m3u8Lines[i].startsWith("https://")) {
          const originalUrl = m3u8Lines[i].trim();
          const segmentName = originalUrl.split("/").pop().replace(".js", ".ts");
          const newUrl = `${url.origin}/${segmentName}?cookies=${encodeURIComponent(cookies)}&streamType=${encodeURIComponent(streamType)}&matchId=${encodeURIComponent(matchId)}&source=${encodeURIComponent(source)}&streamNo=${encodeURIComponent(streamNo)}&segmentPrefix=${encodeURIComponent(segmentPrefix)}`;
          m3u8Lines[i] = newUrl;
          SEGMENT_MAP.set(segmentName, originalUrl);
          console.log(`Mapped segment: ${segmentName} to ${originalUrl}`);
        }
      }
      const rewrittenM3u8 = m3u8Lines.join("\n");
      console.log(`M3U8 content:\n${rewrittenM3u8.slice(0, 200)}...`);

      return new Response(rewrittenM3u8, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error(`M3U8 error: ${e.message}`);
      return new Response(`Error fetching M3U8: ${e.message}`, { status: 500 });
    }
  }

  const requestedPath = pathname;
  if (!requestedPath) {
    console.error("Empty path");
    return new Response("Not found", { status: 404 });
  }

  const cookies = url.searchParams.get("cookies") || "";
  const headers = { ...BASE_HEADERS, ...(cookies && { Cookie: cookies }), "X-Stream-Type": streamType };
  const mappedUrl = SEGMENT_MAP.get(requestedPath);

  let fetchUrlResult;
  if (mappedUrl) {
    fetchUrlResult = mappedUrl;
  } else if (requestedPath.startsWith("key/")) {
    fetchUrlResult = `https://p2-panel.streamed.su/${segmentPrefix}/${requestedPath.replace("key/", "")}`;
  } else {
    fetchUrlResult = `https://p2-panel.streamed.su/${segmentPrefix}/${requestedPath.replace(".ts", ".js")}`;
  }
  console.log(`Fetching resource: ${fetchUrlResult}`);

  try {
    let result = await fetchUrl(fetchUrlResult, headers);
    return new Response(result.content, {
      headers: {
        "Content-Type": result.contentType === "text/javascript" ? "video/mp2t" : result.contentType,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.log(`Trying Netlify: ${NETLIFY_HOST}/?destination=https://p2-panel.streamed.su/${segmentPrefix}/${requestedPath.replace(".ts", ".js")}`);
    try {
      const result = await fetchUrl(`${NETLIFY_HOST}/?destination=https://p2-panel.streamed.su/${segmentPrefix}/${requestedPath.replace(".ts", ".js")}`, headers);
      return new Response(result.content, {
        headers: {
          "Content-Type": result.contentType === "text/javascript" ? "video/mp2t" : result.contentType,
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error(`Resource error: ${e.message}`);
      return new Response(`Error fetching resource: ${e.message}`, { status: 500 });
    }
  }
};

serve(handler, { port: 8000 });
