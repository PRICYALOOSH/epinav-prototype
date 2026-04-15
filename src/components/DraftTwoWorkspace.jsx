import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainCanvas from './BrainCanvas.jsx';
import { generateTargetsFromRegion, pickAmygdala } from '../data/targets.js';
import { buildSurfaceEntrySamples } from '../data/entries.js';
import { buildClusteredEntryCandidates } from '../logic/clustering.js';
import { scorePointForTarget } from '../logic/fakeHeatmap.js';

const palette = {
  bg: '#050D1A',
  surface: '#0A1628',
  surface2: '#0F1F35',
  border: '#1E3552',
  text: '#E8F0F8',
  textMuted: '#8BA3BE',
  textDim: '#3D5A78',
  accent: '#00D4AA',
  accentSoft: 'rgba(0, 212, 170, 0.12)',
  removed: '#FF4757',
  warning: '#F5A623',
};

const DEFAULT_COUNT = 6;
const DEFAULT_RADIUS = 18;
const ENTRY_VALID_THRESHOLD = 0.18;
const MAX_SHORTLIST = 4;
const MAX_RENDERED_TRAJECTORIES = 180;

const clonePoint = (point) => (Array.isArray(point) ? [...point] : point);
const cloneTargets = (targets) =>
  (targets || []).map((target) => ({
    ...target,
    position: clonePoint(target.position),
  }));

const normaliseTargetDecision = (value) => {
  if (value === 'reject') return 'reject';
  if (value === 'accept' || value === 'keep') return 'accept';
  return 'undecided';
};

const buildTargetDecisionMap = (targets, source = null, fallback) =>
  Object.fromEntries(
    (targets || []).map((target) => [
      target.id,
      normaliseTargetDecision(source?.[target.id] ?? fallback),
    ])
  );

const buildFlagMap = (targets, source = null, fallback = true) =>
  Object.fromEntries(
    (targets || []).map((target) => [target.id, source?.[target.id] ?? fallback])
  );

const buildInitialViewState = (initialState = null) => ({
  workflowMode: initialState?.workflowMode || 'target-first',
  targets: cloneTargets(initialState?.targets),
  activeTargetId: initialState?.activeTargetId || null,
  targetStates: initialState?.targetStates || {},
  targetVisibility: initialState?.targetVisibility || {},
  isolatedTargetId: initialState?.isolatedTargetId || null,
  targetRoiRect: initialState?.targetRoiRect ? { ...initialState.targetRoiRect } : null,
  targetRoiIds: Array.isArray(initialState?.targetRoiIds) ? [...initialState.targetRoiIds] : [],
  entryRoiRect: initialState?.entryRoiRect ? { ...initialState.entryRoiRect } : null,
  entryRoiSampleIds: Array.isArray(initialState?.entryRoiSampleIds)
    ? [...initialState.entryRoiSampleIds]
    : [],
  reviewStarted: !!initialState?.reviewStarted,
  filtersTouched: !!initialState?.filtersTouched,
  filterSettings: initialState?.filterSettings
    ? { ...initialState.filterSettings }
    : { count: DEFAULT_COUNT, radiusMm: DEFAULT_RADIUS },
  activeTrajectoryId: initialState?.activeTrajectoryId || null,
  isolatedTrajectoryId: initialState?.isolatedTrajectoryId || null,
  shortlistIds: Array.isArray(initialState?.shortlistIds) ? [...initialState.shortlistIds] : [],
});

const formatPoint = (point) =>
  `${point[0].toFixed(1)}, ${point[1].toFixed(1)}, ${point[2].toFixed(1)}`;

const dist3 = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const getTargetIndex = (target, allTargets) =>
  typeof target?.sourceIndex === 'number'
    ? target.sourceIndex
    : allTargets.findIndex((item) => item.id === target.id);

const targetHasEntryInSamples = (target, samples, allTargets) => {
  const targetIndex = getTargetIndex(target, allTargets);
  if (targetIndex < 0) return false;

  for (const sample of samples) {
    if (scorePointForTarget(sample.position, targetIndex) >= ENTRY_VALID_THRESHOLD) {
      return true;
    }
  }

  return false;
};

const buildAllTrajectories = (targets, samples, allTargets) => {
  const trajectories = [];

  for (const target of targets) {
    const targetIndex = getTargetIndex(target, allTargets);
    if (targetIndex < 0) continue;

    const scored = [];
    for (const sample of samples) {
      const score = scorePointForTarget(sample.position, targetIndex);
      if (score < ENTRY_VALID_THRESHOLD) continue;
      scored.push({ sample, score });
    }

    scored.sort((a, b) => b.score - a.score);

    for (let rank = 0; rank < scored.length; rank++) {
      const { sample, score } = scored[rank];
      const risk = 1 - score;
      trajectories.push({
        id: `traj-${target.id}-${sample.vertexIndex}`,
        targetId: target.id,
        targetName: target.name || target.id,
        targetColor: target.color,
        targetPosition: target.position,
        entryId: sample.id,
        entryLabel: `V${rank + 1}`,
        entryPosition: sample.position,
        vertexIndex: sample.vertexIndex,
        scorePct: Math.round(score * 100),
        riskPct: Math.round(risk * 100),
        score,
        risk,
        lengthMm: dist3(target.position, sample.position),
      });
    }
  }

  return trajectories.sort((a, b) => b.score - a.score);
};

