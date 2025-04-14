#!/usr/bin/env python3

import logging
import urllib.parse
import requests
from flask import Flask, Response, request
import os

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Base headers
BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Origin": "https://embedstreams.top",
    "X-Requested-With": "XMLHttpRequest"
}

# CORS proxy for segments
CORS_PROXY = "https://corsproxy.io/?url="

# In-memory mappings for segment/key requests
mappings = {}

@app.route("/")
def root():
    logger.info("Root endpoint accessed")
    return Response(
        "Stream Proxy: Use /playlist.m3u8?url=<m3u8_url> to proxy M3U8 streams. Health check at /health.",
        status=200,
        mimetype="text/plain"
    )

@app.route("/health")
def health():
    logger.info("Health endpoint accessed")
    return Response("OK", status=200)

@app.route("/playlist.m3u8")
def handle_m3u8():
    m3u8_url = request.args.get("url")
    if not m3u8_url:
        logger.error("Missing 'url' parameter")
        return Response("Missing 'url' parameter", status=400)

    try:
        # Extract matchId, source, streamNo from referer
        client_referer = request.headers.get("Referer", "https://embedstreams.top/")
        referer_parts = client_referer.split("/")
        if len(referer_parts) >= 7 and referer_parts[3] == "embed":
            source = referer_parts[4]
            match_id = referer_parts[5]
            stream_no = referer_parts[6]
        else:
            logger.error(f"Invalid referer format: {client_referer}")
            source = match_id = stream_no = ""

        # Fetch cookies from streamed.su
        stream_url = f"https://streamed.su/watch/{match_id}/{source}/{stream_no}"
        cookies = fetch_cookies(stream_url)
        logger.info(f"Cookies fetched: {cookies}")

        # Prepare headers with cookies
        headers = BASE_HEADERS.copy()
        headers["Referer"] = client_referer
        if cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())

        result = fetch_m3u8(m3u8_url, headers)
        if not result:
            logger.error(f"Failed to fetch M3U8: {m3u8_url}")
            return Response("Failed to fetch M3U8", status=500)

        content, content_type = result
        rewritten_m3u8, new_mappings = rewrite_m3u8(content.decode('utf-8'), m3u8_url)

        # Update mappings
        mappings.update(new_mappings)

        logger.info(f"Serving rewritten M3U8 for {m3u8_url}")
        return Response(
            rewritten_m3u8,
            status=200,
            mimetype="application/vnd.apple.mpegurl",
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except Exception as e:
        logger.error(f"Error processing M3U8 {m3u8_url}: {str(e)}")
        return Response(str(e), status=500)

@app.route("/<path:path>")
def handle_segment(path):
    original_url = mappings.get(path)
    if not original_url:
        logger.error(f"No mapping for {path}")
        return Response("Not found", status=404)

    try:
        response = requests.get(original_url, headers=BASE_HEADERS, stream=True, timeout=30)
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

def fetch_cookies(stream_url):
    try:
        logger.info(f"Fetching cookies from {stream_url}")
        response = requests.get(stream_url, headers=BASE_HEADERS, timeout=15)
        if response.status_code == 200:
            cookies = response.cookies.get_dict()
            logger.info(f"Got cookies: {cookies}")
            return cookies
        else:
            logger.error(f"Failed to fetch cookies from {stream_url}: {response.status_code}")
            return {}
    except Exception as e:
        logger.error(f"Error fetching cookies from {stream_url}: {str(e)}")
        return {}

def fetch_m3u8(url, headers):
    for attempt in range(1, 4):
        logger.info(f"Fetching (attempt {attempt}): {url} with headers: {headers}")
        try:
            response = requests.get(url, headers=headers, timeout=30)
            logger.info(f"Response status: {response.status_code}, headers: {response.headers}")
            if response.status_code != 200:
                logger.error(f"Failed to fetch {url}: {response.status_code} - {response.text[:200]}")
                continue

            content = response.content
            content_type = response.headers.get("Content-Type", "application/octet-stream")

            if content_type != "application/vnd.apple.mpegurl" and not content.startswith(b"#EXTM3U"):
                logger.error(f"Invalid M3U8 content from {url}")
                continue

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
