// Run with: deno run --allow-net --allow-write decrypt-hls.js

const playlistUrl = 'https://streamed.su/watch/punjab-kings-vs-chennai-super-kings-2221947/alpha/1';

async function fetchM3U8(url) {
  const res = await fetch(url);
  return await res.text();
}

async function fetchKey(keyUri) {
  const fullKeyUrl = `https://streamed.su${keyUri}`;
  const res = await fetch(fullKeyUrl);
  const key = new Uint8Array(await res.arrayBuffer());
  console.log('Fetched Key:', key);
  return key;
}

async function fetchSegment(segmentUrl) {
  const res = await fetch(segmentUrl);
  return new Uint8Array(await res.arrayBuffer());
}

async function decryptSegment(encryptedData, key, ivHex) {
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    encryptedData,
  );
  return new Uint8Array(decrypted);
}

function parsePlaylist(m3u8Text) {
  const keyLine = m3u8Text.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=0x([a-fA-F0-9]+)/);
  const segments = [...m3u8Text.matchAll(/https:\/\/[^\n]+/g)].map(match => match[0].replace('https://corsproxy.io/?url=', ''));
  return { keyUri: keyLine[1], iv: keyLine[2], segments };
}

async function main() {
  const m3u8Text = await fetchM3U8(playlistUrl);
  const { keyUri, iv, segments } = parsePlaylist(m3u8Text);
  const key = await fetchKey(keyUri);

  for (let i = 0; i < segments.length; i++) {
    const segmentUrl = segments[i];
    console.log(`Downloading segment ${i + 1}/${segments.length}: ${segmentUrl}`);
    const encryptedData = await fetchSegment(segmentUrl);
    const decryptedData = await decryptSegment(encryptedData, key, iv);
    await Deno.writeFile(`segment_${i}.ts`, decryptedData);
  }

  console.log('All segments downloaded and decrypted!');
}

main().catch(console.error);
