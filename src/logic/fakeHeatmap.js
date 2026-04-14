const BASE_GREY = [205, 200, 192];
const SAFE_GREEN = [0, 212, 170];
const SAFE_AMBER = [245, 166, 35];
const RISK_RED = [255, 107, 107];

const HOTSPOTS_RIGHT = [
  [40, 18, 52],
  [52, -8, 44],
  [36, -28, 58],
  [58, 12, 28],
  [30, 32, 40],
  [48, -40, 36],
  [22, -6, 64],
  [60, -18, 18],
  [34, 22, 24],
  [46, 2, 60],
];

export const TARGET_HEAT_COLOR = [
  [0, 212, 170],
  [245, 166, 35],
  [255, 107, 107],
  [123, 93, 214],
  [78, 205, 196],
  [255, 217, 61],
  [232, 131, 122],
  [150, 206, 180],
  [126, 200, 227],
  [244, 164, 96],
];

const FIELD_CACHE = new Map();

const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const lerpColor = (a, b, t) => [
  Math.round(a[0] * (1 - t) + b[0] * t),
  Math.round(a[1] * (1 - t) + b[1] * t),
  Math.round(a[2] * (1 - t) + b[2] * t),
];

const sampleGradient = (stops, t) => {
  const clamped = clamp01(t);
  if (clamped <= stops[0].at) return stops[0].color;
  if (clamped >= stops[stops.length - 1].at) return stops[stops.length - 1].color;

  for (let i = 1; i < stops.length; i++) {
    if (clamped > stops[i].at) continue;
    const prev = stops[i - 1];
    const next = stops[i];
    return lerpColor(
      prev.color,
      next.color,
      smoothstep(prev.at, next.at, clamped)
    );
  }

  return stops[stops.length - 1].color;
};

const mixIntoBase = (color, weight) => {
  const mix = clamp01(weight);
  return [
    Math.round(BASE_GREY[0] * (1 - mix) + color[0] * mix),
    Math.round(BASE_GREY[1] * (1 - mix) + color[1] * mix),
    Math.round(BASE_GREY[2] * (1 - mix) + color[2] * mix),
  ];
};

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

export const TARGET_HEAT_HEX = TARGET_HEAT_COLOR.map(toHex);

export function getHotspotForTarget(targetIndex) {
  return HOTSPOTS_RIGHT[targetIndex % HOTSPOTS_RIGHT.length];
}

export function getColorForTarget(targetIndex) {
  return TARGET_HEAT_COLOR[targetIndex % TARGET_HEAT_COLOR.length];
}

export function getRiskGradientColor(score) {
  const riskScore = clamp01(1 - score);
  return sampleGradient(
    [
      { at: 0, color: [40, 216, 186] },
      { at: 0.22, color: [108, 224, 116] },
      { at: 0.46, color: [255, 217, 61] },
      { at: 0.68, color: [255, 153, 51] },
      { at: 0.86, color: [255, 96, 96] },
      { at: 1, color: [196, 55, 98] },
    ],
    riskScore
  );
}

export function buildHeatField(targetIndex) {
  const key = targetIndex % TARGET_HEAT_COLOR.length;
  if (FIELD_CACHE.has(key)) {
    return FIELD_CACHE.get(key);
  }

  const primary = getHotspotForTarget(targetIndex);
  const color = getColorForTarget(targetIndex);
  const seed = (targetIndex + 1) * 2654435761;
  const rand = mulberry32(seed);

  const nSub = 3 + Math.floor(rand() * 2);
  const subHotspots = [primary.slice()];
  const spread = 62;
  for (let k = 1; k < nSub; k++) {
    subHotspots.push([
      primary[0] + (rand() - 0.5) * spread,
      primary[1] + (rand() - 0.5) * spread * 1.8,
      primary[2] + (rand() - 0.5) * spread,
    ]);
  }

  const field = {
    color,
    subHotspots,
    radii: subHotspots.map(() => 52 + rand() * 46),
    nf: [
      0.045 + rand() * 0.03,
      0.03 + rand() * 0.025,
      0.055 + rand() * 0.03,
    ],
    nPhase: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
    nf2: [
      0.09 + rand() * 0.04,
      0.07 + rand() * 0.04,
      0.11 + rand() * 0.04,
    ],
    hf: [
      0.10 + rand() * 0.05,
      0.085 + rand() * 0.05,
      0.12 + rand() * 0.05,
    ],
    hPhase: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
  };

  FIELD_CACHE.set(key, field);
  return field;
}

