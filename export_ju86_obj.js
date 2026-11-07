/**
 * Standalone OBJ and MTL Exporter for Three.js Models
 * Exports the Hungarian Ju 86K-2 3D Model to Wavefront OBJ format
 */

const fs = require('fs');
const path = require('path');
const THREE = require('./three.min.js');
const { createHungarianJu86 } = require('./ju86_builder.js');

function exportToObjAndMtl(rootObject, objFileName, mtlFileName) {
  rootObject.updateMatrixWorld(true);

  let outputObj = `# Wavefront OBJ File: Hungarian Junkers Ju 86K-2\n`;
  outputObj += `# Royal Hungarian Air Force (Magyar Királyi Honvéd Légierő)\n`;
  outputObj += `mtllib ${path.basename(mtlFileName)}\n\n`;

  let outputMtl = `# Material Library for Hungarian Junkers Ju 86K-2\n\n`;

  const materialsMap = new Map();
  let vertexOffset = 1;
  let normalOffset = 1;
  let uvOffset = 1;

  rootObject.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;

    // Material handling
    const mat = child.material || new THREE.MeshBasicMaterial();
    const matName = mat.name || ('Material_' + materialsMap.size);

    if (!materialsMap.has(matName)) {
      materialsMap.set(matName, mat);
      const col = mat.color ? mat.color : new THREE.Color(0x888888);
      const opacity = mat.opacity !== undefined ? mat.opacity : 1.0;
      const metalness = mat.metalness !== undefined ? mat.metalness : 0.2;
      const roughness = mat.roughness !== undefined ? mat.roughness : 0.5;

      outputMtl += `newmtl ${matName}\n`;
      outputMtl += `  Ka 0.1 0.1 0.1\n`;
      outputMtl += `  Kd ${col.r.toFixed(4)} ${col.g.toFixed(4)} ${col.b.toFixed(4)}\n`;
      outputMtl += `  Ks ${(metalness * 0.8).toFixed(4)} ${(metalness * 0.8).toFixed(4)} ${(metalness * 0.8).toFixed(4)}\n`;
      outputMtl += `  Ns ${((1 - roughness) * 100).toFixed(1)}\n`;
      outputMtl += `  d ${opacity.toFixed(3)}\n`;
      outputMtl += `  illum 2\n\n`;
    }

    const meshName = (child.name || 'Mesh').replace(/\s+/g, '_');
    outputObj += `o ${meshName}\n`;
    outputObj += `usemtl ${matName}\n`;
    outputObj += `s 1\n`;

    const matrixWorld = child.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    const vCount = posAttr.count;
    const vVec = new THREE.Vector3();
    const nVec = new THREE.Vector3();

    // 1. Vertices
    for (let i = 0; i < vCount; i++) {
      vVec.fromBufferAttribute(posAttr, i);
      vVec.applyMatrix4(matrixWorld);
      outputObj += `v ${vVec.x.toFixed(5)} ${vVec.y.toFixed(5)} ${vVec.z.toFixed(5)}\n`;
    }

    // 2. Normals
    const hasNormals = !!normAttr;
    if (hasNormals) {
      for (let i = 0; i < vCount; i++) {
        nVec.fromBufferAttribute(normAttr, i);
        nVec.applyMatrix3(normalMatrix).normalize();
        outputObj += `vn ${nVec.x.toFixed(4)} ${nVec.y.toFixed(4)} ${nVec.z.toFixed(4)}\n`;
      }
    }

    // 3. Texture UVs
    const hasUVs = !!uvAttr;
    if (hasUVs) {
      for (let i = 0; i < vCount; i++) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        outputObj += `vt ${u.toFixed(4)} ${v.toFixed(4)}\n`;
      }
    }

    // 4. Faces
    const index = geometry.index;
    if (index) {
      const idxCount = index.count;
      for (let i = 0; i < idxCount; i += 3) {
        const a = index.getX(i) + vertexOffset;
        const b = index.getX(i + 1) + vertexOffset;
        const c = index.getX(i + 2) + vertexOffset;

        if (hasUVs && hasNormals) {
          const uva = index.getX(i) + uvOffset;
          const uvb = index.getX(i + 1) + uvOffset;
          const uvc = index.getX(i + 2) + uvOffset;
          const na = index.getX(i) + normalOffset;
          const nb = index.getX(i + 1) + normalOffset;
          const nc = index.getX(i + 2) + normalOffset;
          outputObj += `f ${a}/${uva}/${na} ${b}/${uvb}/${nb} ${c}/${uvc}/${nc}\n`;
        } else if (hasNormals) {
          const na = index.getX(i) + normalOffset;
          const nb = index.getX(i + 1) + normalOffset;
          const nc = index.getX(i + 2) + normalOffset;
          outputObj += `f ${a}//${na} ${b}//${nb} ${c}//${nc}\n`;
        } else {
          outputObj += `f ${a} ${b} ${c}\n`;
        }
      }
    } else {
      for (let i = 0; i < vCount; i += 3) {
        const a = i + vertexOffset;
        const b = i + 1 + vertexOffset;
        const c = i + 2 + vertexOffset;

        if (hasUVs && hasNormals) {
          const uva = i + uvOffset;
          const uvb = i + 1 + uvOffset;
          const uvc = i + 2 + uvOffset;
          const na = i + normalOffset;
          const nb = i + 1 + normalOffset;
          const nc = i + 2 + normalOffset;
          outputObj += `f ${a}/${uva}/${na} ${b}/${uvb}/${nb} ${c}/${uvc}/${nc}\n`;
        } else if (hasNormals) {
          const na = i + normalOffset;
          const nb = i + 1 + normalOffset;
          const nc = i + 2 + normalOffset;
          outputObj += `f ${a}//${na} ${b}//${nb} ${c}//${nc}\n`;
        } else {
          outputObj += `f ${a} ${b} ${c}\n`;
        }
      }
    }

    vertexOffset += vCount;
    if (hasNormals) normalOffset += vCount;
    if (hasUVs) uvOffset += vCount;
  });

  return { obj: outputObj, mtl: outputMtl };
}

// Generate the Ju 86 model and write files
console.log('Generating Hungarian Junkers Ju 86K-2 3D Model...');
const ju86Data = createHungarianJu86({ deployedTurret: true, gearDown: true });
const exported = exportToObjAndMtl(ju86Data.group, 'hungarian_ju86.obj', 'hungarian_ju86.mtl');

const objPath = path.join(__dirname, 'hungarian_ju86.obj');
const mtlPath = path.join(__dirname, 'hungarian_ju86.mtl');

fs.writeFileSync(objPath, exported.obj, 'utf8');
fs.writeFileSync(mtlPath, exported.mtl, 'utf8');

console.log(`Successfully exported:`);
console.log(`  - OBJ: ${objPath} (${(fs.statSync(objPath).size / 1024).toFixed(1)} KB)`);
console.log(`  - MTL: ${mtlPath} (${(fs.statSync(mtlPath).size / 1024).toFixed(1)} KB)`);