const buildSnapshot = ({
  workflowMode,
  targets,
  activeTargetId,
  targetStates,
  targetVisibility,
  isolatedTargetId,
  targetRoiRect,
  targetRoiIds,
  entryRoiRect,
  entryRoiSampleIds,
  reviewStarted,
  filtersTouched,
  filterSettings,
  activeTrajectoryId,
  isolatedTrajectoryId,
  shortlistIds,
}) => ({
  workflowMode,
  targets: cloneTargets(targets),
  activeTargetId,
  targetStates: { ...targetStates },
  targetVisibility: { ...targetVisibility },
  isolatedTargetId,
  targetRoiRect: targetRoiRect ? { ...targetRoiRect } : null,
  targetRoiIds: [...targetRoiIds],
  entryRoiRect: entryRoiRect ? { ...entryRoiRect } : null,
  entryRoiSampleIds: [...entryRoiSampleIds],
  reviewStarted,
  filtersTouched,
  filterSettings: { ...filterSettings },
  activeTrajectoryId,
  isolatedTrajectoryId,
  shortlistIds: [...shortlistIds],
});

const buttonBase = {
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

export default function DraftTwoWorkspace({
  onBack,
  onContinue,
  initialState = null,
}) {
  const initialViewState = useMemo(() => buildInitialViewState(initialState), [initialState]);
  const lastWorkflowModeRef = useRef(initialViewState.workflowMode);
  const [workflowMode, setWorkflowMode] = useState(initialViewState.workflowMode);
  const [targets, setTargets] = useState(initialViewState.targets || []);
  const [activeTargetId, setActiveTargetId] = useState(initialViewState.activeTargetId);
  const [targetStates, setTargetStates] = useState(initialViewState.targetStates);
  const [targetVisibility, setTargetVisibility] = useState(initialViewState.targetVisibility);
  const [isolatedTargetId, setIsolatedTargetId] = useState(initialViewState.isolatedTargetId);
  const [targetRoiRect, setTargetRoiRect] = useState(initialViewState.targetRoiRect);
  const [targetRoiIds, setTargetRoiIds] = useState(initialViewState.targetRoiIds);
  const [targetRoiEditEnabled, setTargetRoiEditEnabled] = useState(false);
  const [surfaceSamples, setSurfaceSamples] = useState([]);
  const [entryRoiRect, setEntryRoiRect] = useState(initialViewState.entryRoiRect);
  const [entryRoiSampleIds, setEntryRoiSampleIds] = useState(initialViewState.entryRoiSampleIds);
  const [entryRoiEditEnabled, setEntryRoiEditEnabled] = useState(false);
  const [reviewStarted, setReviewStarted] = useState(initialViewState.reviewStarted);
  const [filtersTouched, setFiltersTouched] = useState(initialViewState.filtersTouched);
  const [filterSettings, setFilterSettings] = useState(initialViewState.filterSettings);
  const [activeTrajectoryId, setActiveTrajectoryId] = useState(initialViewState.activeTrajectoryId);
  const [isolatedTrajectoryId, setIsolatedTrajectoryId] = useState(
    initialViewState.isolatedTrajectoryId
  );
  const [shortlistIds, setShortlistIds] = useState(initialViewState.shortlistIds);

  const handleRegionsReady = useCallback(
    (regions) => {
      if (targets.length > 0) return;
      const amygdala = pickAmygdala(regions);
      if (!amygdala) return;

      const generated = generateTargetsFromRegion(amygdala, { count: 10, seed: 7 });
      setTargets(generated);
      setActiveTargetId(generated[0]?.id || null);
      setTargetStates(buildTargetDecisionMap(generated, null, 'undecided'));
      setTargetVisibility(buildFlagMap(generated, null, true));
    },
    [targets.length]
  );

  const handleSurfaceReady = useCallback(({ pts, surfaceMask }) => {
    setSurfaceSamples(buildSurfaceEntrySamples(pts, surfaceMask));
  }, []);

  useEffect(() => {
    if (targets.length === 0) return;

    setTargetStates((prev) => buildTargetDecisionMap(targets, prev, 'undecided'));
    setTargetVisibility((prev) => buildFlagMap(targets, prev, true));
    setActiveTargetId((prev) => prev || targets[0]?.id || null);
  }, [targets]);

  const targetRoiTargetSet = useMemo(() => new Set(targetRoiIds), [targetRoiIds]);
  const entryRoiSampleSet = useMemo(() => new Set(entryRoiSampleIds), [entryRoiSampleIds]);

  useEffect(() => {
    if (lastWorkflowModeRef.current === workflowMode) return;
    lastWorkflowModeRef.current = workflowMode;
    if (targets.length === 0) return;
    setTargetStates(buildTargetDecisionMap(targets, null, 'undecided'));
    setTargetVisibility(buildFlagMap(targets, null, true));
    setTargetRoiRect(null);
    setTargetRoiIds([]);
    setEntryRoiRect(null);
    setEntryRoiSampleIds([]);
    setTargetRoiEditEnabled(false);
    setEntryRoiEditEnabled(false);
    setReviewStarted(false);
    setFiltersTouched(false);
    setActiveTrajectoryId(null);
    setIsolatedTrajectoryId(null);
    setIsolatedTargetId(null);
    setShortlistIds([]);
    setActiveTargetId(targets[0]?.id || null);
  }, [workflowMode, targets]);

  useEffect(() => {
    if (workflowMode !== 'target-first') return;
    if (targets.length === 0) return;

    if (targetRoiIds.length === 0) {
      setTargetStates(buildTargetDecisionMap(targets, null, 'undecided'));
      return;
    }

    setTargetStates(
      Object.fromEntries(
        targets.map((target) => [target.id, targetRoiTargetSet.has(target.id) ? 'accept' : 'reject'])
      )
    );
    setActiveTargetId((prev) =>
      prev && targetRoiTargetSet.has(prev) ? prev : targetRoiIds[0] || targets[0]?.id || null
    );
    setIsolatedTargetId((prev) => (prev && targetRoiTargetSet.has(prev) ? prev : null));
  }, [targetRoiIds, targetRoiTargetSet, targets, workflowMode]);

  useEffect(() => {
    if (workflowMode !== 'entry-first') return;
    if (targets.length === 0) return;

    if (entryRoiSampleIds.length === 0) {
      setTargetStates(buildTargetDecisionMap(targets, null, 'undecided'));
      return;
    }

    const selectedSamples = surfaceSamples.filter((sample) => entryRoiSampleSet.has(sample.id));
    setTargetStates(
      Object.fromEntries(
        targets.map((target) => [
          target.id,
          targetHasEntryInSamples(target, selectedSamples, targets) ? 'accept' : 'reject',
        ])
      )
    );
    setActiveTargetId((prev) => {
      if (
        prev &&
        targets.some(
          (target) =>
            target.id === prev && targetHasEntryInSamples(target, selectedSamples, targets)
        )
      ) {
        return prev;
      }
      return (
        targets.find((target) => targetHasEntryInSamples(target, selectedSamples, targets))?.id ||
        targets[0]?.id ||
        null
      );
    });
    setIsolatedTargetId((prev) =>
      prev &&
      targets.some(
        (target) => target.id === prev && targetHasEntryInSamples(target, selectedSamples, targets)
      )
        ? prev
        : null
    );
  }, [entryRoiSampleIds, entryRoiSampleSet, surfaceSamples, targets, workflowMode]);

  const acceptedTargets = useMemo(
    () => targets.filter((target) => targetStates[target.id] === 'accept'),
    [targetStates, targets]
  );
  const roiTargets = useMemo(
    () => targets.filter((target) => targetRoiTargetSet.has(target.id)),
    [targetRoiTargetSet, targets]
  );
  const reviewTargets = useMemo(
    () => acceptedTargets,
    [acceptedTargets]
  );
  const visibleTargets = useMemo(() => {
    if (isolatedTargetId && reviewTargets.some((target) => target.id === isolatedTargetId)) {
      return reviewTargets.filter((target) => target.id === isolatedTargetId);
    }
    return reviewTargets.filter((target) => targetVisibility[target.id] !== false);
  }, [isolatedTargetId, reviewTargets, targetVisibility]);
  const visibleTargetIds = visibleTargets.map((target) => target.id);
  const entryRoiSamples = useMemo(
    () => surfaceSamples.filter((sample) => entryRoiSampleSet.has(sample.id)),
    [entryRoiSampleSet, surfaceSamples]
  );

  const allTrajectories = useMemo(
    () => buildAllTrajectories(reviewTargets, entryRoiSamples, targets),
    [entryRoiSamples, reviewTargets, targets]
  );
  const allTrajectoryMap = useMemo(
    () => new Map(allTrajectories.map((trajectory) => [trajectory.id, trajectory])),
    [allTrajectories]
  );

  const filteredTrajectories = useMemo(() => {
    const filtered = [];

    for (const target of reviewTargets) {
      const targetIndex = getTargetIndex(target, targets);
      if (targetIndex < 0) continue;

      const candidates = buildClusteredEntryCandidates(entryRoiSamples, targetIndex, {
        count: filterSettings.count,
        radiusMm: filterSettings.radiusMm,
        minScore: ENTRY_VALID_THRESHOLD,
      });

      for (const candidate of candidates) {
        const trajectory = allTrajectoryMap.get(`traj-${target.id}-${candidate.vertexIndex}`);
        if (trajectory) {
          filtered.push(trajectory);
        }
      }
    }

    return filtered.sort((a, b) => b.score - a.score);
  }, [
    allTrajectoryMap,
    entryRoiSamples,
    filterSettings.count,
    filterSettings.radiusMm,
    reviewTargets,
    targets,
  ]);

  const displayTrajectories = useMemo(() => {
    if (!reviewStarted) return [];
    const source = filtersTouched ? filteredTrajectories : allTrajectories;
    return source.slice(0, MAX_RENDERED_TRAJECTORIES);
  }, [allTrajectories, filteredTrajectories, filtersTouched, reviewStarted]);

  const shortlistTrajectories = useMemo(
    () => shortlistIds.map((id) => allTrajectoryMap.get(id)).filter(Boolean),
    [allTrajectoryMap, shortlistIds]
  );

  useEffect(() => {
    if (!activeTargetId && targets[0]) {
      setActiveTargetId(targets[0].id);
    }
  }, [activeTargetId, targets]);

  useEffect(() => {
    if (isolatedTargetId && !reviewTargets.some((target) => target.id === isolatedTargetId)) {
      setIsolatedTargetId(null);
    }
  }, [isolatedTargetId, reviewTargets]);

  useEffect(() => {
    if (isolatedTrajectoryId && !displayTrajectories.some((item) => item.id === isolatedTrajectoryId)) {
      setIsolatedTrajectoryId(null);
    }
  }, [displayTrajectories, isolatedTrajectoryId]);

  useEffect(() => {
    if (displayTrajectories.length === 0) {
      setActiveTrajectoryId(null);
      return;
    }

    if (!activeTrajectoryId || !displayTrajectories.some((item) => item.id === activeTrajectoryId)) {
      setActiveTrajectoryId(displayTrajectories[0].id);
    }
  }, [activeTrajectoryId, displayTrajectories]);

  useEffect(() => {
    const validIds = new Set(allTrajectories.map((trajectory) => trajectory.id));
    setShortlistIds((prev) => prev.filter((id) => validIds.has(id)).slice(0, MAX_SHORTLIST));
  }, [allTrajectories]);

  const activeTarget = targets.find((target) => target.id === activeTargetId) || null;
  const activeTrajectory =
    displayTrajectories.find((trajectory) => trajectory.id === activeTrajectoryId) ||
    displayTrajectories[0] ||
    null;
  const structureVisibleTargetIds =
    workflowMode === 'entry-first' ? acceptedTargets.map((target) => target.id) : targetRoiIds;
  const canvasTrajectories =
    isolatedTrajectoryId && activeTrajectory && isolatedTrajectoryId === activeTrajectory.id
      ? [activeTrajectory]
      : isolatedTrajectoryId
        ? displayTrajectories.filter((trajectory) => trajectory.id === isolatedTrajectoryId)
        : displayTrajectories;

  const canShowTrajectories = reviewTargets.length > 0 && entryRoiSamples.length > 0;
  const canContinue = shortlistTrajectories.length > 0;

  const handleClearTargetRoi = () => {
    setTargetRoiRect(null);
    setTargetRoiIds([]);
    setIsolatedTargetId(null);
  };

  const handleClearEntryRoi = () => {
    setEntryRoiRect(null);
    setEntryRoiSampleIds([]);
    setReviewStarted(false);
    setFiltersTouched(false);
    setActiveTrajectoryId(null);
    setIsolatedTrajectoryId(null);
  };

  const toggleShortlist = (trajectoryId) => {
    setShortlistIds((prev) => {
      if (prev.includes(trajectoryId)) {
        return prev.filter((id) => id !== trajectoryId);
      }
      if (prev.length >= MAX_SHORTLIST) {
        return prev;
      }
      return [...prev, trajectoryId];
    });
  };

  const handlePrepareFinalReview = () => {
    if (!canContinue) return;

    const shortlisted = shortlistIds
      .map((id) => allTrajectoryMap.get(id))
      .filter(Boolean)
      .slice(0, MAX_SHORTLIST);
    const shortlistedTargetIds = new Set(shortlisted.map((trajectory) => trajectory.targetId));
    const keptTargets = reviewTargets.filter((target) => shortlistedTargetIds.has(target.id));

    const stage2Snapshot = buildSnapshot({
      workflowMode,
      targets,
      activeTargetId,
      targetStates,
      targetVisibility,
      isolatedTargetId,
      targetRoiRect,
      targetRoiIds,
      entryRoiRect,
      entryRoiSampleIds,
      reviewStarted,
      filtersTouched,
      filterSettings,
      activeTrajectoryId,
      isolatedTrajectoryId,
      shortlistIds,
    });

    onContinue({
      sourceMode: 'D2',
      sourceModeLabel: 'Draft 2',
      keptTargets,
      selections: shortlisted.map((trajectory) => ({
        targetId: trajectory.targetId,
        targetColor: trajectory.targetColor,
        targetPosition: trajectory.targetPosition,
        entryId: trajectory.entryId,
        entryLabel: trajectory.entryLabel,
        entryPosition: trajectory.entryPosition,
        scorePct: trajectory.scorePct,
        riskPct: trajectory.riskPct,
      })),
      stage2Snapshot,
    });
  };

  return (
    <div
      className="screen-enter"
      style={{
        position: 'fixed',
        inset: 0,
        background: palette.bg,
        color: palette.text,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          padding: '14px 24px',
          borderBottom: `1px solid ${palette.border}`,
          background: palette.surface,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: palette.accent,
              textTransform: 'uppercase',
            }}
          >
            Draft 2
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
            Combined Target And Trajectory Review
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {[
              { key: 'target-first', label: 'Target First' },
              { key: 'entry-first', label: 'Entry First' },
            ].map((modeOption) => {
              const active = workflowMode === modeOption.key;
              return (
                <button
                  key={modeOption.key}
                  onClick={() => setWorkflowMode(modeOption.key)}
                  style={{
                    ...buttonBase,
                    padding: '6px 10px',
                    border: `1px solid ${active ? palette.accent : palette.border}`,
                    background: active ? palette.accentSoft : palette.surface2,
                    color: active ? palette.accent : palette.textMuted,
                    fontSize: 10,
                  }}
                >
                  {modeOption.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: palette.surface2,
              fontSize: 12,
              color: palette.textMuted,
            }}
          >
            target ROI {roiTargets.length} / entry ROI {entryRoiSamples.length} / shortlist{' '}
            {shortlistTrajectories.length}
          </div>
          <button
            onClick={onBack}
            style={{
              ...buttonBase,
              border: `1px solid ${palette.border}`,
              background: 'transparent',
              color: palette.textMuted,
            }}
          >
            {'<- Back'}
          </button>
          <button
            onClick={handlePrepareFinalReview}
            disabled={!canContinue}
            style={{
              ...buttonBase,
              border: `1px solid ${canContinue ? palette.accent : palette.border}`,
              background: canContinue ? palette.accentSoft : palette.surface2,
              color: canContinue ? palette.accent : palette.textDim,
              cursor: canContinue ? 'pointer' : 'not-allowed',
            }}
          >
            Proceed To Final Review
          </button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside
          style={{
            width: 296,
            flexShrink: 0,
            background: palette.surface,
            borderRight: `1px solid ${palette.border}`,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${palette.border}` }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: palette.textMuted,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Stage 1
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {workflowMode === 'entry-first' ? 'Target Availability' : 'Target ROI'}
            </div>
            <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.45, marginTop: 8 }}>
              {workflowMode === 'entry-first'
                ? 'Choose the entry ROI first. Available target points will be accepted automatically, and you can still refine them manually here.'
                : 'Draw an ROI on the structure view, then refine the targets that will feed trajectory generation.'}
            </div>
            {workflowMode === 'target-first' ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setTargetRoiEditEnabled((prev) => !prev)}
                  style={{
                    ...buttonBase,
                    flex: 1,
                    border: `1px solid ${targetRoiEditEnabled ? palette.accent : palette.border}`,
                    background: targetRoiEditEnabled ? palette.accentSoft : palette.surface2,
                    color: targetRoiEditEnabled ? palette.accent : palette.textMuted,
                  }}
                >
                  {targetRoiEditEnabled ? 'Stop ROI' : 'Edit Target ROI'}
                </button>
                <button
                  onClick={handleClearTargetRoi}
                  disabled={!targetRoiRect}
                  style={{
                    ...buttonBase,
                    border: `1px solid ${palette.border}`,
                    background: targetRoiRect ? palette.surface2 : 'transparent',
                    color: targetRoiRect ? palette.text : palette.textDim,
                    cursor: targetRoiRect ? 'pointer' : 'not-allowed',
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${
                  roiTargets.length > 0 ? 'rgba(0, 212, 170, 0.35)' : palette.border
                }`,
                background: roiTargets.length > 0 ? palette.accentSoft : palette.surface2,
                fontSize: 12,
                lineHeight: 1.45,
                color: roiTargets.length > 0 ? palette.text : palette.textMuted,
              }}
            >
              {workflowMode === 'entry-first'
                ? entryRoiSampleIds.length > 0
                  ? `${acceptedTargets.length} targets are available from the selected entry ROI.`
                  : 'No entry ROI selected yet. Targets remain undecided until you draw one.'
                : targetRoiIds.length > 0
                  ? `${roiTargets.length} targets fall inside the ROI and have been accepted.`
                  : 'No target ROI selected yet. All targets remain undecided until you draw one.'}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 10px 18px' }}>
            {targets.length === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  fontSize: 12,
                  color: palette.textMuted,
                }}
              >
                Waiting for target generation.
              </div>
            ) : (
              targets.map((target) => {
                const accepted = targetStates[target.id] === 'accept';
                const rejected = targetStates[target.id] === 'reject';
                const undecided = targetStates[target.id] === 'undecided';
                const hidden = targetVisibility[target.id] === false;
                const isolated = isolatedTargetId === target.id;
                const active = activeTargetId === target.id;
                const decisionStatus = accepted
                  ? 'Accepted'
                  : rejected
                    ? 'Rejected'
                    : 'Undecided';

                return (
                  <div
                    key={target.id}
                    onClick={() => setActiveTargetId(target.id)}
                    style={{
                      marginBottom: 8,
                      padding: '11px 12px',
                      borderRadius: 10,
                      border: `1px solid ${active ? palette.accent : palette.border}`,
                      background: active ? palette.accentSoft : palette.surface2,
                      opacity: rejected ? 0.55 : 1,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: target.color,
                            border: '1px solid rgba(255,255,255,0.25)',
                          }}
                        />
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{target.id}</div>
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: rejected
                            ? palette.removed
                            : accepted
                              ? palette.accent
                              : isolated
                                ? palette.accent
                                : hidden
                                  ? palette.warning
                                  : palette.textMuted,
                        }}
                      >
                        {decisionStatus}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        fontFamily: '"Courier New", Courier, monospace',
                        marginTop: 6,
                      }}
                    >
                      {formatPoint(target.position)}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setTargetStates((prev) => ({
                            ...prev,
                            [target.id]: 'accept',
                          }));
                        }}
                        style={{
                          ...buttonBase,
                          padding: '6px 10px',
                          border: `1px solid ${accepted ? palette.accent : palette.border}`,
                          background: accepted ? palette.accentSoft : palette.bg,
                          color: accepted ? palette.accent : palette.textMuted,
                          fontSize: 10,
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setTargetStates((prev) => ({
                            ...prev,
                            [target.id]: 'reject',
                          }));
                        }}
                        style={{
                          ...buttonBase,
                          padding: '6px 10px',
                          border: `1px solid ${palette.removed}`,
                          background: rejected ? 'rgba(255, 71, 87, 0.18)' : 'transparent',
                          color: palette.removed,
                          fontSize: 10,
                        }}
                      >
                        Reject
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setTargetVisibility((prev) => ({
                            ...prev,
                            [target.id]: prev[target.id] === false,
                          }));
                        }}
                        disabled={!accepted}
                        style={{
                          ...buttonBase,
                          padding: '6px 10px',
                          border: `1px solid ${hidden ? palette.warning : palette.border}`,
                          background: hidden ? 'rgba(245, 166, 35, 0.14)' : palette.bg,
                          color: hidden ? palette.warning : palette.textMuted,
                          fontSize: 10,
                          cursor: !accepted ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {hidden ? 'Show' : 'Hide'}
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsolatedTargetId((prev) => (prev === target.id ? null : target.id));
                        }}
                        disabled={!accepted}
                        style={{
                          ...buttonBase,
                          padding: '6px 10px',
                          border: `1px solid ${isolated ? palette.accent : palette.border}`,
                          background: isolated ? palette.accentSoft : palette.bg,
                          color: isolated ? palette.accent : palette.textMuted,
                          fontSize: 10,
                          cursor: !accepted ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isolated ? 'Clear isolate' : 'Isolate'}
                      </button>
                      <div
                        style={{
                          ...buttonBase,
                          padding: '6px 10px',
                          border: `1px solid ${
                            undecided
                              ? palette.border
                              : accepted
                                ? palette.accent
                                : palette.removed
                          }`,
                          background:
                            undecided
                              ? palette.bg
                              : accepted
                                ? palette.accentSoft
                                : 'rgba(255, 71, 87, 0.18)',
                          color:
                            undecided
                              ? palette.textDim
                              : accepted
                                ? palette.accent
                                : palette.removed,
                          fontSize: 10,
                          cursor: 'default',
                        }}
                      >
                        {decisionStatus}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0,
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', borderRight: `1px solid ${palette.border}` }}>
              <BrainCanvas
                mode="structures"
                targets={targets}
                activeTargetId={activeTargetId}
                visibleTargetIds={structureVisibleTargetIds}
                roiRect={workflowMode === 'target-first' ? targetRoiRect : null}
                roiEditEnabled={workflowMode === 'target-first' ? targetRoiEditEnabled : false}
                roiSelectionItems={targets}
                onRegionsReady={handleRegionsReady}
                onRoiChange={workflowMode === 'target-first' ? setTargetRoiRect : null}
                onRoiSelectionIdsChange={workflowMode === 'target-first' ? setTargetRoiIds : null}
              />
            </div>
            <div style={{ minWidth: 0, display: 'flex' }}>
              {reviewStarted ? (
                <BrainCanvas
                  key={`draft2-trajectories-${filtersTouched}-${canvasTrajectories.length}`}
                  mode="final"
                  targets={reviewTargets}
                  activeTargetId={activeTrajectory?.targetId || activeTargetId}
                  visibleTargetIds={visibleTargetIds}
                  finalTrajectories={canvasTrajectories}
                  activeFinalTrajectoryId={activeTrajectory?.id || null}
                />
              ) : (
                <BrainCanvas
                  key="draft2-entry-roi"
                  mode="entry"
                  targets={reviewTargets}
                  activeTargetId={activeTargetId}
                  visibleTargetIds={visibleTargetIds}
                  entryView="hover"
                  hoverSamples={surfaceSamples}
                  roiRect={entryRoiRect}
                  roiSampleIds={entryRoiSampleIds}
                  roiEditEnabled={entryRoiEditEnabled}
                  onSurfaceReady={handleSurfaceReady}
                  onRoiChange={setEntryRoiRect}
                  onRoiSampleIdsChange={setEntryRoiSampleIds}
                />
              )}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 18px',
              borderTop: `1px solid ${palette.border}`,
              background: palette.surface,
              color: palette.textMuted,
              fontSize: 12,
            }}
          >
            <div>
              {activeTarget
                ? `Active target ${activeTarget.id} at ${formatPoint(activeTarget.position)}`
                : 'Waiting for targets'}
            </div>
            <div>
              {reviewStarted
                ? `${displayTrajectories.length} trajectory lines on canvas`
                : entryRoiSamples.length > 0
                  ? `${entryRoiSamples.length} entry samples selected in the ROI`
                  : 'Draw an entry ROI on the full brain view'}
            </div>
            {!filtersTouched && reviewStarted && (
              <div style={{ color: palette.warning }}>
                Showing all ROI-valid trajectories. Move either filter to reduce them.
              </div>
            )}
          </div>
        </div>

        <aside
          style={{
            width: 316,
            flexShrink: 0,
            background: palette.surface,
            borderLeft: `1px solid ${palette.border}`,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ padding: '14px 14px', borderBottom: `1px solid ${palette.border}` }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: palette.textMuted,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {workflowMode === 'entry-first' ? 'Stage 1' : 'Stage 2'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {workflowMode === 'entry-first' ? 'Entry ROI First' : 'Entry ROI And Trajectories'}
            </div>
            <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.45, marginTop: 8 }}>
              {workflowMode === 'entry-first'
                ? 'Draw the entry ROI first. The target view will update to show which targets are available, then you can reveal and filter trajectories.'
                : 'Draw the entry ROI, reveal all valid target-to-entry trajectories, then use the number and radius controls to narrow the set.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => setEntryRoiEditEnabled((prev) => !prev)}
                style={{
                  ...buttonBase,
                  flex: 1,
                  border: `1px solid ${entryRoiEditEnabled ? palette.accent : palette.border}`,
                  background: entryRoiEditEnabled ? palette.accentSoft : palette.surface2,
                  color: entryRoiEditEnabled ? palette.accent : palette.textMuted,
                }}
              >
                {entryRoiEditEnabled ? 'Stop ROI' : 'Edit Entry ROI'}
              </button>
              <button
                onClick={handleClearEntryRoi}
                disabled={!entryRoiRect}
                style={{
                  ...buttonBase,
                  border: `1px solid ${palette.border}`,
                  background: entryRoiRect ? palette.surface2 : 'transparent',
                  color: entryRoiRect ? palette.text : palette.textDim,
                  cursor: entryRoiRect ? 'pointer' : 'not-allowed',
                }}
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => setReviewStarted(true)}
              disabled={!canShowTrajectories}
              style={{
                ...buttonBase,
                width: '100%',
                marginTop: 12,
                border: `1px solid ${canShowTrajectories ? palette.accent : palette.border}`,
                background: canShowTrajectories ? palette.accentSoft : palette.surface2,
                color: canShowTrajectories ? palette.accent : palette.textDim,
                cursor: canShowTrajectories ? 'pointer' : 'not-allowed',
              }}
            >
              Show Trajectories
            </button>
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${palette.border}`,
                background: palette.surface2,
                fontSize: 12,
                lineHeight: 1.45,
                color: palette.textMuted,
              }}
            >
              {!targetRoiIds.length
                ? workflowMode === 'target-first'
                  ? 'Select a target ROI first.'
                  : !entryRoiSampleIds.length
                    ? 'Draw an entry ROI on the full-brain view.'
                    : `${acceptedTargets.length} targets are available from this entry ROI.`
                : !entryRoiSampleIds.length
                  ? 'Draw an entry ROI on the full-brain view.'
                  : `${allTrajectories.length} ROI-valid trajectories are available across ${reviewTargets.length} retained targets.`}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 16px' }}>
            {reviewStarted && (
              <>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: `1px solid ${palette.border}`,
                    background: palette.surface2,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: 1.4,
                          textTransform: 'uppercase',
                          color: palette.textMuted,
                        }}
                      >
                        Trajectory Filters
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                        {filtersTouched
                          ? `${filteredTrajectories.length} filtered lines`
                          : `${allTrajectories.length} lines`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFiltersTouched(false);
                        setFilterSettings({ count: DEFAULT_COUNT, radiusMm: DEFAULT_RADIUS });
                      }}
                      style={{
                        ...buttonBase,
                        padding: '6px 10px',
                        border: `1px solid ${palette.border}`,
                        background: palette.bg,
                        color: palette.textMuted,
                        fontSize: 10,
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 11,
                        color: palette.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      <span>Number per target</span>
                      <span style={{ color: palette.text, fontWeight: 700 }}>{filterSettings.count}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={filterSettings.count}
                      onChange={(event) => {
                        setFiltersTouched(true);
                        setFilterSettings((prev) => ({
                          ...prev,
                          count: Number(event.target.value),
                        }));
                      }}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 11,
                        color: palette.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      <span>Radius</span>
                      <span style={{ color: palette.text, fontWeight: 700 }}>
                        {filterSettings.radiusMm} mm
                      </span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={32}
                      step={1}
                      value={filterSettings.radiusMm}
                      onChange={(event) => {
                        setFiltersTouched(true);
                        setFilterSettings((prev) => ({
                          ...prev,
                          radiusMm: Number(event.target.value),
                        }));
                      }}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {activeTrajectory && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: `1px solid ${palette.accent}`,
                      background: palette.accentSoft,
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: 1.4,
                        textTransform: 'uppercase',
                        color: palette.accent,
                      }}
                    >
                      Active trajectory
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                      {activeTrajectory.targetId} · {activeTrajectory.entryLabel}
                    </div>
                    <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 6 }}>
                      safety {activeTrajectory.scorePct}% / risk {activeTrajectory.riskPct}% / length{' '}
                      {activeTrajectory.lengthMm.toFixed(1)} mm
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 11,
                        color: palette.textMuted,
                        fontFamily: '"Courier New", Courier, monospace',
                        lineHeight: 1.45,
                      }}
                    >
                      {formatPoint(activeTrajectory.entryPosition)}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => toggleShortlist(activeTrajectory.id)}
                        style={{
                          ...buttonBase,
                          flex: 1,
                          border: `1px solid ${
                            shortlistIds.includes(activeTrajectory.id) ? palette.accent : palette.border
                          }`,
                          background: shortlistIds.includes(activeTrajectory.id)
                            ? palette.accentSoft
                            : palette.bg,
                          color: shortlistIds.includes(activeTrajectory.id)
                            ? palette.accent
                            : palette.textMuted,
                        }}
                      >
                        {shortlistIds.includes(activeTrajectory.id)
                          ? 'Remove From Shortlist'
                          : 'Add To Shortlist'}
                      </button>
                      <button
                        onClick={() =>
                          setIsolatedTrajectoryId((prev) =>
                            prev === activeTrajectory.id ? null : activeTrajectory.id
                          )
                        }
                        style={{
                          ...buttonBase,
                          border: `1px solid ${
                            isolatedTrajectoryId === activeTrajectory.id ? palette.accent : palette.border
                          }`,
                          background:
                            isolatedTrajectoryId === activeTrajectory.id ? palette.accentSoft : palette.bg,
                          color:
                            isolatedTrajectoryId === activeTrajectory.id ? palette.accent : palette.textMuted,
                        }}
                      >
                        {isolatedTrajectoryId === activeTrajectory.id ? 'Show All' : 'Isolate'}
                      </button>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: palette.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Shortlist ({shortlistTrajectories.length}/{MAX_SHORTLIST})
                </div>
                {shortlistTrajectories.length === 0 ? (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1px solid ${palette.border}`,
                      background: palette.surface2,
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: palette.textMuted,
                      marginBottom: 14,
                    }}
                  >
                    Add up to four trajectories for final review.
                  </div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    {shortlistTrajectories.map((trajectory) => (
                      <div
                        key={trajectory.id}
                        onClick={() => setActiveTrajectoryId(trajectory.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: `1px solid ${
                            activeTrajectory?.id === trajectory.id ? palette.accent : palette.border
                          }`,
                          background:
                            activeTrajectory?.id === trajectory.id ? palette.accentSoft : palette.surface2,
                          marginBottom: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {trajectory.targetId} · {trajectory.entryLabel}
                        </div>
                        <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                          safety {trajectory.scorePct}% / risk {trajectory.riskPct}% / length{' '}
                          {trajectory.lengthMm.toFixed(1)} mm
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: palette.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Visible trajectories
                </div>
                {displayTrajectories.length === 0 ? (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1px solid ${palette.border}`,
                      background: palette.surface2,
                      fontSize: 12,
                      color: palette.textMuted,
                    }}
                  >
                    No trajectories are available for the current ROI and target choices.
                  </div>
                ) : (
                  displayTrajectories.map((trajectory) => {
                    const active = activeTrajectory?.id === trajectory.id;
                    const shortlisted = shortlistIds.includes(trajectory.id);
                    return (
                      <div
                        key={trajectory.id}
                        onClick={() => setActiveTrajectoryId(trajectory.id)}
                        style={{
                          padding: '11px 12px',
                          borderRadius: 10,
                          border: `1px solid ${active ? palette.accent : palette.border}`,
                          background: active ? palette.accentSoft : palette.surface2,
                          marginBottom: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {trajectory.targetId} · {trajectory.entryLabel}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: shortlisted ? palette.accent : active ? palette.text : palette.textMuted,
                            }}
                          >
                            {shortlisted ? 'shortlisted' : active ? 'active' : 'view'}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                          safety {trajectory.scorePct}% / risk {trajectory.riskPct}% / length{' '}
                          {trajectory.lengthMm.toFixed(1)} mm
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleShortlist(trajectory.id);
                            }}
                            disabled={!shortlisted && shortlistIds.length >= MAX_SHORTLIST}
                            style={{
                              ...buttonBase,
                              padding: '6px 10px',
                              border: `1px solid ${shortlisted ? palette.accent : palette.border}`,
                              background: shortlisted ? palette.accentSoft : palette.bg,
                              color: shortlisted ? palette.accent : palette.textMuted,
                              fontSize: 10,
                              cursor:
                                shortlisted || shortlistIds.length < MAX_SHORTLIST
                                  ? 'pointer'
                                  : 'not-allowed',
                            }}
                          >
                            {shortlisted ? 'Remove' : 'Shortlist'}
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setIsolatedTrajectoryId((prev) =>
                                prev === trajectory.id ? null : trajectory.id
                              );
                              setActiveTrajectoryId(trajectory.id);
                            }}
                            style={{
                              ...buttonBase,
                              padding: '6px 10px',
                              border: `1px solid ${
                                isolatedTrajectoryId === trajectory.id ? palette.accent : palette.border
                              }`,
                              background:
                                isolatedTrajectoryId === trajectory.id ? palette.accentSoft : palette.bg,
                              color:
                                isolatedTrajectoryId === trajectory.id ? palette.accent : palette.textMuted,
                              fontSize: 10,
                            }}
                          >
                            {isolatedTrajectoryId === trajectory.id ? 'Show all' : 'Isolate'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {reviewStarted &&
                  !filtersTouched &&
                  allTrajectories.length > MAX_RENDERED_TRAJECTORIES && (
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.warning,
                        marginTop: 10,
                        lineHeight: 1.45,
                      }}
                    >
                      The canvas and list are showing the top {MAX_RENDERED_TRAJECTORIES} ROI-valid
                      trajectories by safety. Move the sliders to narrow the set further.
                    </div>
                  )}
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
