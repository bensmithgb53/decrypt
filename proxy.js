import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity",
  "Cookie": "__ddg8_=5Ql4W19U75au1omU; __ddg10_=1744345197; __ddg9_=82.46.16.114; __ddg1_=CXWkM9IjfJXcFutkGKsS"
};

const SEGMENT_MAP = new Map();

async function fetchUrl(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Failed: ${url} | Status: ${response.status}`);
  const content = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.byteLength} bytes`);
  return { content, contentType };
}

const handler = async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/+/, "/"); // Normalize multiple leading slashes
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
