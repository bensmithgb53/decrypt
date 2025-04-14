#!/usr/bin/env python3

import logging
import urllib.parse
import requests
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

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

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    pass

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        logger.info(f"Request path: {self.path}")

        if path == "/playlist.m3u8":
            m3u8_url = query.get("url", [None])[0]
            if not m3u8_url:
                self.send_error(400, "Missing 'url' parameter")
                return

            try:
                result = self.fetch_m3u8(m3u8_url)
                if not result:
                    self.send_error(500, "Failed to fetch M3U8")
                    return

                content, content_type = result
                rewritten_m3u8, mappings = self.rewrite_m3u8(content.decode('utf-8'), m3u8_url)

                # Store mappings for segment/key requests
                if not hasattr(self.server, 'mappings'):
                    self.server.mappings = {}
                self.server.mappings.update(mappings)

                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(rewritten_m3u8.encode('utf-8'))

            except Exception as e:
                logger.error(f"Error processing M3U8: {str(e)}")
                self.send_error(500, str(e))

        else:
            # Handle segment or key requests
            mappings = getattr(self.server, 'mappings', {})
            original_url = mappings.get(path.lstrip('/'))

            if not original_url:
                logger.error(f"No mapping for {path}")
                self.send_error(404, "Not found")
                return

            try:
                response = requests.get(original_url, headers=HEADERS, stream=True)
                if response.status_code != 200:
                    logger.error(f"Failed to fetch {original_url}: {response.status_code}")
                    self.send_error(response.status_code)
                    return

                content_type = response.headers.get("Content-Type", "video/mp2t")
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                for chunk in response.iter_content(chunk_size=8192):
                    self.wfile.write(chunk)

            except Exception as e:
                logger.error(f"Error fetching {original_url}: {str(e)}")
                self.send_error(500, str(e))

    def fetch_m3u8(self, url):
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

    def rewrite_m3u8(self, m3u8_content, base_url):
        lines = m3u8_content.splitlines()
        mappings = {}
        rewritten_lines = []
        host = self.headers.get('Host', 'localhost:8000')

        for line in lines:
            if line.startswith("#EXT-X-KEY"):
                # Rewrite key URI
                uri_start = line.find('URI="') + 5
                uri_end = line.find('"', uri_start)
                original_uri = line[uri_start:uri_end]
                parsed = urllib.parse.urlparse(original_uri)
                local_path = parsed.path.lstrip('/')
                mappings[local_path] = original_uri
                new_uri = f"http://{host}/{local_path}"
                rewritten_line = line[:uri_start] + new_uri + line[uri_end:]
                logger.info(f"Mapping key {local_path} to {original_uri}")
                rewritten_lines.append(rewritten_line)

            elif line.startswith("https://p2-panel.streamed.su"):
                # Rewrite segment URL
                segment_name = line.split("/")[-1].replace(".js", ".ts")
                local_path = segment_name
                original_url = f"{CORS_PROXY}{urllib.parse.quote(line)}"
                mappings[local_path] = original_url
                new_url = f"http://{host}/{local_path}"
                logger.info(f"Mapping segment {local_path} to {original_url}")
                rewritten_lines.append(new_url)

            else:
                rewritten_lines.append(line)

        rewritten_m3u8 = "\n".join(rewritten_lines)
        logger.info(f"Rewritten M3U8 content:\n{rewritten_m3u8[:200]}...")
        return rewritten_m3u8, mappings

def main():
    PORT = int(os.getenv("PORT", 8000))
    server = ThreadingHTTPServer(("", PORT), ProxyHandler)
    logger.info(f"Serving proxy at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down proxy")
        server.server_close()

if __name__ == "__main__":
    main()
