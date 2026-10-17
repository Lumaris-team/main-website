import fs from 'node:fs';
import path from 'node:path';

const pointCount = 12000;
const positions = new Float32Array(pointCount * 3);
const colors = new Float32Array(pointCount * 3);
let seed = 9217;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const cyan = [0.549, 0.925, 1];
const violet = [0.71, 0.314, 1];

for (let index = 0; index < pointCount; index += 1) {
  const y = (random() - 0.5) * 22;
  const wave = Math.sin(y * 0.68) * 0.12 + Math.sin(y * 1.73 + 1.2) * 0.06;
  const radiusLimit = 1.2 * (0.84 + random() * 0.16) + wave;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * radiusLimit;
  const offsetX = Math.sin(y * 0.37) * 0.12;
  const offsetZ = Math.cos(y * 0.29) * 0.1;
  positions[index * 3] = Math.cos(angle) * radius + offsetX;
  positions[index * 3 + 1] = y;
  positions[index * 3 + 2] = Math.sin(angle) * radius + offsetZ;
  const blend = Math.min(1, Math.max(0, (y + 11) / 22 + (random() - 0.5) * 0.22));
  colors[index * 3] = cyan[0] + (violet[0] - cyan[0]) * blend;
  colors[index * 3 + 1] = cyan[1] + (violet[1] - cyan[1]) * blend;
  colors[index * 3 + 2] = cyan[2] + (violet[2] - cyan[2]) * blend;
}

const positionBytes = Buffer.from(positions.buffer);
const colorBytes = Buffer.from(colors.buffer);
const binary = Buffer.concat([positionBytes, colorBytes]);
const json = JSON.stringify({
  asset: { version: '2.0', generator: 'Lumaris long tube generator' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, mode: 0 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pointCount, type: 'VEC3', min: [-1.4, -11, -1.4], max: [1.4, 11, 1.4] },
    { bufferView: 1, componentType: 5126, count: pointCount, type: 'VEC3', normalized: false }
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.length, byteLength: colorBytes.length, target: 34962 }
  ],
  buffers: [{ byteLength: binary.length }]
});

const jsonBytes = Buffer.from(json);
const jsonPadding = Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20);
const binPadding = Buffer.alloc((4 - (binary.length % 4)) % 4);
const totalLength = 12 + 8 + jsonBytes.length + jsonPadding.length + 8 + binary.length + binPadding.length;
const glb = Buffer.alloc(totalLength);
let offset = 0;
glb.writeUInt32LE(0x46546c67, offset); offset += 4;
glb.writeUInt32LE(2, offset); offset += 4;
glb.writeUInt32LE(totalLength, offset); offset += 4;
glb.writeUInt32LE(jsonBytes.length + jsonPadding.length, offset); offset += 4;
glb.writeUInt32LE(0x4e4f534a, offset); offset += 4;
jsonBytes.copy(glb, offset);
jsonPadding.copy(glb, offset + jsonBytes.length);
offset += jsonBytes.length + jsonPadding.length;
glb.writeUInt32LE(binary.length + binPadding.length, offset); offset += 4;
glb.writeUInt32LE(0x004e4942, offset); offset += 4;
binary.copy(glb, offset);

const output = path.resolve('src/frontend/assets/models/long-tube.glb');
fs.writeFileSync(output, glb);
console.log(`Wrote ${output} (${glb.length} bytes, ${pointCount} points)`);
