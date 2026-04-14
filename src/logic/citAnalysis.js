const MNI_LANDMARKS = {
  amygdala:    [0, -4, -18],
  hippocampus: [0, -22, -14],
  thalamus:    [0, -18, 8],
  caudate:     [0, 8, 8],
  putamen:     [0, 4, 0],
  STN:         [0, -14, -8],
  GP:          [0, -2, -2],
  SN:          [0, -16, -12],
  redNucleus:  [0, -20, -10],
  accumbens:   [0, 12, -8],
  habenula:    [0, -24, 4],
  VTA:         [0, -18, -14],
  hypothalamus:[0, -2, -10],
};

const dist3D = (a, b) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

export function filterRegionHemisphere(region, mesh, side = 'right') {
  if (!region || !mesh?.pts) return region;
  const pts = mesh.pts;

  let minX = Infinity, maxX = -Infinity;
  for (const i of region.vertexIndices) {
    const x = pts[i * 3];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const midX = (minX + maxX) / 2;

  const keep = [];
  let sx = 0, sy = 0, sz = 0;
  let fMinX = Infinity, fMaxX = -Infinity;
  let fMinY = Infinity, fMaxY = -Infinity;
  let fMinZ = Infinity, fMaxZ = -Infinity;
  const xMin = minX, xMax = maxX;

  for (const i of region.vertexIndices) {
    const x = pts[i * 3];
    const y = pts[i * 3 + 1];
    const z = pts[i * 3 + 2];
    if (side === 'right' && x <= midX) continue;
    if (side === 'left' && x >= midX) continue;
    keep.push(i);
    sx += x; sy += y; sz += z;
    if (x < fMinX) fMinX = x; if (x > fMaxX) fMaxX = x;
    if (y < fMinY) fMinY = y; if (y > fMaxY) fMaxY = y;
    if (z < fMinZ) fMinZ = z; if (z > fMaxZ) fMaxZ = z;
  }

  if (keep.length === 0) return region;
  const n = keep.length;
  const surfacePoints = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const vi = keep[i];
    surfacePoints[i * 3]     = pts[vi * 3];
    surfacePoints[i * 3 + 1] = pts[vi * 3 + 1];
    surfacePoints[i * 3 + 2] = pts[vi * 3 + 2];
  }
  return {
    ...region,
    count: n,
    centroid: [+(sx / n).toFixed(1), +(sy / n).toFixed(1), +(sz / n).toFixed(1)],
    bbox: {
      x: [+fMinX.toFixed(1), +fMaxX.toFixed(1)],
      y: [+fMinY.toFixed(1), +fMaxY.toFixed(1)],
      z: [+fMinZ.toFixed(1), +fMaxZ.toFixed(1)],
    },
    vertexIndices: keep,
    surfacePoints,
  };
}

export function analyseCitRegions(mesh) {
  const pts = mesh?.pts;
  const colors = mesh?.rgba255;
  if (!pts || !colors) return [];

  const nVerts = Math.min(pts.length / 3, colors.length / 4);

  const groups = new Map();
  for (let i = 0; i < nVerts; i++) {
    const r = colors[i * 4];
    const g = colors[i * 4 + 1];
    const b = colors[i * 4 + 2];
    const key = `${r},${g},${b}`;
    let grp = groups.get(key);
    if (!grp) {
      grp = {
        r, g, b,
        count: 0,
        sx: 0, sy: 0, sz: 0,
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity,
        vertexIndices: [],
      };
      groups.set(key, grp);
    }
    const x = pts[i * 3];
    const y = pts[i * 3 + 1];
    const z = pts[i * 3 + 2];
    grp.count++;
    grp.sx += x; grp.sy += y; grp.sz += z;
    if (x < grp.minX) grp.minX = x; if (x > grp.maxX) grp.maxX = x;
    if (y < grp.minY) grp.minY = y; if (y > grp.maxY) grp.maxY = y;
    if (z < grp.minZ) grp.minZ = z; if (z > grp.maxZ) grp.maxZ = z;
    grp.vertexIndices.push(i);
  }

  const regions = [];
  for (const [key, grp] of groups) {
    const cx = grp.sx / grp.count;
    const cy = grp.sy / grp.count;
    const cz = grp.sz / grp.count;

    // match against landmarks; ignore left/right by using |x|
    const absCentroid = [Math.abs(cx), cy, cz];
    let best = null;
    let bestD = Infinity;
    const ranked = [];
    for (const [name, pos] of Object.entries(MNI_LANDMARKS)) {
      const absLm = [Math.abs(pos[0]), pos[1], pos[2]];
      const d = dist3D(absCentroid, absLm);
      ranked.push({ name, d });
      if (d < bestD) { bestD = d; best = name; }
    }
    ranked.sort((a, b) => a.d - b.d);

    regions.push({
      colorKey: key,
      r: grp.r, g: grp.g, b: grp.b,
      count: grp.count,
      centroid: [+cx.toFixed(1), +cy.toFixed(1), +cz.toFixed(1)],
      bbox: {
        x: [+grp.minX.toFixed(1), +grp.maxX.toFixed(1)],
        y: [+grp.minY.toFixed(1), +grp.maxY.toFixed(1)],
        z: [+grp.minZ.toFixed(1), +grp.maxZ.toFixed(1)],
      },
      guess: best,
      guessDistMm: +bestD.toFixed(1),
      topMatches: ranked.slice(0, 3).map(m => `${m.name} (${m.d.toFixed(0)})`),
      vertexIndices: grp.vertexIndices,
    });
  }

  regions.sort((a, b) => b.count - a.count);
  return regions;
}
