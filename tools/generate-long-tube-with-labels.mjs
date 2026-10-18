import fs from 'node:fs';
import path from 'node:path';

const pointCount = 12000;
const labelScale = 0.055;
const positions = new Float32Array(pointCount * 3);
const colors = new Float32Array(pointCount * 3);
let seed = 9217;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const cyan = [0.549, 0.925, 1];
const deepBlue = [0.118, 0.435, 1];
for (let index = 0; index < pointCount; index += 1) {
  const y = (random() - 0.5) * 22;
  const wave = Math.sin(y * 0.68) * 0.12 + Math.sin(y * 1.73 + 1.2) * 0.06;
  const radiusLimit = 1.2 * (0.84 + random() * 0.16) + wave;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * radiusLimit;
  positions[index * 3] = Math.cos(angle) * radius + Math.sin(y * 0.37) * 0.12;
  positions[index * 3 + 1] = y;
  positions[index * 3 + 2] = Math.sin(angle) * radius + Math.cos(y * 0.29) * 0.1;
  const blend = Math.min(1, Math.max(0, (y + 11) / 22 + (random() - 0.5) * 0.22));
  colors[index * 3] = cyan[0] + (deepBlue[0] - cyan[0]) * blend;
  colors[index * 3 + 1] = cyan[1] + (deepBlue[1] - cyan[1]) * blend;
  colors[index * 3 + 2] = cyan[2] + (deepBlue[2] - cyan[2]) * blend;
}

const glyphs = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'], C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'], E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'], G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'], I: ['11111','00100','00100','00100','00100','00100','11111'], L: ['10000','10000','10000','10000','10000','10000','11111'], M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'], O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'], R: ['11110','10001','10001','11110','10100','10010','10001'], S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'], U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'], W: ['10001','10001','10001','10101','10101','11011','10001'], Y: ['10001','10001','01010','00100','00100','00100','00100']
};
const labels = [];
const labelPositions = [];
const labelColors = [];
const addLine = (x1, y1, z1, x2, y2, z2) => {
  labelPositions.push(x1, y1, z1, x2, y2, z2);
  labelColors.push(0.55, 0.93, 1, 0.12, 0.44, 1);
};
for (const [text, baseY] of labels) {
  const glyphWidth = 5 * labelScale;
  const letterGap = 2 * labelScale;
  const textWidth = [...text].reduce((width, character) => width + (character === ' ' ? glyphWidth : glyphWidth + letterGap), -letterGap);
  let cursor = -textWidth / 2;
  for (const character of text) {
    if (character === ' ') { cursor += glyphWidth + letterGap; continue; }
    const glyph = glyphs[character];
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (glyph[row][column] !== '1') continue;
        const x = cursor + column * labelScale;
        const y = baseY + (3 - row) * labelScale;
        addLine(x, y, 1.23, x + labelScale * 0.7, y, 1.23);
      }
    }
    cursor += glyphWidth + letterGap;
  }
}

const positionBytes = Buffer.from(positions.buffer);
const colorBytes = Buffer.from(colors.buffer);
const labelPositionBytes = Buffer.from(new Float32Array(labelPositions).buffer);
const labelColorBytes = Buffer.from(new Float32Array(labelColors).buffer);
// Label strokes are gone (the HTML overlay replaces them): only ship the
// point cloud — glTF forbids accessors with count 0.
const hasLabelStrokes = labelPositions.length > 0;
const chunks = [positionBytes, colorBytes];
if (hasLabelStrokes) chunks.push(labelPositionBytes, labelColorBytes);
const offsets = [];
let binaryLength = 0;
for (const chunk of chunks) { offsets.push(binaryLength); binaryLength += chunk.length; }
const binary = Buffer.concat(chunks);
const json = JSON.stringify({
  asset: { version: '2.0', generator: 'Lumaris long tube with embedded labels' }, scene: 0,
  scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: hasLabelStrokes ? [
    { attributes: { POSITION: 0, COLOR_0: 1 }, mode: 0 },
    { attributes: { POSITION: 2, COLOR_0: 3 }, mode: 1 }
  ] : [
    { attributes: { POSITION: 0, COLOR_0: 1 }, mode: 0 }
  ] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pointCount, type: 'VEC3', min: [-1.4, -11, -1.4], max: [1.4, 11, 1.4] },
    { bufferView: 1, componentType: 5126, count: pointCount, type: 'VEC3' },
    ...(hasLabelStrokes ? [
      { bufferView: 2, componentType: 5126, count: labelPositions.length / 3, type: 'VEC3', min: [-2, -12.3, 1.23], max: [2, 8.3, 1.23] },
      { bufferView: 3, componentType: 5126, count: labelColors.length / 3, type: 'VEC3' }
    ] : [])
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: positionBytes.length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: colorBytes.length, target: 34962 },
    ...(hasLabelStrokes ? [
      { buffer: 0, byteOffset: offsets[2], byteLength: labelPositionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: labelColorBytes.length, target: 34962 }
    ] : [])
  ], buffers: [{ byteLength: binary.length }]
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
fs.writeFileSync(path.resolve('src/frontend/assets/models/long-tube.glb'), glb);
console.log(`Wrote embedded-label GLB with ${pointCount} points and ${labelPositions.length / 6} label strokes`);