export function scorePointForTarget(point, targetIndex) {
  if (!point) return 0;

  const [x, y, z] = point;
  const field = buildHeatField(targetIndex);
  let weight = 0;

  for (let k = 0; k < field.subHotspots.length; k++) {
    const hotspot = field.subHotspots[k];
    const radius = field.radii[k];
    const dx = x - hotspot[0];
    const dy = y - hotspot[1];
    const dz = z - hotspot[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance < radius) {
      const t = 1 - distance / radius;
      const smoothed = t * t * (3 - 2 * t);
      if (smoothed > weight) weight = smoothed;
    }
  }

  const primaryNoise =
    Math.sin(x * field.nf[0] + field.nPhase[0]) *
    Math.cos(y * field.nf[1] + field.nPhase[1]) *
    Math.sin(z * field.nf[2] + field.nPhase[2]);
  const secondaryNoise = Math.sin(
    x * field.nf2[0] - y * field.nf2[1] + z * field.nf2[2] + field.nPhase[0]
  );
  const combinedNoise =
    (primaryNoise * 0.65 + secondaryNoise * 0.35) * 0.5 + 0.5;
  weight *= 0.55 + 0.9 * combinedNoise;

  const holeA =
    Math.sin(x * field.hf[0] + field.hPhase[0]) *
    Math.sin(y * field.hf[1] + field.hPhase[1]) *
    Math.cos(z * field.hf[2] + field.hPhase[2]);
  const holeB =
    Math.cos(x * field.hf[1] - z * field.hf[0] + field.hPhase[2]) *
    Math.sin(y * field.hf[2] + field.hPhase[0]);
  const holeNoise = (holeA * 0.6 + holeB * 0.4) * 0.5 + 0.5;

  if (holeNoise < 0.58) {
    const softened = holeNoise / 0.58;
    weight *= softened * softened * softened;
  }

  if (weight < 0.08) {
    return 0;
  }

  const normalized = Math.min(1, (weight - 0.08) / 0.5);
  return normalized * normalized * (3 - 2 * normalized);
}

export function computeOuterSurfaceMask(pts) {
  const n = pts.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (let i = 0; i < n; i++) {
    cx += pts[i * 3];
    cy += pts[i * 3 + 1];
    cz += pts[i * 3 + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;

  const nLat = 48;
  const nLon = 96;
  const buckets = new Array(nLat * nLon);
  const dists = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const dx = pts[i * 3] - cx;
    const dy = pts[i * 3 + 1] - cy;
    const dz = pts[i * 3 + 2] - cz;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

    dists[i] = radius;

    const lat = Math.acos(Math.max(-1, Math.min(1, dz / radius)));
    const lon = Math.atan2(dy, dx) + Math.PI;
    const latIndex = Math.min(nLat - 1, Math.floor((lat / Math.PI) * nLat));
    const lonIndex = Math.min(
      nLon - 1,
      Math.floor((lon / (2 * Math.PI)) * nLon)
    );
    const bucketIndex = latIndex * nLon + lonIndex;

    if (!buckets[bucketIndex]) {
      buckets[bucketIndex] = [];
    }
    buckets[bucketIndex].push(i);
  }

  const mask = new Uint8Array(n);
  for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
    const bucket = buckets[bucketIndex];
    if (!bucket) continue;

    let maxDistance = 0;
    for (let i = 0; i < bucket.length; i++) {
      const distance = dists[bucket[i]];
      if (distance > maxDistance) maxDistance = distance;
    }

    const threshold = maxDistance * 0.93;
    for (let i = 0; i < bucket.length; i++) {
      if (dists[bucket[i]] >= threshold) {
        mask[bucket[i]] = 1;
      }
    }
  }

  return mask;
}

