export function extractSubMesh(srcMesh, vertexIndices) {
  const srcPts = srcMesh.pts;
  const srcTris = srcMesh.tris;
  const srcColors = srcMesh.rgba255;

  if (!srcPts || !srcTris) return null;

  const keep = new Uint8Array(srcPts.length / 3);
  for (const idx of vertexIndices) keep[idx] = 1;

  const remap = new Int32Array(keep.length);
  remap.fill(-1);

  let newVertCount = 0;
  for (let i = 0; i < keep.length; i++) {
    if (keep[i]) remap[i] = newVertCount++;
  }

  const keptTris = [];
  const nTri = srcTris.length / 3;
  for (let t = 0; t < nTri; t++) {
    const a = srcTris[t * 3];
    const b = srcTris[t * 3 + 1];
    const c = srcTris[t * 3 + 2];
    if (keep[a] && keep[b] && keep[c]) {
      keptTris.push(remap[a], remap[b], remap[c]);
    }
  }

  const pts = new Float32Array(newVertCount * 3);
  const rgba255 = srcColors ? new Uint8Array(newVertCount * 4) : null;
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i]) continue;
    const ni = remap[i];
    pts[ni * 3]     = srcPts[i * 3];
    pts[ni * 3 + 1] = srcPts[i * 3 + 1];
    pts[ni * 3 + 2] = srcPts[i * 3 + 2];
    if (rgba255) {
      rgba255[ni * 4]     = srcColors[i * 4];
      rgba255[ni * 4 + 1] = srcColors[i * 4 + 1];
      rgba255[ni * 4 + 2] = srcColors[i * 4 + 2];
      rgba255[ni * 4 + 3] = srcColors[i * 4 + 3];
    }
  }

  const tris = new Uint32Array(keptTris);

  return { pts, tris, rgba255, vertexCount: newVertCount, triangleCount: tris.length / 3 };
}
