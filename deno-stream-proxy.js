import { serve } from "https://deno.land/std@0.223.0/http/server.ts";

serve(async (req) => {
  try {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const playlistUrl = 'https://rr.buytommy.top/s/jRwpGkyCKixMn0_IvGQwSIRPS3AwmORsOtxNwb7Zk7kON1bB48UseifrZNs3LF3Y/wFy8dycpF4kOjorpSKe2x5evFOqvlux9l22PedN1FY83gL5R4EN75OTbPchEFvE0mFOTKk-oQgQsqPkX4ceOlNHG4G4GKyfL7E8WJNqdnHA/-bqMzx-wDPy1f-QIeIsYEqPkoNpFrOkTq2rWqQqRV6jUdUSJU382DsMStbO58P6g/strm.m3u8?md5=qdsiHvFUqheReC_VY9gUjA&expiry=1744140657';

    // Check expiration (current date: April 8, 2025)
    const currentTime = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds
    const expiryTime = 1744140657; // From the URL
    if (currentTime > expiryTime) {
      throw new Error(
        `The playlist URL expired on October 6, 2024 (Unix: ${expiryTime}). Please provide a new, valid M3U8 URL. Current date: April 8, 2025 (Unix: ${currentTime}).`
      );
    }

    const m3u8Text = await fetch(playlistUrl).then(r => r.text());
    const keyLine = m3u8Text.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=0x([a-fA-F0-9]+)/);
    if (!keyLine) throw new Error('No encryption key found in M3U8');

    const segments = [...m3u8Text.matchAll(/https:\/\/[^\n]+/g)].map(match => match[0].replace('https://corsproxy.io/?url=', ''));
    const keyUri = keyLine[1];
    const ivHex = keyLine[2];

    const key = new Uint8Array(await fetch(`https://streamed.su${keyUri}`).then(r => r.arrayBuffer()));
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);

    for (const segmentUrl of segments) {
      const encrypted = new Uint8Array(await fetch(segmentUrl).then(r => r.arrayBuffer()));
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, encrypted);
      writer.write(new Uint8Array(decrypted));
    }

    writer.close();

    return new Response(readable, {
      headers: { "Content-Type": "video/MP2T" },
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});
