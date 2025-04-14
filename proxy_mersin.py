#!/usr/bin/env python3

import logging
import urllib.parse
import requests
from flask import Flask, Response, request

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Headers to mimic a browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    "Referer": "https://embedstreams.top/",
    "Accept": "*/*",
    "Origin": "https://embedstreams.top",
    "Accept-Encoding": "identity",
}

# CORS proxy for segments
CORS_PROXY = "https://corsproxy.io/?url="

# In-memory mappings for segment/key requests
mappings = {}

@app.route("/health")
def health():
    return Response("OK", status=200)

@app.route("/playlist.m3u8")
def handle_m3u8():
    m3u8_url = request.args.get("url")
    if not m3u8_url:
        logger.error("Missing 'url' parameter")
        return Response("Missing 'url' parameter", status=400)

    try:
        result = fetch_m3u8(m3u8_url)
        if not result:
            logger.error("Failed to fetch M3U8")
            return Response("Failed to fetch M3U8", status=500)

        content, content_type = result
        rewritten_m3u8, new_mappings = rewrite_m3u8(content.decode('utf-8'), m3u8_url)

        # Update mappings
        mappings.update(new_mappings)

        logger.info("Serving rewritten M3U8")
        return Response(
            rewritten_m3u8,
            status=200,
            mimetype="application/vnd.apple.mpegurl",
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except Exception as e:
        logger.error(f"Error processing M3U8: {str(e)}")
        return Response(str(e), status=500)

@app.route("/<path:path>")
def handle_segment(path):
    original_url = mappings.get(path)
    if not original_url:
        logger.error(f"No mapping for {path}")
        return Response("Not found", status=404)

    try:
        response = requests.get(original_url, headers=HEADERS, stream=True, timeout=15)
        if response.status_code != 200:
            logger.error(f"Failed to fetch {original_url}: {response.status_code}")
            return Response("Failed to fetch resource", status=response.status_code)

        content_type = response.headers.get("Content-Type", "video/mp2t")
        logger.info(f"Serving segment/key: {path}")
        return Response(
            response.iter_content(chunk_size=8192),
            status=200,
            content_type=content_type,
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except Exception as e:
        logger.error(f"Error fetching {original_url}: {str(e)}")
        return Response(str(e), status=500)

def fetch_m3u8(url):
    logger.info(f"Fetching (attempt 1): {url}")
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code != 200:
            logger.error(f"Failed to fetch {url}: {response.status_code}")
            return None

        content = response.content
        content_type = response.headers.get("Content-Type", "application/octet-stream")

        if content_type != "application/vnd.apple.mpegurl" and not content.startswith(b"#EXTM3U"):
            logger.error(f"Invalid M3U8 content from {url}")
            return None

        logger.info(f"Success: {url} - Status: {response.status_code}, Content-Type: {content_type}, Size: {len(content)} bytes")
        return content, content_type

    except Exception as e:
        logger.error(f"Error fetching {url}: {str(e)}")
        return None

def rewrite_m3u8(m3u8_content, base_url):
    lines = m3u8_content.splitlines()
    new_mappings = {}
    rewritten_lines = []
    host = request.host

    for line in lines:
        if line.startswith("#EXT-X-KEY"):
            # Rewrite key URI
            uri_start = line.find('URI="') + 5
            uri_end = line.find('"', uri_start)
            original_uri = line[uri_start:uri_end]
            parsed = urllib.parse.urlparse(original_uri)
            local_path = parsed.path.lstrip('/')
            new_mappings[local_path] = original_uri
            new_uri = f"https://{host}/{local_path}"
            rewritten_line = line[:uri_start] + new_uri + line[uri_end:]
            logger.info(f"Mapping key {local_path} to {original_uri}")
            rewritten_lines.append(rewritten_line)

        elif line.startswith("https://p2-panel.streamed.su"):
            # Rewrite segment URL
            segment_name = line.split("/")[-1].replace(".js", ".ts")
            local_path = segment_name
            original_url = f"{CORS_PROXY}{urllib.parse.quote(line)}"
            new_mappings[local_path] = original_url
            new_url = f"https://{host}/{local_path}"
            logger.info(f"Mapping segment {local_path} to {original_url}")
            rewritten_lines.append(new_url)

        else:
            rewritten_lines.append(line)

    rewritten_m3u8 = "\n".join(rewritten_lines)
    logger.info(f"Rewritten M3U8 content:\n{rewritten_m3u8[:200]}...")
    return rewritten_m3u8, new_mappings

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
