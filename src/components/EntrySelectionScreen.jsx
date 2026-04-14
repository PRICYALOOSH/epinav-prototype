import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrainCanvas from './BrainCanvas.jsx';
import { buildSurfaceEntrySamples } from '../data/entries.js';
import { scorePointForTarget } from '../logic/fakeHeatmap.js';
import { buildClusteredEntryCandidates } from '../logic/clustering.js';

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
};

const DEFAULT_N = 5;
const DEFAULT_RADIUS = 18;
const ENTRY_VALID_THRESHOLD = 0.18;
const ENTRY_SNAP_RADIUS_MM = 12;
const PIN_DUPLICATE_RADIUS_MM = 7;
const MAX_PIN_COUNT = 5;

const formatPoint = (point) =>
  `${point[0].toFixed(1)}, ${point[1].toFixed(1)}, ${point[2].toFixed(1)}`;

const dist3 = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const buildEnabledMap = (targets) =>
  Object.fromEntries(targets.map((target) => [target.id, 'keep']));

const buildOverlayMap = (targets) =>
  Object.fromEntries(targets.map((target) => [target.id, true]));
const filterSamplesByRoi = (samples, roiRect, roiSampleIds) => {
  if (!roiRect) return samples;
  if (!Array.isArray(roiSampleIds) || roiSampleIds.length === 0) return [];
  const idSet = new Set(roiSampleIds);
  return samples.filter((sample) => idSet.has(sample.id));
};

const getTargetIndex = (target, allTargets) =>
  typeof target?.sourceIndex === 'number'
    ? target.sourceIndex
    : allTargets.findIndex((item) => item.id === target.id);

