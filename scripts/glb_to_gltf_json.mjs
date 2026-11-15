// Repackages a GLB as glTF JSON with its binary chunk embedded as a base64 data URI, so the model ships as a
// .json file like the rest of the app's binary data (DECISIONS.md #22: static hosts and the Artifact host
// reliably serve JSON, not model/gltf-binary). Three's GLTFLoader reads either form; gzip on the wire
// recovers most of the base64 overhead.
//   node scripts/glb_to_gltf_json.mjs public/models/rassor.glb public/models/rassor.gltf.json
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node scripts/glb_to_gltf_json.mjs <in.glb> <out.gltf.json>'); process.exit(1); }
const b = readFileSync(src);
if (b.toString('latin1', 0, 4) !== 'glTF' || b.readUInt32LE(4) !== 2) throw new Error(`${src} is not a glTF 2 binary`);
const jsonLen = b.readUInt32LE(12);
if (b.toString('latin1', 16, 20) !== 'JSON') throw new Error('first GLB chunk is not JSON');
const gltf = JSON.parse(b.toString('utf8', 20, 20 + jsonLen).trim());
const at = 20 + jsonLen;
if (at < b.length) {
  const binLen = b.readUInt32LE(at);
  if (b.toString('latin1', at + 4, at + 8) !== 'BIN\0') throw new Error('second GLB chunk is not BIN');
  const bin = b.subarray(at + 8, at + 8 + binLen);
  // the GLB body is the first buffer, the one with no uri
  const buf = gltf.buffers?.[0];
  if (!buf || buf.uri !== undefined) throw new Error('expected buffer 0 to be the GLB body');
  buf.uri = `data:application/octet-stream;base64,${bin.subarray(0, buf.byteLength).toString('base64')}`;
}
writeFileSync(out, JSON.stringify(gltf));
console.log(`${out}: ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
