import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity",
  "Cookie": "__ddg8_=5Ql4W19U75au1omU; __ddg10_=1744345197; __ddg9_=82.46.16.114; __ddg1_=CXWkM9IjfJXcFutkGKsS"
};

const ALT_HEADERS = {
  "User-Agent": BASE_HEADERS["User-Agent"],
  "Referer": "https://streamed.su/",
  "Accept": "*/*",
  "Origin": "https://streamed.su",
  "Accept-Encoding": "identity"
};

const SEGMENT_MAP = new Map();

async function fetchUrl(url, retries = 2, delay = 1000) {
  console.log(`Fetching: ${url}`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers = attempt === 1 ? BASE_HEADERS : ALT_HEADERS;
      console.log(`Attempt ${attempt} with headers:`, headers);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "No body");
        throw new Error(`Failed: ${url} | Status: ${response.status} | Body: ${errorBody.substring(0, 100)}`);
      }
      const content = await response.arrayBuffer();
      const contentType = response.headers.get("Content-Type") || "application/octet-stream";
      console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.byteLength} bytes`);
      return { content, contentType };
    } catch (e) {
      console.error(`Fetch error (attempt ${attempt}): ${e.message}`);
      if (attempt < retries) {
        console.log(`Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw e;
      }
    }
  }
}

const handler = async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/+/, "/");
  console.log(`Request path: ${pathname}${url.search}`);

  if (pathname === "/playlist.m3u8") {
    const m3u8Url = url.searchParams.get("url");
    if (!m3u8Url) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    try {
      const { content: m3u8Content } = await fetchUrl(m3u8Url);
      const m3u8Text = new TextDecoder().decode(m3u8Content);
      SEGMENT_MAP.clear();
      const m3u8Lines = m3u8Text.split("\n");
      for (let i = 0; i < m3u8Lines.length; i++) {
        if (m3u8Lines[i].startsWith("#EXT-X-KEY") && m3u8Lines[i].includes("URI=")) {
          const originalUri = m3u8Lines[i].split('URI="')[1].split('"')[0];
          const newUri = `${url.origin}/${originalUri.replace(/^\//, "")}`;
          m3u8Lines[i] = m3u8Lines[i].replace(originalUri, newUri);
          SEGMENT_MAP.set(originalUri.replace(/^\//, ""), new URL(originalUri, m3u8Url).href);
        } else if (m3u8Lines[i].startsWith("https://")) {
          const originalUrl = m3u8Lines[i].trim();
          const segmentName = originalUrl.split("/").pop().replace(".js", ".ts");
          const newUrl = `${url.origin}/${segmentName}`;
          m3u8Lines[i] = newUrl;
          SEGMENT_MAP.set(segmentName, originalUrl);
          console.log(`Mapping ${segmentName} to ${originalUrl}`);
        }
      }
      const rewrittenM3u8 = m3u8Lines.join("\n");
      console.log(`Rewritten M3U8 content:\n${rewrittenM3u8}`);

      return new Response(rewrittenM3u8, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error(e);
      return new Response(`Error fetching M3U8: ${e.message}`, { status: 500 });
    }
  }

  const requestedPath = pathname.replace(/^\//, "");
  if (!requestedPath) {
    return new Response("Not found", { status: 404 });
  }

  let fetchUrlResult = SEGMENT_MAP.get(requestedPath);
  if (!fetchUrlResult) {
    fetchUrlResult = new URL(requestedPath.replace(".ts", ".js"), "https://rr.buytommy.top/").href;
    console.log(`Unmapped request, trying: ${fetchUrlResult}`);
  }

  try {
    const { content, contentType } = await fetchUrl(fetchUrlResult);
    return new Response(content, {
      headers: {
        "Content-Type": contentType === "text/css" ? "video/mp2t" : contentType,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error(e);
    return new Response(`Error fetching resource: ${e.message}`, { status: 500 });
  }
};

serve(handler, { port: 8000 });
