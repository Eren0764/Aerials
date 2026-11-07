/**
 * Converter: Parses macchi_c202.obj, rotates to simulator coordinates (+Z forward, +Y up, +X right),
 * scales to real-world dimensions (10.58m span), and writes macchi_c202_data.js with base64 binary buffers.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function convert() {
  console.log('Reading and converting macchi_c202.obj...');
  const objPath = path.join(__dirname, 'macchi_c202.obj');
  const fileStream = fs.createReadStream(objPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const rawPositions = [];
  const rawNormals = [];
  const rawUVs = [];

  const vertexMap = new Map();
  const finalPositions = [];
  const finalNormals = [];
  const finalUVs = [];
  const finalIndices = [];

  let vertexCounter = 0;

  // Scale and rotation:
  // Raw has nose at -X, tail at +X, wings along Z
  // Rotate +90 deg around Y:
  // X_new = Z_raw * scale
  // Y_new = Y_raw * scale
  // Z_new = -X_raw * scale
  const scale = 5.5611;

  for await (const line of rl) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/).slice(1).map(Number);
      rawPositions.push(p[2] * scale, p[1] * scale, -p[0] * scale);
    } else if (line.startsWith('vn ')) {
      const p = line.trim().split(/\s+/).slice(1).map(Number);
      rawNormals.push(p[2], p[1], -p[0]);
    } else if (line.startsWith('vt ')) {
      const p = line.trim().split(/\s+/).slice(1).map(Number);
      rawUVs.push(p[0], p[1]);
    } else if (line.startsWith('f ')) {
      const parts = line.trim().split(/\s+/).slice(1);
      for (let i = 0; i < 3; i++) {
        const key = parts[i];
        let idx = vertexMap.get(key);
        if (idx === undefined) {
          idx = vertexCounter++;
          vertexMap.set(key, idx);

          const indices = key.split('/').map(s => parseInt(s, 10));
          const vIdx = (indices[0] - 1) * 3;
          finalPositions.push(rawPositions[vIdx], rawPositions[vIdx + 1], rawPositions[vIdx + 2]);

          if (indices[1]) {
            const vtIdx = (indices[1] - 1) * 2;
            finalUVs.push(rawUVs[vtIdx], rawUVs[vtIdx + 1]);
          } else {
            finalUVs.push(0, 0);
          }

          if (indices[2]) {
            const vnIdx = (indices[2] - 1) * 3;
            finalNormals.push(rawNormals[vnIdx], rawNormals[vnIdx + 1], rawNormals[vnIdx + 2]);
          } else {
            finalNormals.push(0, 1, 0);
          }
        }
        finalIndices.push(idx);
      }
    }
  }

  console.log(`Processed ${vertexCounter} vertices and ${finalIndices.length / 3} faces.`);

  // Create typed arrays
  const posArr = new Float32Array(finalPositions);
  const normArr = new Float32Array(finalNormals);
  const uvArr = new Float32Array(finalUVs);
  const idxArr = new Uint32Array(finalIndices);

  const posBuf = Buffer.from(posArr.buffer);
  const normBuf = Buffer.from(normArr.buffer);
  const uvBuf = Buffer.from(uvArr.buffer);
  const idxBuf = Buffer.from(idxArr.buffer);

  const posB64 = posBuf.toString('base64');
  const normB64 = normBuf.toString('base64');
  const uvB64 = uvBuf.toString('base64');
  const idxB64 = idxBuf.toString('base64');

  const outJsPath = path.join(__dirname, 'macchi_c202_data.js');

  const fileContent = `/**
 * Macchi C.202 Folgore Geometry Data Buffer
 * Pre-transformed to simulator coordinates (+Z forward, +Y up, +X right, 10.58m span)
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.MacchiC202Data = factory();
  }
}(this, function () {
  'use strict';

  function b64ToUint8Array(b64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const data = {
    vertexCount: ${vertexCounter},
    indexCount: ${finalIndices.length},
    positionsB64: "${posB64}",
    normalsB64: "${normB64}",
    uvsB64: "${uvB64}",
    indicesB64: "${idxB64}",
    getGeometry: function (THREE) {
      const posBytes = b64ToUint8Array(this.positionsB64);
      const normBytes = b64ToUint8Array(this.normalsB64);
      const uvBytes = b64ToUint8Array(this.uvsB64);
      const idxBytes = b64ToUint8Array(this.indicesB64);

      const positions = new Float32Array(posBytes.buffer, posBytes.byteOffset, posBytes.byteLength / 4);
      const normals = new Float32Array(normBytes.buffer, normBytes.byteOffset, normBytes.byteLength / 4);
      const uvs = new Float32Array(uvBytes.buffer, uvBytes.byteOffset, uvBytes.byteLength / 4);
      const indices = new Uint32Array(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength / 4);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    }
  };

  return data;
}));
`;

  fs.writeFileSync(outJsPath, fileContent, 'utf8');
  console.log(`Successfully generated: ${outJsPath} (${(fs.statSync(outJsPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

convert();