const buildTargetHits = (point, targets, allTargets, visibilityMap) => {
  if (!point) return [];

  const hits = [];
  for (const target of targets) {
    if (visibilityMap && visibilityMap[target.id] === false) continue;

    const score = scorePointForTarget(point, getTargetIndex(target, allTargets));
    if (score < ENTRY_VALID_THRESHOLD) continue;

    hits.push({
      id: target.id,
      name: target.name || target.id,
      score,
      scorePct: Math.round(score * 100),
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
};

const getSelectedTargetForPin = (pinId, selectedTargetByPin, pinnedEntries) => {
  const pin = pinnedEntries.find((item) => item.id === pinId);
  if (!pin) return null;
  const selectedId = selectedTargetByPin[pinId];
  return pin.targets.find((target) => target.id === selectedId) || null;
};
const clonePoint = (point) => (Array.isArray(point) ? [...point] : point);
const clonePinnedEntries = (entries) =>
  (entries || []).map((entry) => ({
    ...entry,
    position: clonePoint(entry.position),
    targets: (entry.targets || []).map((target) => ({ ...target })),
  }));
const buildStage2ViewState = (acceptedTargets, reviewState = null) => {
  const defaults = {
    entryMode: 'B',
    targetStates: buildEnabledMap(acceptedTargets),
    modeBVisible: buildOverlayMap(acceptedTargets),
    modeAActiveTargetId: acceptedTargets[0]?.id || null,
    modeBActiveTargetId: acceptedTargets[0]?.id || null,
    modeASettings: { N: DEFAULT_N, radiusMm: DEFAULT_RADIUS },
    modeBSettings: { N: DEFAULT_N, radiusMm: DEFAULT_RADIUS },
    modeARoiRect: null,
    modeARoiEditEnabled: false,
    modeARoiSampleIds: null,
    modeBRoiRect: null,
    modeBRoiEditEnabled: false,
    modeBRoiSampleIds: null,
    modeASelectedEntryByTarget: {},
    modeAConfirmedEntryByTarget: {},
    hoverSelectionEnabled: false,
    hoverPreview: null,
    pinnedEntries: [],
    activePinnedId: null,
    modeBSelectedTargetByPin: {},
    modeBConfirmedTargetByPin: {},
    handoffPreviewMode: null,
    nextPinNumber: 1,
  };

  if (!reviewState) return defaults;

  return {
    ...defaults,
    entryMode: reviewState.entryMode || defaults.entryMode,
    targetStates: { ...defaults.targetStates, ...(reviewState.targetStates || {}) },
    modeBVisible: { ...defaults.modeBVisible, ...(reviewState.modeBVisible || {}) },
    modeAActiveTargetId: reviewState.modeAActiveTargetId || defaults.modeAActiveTargetId,
    modeBActiveTargetId: reviewState.modeBActiveTargetId || defaults.modeBActiveTargetId,
    modeASettings: reviewState.modeASettings
      ? { ...reviewState.modeASettings }
      : defaults.modeASettings,
    modeBSettings: reviewState.modeBSettings
      ? { ...reviewState.modeBSettings }
      : defaults.modeBSettings,
    modeARoiRect: reviewState.modeARoiRect ? { ...reviewState.modeARoiRect } : null,
    modeARoiSampleIds: Array.isArray(reviewState.modeARoiSampleIds)
      ? [...reviewState.modeARoiSampleIds]
      : null,
    modeBRoiRect: reviewState.modeBRoiRect ? { ...reviewState.modeBRoiRect } : null,
    modeBRoiSampleIds: Array.isArray(reviewState.modeBRoiSampleIds)
      ? [...reviewState.modeBRoiSampleIds]
      : null,
    modeASelectedEntryByTarget: { ...(reviewState.modeASelectedEntryByTarget || {}) },
    modeAConfirmedEntryByTarget: { ...(reviewState.modeAConfirmedEntryByTarget || {}) },
    pinnedEntries: clonePinnedEntries(reviewState.pinnedEntries),
    activePinnedId: reviewState.activePinnedId || null,
    modeBSelectedTargetByPin: { ...(reviewState.modeBSelectedTargetByPin || {}) },
    modeBConfirmedTargetByPin: { ...(reviewState.modeBConfirmedTargetByPin || {}) },
    nextPinNumber: reviewState.nextPinNumber || defaults.nextPinNumber,
  };
};

export default function EntrySelectionScreen({
  selectionState,
  onBack,
  onContinue = null,
  initialReviewState = null,
}) {
  const allTargets = useMemo(() => selectionState?.targets || [], [selectionState]);
  const acceptedTargets = useMemo(
    () =>
      allTargets.filter((target) => selectionState?.decisions?.[target.id] === 'accept'),
    [allTargets, selectionState]
  );
  const initialViewState = useMemo(
    () => buildStage2ViewState(acceptedTargets, initialReviewState),
    [acceptedTargets, initialReviewState]
  );

  const [entryMode, setEntryMode] = useState(initialViewState.entryMode);
  const [surfaceSamples, setSurfaceSamples] = useState([]);
  const [targetStates, setTargetStates] = useState(initialViewState.targetStates);
  const [modeBVisible, setModeBVisible] = useState(initialViewState.modeBVisible);
  const [modeAActiveTargetId, setModeAActiveTargetId] = useState(initialViewState.modeAActiveTargetId);
  const [modeBActiveTargetId, setModeBActiveTargetId] = useState(initialViewState.modeBActiveTargetId);
  const [modeASettings, setModeASettings] = useState(initialViewState.modeASettings);
  const [modeBSettings, setModeBSettings] = useState(initialViewState.modeBSettings);
  const [modeARoiRect, setModeARoiRect] = useState(initialViewState.modeARoiRect);
  const [modeARoiEditEnabled, setModeARoiEditEnabled] = useState(initialViewState.modeARoiEditEnabled);
  const [modeARoiSampleIds, setModeARoiSampleIds] = useState(initialViewState.modeARoiSampleIds);
  const [modeBRoiRect, setModeBRoiRect] = useState(initialViewState.modeBRoiRect);
  const [modeBRoiEditEnabled, setModeBRoiEditEnabled] = useState(initialViewState.modeBRoiEditEnabled);
  const [modeBRoiSampleIds, setModeBRoiSampleIds] = useState(initialViewState.modeBRoiSampleIds);
  const [modeACandidatesByTarget, setModeACandidatesByTarget] = useState({});
  const [modeBCandidatesByTarget, setModeBCandidatesByTarget] = useState({});
  const [modeASelectedEntryByTarget, setModeASelectedEntryByTarget] = useState(
    initialViewState.modeASelectedEntryByTarget
  );
  const [modeAConfirmedEntryByTarget, setModeAConfirmedEntryByTarget] = useState(
    initialViewState.modeAConfirmedEntryByTarget
  );
  const [hoverSelectionEnabled, setHoverSelectionEnabled] = useState(
    initialViewState.hoverSelectionEnabled
  );
  const [hoverPreview, setHoverPreview] = useState(initialViewState.hoverPreview);
  const [pinnedEntries, setPinnedEntries] = useState(initialViewState.pinnedEntries);
  const [activePinnedId, setActivePinnedId] = useState(initialViewState.activePinnedId);
  const [modeBSelectedTargetByPin, setModeBSelectedTargetByPin] = useState(
    initialViewState.modeBSelectedTargetByPin
  );
  const [modeBConfirmedTargetByPin, setModeBConfirmedTargetByPin] = useState(
    initialViewState.modeBConfirmedTargetByPin
  );
  const [handoffPreviewMode, setHandoffPreviewMode] = useState(initialViewState.handoffPreviewMode);
  const nextPinNumberRef = useRef(initialViewState.nextPinNumber);

  const resetModeAState = useCallback(() => {
    setModeAActiveTargetId(acceptedTargets[0]?.id || null);
    setModeASettings({ N: DEFAULT_N, radiusMm: DEFAULT_RADIUS });
    setModeARoiRect(null);
    setModeARoiEditEnabled(false);
    setModeARoiSampleIds(null);
  }, [acceptedTargets]);

  const resetModeBState = useCallback(() => {
    setModeBVisible(buildOverlayMap(acceptedTargets));
    setModeBActiveTargetId(acceptedTargets[0]?.id || null);
    setModeBRoiRect(null);
    setModeBRoiEditEnabled(false);
    setModeBRoiSampleIds(null);
    setHoverSelectionEnabled(false);
    setHoverPreview(null);
    setPinnedEntries([]);
    setActivePinnedId(null);
    setModeBSelectedTargetByPin({});
    setModeBConfirmedTargetByPin({});
    setHandoffPreviewMode(null);
    setModeBSettings({ N: DEFAULT_N, radiusMm: DEFAULT_RADIUS });
    nextPinNumberRef.current = 1;
  }, [acceptedTargets]);

  const applyStage2ViewState = useCallback((nextState) => {
    setEntryMode(nextState.entryMode);
    setTargetStates(nextState.targetStates);
    setModeBVisible(nextState.modeBVisible);
    setModeAActiveTargetId(nextState.modeAActiveTargetId);
    setModeBActiveTargetId(nextState.modeBActiveTargetId);
    setModeASettings(nextState.modeASettings);
    setModeBSettings(nextState.modeBSettings);
    setModeARoiRect(nextState.modeARoiRect);
    setModeARoiEditEnabled(nextState.modeARoiEditEnabled);
    setModeARoiSampleIds(nextState.modeARoiSampleIds);
    setModeBRoiRect(nextState.modeBRoiRect);
    setModeBRoiEditEnabled(nextState.modeBRoiEditEnabled);
    setModeBRoiSampleIds(nextState.modeBRoiSampleIds);
    setModeASelectedEntryByTarget(nextState.modeASelectedEntryByTarget);
    setModeAConfirmedEntryByTarget(nextState.modeAConfirmedEntryByTarget);
    setHoverSelectionEnabled(nextState.hoverSelectionEnabled);
    setHoverPreview(nextState.hoverPreview);
    setPinnedEntries(nextState.pinnedEntries);
    setActivePinnedId(nextState.activePinnedId);
    setModeBSelectedTargetByPin(nextState.modeBSelectedTargetByPin);
    setModeBConfirmedTargetByPin(nextState.modeBConfirmedTargetByPin);
    setHandoffPreviewMode(nextState.handoffPreviewMode);
    nextPinNumberRef.current = nextState.nextPinNumber;
  }, []);

  const resetStage2ToCheckpoint = useCallback(() => {
    applyStage2ViewState(buildStage2ViewState(acceptedTargets, initialReviewState));
  }, [acceptedTargets, applyStage2ViewState, initialReviewState]);

  const handleModeSwitch = useCallback(
    (nextMode) => {
      if (nextMode === entryMode) return;
      if (nextMode === 'A') {
        resetModeAState();
      } else {
        resetModeBState();
      }
      setEntryMode(nextMode);
    },
    [entryMode, resetModeAState, resetModeBState]
  );

  useEffect(() => {
    setSurfaceSamples([]);
    setModeACandidatesByTarget({});
    setModeBCandidatesByTarget({});
    applyStage2ViewState(buildStage2ViewState(acceptedTargets, initialReviewState));
  }, [applyStage2ViewState, initialReviewState, selectionState]);

  const handleSurfaceReady = useCallback(({ pts, surfaceMask }) => {
    setSurfaceSamples(buildSurfaceEntrySamples(pts, surfaceMask));
  }, []);

  const keptTargets = acceptedTargets.filter((target) => targetStates[target.id] !== 'remove');
  const keptTargetIdSet = new Set(keptTargets.map((target) => target.id));
  const visibleTargetsB = keptTargets.filter((target) => modeBVisible[target.id] !== false);
  const modeASamples = filterSamplesByRoi(surfaceSamples, modeARoiRect, modeARoiSampleIds);
  const modeBSamples = filterSamplesByRoi(surfaceSamples, modeBRoiRect, modeBRoiSampleIds);

  useEffect(() => {
    if (!modeAActiveTargetId || targetStates[modeAActiveTargetId] !== 'remove') return;
    setModeAActiveTargetId(keptTargets[0]?.id || null);
  }, [modeAActiveTargetId, keptTargets, targetStates]);

  useEffect(() => {
    if (!modeBActiveTargetId || targetStates[modeBActiveTargetId] !== 'remove') return;
    setModeBActiveTargetId(keptTargets[0]?.id || null);
  }, [modeBActiveTargetId, keptTargets, targetStates]);

  useEffect(() => {
    if (modeASamples.length === 0 || acceptedTargets.length === 0) {
      setModeACandidatesByTarget({});
      return;
    }

    const next = {};
    for (const target of acceptedTargets) {
      next[target.id] = buildClusteredEntryCandidates(
        modeASamples,
        getTargetIndex(target, allTargets),
        { count: modeASettings.N, radiusMm: modeASettings.radiusMm }
      );
    }
    setModeACandidatesByTarget(next);
  }, [acceptedTargets, allTargets, modeASettings.N, modeASettings.radiusMm, modeASamples]);

  useEffect(() => {
    if (acceptedTargets.length === 0) {
      setModeASelectedEntryByTarget({});
      return;
    }

    setModeASelectedEntryByTarget((prev) => {
      const next = {};
      for (const target of acceptedTargets) {
        const candidates = modeACandidatesByTarget[target.id] || [];
        const existing = prev[target.id];
        const match = candidates.find((candidate) => candidate.id === existing);
        next[target.id] = match?.id || candidates[0]?.id || null;
      }
      return next;
    });
  }, [acceptedTargets, modeACandidatesByTarget]);

  useEffect(() => {
    if (acceptedTargets.length === 0) {
      setModeAConfirmedEntryByTarget({});
      return;
    }

    setModeAConfirmedEntryByTarget((prev) => {
      const next = {};
      for (const target of acceptedTargets) {
        const candidates = modeACandidatesByTarget[target.id] || [];
        const existing = prev[target.id];
        const match = candidates.find((candidate) => candidate.id === existing);
        next[target.id] = match?.id || null;
      }
      return next;
    });
  }, [acceptedTargets, modeACandidatesByTarget]);

  useEffect(() => {
    if (modeBSamples.length === 0 || acceptedTargets.length === 0) {
      setModeBCandidatesByTarget({});
      return;
    }

    const next = {};
    for (const target of acceptedTargets) {
      next[target.id] = buildClusteredEntryCandidates(
        modeBSamples,
        getTargetIndex(target, allTargets),
        { count: modeBSettings.N, radiusMm: modeBSettings.radiusMm }
      );
    }
    setModeBCandidatesByTarget(next);
  }, [acceptedTargets, allTargets, modeBSettings.N, modeBSettings.radiusMm, modeBSamples]);

  useEffect(() => {
    if (entryMode !== 'B' || !hoverSelectionEnabled) {
      setHoverPreview(null);
    }
  }, [entryMode, hoverSelectionEnabled]);

  useEffect(() => {
    if (!modeBRoiRect || !Array.isArray(modeBRoiSampleIds)) return;
    const allowed = new Set(modeBRoiSampleIds);
    const remaining = pinnedEntries.filter((pin) => allowed.has(`sample-${pin.vertexIndex}`));
    if (remaining.length === pinnedEntries.length) return;
    const remainingIds = new Set(remaining.map((pin) => pin.id));
    setPinnedEntries(remaining);
    setActivePinnedId((prev) =>
      remainingIds.has(prev) ? prev : remaining[remaining.length - 1]?.id || null
    );
    setModeBSelectedTargetByPin((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([pinId]) => remainingIds.has(pinId))
      )
    );
    setModeBConfirmedTargetByPin((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([pinId]) => remainingIds.has(pinId))
      )
    );
  }, [modeBRoiRect, modeBRoiSampleIds, pinnedEntries]);

  useEffect(() => {
    if (!hoverPreview) return;
    const refreshedHits = buildTargetHits(
      hoverPreview.position,
      keptTargets,
      allTargets,
      modeBVisible
    );
    setHoverPreview((prev) => (prev ? { ...prev, targets: refreshedHits } : prev));
  }, [hoverPreview?.vertexIndex, keptTargets, allTargets, modeBVisible]);

  const activeTargetA =
    keptTargets.find((target) => target.id === modeAActiveTargetId) || keptTargets[0] || null;
  const activeTargetB =
    keptTargets.find((target) => target.id === modeBActiveTargetId) || keptTargets[0] || null;
  const activeCandidatesA = activeTargetA ? modeACandidatesByTarget[activeTargetA.id] || [] : [];
  const activeCandidatesB = activeTargetB ? modeBCandidatesByTarget[activeTargetB.id] || [] : [];
  const modeAViewTargetIds = activeTargetA ? [activeTargetA.id] : [];
  const selectedCandidateA = activeTargetA
    ? activeCandidatesA.find(
        (candidate) => candidate.id === modeASelectedEntryByTarget[activeTargetA.id]
      ) || null
    : null;
  const confirmedCandidateA = activeTargetA
    ? activeCandidatesA.find(
        (candidate) => candidate.id === modeAConfirmedEntryByTarget[activeTargetA.id]
      ) || null
    : null;
  const activePinnedEntry =
    pinnedEntries.find((pin) => pin.id === activePinnedId) ||
    pinnedEntries[pinnedEntries.length - 1] ||
    null;
  const activeHoverState =
    hoverSelectionEnabled && hoverPreview ? hoverPreview : activePinnedEntry;
  const activeHitMap = Object.fromEntries(
    (activeHoverState?.targets || []).map((hit) => [hit.id, hit])
  );
  const confirmedModeACount = keptTargets.filter(
    (target) => !!modeAConfirmedEntryByTarget[target.id]
  ).length;
  const modeARoiSampleCount = modeARoiRect ? modeASamples.length : surfaceSamples.length;
  const modeBRoiSampleCount = modeBRoiRect ? modeBSamples.length : surfaceSamples.length;
  const activeConfirmedTargetB =
    activePinnedEntry &&
    keptTargetIdSet.has(modeBConfirmedTargetByPin[activePinnedEntry.id] || '')
      ? getSelectedTargetForPin(activePinnedEntry.id, modeBConfirmedTargetByPin, pinnedEntries)
      : null;
  const modeAConfirmedSelections = keptTargets
    .map((target) => {
      const entryId = modeAConfirmedEntryByTarget[target.id];
      if (!entryId) return null;
      const candidate = (modeACandidatesByTarget[target.id] || []).find(
        (item) => item.id === entryId
      );
      if (!candidate) return null;
      return {
        targetId: target.id,
        targetColor: target.color,
        targetPosition: target.position,
        entryId: candidate.id,
        entryLabel: candidate.label,
        entryPosition: candidate.position,
        scorePct: candidate.scorePct,
        riskPct: candidate.riskPct,
      };
    })
    .filter(Boolean);
  const modeBConfirmedSelections = pinnedEntries
    .map((pin) => {
      const targetId = modeBConfirmedTargetByPin[pin.id];
      if (!targetId || !keptTargetIdSet.has(targetId)) return null;
      const targetHit = pin.targets.find((target) => target.id === targetId);
      if (!targetHit) return null;
      return {
        pinId: pin.id,
        pinLabel: pin.label,
        pinPosition: pin.position,
        targetId,
        scorePct: targetHit.scorePct,
      };
    })
    .filter(Boolean);
  const currentModeSelections =
    entryMode === 'A' ? modeAConfirmedSelections : modeBConfirmedSelections;
  const currentModeReady = currentModeSelections.length > 0;
  const currentModeValidation = currentModeReady
    ? null
    : entryMode === 'A'
      ? 'Confirm at least one target entry in Mode A before preparing final review.'
      : 'Confirm at least one pin-target choice in Mode B before preparing final review.';
  const currentModeSelectionLabel =
    entryMode === 'A'
      ? `${modeAConfirmedSelections.length}/${keptTargets.length} targets reviewed`
      : `${modeBConfirmedSelections.length} confirmed pin assignment${
          modeBConfirmedSelections.length === 1 ? '' : 's'
        }`;
  const buildStage2Output = useCallback(
    (modeKey) => {
      const useModeA = modeKey === 'A';
      const selections = useModeA ? modeAConfirmedSelections : modeBConfirmedSelections;
      return {
        stage: 2,
        sourceMode: modeKey,
        keptTargets: keptTargets.map((target) => ({
          id: target.id,
          color: target.color,
          position: target.position,
        })),
        roi: useModeA
          ? {
              active: !!modeARoiRect,
              rect: modeARoiRect,
              sampleCount: modeARoiSampleCount,
            }
          : {
              active: !!modeBRoiRect,
              rect: modeBRoiRect,
              sampleCount: modeBRoiSampleCount,
            },
        selections,
        stage2Snapshot: {
          entryMode,
          targetStates: { ...targetStates },
          modeBVisible: { ...modeBVisible },
          modeAActiveTargetId,
          modeBActiveTargetId,
          modeASettings: { ...modeASettings },
          modeBSettings: { ...modeBSettings },
          modeARoiRect: modeARoiRect ? { ...modeARoiRect } : null,
          modeARoiSampleIds: modeARoiSampleIds ? [...modeARoiSampleIds] : null,
          modeBRoiRect: modeBRoiRect ? { ...modeBRoiRect } : null,
          modeBRoiSampleIds: modeBRoiSampleIds ? [...modeBRoiSampleIds] : null,
          modeASelectedEntryByTarget: { ...modeASelectedEntryByTarget },
          modeAConfirmedEntryByTarget: { ...modeAConfirmedEntryByTarget },
          pinnedEntries: clonePinnedEntries(pinnedEntries),
          activePinnedId,
          modeBSelectedTargetByPin: { ...modeBSelectedTargetByPin },
          modeBConfirmedTargetByPin: { ...modeBConfirmedTargetByPin },
          nextPinNumber: nextPinNumberRef.current,
        },
      };
    },
    [
      activePinnedId,
      entryMode,
      keptTargets,
      modeAConfirmedSelections,
      modeAActiveTargetId,
      modeAConfirmedEntryByTarget,
      modeARoiRect,
      modeARoiSampleCount,
      modeARoiSampleIds,
      modeASelectedEntryByTarget,
      modeASettings,
      modeBConfirmedSelections,
      modeBActiveTargetId,
      modeBConfirmedTargetByPin,
      modeBRoiRect,
      modeBRoiSampleCount,
      modeBRoiSampleIds,
      modeBSelectedTargetByPin,
      modeBSettings,
      modeBVisible,
      pinnedEntries,
      targetStates,
    ]
  );
  const handoffPreviewPayload = handoffPreviewMode
    ? buildStage2Output(handoffPreviewMode)
    : null;

  const handleHoverPoint = useCallback(
    (mmPoint) => {
      if (entryMode !== 'B' || !hoverSelectionEnabled || modeBRoiEditEnabled) return;
      if (!mmPoint || surfaceSamples.length === 0) {
        setHoverPreview(null);
        return;
      }

      let nearest = null;
      let nearestDistance = Infinity;
      for (let i = 0; i < surfaceSamples.length; i++) {
        const sample = surfaceSamples[i];
        const distance = dist3(sample.position, mmPoint);
        if (distance < nearestDistance) {
          nearest = sample;
          nearestDistance = distance;
        }
      }

      if (!nearest || nearestDistance > ENTRY_SNAP_RADIUS_MM) {
        setHoverPreview(null);
        return;
      }

      setHoverPreview({
        id: nearest.id,
        vertexIndex: nearest.vertexIndex,
        position: nearest.position,
        distanceMm: nearestDistance,
        targets: buildTargetHits(nearest.position, keptTargets, allTargets, modeBVisible),
      });
    },
    [
      allTargets,
      entryMode,
      hoverSelectionEnabled,
      keptTargets,
      modeBRoiEditEnabled,
      modeBVisible,
      surfaceSamples,
    ]
  );

  const handleCommitHover = useCallback(() => {
    if (entryMode !== 'B' || !hoverSelectionEnabled || modeBRoiEditEnabled || !hoverPreview) {
      return;
    }
    if (!hoverPreview.targets || hoverPreview.targets.length === 0) return;

    const duplicate = pinnedEntries.find(
      (pin) => dist3(pin.position, hoverPreview.position) <= PIN_DUPLICATE_RADIUS_MM
    );

    if (duplicate) {
      setActivePinnedId(duplicate.id);
      const selectedTargetId =
        modeBSelectedTargetByPin[duplicate.id] || duplicate.targets[0]?.id || null;
      if (selectedTargetId) setModeBActiveTargetId(selectedTargetId);
      return;
    }

    if (pinnedEntries.length >= MAX_PIN_COUNT) return;

    const pin = {
      id: `pin-${nextPinNumberRef.current}`,
      label: `P${nextPinNumberRef.current}`,
      position: hoverPreview.position,
      vertexIndex: hoverPreview.vertexIndex,
      targets: hoverPreview.targets,
    };
    nextPinNumberRef.current += 1;

    setPinnedEntries((prev) => [...prev, pin]);
    setActivePinnedId(pin.id);
    setModeBSelectedTargetByPin((prev) => ({
      ...prev,
      [pin.id]: pin.targets[0]?.id || null,
    }));
    if (pin.targets[0]) setModeBActiveTargetId(pin.targets[0].id);
  }, [
    entryMode,
    hoverPreview,
    hoverSelectionEnabled,
    modeBRoiEditEnabled,
    pinnedEntries,
    modeBSelectedTargetByPin,
  ]);

  const handleRemovePin = (pinId) => {
    const remaining = pinnedEntries.filter((pin) => pin.id !== pinId);
    setPinnedEntries(remaining);
    setModeBSelectedTargetByPin((prev) => {
      const next = { ...prev };
      delete next[pinId];
      return next;
    });
    setModeBConfirmedTargetByPin((prev) => {
      const next = { ...prev };
      delete next[pinId];
      return next;
    });
    setActivePinnedId((prev) =>
      prev === pinId ? remaining[remaining.length - 1]?.id || null : prev
    );
  };

  const handlePrepareFinalReview = () => {
    if (!currentModeReady) return;
    const payload = buildStage2Output(entryMode);
    if (onContinue) {
      onContinue(payload);
      return;
    }
    setHandoffPreviewMode(entryMode);
  };

  const handleResetToCheckpoint = () => {
    if (!window.confirm('Reset Stage 2 to the last checkpoint?')) return;
    resetStage2ToCheckpoint();
  };

  if (acceptedTargets.length === 0) return null;

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
            Stage 2 / 3
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
            Entry Selection
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: 4,
            borderRadius: 10,
            border: `1px solid ${palette.border}`,
            background: palette.surface2,
          }}
        >
          {[
            { key: 'A', label: 'Mode A', body: 'Target Review' },
            { key: 'B', label: 'Mode B', body: 'Hover Select' },
          ].map((modeOption) => {
            const active = entryMode === modeOption.key;
            return (
              <button
                key={modeOption.key}
                onClick={() => handleModeSwitch(modeOption.key)}
                style={{
                  minWidth: 132,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  background: active ? palette.accentSoft : 'transparent',
                  color: active ? palette.accent : palette.textMuted,
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                  }}
                >
                  {modeOption.label}
                </div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{modeOption.body}</div>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleResetToCheckpoint}
            style={{
              background: palette.surface2,
              color: palette.text,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 13,
            }}
          >
            Reset
          </button>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              color: palette.textMuted,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 13,
            }}
          >
            {'<- Back'}
          </button>
        </div>
      </header>

      {entryMode === 'A' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderBottom: `1px solid ${palette.border}`,
            background: palette.surface,
            overflowX: 'auto',
          }}
        >
          {keptTargets.map((target) => {
            const active = activeTargetA?.id === target.id;
            const confirmedId = modeAConfirmedEntryByTarget[target.id];
            return (
              <button
                key={target.id}
                onClick={() => setModeAActiveTargetId(target.id)}
                style={{
                  flexShrink: 0,
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  background: active ? palette.accentSoft : palette.surface2,
                  color: active ? palette.accent : palette.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {target.id}
                {confirmedId ? ' · confirmed' : ''}
              </button>
            );
          })}
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <BrainCanvas
            key={`entry-canvas-${entryMode}`}
            mode="entry"
            targets={acceptedTargets}
            activeTargetId={
              entryMode === 'A' ? activeTargetA?.id || null : activeTargetB?.id || null
            }
            visibleTargetIds={
              entryMode === 'A'
                ? modeAViewTargetIds
                : visibleTargetsB.map((target) => target.id)
            }
            candidateEntries={entryMode === 'A' ? activeCandidatesA : []}
            selectedEntryId={entryMode === 'A' ? selectedCandidateA?.id || null : null}
            entryView={entryMode === 'A' ? 'individual' : 'hover'}
            hoverSelectionEnabled={entryMode === 'B' && hoverSelectionEnabled}
            hoverEntryPreview={entryMode === 'B' ? hoverPreview : null}
            hoverSamples={surfaceSamples}
            pinnedEntries={entryMode === 'B' ? pinnedEntries : []}
            activePinnedEntryId={entryMode === 'B' ? activePinnedId : null}
            selectedTargetByPin={entryMode === 'B' ? modeBSelectedTargetByPin : {}}
            roiRect={entryMode === 'A' ? modeARoiRect : modeBRoiRect}
            roiSampleIds={entryMode === 'A' ? modeARoiSampleIds : modeBRoiSampleIds}
            roiEditEnabled={entryMode === 'A' ? modeARoiEditEnabled : modeBRoiEditEnabled}
            onHoverPoint={handleHoverPoint}
            onCommitHover={handleCommitHover}
            onRoiChange={entryMode === 'A' ? setModeARoiRect : setModeBRoiRect}
            onRoiSampleIdsChange={
              entryMode === 'A' ? setModeARoiSampleIds : setModeBRoiSampleIds
            }
            onSurfaceReady={handleSurfaceReady}
          />
        </div>

        <aside
          style={{
            width: 372,
            flexShrink: 0,
            background: palette.surface,
            borderLeft: `1px solid ${palette.border}`,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '18px 18px 12px',
              borderBottom: `1px solid ${palette.border}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: palette.textMuted,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Stage 2 status
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {entryMode === 'A'
                ? 'Individual target review'
                : hoverSelectionEnabled
                  ? 'Hover-to-select entry review'
                  : 'Pinned entry review'}
            </div>
            <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.45 }}>
              {surfaceSamples.length === 0
                ? 'Sampling the cortex surface for entry-point evaluation...'
                : entryMode === 'A'
                  ? activeTargetA
                    ? `Showing ${activeTargetA.id} as an individual target map${modeARoiRect ? ` inside ROI (${modeARoiSampleCount} sampled points)` : ''}.`
                    : 'Showing an individual target map.'
                  : modeBRoiEditEnabled
                    ? 'Drag on the cortex to draw a Mode B area-of-interest window.'
                    : hoverSelectionEnabled
                      ? `Hover the cortex to snap to a valid sampled entry point${modeBRoiRect ? ' inside the ROI' : ''}. Double-click to place a pin${pinnedEntries.length >= MAX_PIN_COUNT ? ` (${MAX_PIN_COUNT}/${MAX_PIN_COUNT} used)` : ''}.`
                      : `Turn on Select Entry to probe the cortex. ${pinnedEntries.length}/${MAX_PIN_COUNT} pinned points currently stored${modeBRoiRect ? ` inside ROI (${modeBRoiSampleCount} sampled points)` : ''}.`}
            </div>
          </div>

          {entryMode === 'B' ? (
            <>
              <div
                style={{
                  padding: '14px 18px 12px',
                  borderBottom: `1px solid ${palette.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: palette.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Select Entry
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() =>
                      setHoverSelectionEnabled((prev) => {
                        const next = !prev;
                        setModeBRoiEditEnabled(false);
                        if (!next) setHoverPreview(null);
                        return next;
                      })
                    }
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: `1px solid ${
                        hoverSelectionEnabled ? palette.accent : palette.border
                      }`,
                      background: hoverSelectionEnabled
                        ? palette.accentSoft
                        : palette.surface2,
                      color: hoverSelectionEnabled ? palette.accent : palette.text,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {hoverSelectionEnabled ? 'Stop Selecting' : 'Select Entry'}
                  </button>
                  <button
                    onClick={() => {
                      setModeBRoiEditEnabled((prev) => {
                        const next = !prev;
                        if (next) {
                          setHoverSelectionEnabled(false);
                          setHoverPreview(null);
                        }
                        return next;
                      });
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: `1px solid ${
                        modeBRoiEditEnabled ? palette.accent : palette.border
                      }`,
                      background: modeBRoiEditEnabled ? palette.accentSoft : palette.surface2,
                      color: modeBRoiEditEnabled ? palette.accent : palette.textMuted,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {modeBRoiEditEnabled ? 'Stop ROI' : 'Edit ROI'}
                  </button>
                  <button
                    onClick={() => {
                      setHoverPreview(null);
                      setPinnedEntries([]);
                      setActivePinnedId(null);
                      setModeBSelectedTargetByPin({});
                      setModeBConfirmedTargetByPin({});
                      nextPinNumberRef.current = 1;
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: `1px solid ${palette.border}`,
                      background: palette.surface2,
                      color: palette.textMuted,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Clear Pins
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => {
                      setModeBRoiRect(null);
                      setModeBRoiEditEnabled(false);
                      setModeBRoiSampleIds(null);
                      setHoverPreview(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: `1px solid ${palette.border}`,
                      background: palette.surface2,
                      color: modeBRoiRect ? palette.text : palette.textDim,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Clear ROI
                  </button>
                  <div
                    style={{
                      minWidth: 132,
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: `1px solid ${modeBRoiRect ? palette.accent : palette.border}`,
                      background: modeBRoiRect ? palette.accentSoft : palette.surface2,
                      color: modeBRoiRect ? palette.accent : palette.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    {modeBRoiRect
                      ? `ROI active · ${modeBRoiSampleCount} pts`
                      : 'ROI inactive'}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${
                      activeHoverState?.targets?.length ? palette.accent : palette.border
                    }`,
                    background:
                      activeHoverState?.targets?.length
                        ? palette.accentSoft
                        : palette.surface2,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: activeHoverState ? palette.text : palette.textMuted,
                  }}
                >
                  {!activeHoverState
                    ? 'No entry point is active yet. Turn on Select Entry and hover the cortex to preview valid trajectories.'
                    : modeBRoiEditEnabled
                      ? modeBRoiRect
                        ? `ROI active. Drag again on the cortex to replace it. ${modeBRoiSampleCount} sampled points currently fall inside this window.`
                        : 'ROI edit is active. Drag on the cortex to define the area of interest for Mode B.'
                    : hoverSelectionEnabled && hoverPreview
                      ? hoverPreview.targets.length > 0
                        ? `Hover preview at ${formatPoint(
                            hoverPreview.position
                          )}. Valid for ${hoverPreview.targets
                            .map((target) => target.id)
                            .join(', ')}. ${
                            pinnedEntries.length >= MAX_PIN_COUNT
                              ? `Pin limit reached (${MAX_PIN_COUNT}). Remove a pin to add another.`
                              : 'Double-click to pin it.'
                          }`
                        : `Hover preview at ${formatPoint(
                            hoverPreview.position
                          )}. This sampled point is outside the visible target maps${modeBRoiRect ? ' or ROI window' : ''}.`
                      : `${activePinnedEntry.label} pinned at ${formatPoint(
                          activePinnedEntry.position
                        )}. ${
                          getSelectedTargetForPin(
                            activePinnedEntry.id,
                            modeBSelectedTargetByPin,
                            pinnedEntries
                          )?.id
                            ? `Assigned to ${
                                getSelectedTargetForPin(
                                  activePinnedEntry.id,
                                  modeBSelectedTargetByPin,
                                  pinnedEntries
                                ).id
                              }.`
                            : 'Choose the best target for this entry below.'
                        } ${
                          activeConfirmedTargetB?.id
                            ? `Confirmed for final review: ${activeConfirmedTargetB.id}.`
                            : 'No confirmed target for this pin yet.'
                        }`}
                </div>
              </div>

              <div
                style={{
                  padding: '14px 18px 12px',
                  borderBottom: `1px solid ${palette.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: palette.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Target Maps
                </div>
                {keptTargets.map((target) => {
                  const hit = activeHitMap[target.id];
                  const visible = modeBVisible[target.id] !== false;
                  return (
                    <div
                      key={target.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${hit ? palette.accent : palette.border}`,
                        background: hit ? palette.accentSoft : palette.surface2,
                        marginBottom: 8,
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
                        <button
                          onClick={() => setModeBActiveTargetId(target.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: palette.text,
                            fontSize: 13,
                            fontWeight: 700,
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          {target.id}
                        </button>
                        <button
                          onClick={() =>
                            setModeBVisible((prev) => ({
                              ...prev,
                              [target.id]: !prev[target.id],
                            }))
                          }
                          style={{
                            minWidth: 64,
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: `1px solid ${visible ? palette.accent : palette.border}`,
                            background: visible ? palette.accentSoft : palette.bg,
                            color: visible ? palette.accent : palette.textDim,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {visible ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove ${target.id} from retained targets?`
                              )
                            ) {
                              return;
                            }
                            setTargetStates((prev) => ({
                              ...prev,
                              [target.id]: 'remove',
                            }));
                          }}
                          style={{
                            minWidth: 76,
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: `1px solid ${palette.removed}`,
                            background: 'transparent',
                            color: palette.removed,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: hit ? palette.accent : palette.textMuted,
                          marginTop: 6,
                          lineHeight: 1.4,
                        }}
                      >
                        {!visible
                          ? 'Hidden from the compare map.'
                          : hit
                            ? `Valid here · safety ${hit.scorePct}%`
                            : 'No active trajectory at this point.'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '14px 18px 18px' }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: palette.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Pinned Entries ({pinnedEntries.length}/{MAX_PIN_COUNT})
                </div>
                {pinnedEntries.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 10,
                      border: `1px solid ${palette.border}`,
                      background: palette.surface2,
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: palette.textMuted,
                    }}
                  >
                    No pins yet. Turn on Select Entry, hover over a valid surface point, then
                    double-click the cortex.
                  </div>
                ) : (
                  pinnedEntries.map((pin) => {
                    const availableTargets = pin.targets.filter((target) =>
                      keptTargetIdSet.has(target.id)
                    );
                    const active = pin.id === activePinnedId;
                    const selectedTargetId = modeBSelectedTargetByPin[pin.id] || null;
                    const confirmedTargetId = modeBConfirmedTargetByPin[pin.id] || null;
                    return (
                      <div
                        key={pin.id}
                        onClick={() => {
                          setActivePinnedId(pin.id);
                          if (selectedTargetId && keptTargetIdSet.has(selectedTargetId)) {
                            setModeBActiveTargetId(selectedTargetId);
                          } else if (availableTargets[0]) {
                            setModeBActiveTargetId(availableTargets[0].id);
                          }
                        }}
                        style={{
                          marginBottom: 8,
                          padding: '11px 12px',
                          borderRadius: 10,
                          border: `1px solid ${active ? palette.accent : palette.border}`,
                          background: active ? palette.accentSoft : palette.surface2,
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
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{pin.label}</div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemovePin(pin.id);
                            }}
                            style={{
                              padding: '6px 9px',
                              borderRadius: 8,
                              border: `1px solid ${palette.removed}`,
                              background: 'transparent',
                              color: palette.removed,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: palette.textMuted,
                            fontFamily: '"Courier New", Courier, monospace',
                            marginTop: 6,
                            lineHeight: 1.45,
                          }}
                        >
                          {formatPoint(pin.position)}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: palette.textDim }}>
                          Valid maps
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginTop: 8,
                          }}
                        >
                          {availableTargets.map((target) => {
                            const selectedForTarget =
                              modeBSelectedTargetByPin[pin.id] === target.id;
                            const confirmedForTarget =
                              modeBConfirmedTargetByPin[pin.id] === target.id;
                            return (
                              <button
                                key={`${pin.id}-${target.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActivePinnedId(pin.id);
                                  setModeBActiveTargetId(target.id);
                                  setModeBSelectedTargetByPin((prev) => ({
                                    ...prev,
                                    [pin.id]: target.id,
                                  }));
                                }}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                  border: `1px solid ${
                                    selectedForTarget ? palette.accent : palette.border
                                  }`,
                                  background: selectedForTarget
                                    ? palette.accentSoft
                                    : palette.bg,
                                  color: selectedForTarget
                                    ? palette.accent
                                    : palette.textMuted,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                {target.id}
                                {confirmedForTarget ? ' · confirmed' : ''}
                              </button>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            marginTop: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div style={{ fontSize: 11, color: palette.textDim, lineHeight: 1.4 }}>
                            {confirmedTargetId && keptTargetIdSet.has(confirmedTargetId)
                              ? `Confirmed target: ${confirmedTargetId}`
                              : selectedTargetId && keptTargetIdSet.has(selectedTargetId)
                                ? `Selected target: ${selectedTargetId}`
                                : availableTargets.length > 0
                                  ? 'Choose a target, then confirm it for this entry.'
                                  : 'No retained targets remain for this pin.'}
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!selectedTargetId || !keptTargetIdSet.has(selectedTargetId)) {
                                return;
                              }
                              setActivePinnedId(pin.id);
                              setModeBActiveTargetId(selectedTargetId);
                              setModeBConfirmedTargetByPin((prev) => ({
                                ...prev,
                                [pin.id]: selectedTargetId,
                              }));
                            }}
                            disabled={
                              !selectedTargetId ||
                              !keptTargetIdSet.has(selectedTargetId) ||
                              confirmedTargetId === selectedTargetId
                            }
                            style={{
                              flexShrink: 0,
                              padding: '7px 10px',
                              borderRadius: 8,
                              border: `1px solid ${
                                selectedTargetId &&
                                keptTargetIdSet.has(selectedTargetId) &&
                                confirmedTargetId !== selectedTargetId
                                  ? palette.accent
                                  : palette.border
                              }`,
                              background:
                                selectedTargetId &&
                                keptTargetIdSet.has(selectedTargetId) &&
                                confirmedTargetId !== selectedTargetId
                                  ? palette.accentSoft
                                  : palette.bg,
                              color:
                                selectedTargetId &&
                                keptTargetIdSet.has(selectedTargetId) &&
                                confirmedTargetId !== selectedTargetId
                                  ? palette.accent
                                  : palette.textDim,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor:
                                selectedTargetId &&
                                keptTargetIdSet.has(selectedTargetId) &&
                                confirmedTargetId !== selectedTargetId
                                  ? 'pointer'
                                  : 'not-allowed',
                            }}
                          >
                            {confirmedTargetId === selectedTargetId && confirmedTargetId
                              ? 'Confirmed'
                              : 'Confirm Target'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '14px 18px 18px' }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: palette.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Area Of Interest
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${modeARoiRect ? palette.accent : palette.border}`,
                  background: modeARoiRect ? palette.accentSoft : palette.surface2,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: modeARoiRect ? palette.text : palette.textMuted,
                  marginBottom: 12,
                }}
              >
                {modeARoiEditEnabled
                  ? 'ROI edit is on. Drag a rectangle on the cortex to constrain Mode A entry clustering.'
                  : modeARoiRect
                    ? `ROI active for Mode A. ${modeARoiSampleCount} sampled surface points are available inside it.`
                    : 'Mode A can use its own ROI filter. Draw one to limit the active target heatmap review to a specific surface window.'}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() =>
                      setModeARoiEditEnabled((prev) => !prev)
                    }
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: `1px solid ${
                        modeARoiEditEnabled ? palette.accent : palette.border
                      }`,
                      background: modeARoiEditEnabled ? palette.accentSoft : palette.bg,
                      color: modeARoiEditEnabled ? palette.accent : palette.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {modeARoiEditEnabled ? 'Stop ROI' : 'Edit ROI'}
                  </button>
                  <button
                    onClick={() => {
                      setModeARoiRect(null);
                      setModeARoiEditEnabled(false);
                      setModeARoiSampleIds(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: `1px solid ${palette.border}`,
                      background: palette.bg,
                      color: modeARoiRect ? palette.text : palette.textDim,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Clear ROI
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: palette.textMuted,
                  marginBottom: 12,
                }}
              >
                Mode A shows one target map at a time so you can inspect each target's heat
                surface and clustered entries separately before switching to Mode B.
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: palette.textMuted }}>
                    Suggested trajectories
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{modeASettings.N}</div>
                </div>
                <input
                  type="range"
                  min="3"
                  max="10"
                  step="1"
                  value={modeASettings.N}
                  onChange={(event) =>
                    setModeASettings((prev) => ({ ...prev, N: Number(event.target.value) }))
                  }
                  style={{ width: '100%', marginBottom: 14 }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: palette.textMuted }}>Separation radius</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{modeASettings.radiusMm} mm</div>
                </div>
                <input
                  type="range"
                  min="8"
                  max="30"
                  step="1"
                  value={modeASettings.radiusMm}
                  onChange={(event) =>
                    setModeASettings((prev) => ({
                      ...prev,
                      radiusMm: Number(event.target.value),
                    }))
                  }
                  style={{ width: '100%' }}
                />
              </div>
              {activeTargetA && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${palette.accent}`,
                    background: palette.accentSoft,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>
                    Viewing {activeTargetA.id}
                  </div>
                  <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 6 }}>
                    {activeCandidatesA.length} clustered entries available for this target
                  </div>
                  <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                    {selectedCandidateA
                      ? `Active entry ${selectedCandidateA.label} at ${formatPoint(selectedCandidateA.position)}`
                      : 'No active entry selected for this target.'}
                  </div>
                  <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                    {confirmedCandidateA
                      ? `Confirmed for final review: ${confirmedCandidateA.label}`
                      : 'No confirmed entry for final review yet.'}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      onClick={() => {
                        if (!activeTargetA || !selectedCandidateA) return;
                        setModeAConfirmedEntryByTarget((prev) => ({
                          ...prev,
                          [activeTargetA.id]: selectedCandidateA.id,
                        }));
                      }}
                      disabled={!selectedCandidateA}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${
                          selectedCandidateA ? palette.accent : palette.border
                        }`,
                        background: selectedCandidateA
                          ? palette.accentSoft
                          : 'transparent',
                        color: selectedCandidateA ? palette.accent : palette.textDim,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: selectedCandidateA ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Confirm Entry
                    </button>
                    <button
                      onClick={() => {
                        if (!activeTargetA) return;
                        if (
                          !window.confirm(
                            `Remove ${activeTargetA.id} from final review consideration?`
                          )
                        ) {
                          return;
                        }
                        setTargetStates((prev) => ({
                          ...prev,
                          [activeTargetA.id]: 'remove',
                        }));
                        setModeAConfirmedEntryByTarget((prev) => {
                          const next = { ...prev };
                          delete next[activeTargetA.id];
                          return next;
                        });
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${palette.removed}`,
                        background: 'transparent',
                        color: palette.removed,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Remove Target
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
                Target Entries
              </div>
              {activeCandidatesA.length === 0 ? (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: palette.surface2,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: palette.textMuted,
                  }}
                >
                  {surfaceSamples.length === 0
                    ? 'Waiting for cortex sampling before clustering entries.'
                    : 'No entries are available for this target with the current settings.'}
                </div>
              ) : (
                activeCandidatesA.map((candidate) => {
                  const isSelected =
                    modeASelectedEntryByTarget[activeTargetA?.id] === candidate.id;
                  const isConfirmed =
                    modeAConfirmedEntryByTarget[activeTargetA?.id] === candidate.id;
                  return (
                    <div
                      key={candidate.id}
                      onClick={() =>
                        activeTargetA &&
                        setModeASelectedEntryByTarget((prev) => ({
                          ...prev,
                          [activeTargetA.id]: candidate.id,
                        }))
                      }
                      style={{
                        padding: '11px 12px',
                        borderRadius: 10,
                        border: `1px solid ${isSelected ? palette.accent : palette.border}`,
                        background: isSelected ? palette.accentSoft : palette.surface2,
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
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{candidate.label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: isConfirmed
                              ? palette.accent
                              : isSelected
                                ? palette.text
                                : palette.textMuted,
                          }}
                        >
                          {isConfirmed
                            ? 'confirmed'
                            : isSelected
                              ? 'selected'
                              : 'click to select'}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: palette.textMuted,
                          fontFamily: '"Courier New", Courier, monospace',
                          lineHeight: 1.45,
                        }}
                      >
                        {formatPoint(candidate.position)}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: palette.textDim }}>
                        safety {candidate.scorePct}% / risk {candidate.riskPct}%
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>
      </main>

      <footer
        style={{
          padding: '14px 24px',
          borderTop: `1px solid ${palette.border}`,
          background: palette.surface,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          gap: 20,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: palette.textMuted,
            fontFamily: '"Courier New", Courier, monospace',
          }}
        >
          retained {keptTargets.length} / {acceptedTargets.length}
          {entryMode === 'B'
            ? ` / visible maps ${visibleTargetsB.length} / pins ${pinnedEntries.length}`
            : ` / viewing ${activeTargetA?.id || '-'} / confirmed ${confirmedModeACount}`}
          {entryMode === 'A' && modeARoiRect ? ` / roi ${modeARoiSampleCount} pts` : ''}
          {entryMode === 'B' && modeBRoiRect ? ` / roi ${modeBRoiSampleCount} pts` : ''}
          {entryMode === 'B' && hoverSelectionEnabled ? ' / hover select on' : ''}
          {entryMode === 'A' && modeARoiEditEnabled ? ' / roi edit on' : ''}
          {entryMode === 'B' && modeBRoiEditEnabled ? ' / roi edit on' : ''}
          {surfaceSamples.length > 0
            ? ` / surface samples ${surfaceSamples.length}`
            : ' / sampling cortex'}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 12,
            minWidth: 0,
            maxWidth: entryMode === 'A' ? 460 : 620,
          }}
        >
          <div
            style={{
              minWidth: 0,
              padding: entryMode === 'A' && currentModeReady ? '8px 12px' : '10px 14px',
              borderRadius: 8,
              border: `1px solid ${currentModeReady ? palette.accent : palette.border}`,
              background: currentModeReady ? palette.accentSoft : palette.surface2,
              fontSize: 12,
              flex:
                currentModeReady && entryMode === 'A'
                  ? '0 1 240px'
                  : currentModeReady
                    ? '1 1 auto'
                    : '0 1 340px',
            }}
          >
            {currentModeReady && entryMode === 'A' ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      color: palette.accent,
                    }}
                  >
                    Stage 2 Output
                  </div>
                  <div style={{ color: palette.text, fontWeight: 700 }}>
                    {currentModeSelectionLabel}
                  </div>
                </div>
                <div
                  style={{
                    color: palette.textDim,
                    marginTop: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {currentModeSelections
                    .slice(0, 2)
                    .map((item) => `${item.targetId} -> ${item.entryLabel}`)
                    .join(' / ')}
                  {currentModeSelections.length > 2
                    ? ` / +${currentModeSelections.length - 2} more`
                    : ''}
                </div>
              </>
            ) : currentModeReady ? (
              <>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: palette.accent,
                    marginBottom: 6,
                  }}
                >
                  Stage 2 Output
                </div>
                <div style={{ color: palette.text, fontWeight: 700, marginBottom: 4 }}>
                  {entryMode === 'A' ? 'Target review selections' : 'Pin review selections'}
                </div>
                <div style={{ color: palette.text }}>
                  {currentModeSelectionLabel} ready for Stage 3.
                </div>
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: palette.textMuted,
                  lineHeight: 1.4,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: palette.textDim,
                    flexShrink: 0,
                  }}
                />
                <div>{currentModeValidation}</div>
              </div>
            )}
            {currentModeReady && entryMode !== 'A' && (
              <div style={{ color: palette.textDim, marginTop: 6 }}>
                {currentModeSelections
                  .slice(0, 2)
                  .map((item) =>
                    entryMode === 'A'
                      ? `${item.targetId} -> ${item.entryLabel}`
                      : `${item.pinLabel} -> ${item.targetId}`
                  )
                  .join(' / ')}
                {currentModeSelections.length > 2
                  ? ` / +${currentModeSelections.length - 2} more`
                  : ''}
              </div>
            )}
          </div>
          <button
            onClick={handlePrepareFinalReview}
            disabled={!currentModeReady}
            style={{
              minWidth: entryMode === 'A' ? 190 : 214,
              padding: '0 16px',
              borderRadius: 8,
              border: `1px solid ${currentModeReady ? palette.accent : palette.border}`,
              background: currentModeReady ? palette.accentSoft : palette.surface2,
              color: currentModeReady ? palette.accent : palette.textDim,
              fontSize: 12,
              fontWeight: 700,
              cursor: currentModeReady ? 'pointer' : 'not-allowed',
            }}
          >
            {onContinue ? 'Proceed To Final Review' : 'Prepare Final Review'}
          </button>
        </div>
      </footer>

      {handoffPreviewPayload && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 13, 26, 0.74)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 30,
          }}
        >
          <div
            style={{
              width: 'min(720px, 100%)',
              maxHeight: 'min(80vh, 860px)',
              overflowY: 'auto',
              borderRadius: 14,
              border: `1px solid ${palette.border}`,
              background: palette.surface,
              padding: 20,
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 1.6,
                    color: palette.accent,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Stage 2 Ready
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: palette.text }}>
                  {handoffPreviewPayload.sourceMode === 'A'
                    ? 'Mode A handoff package'
                    : 'Mode B handoff package'}
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 6 }}>
                  This is the exact selection set Stage 3 should compare.
                </div>
              </div>
              <button
                onClick={() => setHandoffPreviewMode(null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  color: palette.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {[
                `Mode ${handoffPreviewPayload.sourceMode}`,
                `${handoffPreviewPayload.keptTargets.length} retained targets`,
                handoffPreviewPayload.roi.active
                  ? `ROI active · ${handoffPreviewPayload.roi.sampleCount} pts`
                  : 'ROI inactive',
                `${handoffPreviewPayload.selections.length} confirmed selections`,
              ].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: palette.surface2,
                    fontSize: 12,
                    color: palette.text,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: palette.textMuted,
                marginBottom: 10,
              }}
            >
              Confirmed Selections
            </div>
            {handoffPreviewPayload.selections.map((item) => (
              <div
                key={handoffPreviewPayload.sourceMode === 'A' ? item.entryId : item.pinId}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  marginBottom: 8,
                }}
              >
                {handoffPreviewPayload.sourceMode === 'A' ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>
                      {item.targetId} · {item.entryLabel}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        fontFamily: '"Courier New", Courier, monospace',
                        marginTop: 6,
                      }}
                    >
                      {formatPoint(item.entryPosition)}
                    </div>
                    <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                      safety {item.scorePct}% / risk {item.riskPct}%
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>
                      {item.pinLabel} {'->'} {item.targetId}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        fontFamily: '"Courier New", Courier, monospace',
                        marginTop: 6,
                      }}
                    >
                      {formatPoint(item.pinPosition)}
                    </div>
                    <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                      target safety {item.scorePct}%
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
