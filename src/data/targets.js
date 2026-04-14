import { TARGET_HEAT_HEX } from '../logic/fakeHeatmap.js';

const TARGET_PALETTE = TARGET_HEAT_HEX;

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export function generateTargetsFromRegion(region, {
  count = 10,
  seed = 1,
  minSepMm = 1.5,
} = {}) {
  if (!region || !region.surfacePoints) return [];

  const sp = region.surfacePoints;
  const nSurface = sp.length / 3;
  if (nSurface === 0) return [];

  const rand = mulberry32(seed);
  const chosen = [];

  const tooClose = (p) => {
    for (const q of chosen) {
      const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
      if (dx * dx + dy * dy + dz * dz < minSepMm * minSepMm) return true;
    }
    return false;
  };

  let attempts = 0;
  while (chosen.length < count && attempts < count * 60) {
    attempts++;
    const i = Math.floor(rand() * nSurface);
    const p = [sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]];
    if (tooClose(p)) continue;
    chosen.push(p);
  }

  return chosen.map((p, i) => ({
    id: `T${i + 1}`,
    name: `${region.guess || 'target'} ${i + 1}`,
    sourceIndex: i,
    position: [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2)],
    color: TARGET_PALETTE[i % TARGET_PALETTE.length],
  }));
}

export function pickAmygdala(regions) {
  if (!regions || regions.length === 0) return null;
  const named = regions.filter((r) => r.guess === 'amygdala');
  if (named.length === 0) return null;
  return named.reduce((best, r) =>
    r.guessDistMm < best.guessDistMm ? r : best
  );
}
