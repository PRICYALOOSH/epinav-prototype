const sqDist = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

export function buildSurfaceEntrySamples(pts, surfaceMask, opts = {}) {
  const {
    maxPoints = 720,
    minSeparationMm = 6,
  } = opts;

  if (!pts || !surfaceMask) return [];

  const indices = [];
  for (let i = 0; i < surfaceMask.length; i++) {
    if (surfaceMask[i]) indices.push(i);
  }
  if (indices.length === 0) return [];

  const stride = Math.max(1, Math.floor(indices.length / maxPoints));
  const chosen = [];
  const minSepSq = minSeparationMm * minSeparationMm;

  for (let cursor = 0; cursor < indices.length; cursor += stride) {
    const vertexIndex = indices[cursor];
    const point = [
      pts[vertexIndex * 3],
      pts[vertexIndex * 3 + 1],
      pts[vertexIndex * 3 + 2],
    ];

    let tooClose = false;
    for (let i = 0; i < chosen.length; i++) {
      if (sqDist(chosen[i].position, point) < minSepSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    chosen.push({
      id: `sample-${vertexIndex}`,
      vertexIndex,
      position: point,
    });

    if (chosen.length >= maxPoints) break;
  }

  return chosen;
}