export function paintFakeHeatmap(cortexMesh, targetIndex, opts = {}) {
  const {
    transparent = false,
    returnPainted = false,
    style = 'qualitative',
    surfaceMask = null,
  } = opts;
  const pts = cortexMesh?.pts;
  if (!pts) return null;

  const nVerts = pts.length / 3;
  const rgba = new Uint8Array(nVerts * 4);
  const painted = returnPainted ? [] : null;
  const field = buildHeatField(targetIndex);

  for (let i = 0; i < nVerts; i++) {
    if (surfaceMask && !surfaceMask[i]) {
      rgba[i * 4] = BASE_GREY[0];
      rgba[i * 4 + 1] = BASE_GREY[1];
      rgba[i * 4 + 2] = BASE_GREY[2];
      rgba[i * 4 + 3] = transparent ? 0 : 255;
      continue;
    }

    const point = [
      pts[i * 3],
      pts[i * 3 + 1],
      pts[i * 3 + 2],
    ];
    const score = scorePointForTarget(point, targetIndex);
    const visualScore =
      style === 'risk'
        ? clamp01(Math.pow(score, 0.72) * 1.08)
        : score;
    const tint =
      style === 'risk'
        ? mixIntoBase(getRiskGradientColor(visualScore), visualScore * 0.98)
        : mixIntoBase(field.color, visualScore * 0.95);

    rgba[i * 4] = tint[0];
    rgba[i * 4 + 1] = tint[1];
    rgba[i * 4 + 2] = tint[2];
    rgba[i * 4 + 3] = transparent
      ? visualScore <= 0
        ? 0
        : Math.round(Math.min(1, visualScore * 1.2) * 255)
      : 255;

    if (painted && visualScore > 0) {
      painted.push(i);
    }
  }

  if (returnPainted) return { rgba, painted };
  return rgba;
}

export function paintOverlayHeatmap(cortexMesh, targetIndexes, opts = {}) {
  const { transparent = false, surfaceMask = null } = opts;
  const pts = cortexMesh?.pts;
  if (!pts) return null;

  const indexes = Array.isArray(targetIndexes) ? targetIndexes : [];
  const nVerts = pts.length / 3;
  const rgba = new Uint8Array(nVerts * 4);

  for (let i = 0; i < nVerts; i++) {
    if (surfaceMask && !surfaceMask[i]) {
      rgba[i * 4] = BASE_GREY[0];
      rgba[i * 4 + 1] = BASE_GREY[1];
      rgba[i * 4 + 2] = BASE_GREY[2];
      rgba[i * 4 + 3] = transparent ? 0 : 255;
      continue;
    }

    const point = [
      pts[i * 3],
      pts[i * 3 + 1],
      pts[i * 3 + 2],
    ];

    let totalWeight = 0;
    let maxWeight = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (let j = 0; j < indexes.length; j++) {
      const index = indexes[j];
      const weight = scorePointForTarget(point, index);
      if (weight <= 0) continue;

      const color = getColorForTarget(index);
      totalWeight += weight;
      maxWeight = Math.max(maxWeight, weight);
      sumR += color[0] * weight;
      sumG += color[1] * weight;
      sumB += color[2] * weight;
    }

    if (totalWeight === 0) {
      rgba[i * 4] = BASE_GREY[0];
      rgba[i * 4 + 1] = BASE_GREY[1];
      rgba[i * 4 + 2] = BASE_GREY[2];
      rgba[i * 4 + 3] = transparent ? 0 : 255;
      continue;
    }

    const averaged = [
      Math.round(sumR / totalWeight),
      Math.round(sumG / totalWeight),
      Math.round(sumB / totalWeight),
    ];
    const tinted = mixIntoBase(averaged, Math.min(1, maxWeight * 1.05));

    rgba[i * 4] = tinted[0];
    rgba[i * 4 + 1] = tinted[1];
    rgba[i * 4 + 2] = tinted[2];
    rgba[i * 4 + 3] = transparent
      ? Math.round(Math.min(1, maxWeight * 1.25) * 255)
      : 255;
  }

  return rgba;
}
