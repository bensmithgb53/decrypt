import { serve } from "https://deno.land/std@0.223.0/http/server.ts";

serve(async (req) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const playlistUrl = 'https://streamed.su/watch/punjab-kings-vs-chennai-super-kings-2221947/alpha/1';

  const m3u8Text = await fetch(playlistUrl).then(r => r.text());
  const keyLine = m3u8Text.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=0x([a-fA-F0-9]+)/);
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
});
