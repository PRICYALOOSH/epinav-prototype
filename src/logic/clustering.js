import { scorePointForTarget } from './fakeHeatmap.js';

const dist3 = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export function buildClusteredEntryCandidates(samples, targetIndex, opts = {}) {
  const {
    count = 5,
    radiusMm = 18,
    minScore = 0.16,
    filter = null,
  } = opts;

  if (!Array.isArray(samples) || samples.length === 0) return [];

  const scored = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (filter && !filter(sample)) continue;

    const score = scorePointForTarget(sample.position, targetIndex);
    if (score < minScore) continue;

    scored.push({
      ...sample,
      score,
      risk: 1 - score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const chosen = [];
  const reserve = [];

  for (let i = 0; i < scored.length; i++) {
    const candidate = scored[i];
    let blocked = false;

    for (let j = 0; j < chosen.length; j++) {
      if (dist3(candidate.position, chosen[j].position) < radiusMm) {
        blocked = true;
        break;
      }
    }

    if (blocked) {
      reserve.push(candidate);
      continue;
    }

    chosen.push(candidate);
    if (chosen.length >= count) break;
  }

  if (chosen.length < count) {
    for (let i = 0; i < reserve.length && chosen.length < count; i++) {
      chosen.push(reserve[i]);
    }
  }

  return chosen.slice(0, count).map((candidate, index) => ({
    ...candidate,
    id: `entry-${targetIndex}-${candidate.vertexIndex}`,
    label: `E${index + 1}`,
    scorePct: Math.round(candidate.score * 100),
    riskPct: Math.round(candidate.risk * 100),
    rank: index + 1,
  }));
}
