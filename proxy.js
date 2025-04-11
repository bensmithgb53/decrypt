import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://embedstreams.top/",
  "Accept": "*/*",
  "Origin": "https://embedstreams.top",
  "Accept-Encoding": "identity"
};

const SEGMENT_MAP = new Map();

async function fetchUrl(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Failed: ${url} | Status: ${response.status}`);
  const content = await response.text();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  console.log(`Success: ${url} | Status: ${response.status} | Content-Type: ${contentType} | Size: ${content.length} bytes`);
  return { content, contentType };
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`Request path: ${url.pathname}${url.search}`);

  if (url.pathname === "/playlist.m3u8") {
    const m3u8Url = url.searchParams.get("url");
    if (!m3u8Url) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    try {
      const { content: m3u8Content } = await fetchUrl(m3u8Url);
      SEGMENT_MAP.clear();
      const m3u8Lines = m3u8Content.split("\n");
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

  const requestedPath = url.pathname.replace(/^\//, "");
  let fetchUrl = SEGMENT_MAP.get(requestedPath);
  if (!fetchUrl) {
    fetchUrl = new URL(requestedPath.replace(".ts", ".js"), "https://rr.buytommy.top/").href;
    console.log(`Unmapped request, trying: ${fetchUrl}`);
  }

  try {
    const { content, contentType } = await fetchUrl(fetchUrl);
    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error(e);
    return new Response(`Error fetching resource: ${e.message}`, { status: 500 });
  }
}, { port: 8000 });
