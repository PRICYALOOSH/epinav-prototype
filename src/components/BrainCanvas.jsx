import React, { useEffect, useRef, useState } from 'react';
import { Niivue, NVMesh } from '@niivue/niivue';
import { analyseCitRegions, filterRegionHemisphere } from '../logic/citAnalysis.js';
import { extractSubMesh } from '../logic/extractSubMesh.js';
import {
  paintFakeHeatmap,
  paintOverlayHeatmap,
  computeOuterSurfaceMask,
  TARGET_HEAT_COLOR,
} from '../logic/fakeHeatmap.js';

const TARGET_CMAP_KEY = 'epinavTargets';
const DIM_GREY = [110, 125, 145];
const ROI_MIN_SIZE = 0.025;
const FINAL_CORTEX_GREY = [188, 194, 202];

const STRUCTURES_MESHES = [
  { url: '/meshes/cit168.mz3', rgba255: [255, 110, 130, 255] },
];

const HEATMAP_MESHES = [
  { url: '/meshes/cit168.mz3', rgba255: [255, 110, 130, 255] },
  { url: '/meshes/mni152_2009.mz3', rgba255: [205, 200, 192, 255] },
];

const palette = {
  bg: '#050D1A',
  border: '#1E3552',
  text: '#E8F0F8',
  textMuted: '#8BA3BE',
  accent: '#00D4AA',
  error: '#FF4757',
};

const buildTargetColormap = () => {
  const entries = [DIM_GREY, ...TARGET_HEAT_COLOR];
  const n = entries.length;
  return {
    R: entries.map((c) => c[0]),
    G: entries.map((c) => c[1]),
    B: entries.map((c) => c[2]),
    A: entries.map(() => 255),
    I: entries.map((_, i) => Math.round((i * 255) / (n - 1))),
    min: 0,
    max: 0,
  };
};

const colorValueForTargetIdx = (idx) => (idx + 1) / TARGET_HEAT_COLOR.length;
const ENTRY_INACTIVE_COLOR_VALUE = colorValueForTargetIdx(2);
const getFieldIndexForTarget = (target, fallbackIndex) =>
  typeof target?.sourceIndex === 'number' ? target.sourceIndex : fallbackIndex;
const getTargetColorValueById = (targets, targetId) => {
  const index = targets.findIndex((target) => target.id === targetId);
  return index >= 0 ? colorValueForTargetIdx(index) : 0;
};
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const normaliseRoiRect = (start, end) => {
  if (!start || !end) return null;
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = right - left;
  const height = bottom - top;
  if (width < ROI_MIN_SIZE || height < ROI_MIN_SIZE) return null;
  return { left, top, right, bottom };
};
const roiRectToPixels = (roiRect, width, height) => {
  if (!roiRect) return null;
  return {
    left: roiRect.left * width,
    top: roiRect.top * height,
    right: roiRect.right * width,
    bottom: roiRect.bottom * height,
  };
};
const isPointInsideRect = (x, y, rect) =>
  !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
const collectProjectedItemIds = (runtime, canvasNode, items, roiRect) => {
  if (!runtime || !canvasNode || !Array.isArray(items) || !roiRect) return [];
  const ltwh = [0, 0, canvasNode.width, canvasNode.height];
  const [mvpMatrix] = runtime.calculateMvpMatrix(
    null,
    ltwh,
    runtime.scene.renderAzimuth,
    runtime.scene.renderElevation
  );
  const pixelRect = roiRectToPixels(roiRect, canvasNode.width, canvasNode.height);
  const ids = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.id || !Array.isArray(item.position)) continue;

    const screenPoint = runtime.calculateScreenPoint(item.position, mvpMatrix, ltwh);
    if (
      !Number.isFinite(screenPoint[0]) ||
      !Number.isFinite(screenPoint[1]) ||
      !Number.isFinite(screenPoint[2]) ||
      screenPoint[2] < -1 ||
      screenPoint[2] > 1
    ) {
      continue;
    }

    if (isPointInsideRect(screenPoint[0], screenPoint[1], pixelRect)) {
      ids.push(item.id);
    }
  }

  return ids;
};
const collectProjectedSampleIds = (runtime, canvasNode, samples, roiRect) => {
  return collectProjectedItemIds(runtime, canvasNode, samples, roiRect);
};

const scalePtsAboutCentroid = (pts, factor) => {
  if (!pts || factor === 1) return pts;

  const scaled = new Float32Array(pts.length);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n = pts.length / 3;

  for (let i = 0; i < n; i++) {
    cx += pts[i * 3];
    cy += pts[i * 3 + 1];
    cz += pts[i * 3 + 2];
  }

  cx /= n || 1;
  cy /= n || 1;
  cz /= n || 1;

  for (let i = 0; i < n; i++) {
    scaled[i * 3] = cx + (pts[i * 3] - cx) * factor;
    scaled[i * 3 + 1] = cy + (pts[i * 3 + 1] - cy) * factor;
    scaled[i * 3 + 2] = cz + (pts[i * 3 + 2] - cz) * factor;
  }

  return scaled;
};

const buildTargetPin = (target, colorValue, allTargets) => {
  const centroid = allTargets.reduce(
    (acc, item) => [
      acc[0] + item.position[0],
      acc[1] + item.position[1],
      acc[2] + item.position[2],
    ],
    [0, 0, 0]
  );
  centroid[0] /= allTargets.length || 1;
  centroid[1] /= allTargets.length || 1;
  centroid[2] /= allTargets.length || 1;

  let dx = target.position[0] - centroid[0];
  let dy = target.position[1] - centroid[1];
  let dz = target.position[2] - centroid[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;

  if (dz < 0.15) {
    dz = 0.15;
    const norm = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= norm;
    dy /= norm;
    dz /= norm;
  }

  return {
    stemLen: 6,
    targetNode: {
      name: target.name || target.id,
      x: target.position[0],
      y: target.position[1],
      z: target.position[2],
      colorValue,
      sizeValue: 0.42,
    },
    balloonNode: {
      name: `${target.name || target.id} balloon`,
      x: target.position[0] + dx * 6,
      y: target.position[1] + dy * 6,
      z: target.position[2] + dz * 6,
      colorValue,
      sizeValue: 0.7,
    },
  };
};

export default function BrainCanvas({
  mode = 'structures',
  targets = null,
  activeTargetId = null,
  visibleTargetIds = null,
  candidateEntries = null,
  selectedEntryId = null,
  entryView = 'individual',
  hoverSelectionEnabled = false,
  hoverEntryPreview = null,
  hoverSamples = null,
  pinnedEntries = null,
  activePinnedEntryId = null,
  selectedTargetByPin = null,
  finalTrajectories = null,
  activeFinalTrajectoryId = null,
  roiRect = null,
  roiSampleIds = null,
  roiEditEnabled = false,
  roiSelectionItems = null,
  onRegionsReady = null,
  onHoverPoint = null,
  onCommitHover = null,
  onRoiChange = null,
  onRoiSampleIdsChange = null,
  onRoiSelectionIdsChange = null,
  onSurfaceReady = null,
}) {
  const canvasRef = useRef(null);
  const nvRef = useRef(null);
  const cortexRef = useRef(null);
  const amygdalaRef = useRef(null);
  const connectomeRef = useRef(null);
  const paintedSubmeshRef = useRef(null);
  const surfaceMaskRef = useRef(null);
  const hoverFrameRef = useRef(null);
  const roiDragRef = useRef(null);
  const [status, setStatus] = useState('initialising');
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [heatmapView, setHeatmapView] = useState('default');
  const [roiDraftRect, setRoiDraftRect] = useState(null);

  useEffect(() => {
    setHeatmapView('default');
  }, [entryView, mode]);

  const cortexOpacityForView = (view, currentMode) => {
    if (view === 'opaque') return 1.0;
    if (view === 'translucent') return 0.28;
    return currentMode === 'entry' ? 0.62 : 0.62;
  };

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!canvasRef.current) return;

      try {
        setStatus('initialising');
        setError(null);

        const nv = new Niivue({
          backColor: [0.02, 0.05, 0.1, 1],
          show3Dcrosshair: false,
          isOrientCube: false,
          isColorbar: false,
          showLegend: false,
          isRadiologicalConvention: false,
          loadingText: '',
        });

        await nv.attachToCanvas(canvasRef.current);
        if (cancelled) return;

        try {
          nv.addColormap(TARGET_CMAP_KEY, buildTargetColormap());
        } catch (_) {}

        nv.setSliceType(nv.sliceTypeRender);
        nv.setRenderAzimuthElevation(120, 15);
        nvRef.current = nv;

        const meshList = mode === 'structures' ? STRUCTURES_MESHES : HEATMAP_MESHES;
        setStatus(`loading ${meshList.length} mesh${meshList.length === 1 ? '' : 'es'}`);
        await nv.loadMeshes(meshList);
        if (cancelled) return;

        for (let i = 0; i < nv.meshes.length; i++) {
          nv.meshes[i].colorbarVisible = false;
          nv.meshes[i].showLegend = false;
        }

        if (mode === 'structures') {
          const cit = nv.meshes[0];
          const regions = analyseCitRegions(cit);
          const amygFull = regions.find((region) => region.guess === 'amygdala');
          const amygRight = amygFull
            ? filterRegionHemisphere(amygFull, cit, 'right')
            : null;

          if (onRegionsReady) {
            const patched = regions.map((region) =>
              region === amygFull && amygRight ? amygRight : region
            );
            onRegionsReady(patched);
          }

          if (amygFull) {
            const sub = extractSubMesh(cit, amygFull.vertexIndices);
            if (sub && sub.triangleCount > 0) {
              const amygMesh = new NVMesh(
                sub.pts,
                sub.tris,
                'amygdala',
                sub.rgba255,
                1.0,
                true,
                nv.gl,
                null,
                null,
                null,
                null,
                null,
                false
              );
              nv.addMesh(amygMesh);
              amygdalaRef.current = amygMesh;
            }
          }

          nv.setMeshProperty(cit.id, 'opacity', 0);
          nv.volScaleMultiplier = 2.6;
        } else {
          const cit = nv.meshes[0];
          const cortex = nv.meshes[1];
          cortexRef.current = cortex;

          const regions = analyseCitRegions(cit);
          const amygFull = regions.find((region) => region.guess === 'amygdala');
          const amygRight = amygFull
            ? filterRegionHemisphere(amygFull, cit, 'right')
            : null;

          if (amygRight) {
            const sub = extractSubMesh(cit, amygRight.vertexIndices);
            if (sub && sub.triangleCount > 0) {
              const amygPts = mode === 'entry' || mode === 'final'
                ? scalePtsAboutCentroid(sub.pts, 0.52)
                : sub.pts;
              const amygMesh = new NVMesh(
                amygPts,
                sub.tris,
                'amygdala-heatmap',
                sub.rgba255,
                1.0,
                true,
                nv.gl,
                null,
                null,
                null,
                null,
                null,
                false
              );
              nv.addMesh(amygMesh);
              nv.setMeshProperty(amygMesh.id, 'opacity', 0.9);
              amygdalaRef.current = amygMesh;
            }
          }

          const surfaceMask = computeOuterSurfaceMask(cortex.pts);
          surfaceMaskRef.current = surfaceMask;
          if (onSurfaceReady) {
            onSurfaceReady({
              pts: cortex.pts,
              surfaceMask,
            });
          }

          nv.setMeshProperty(cit.id, 'opacity', mode === 'entry' ? 0 : mode === 'final' ? 1 : 1);
          nv.setMeshProperty(cortex.id, 'opacity', 0.28);
        }

        nv.drawScene();
        setReady(true);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          console.error('BrainCanvas mount failed:', e);
          setError(e?.message || String(e));
          setStatus('error');
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
      if (nvRef.current && typeof nvRef.current.cleanup === 'function') {
        try {
          nvRef.current.cleanup();
        } catch (_) {}
      }
      nvRef.current = null;
      cortexRef.current = null;
      amygdalaRef.current = null;
      connectomeRef.current = null;
      paintedSubmeshRef.current = null;
      surfaceMaskRef.current = null;
      setReady(false);
    };
  }, [mode]);

  useEffect(() => {
    if (!roiEditEnabled) {
      setRoiDraftRect(null);
      roiDragRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !onRoiChange) return;

    const getNormPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
      };
    };

    const handleMouseDown = (event) => {
      if (event.button !== 0) return;
      const start = getNormPoint(event);
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      roiDragRef.current = { start };
      setRoiDraftRect({ left: start.x, top: start.y, right: start.x, bottom: start.y });
    };

    const handleMouseMove = (event) => {
      if (!roiDragRef.current?.start) return;
      const point = getNormPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      setRoiDraftRect(
        normaliseRoiRect(roiDragRef.current.start, point) || {
          left: roiDragRef.current.start.x,
          top: roiDragRef.current.start.y,
          right: point.x,
          bottom: point.y,
        }
      );
    };

    const handleMouseUp = (event) => {
      if (!roiDragRef.current?.start) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getNormPoint(event) || roiDragRef.current.start;
      const nextRect = normaliseRoiRect(roiDragRef.current.start, point);
      roiDragRef.current = null;
      setRoiDraftRect(null);
      if (nextRect) {
        onRoiChange(nextRect);
        if (onRoiSelectionIdsChange) {
          onRoiSelectionIdsChange(
            collectProjectedItemIds(
              nvRef.current,
              canvasRef.current,
              roiSelectionItems || [],
              nextRect
            )
          );
        } else if (onRoiSampleIdsChange) {
          onRoiSampleIdsChange(
            collectProjectedSampleIds(
              nvRef.current,
              canvasRef.current,
              hoverSamples || [],
              nextRect
            )
          );
        }
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      roiDragRef.current = null;
      setRoiDraftRect(null);
    };
  }, [
    hoverSamples,
    mode,
    onRoiChange,
    onRoiSampleIdsChange,
    onRoiSelectionIdsChange,
    roiEditEnabled,
    roiSelectionItems,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const nv = nvRef.current;
    if (!canvas || !nv || !ready || mode !== 'entry' || entryView !== 'hover') return;

    const requestHoverPick = (event) => {
      if (!hoverSelectionEnabled || roiEditEnabled) return;
      if (hoverFrameRef.current !== null) {
        return;
      }

      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const runtime = nvRef.current;
        const canvasNode = canvasRef.current;
        const samples = Array.isArray(hoverSamples) ? hoverSamples : [];
        if (!runtime || !canvasNode || !hoverSelectionEnabled || samples.length === 0) return;

        const rect = canvasNode.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const allowedSampleIds = Array.isArray(roiSampleIds) ? new Set(roiSampleIds) : null;

        const scaleX = canvasNode.width / rect.width;
        const scaleY = canvasNode.height / rect.height;
        const mouseX = (event.clientX - rect.left) * scaleX;
        const mouseY = (event.clientY - rect.top) * scaleY;
        const ltwh = [0, 0, canvasNode.width, canvasNode.height];
        const [mvpMatrix] = runtime.calculateMvpMatrix(
          null,
          ltwh,
          runtime.scene.renderAzimuth,
          runtime.scene.renderElevation
        );

        let bestSample = null;
        let bestDistSq = Infinity;
        const maxDistSq = Math.pow(36 * Math.max(scaleX, scaleY), 2);

        for (let i = 0; i < samples.length; i++) {
          const sample = samples[i];
          if (allowedSampleIds && !allowedSampleIds.has(sample.id)) continue;
          const screenPoint = runtime.calculateScreenPoint(sample.position, mvpMatrix, ltwh);
          if (
            !Number.isFinite(screenPoint[0]) ||
            !Number.isFinite(screenPoint[1]) ||
            !Number.isFinite(screenPoint[2]) ||
            screenPoint[2] < -1 ||
            screenPoint[2] > 1
          ) {
            continue;
          }
          const dx = screenPoint[0] - mouseX;
          const dy = screenPoint[1] - mouseY;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestSample = sample;
          }
        }

        if (!bestSample || bestDistSq > maxDistSq) {
          if (onHoverPoint) onHoverPoint(null);
          return;
        }

        if (onHoverPoint) onHoverPoint(bestSample.position);
      });
    };

    const handleLeave = () => {
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
      if (onHoverPoint) onHoverPoint(null);
    };

    const handleDoubleClick = (event) => {
      if (!hoverSelectionEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (onCommitHover) onCommitHover();
    };

    canvas.addEventListener('mousemove', requestHoverPick);
    canvas.addEventListener('mouseleave', handleLeave);
    canvas.addEventListener('dblclick', handleDoubleClick, true);

    return () => {
      canvas.removeEventListener('mousemove', requestHoverPick);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('dblclick', handleDoubleClick, true);
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
    };
  }, [
    entryView,
    hoverSelectionEnabled,
    hoverSamples,
    mode,
    onCommitHover,
    onHoverPoint,
    roiEditEnabled,
    roiSampleIds,
    ready,
  ]);

  useEffect(() => {
    if (mode === 'entry' && entryView === 'hover' && hoverSelectionEnabled && !roiEditEnabled) {
      return;
    }
    if (onHoverPoint) onHoverPoint(null);
  }, [entryView, hoverSelectionEnabled, mode, onHoverPoint, roiEditEnabled]);

  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || !ready || !targets || targets.length === 0) return;

    if (connectomeRef.current) {
      try {
        nv.removeMesh(connectomeRef.current);
      } catch (_) {}
      connectomeRef.current = null;
    }

    const activeIdx = targets.findIndex((target) => target.id === activeTargetId);
    const activeColorValue = activeIdx >= 0 ? colorValueForTargetIdx(activeIdx) : 0;
    const nodes = [];
    const edges = [];

    if (mode === 'structures' || mode === 'heatmap') {
      const visibleSet =
        visibleTargetIds && visibleTargetIds.length > 0 ? new Set(visibleTargetIds) : null;

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const highlighted = visibleSet ? visibleSet.has(target.id) : i === activeIdx;
        nodes.push({
          name: target.name || target.id,
          x: target.position[0],
          y: target.position[1],
          z: target.position[2],
          colorValue: highlighted ? colorValueForTargetIdx(i) : 0,
          sizeValue: target.id === activeTargetId ? 0.38 : highlighted ? 0.32 : 0.24,
        });
      }

      if (activeIdx >= 0) {
        const target = targets[activeIdx];
        const pin = buildTargetPin(target, activeColorValue, targets);
        nodes.push(pin.balloonNode);
        edges.push({
          first: activeIdx,
          second: nodes.length - 1,
          colorValue: activeColorValue,
        });
      }
    }

    if (mode === 'entry' && entryView === 'individual' && activeIdx >= 0) {
      const target = targets[activeIdx];
      const pin = buildTargetPin(target, activeColorValue, targets);
      nodes.push(pin.targetNode);
      nodes.push(pin.balloonNode);
      edges.push({
        first: 0,
        second: 1,
        colorValue: activeColorValue,
      });

      const entries = Array.isArray(candidateEntries) ? candidateEntries : [];
      const activeEntryId = selectedEntryId || entries[0]?.id || null;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const selected = entry.id === activeEntryId;
        nodes.push({
          name: entry.label || `Entry ${i + 1}`,
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          colorValue: selected ? activeColorValue : 0,
          sizeValue: selected ? 1.22 : 0.92,
        });
        edges.push({
          first: 0,
          second: nodes.length - 1,
          colorValue: activeColorValue,
        });
      }
    }

    if (mode === 'entry' && entryView === 'hover') {
      const visibleSet = new Set(visibleTargetIds || targets.map((target) => target.id));
      const targetNodeIndexById = new Map();
      const activePinnedEntry = Array.isArray(pinnedEntries)
        ? pinnedEntries.find((entry) => entry.id === activePinnedEntryId) || null
        : null;
      const previewTargetIds = new Set(
        (hoverEntryPreview?.targets || []).map((target) => target.id)
      );
      const activePinnedTargetIds = new Set(
        (activePinnedEntry?.targets || []).map((target) => target.id)
      );

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (!visibleSet.has(target.id)) continue;

        const highlighted =
          previewTargetIds.has(target.id) ||
          (!hoverEntryPreview && activePinnedTargetIds.has(target.id)) ||
          target.id === activeTargetId;
        nodes.push({
          name: target.name || target.id,
          x: target.position[0],
          y: target.position[1],
          z: target.position[2],
          colorValue: highlighted ? colorValueForTargetIdx(i) : 0,
          sizeValue: highlighted ? 0.34 : 0.24,
        });
        targetNodeIndexById.set(target.id, nodes.length - 1);
      }

      const addEntryNode = (entry, opts = {}) => {
        const { active = false, preview = false } = opts;
        const firstTargetId = entry?.targets?.[0]?.id || activeTargetId;
        const entryColorValue = getTargetColorValueById(targets, firstTargetId);
        const selectedTargetId =
          !preview && selectedTargetByPin ? selectedTargetByPin[entry.id] || null : null;
        nodes.push({
          name: entry.label || (preview ? 'Hover entry' : 'Pinned entry'),
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          colorValue: entryColorValue || ENTRY_INACTIVE_COLOR_VALUE,
          sizeValue: preview ? 1.5 : active ? 1.1 : 0.8,
        });
        const entryNodeIndex = nodes.length - 1;

        const shouldDrawEdges = preview || active;
        if (!shouldDrawEdges) return;

        for (let i = 0; i < (entry.targets || []).length; i++) {
          const targetHit = entry.targets[i];
          if (selectedTargetId && targetHit.id !== selectedTargetId) continue;
          if (!visibleSet.has(targetHit.id)) continue;
          const targetNodeIndex = targetNodeIndexById.get(targetHit.id);
          if (typeof targetNodeIndex !== 'number') continue;
          edges.push({
            first: targetNodeIndex,
            second: entryNodeIndex,
            colorValue: getTargetColorValueById(targets, targetHit.id) || entryColorValue,
          });
        }
      };

      if (Array.isArray(pinnedEntries)) {
        for (let i = 0; i < pinnedEntries.length; i++) {
          addEntryNode(pinnedEntries[i], {
            active: !hoverEntryPreview && pinnedEntries[i].id === activePinnedEntryId,
          });
        }
      }

      if (hoverEntryPreview) {
        addEntryNode(hoverEntryPreview, { preview: true });
      }
    }

    if (mode === 'final' && Array.isArray(finalTrajectories) && finalTrajectories.length > 0) {
      const visibleSet =
        visibleTargetIds && visibleTargetIds.length > 0 ? new Set(visibleTargetIds) : null;
      const activeTrajectory =
        finalTrajectories.find((trajectory) => trajectory.id === activeFinalTrajectoryId) ||
        finalTrajectories[0];
      const targetNodeIndexById = new Map();

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (visibleSet && !visibleSet.has(target.id)) continue;
        const highlighted = target.id === activeTrajectory?.targetId;
        nodes.push({
          name: target.name || target.id,
          x: target.position[0],
          y: target.position[1],
          z: target.position[2],
          colorValue: highlighted ? colorValueForTargetIdx(i) : 0,
          sizeValue: highlighted ? 0.38 : 0.24,
        });
        targetNodeIndexById.set(target.id, nodes.length - 1);
      }

      if (activeTrajectory) {
        const targetIndex = targets.findIndex((target) => target.id === activeTrajectory.targetId);
        const target = targets[targetIndex];
        const activeColor =
          targetIndex >= 0 ? colorValueForTargetIdx(targetIndex) : ENTRY_INACTIVE_COLOR_VALUE;
        if (target) {
          const pin = buildTargetPin(target, activeColor, targets);
          nodes.push(pin.balloonNode);
          edges.push({
            first: targetNodeIndexById.get(target.id),
            second: nodes.length - 1,
            colorValue: activeColor,
          });
        }
      }

      for (let i = 0; i < finalTrajectories.length; i++) {
        const trajectory = finalTrajectories[i];
        if (visibleSet && !visibleSet.has(trajectory.targetId)) continue;

        const targetIndex = targets.findIndex((target) => target.id === trajectory.targetId);
        const colorValue =
          targetIndex >= 0 ? colorValueForTargetIdx(targetIndex) : ENTRY_INACTIVE_COLOR_VALUE;
        nodes.push({
          name: trajectory.label || `Trajectory ${i + 1}`,
          x: trajectory.entryPosition[0],
          y: trajectory.entryPosition[1],
          z: trajectory.entryPosition[2],
          colorValue,
          sizeValue: trajectory.id === activeTrajectory?.id ? 1.32 : 0.84,
        });
        const entryNodeIndex = nodes.length - 1;
        const targetNodeIndex = targetNodeIndexById.get(trajectory.targetId);
        if (typeof targetNodeIndex === 'number') {
          edges.push({
            first: targetNodeIndex,
            second: entryNodeIndex,
            colorValue,
          });
        }
      }
    }

    if (nodes.length === 0) {
      nv.drawScene();
      return;
    }

    const connectome = {
      name: mode === 'entry' ? 'entry-candidates' : 'target-pins',
      nodeColormap: TARGET_CMAP_KEY,
      nodeColormapNegative: '',
      nodeMinColor: 0,
      nodeMaxColor: 1,
      nodeScale: 1,
      edgeColormap: TARGET_CMAP_KEY,
      edgeColormapNegative: '',
      edgeMin: 0,
      edgeMax: 1,
      edgeScale:
        mode === 'final'
          ? 1.4
          : mode === 'entry'
            ? entryView === 'hover'
              ? 0.95
              : 0.85
            : 0.15,
      legendLineThickness: 0,
      showLegend: false,
      nodes,
      edges,
    };

    try {
      const mesh = nv.loadConnectomeAsMesh(connectome);
      mesh.colorbarVisible = false;
      nv.addMesh(mesh);
      connectomeRef.current = mesh;
      nv.drawScene();
    } catch (e) {
      console.error('connectome add failed:', e);
    }
  }, [
    targets,
    activeTargetId,
    candidateEntries,
    selectedEntryId,
    entryView,
    ready,
    mode,
    visibleTargetIds,
    hoverEntryPreview,
    pinnedEntries,
    activePinnedEntryId,
    selectedTargetByPin,
    finalTrajectories,
    activeFinalTrajectoryId,
  ]);

  useEffect(() => {
    const nv = nvRef.current;
    const cortex = cortexRef.current;
    if (!nv || !cortex || !ready || !targets || targets.length === 0) return;
    if (mode !== 'heatmap' && mode !== 'entry' && mode !== 'final') return;

    if (paintedSubmeshRef.current) {
      try {
        nv.removeMesh(paintedSubmeshRef.current);
      } catch (_) {}
      paintedSubmeshRef.current = null;
    }

    try {
      const activeIdx = Math.max(
        0,
        targets.findIndex((target) => target.id === activeTargetId)
      );
      const activeTarget = targets[activeIdx] || null;
      const activeFieldIdx = getFieldIndexForTarget(activeTarget, activeIdx);

      let rgba = null;

      if (mode === 'final') {
        rgba = new Uint8Array((cortex.pts.length / 3) * 4);
        for (let i = 0; i < cortex.pts.length / 3; i++) {
          rgba[i * 4] = FINAL_CORTEX_GREY[0];
          rgba[i * 4 + 1] = FINAL_CORTEX_GREY[1];
          rgba[i * 4 + 2] = FINAL_CORTEX_GREY[2];
          rgba[i * 4 + 3] = 255;
        }
        nv.setMeshProperty(cortex.id, 'opacity', 0.46);
      } else if (mode === 'entry' && entryView === 'hover') {
        const indexes = (visibleTargetIds || [])
          .map((id) => {
            const listIndex = targets.findIndex((target) => target.id === id);
            if (listIndex < 0) return -1;
            return getFieldIndexForTarget(targets[listIndex], listIndex);
          })
          .filter((index) => index >= 0);

        rgba = paintOverlayHeatmap(cortex, indexes, {
          surfaceMask: surfaceMaskRef.current,
        });
        nv.setMeshProperty(cortex.id, 'opacity', cortexOpacityForView(heatmapView, mode));
      } else {
        const result = paintFakeHeatmap(cortex, activeFieldIdx, {
          returnPainted: mode === 'heatmap' || heatmapView === 'translucent',
          style:
            mode === 'entry'
              ? entryView === 'individual'
                ? 'risk'
                : 'risk'
              : 'qualitative',
          surfaceMask: surfaceMaskRef.current,
        });
        if (!result) return;

        if (mode === 'heatmap' || heatmapView === 'translucent') {
          const painted = result.painted;
          rgba = result.rgba;
          nv.setMeshProperty(cortex.id, 'opacity', cortexOpacityForView(heatmapView, mode));

          if (heatmapView === 'translucent' && painted && painted.length > 0) {
            const sub = extractSubMesh(cortex, painted);
            if (sub && sub.triangleCount > 0) {
              const patchMesh = new NVMesh(
                sub.pts,
                sub.tris,
                'heatmap-patches',
                sub.rgba255,
                1.0,
                true,
                nv.gl,
                null,
                null,
                null,
                null,
                null,
                false
              );
              nv.addMesh(patchMesh);
              paintedSubmeshRef.current = patchMesh;
            }
          }
        } else {
          rgba = result;
          nv.setMeshProperty(cortex.id, 'opacity', cortexOpacityForView(heatmapView, mode));
        }
      }

      if (!rgba) return;
      cortex.rgba255 = rgba;
      cortex.updateMesh(nv.gl);

      const cit = nv.meshes[0];
      if (mode === 'heatmap' || mode === 'entry' || mode === 'final') {
        if (heatmapView === 'default') {
          if (cit) {
            nv.setMeshProperty(cit.id, 'opacity', mode === 'final' ? 1 : 0);
          }
          if (amygdalaRef.current) {
            nv.setMeshProperty(
              amygdalaRef.current.id,
              mode === 'heatmap' ? 1 : mode === 'final' ? 0.9 : 0.95
            );
          }
        } else {
          if (cit) {
            nv.setMeshProperty(cit.id, 'opacity', mode === 'final' ? 1 : 1);
          }
          if (amygdalaRef.current) {
            nv.setMeshProperty(
              amygdalaRef.current.id,
              mode === 'entry' ? 0.18 : mode === 'final' ? 0.12 : 0
            );
          }
        }
      }

      nv.drawScene();
    } catch (e) {
      console.error('cortex repaint failed:', e);
    }
  }, [targets, activeTargetId, visibleTargetIds, ready, mode, heatmapView, entryView]);

  const displayRoiRect = roiEditEnabled ? roiDraftRect || roiRect : roiDraftRect;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        background: palette.bg,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: roiEditEnabled ? 'crosshair' : 'default',
        }}
      />

      {displayRoiRect && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: `${displayRoiRect.top * 100}%`,
                background: 'rgba(5, 13, 26, 0.58)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${displayRoiRect.bottom * 100}%`,
                bottom: 0,
                background: 'rgba(5, 13, 26, 0.58)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: `${displayRoiRect.top * 100}%`,
                width: `${displayRoiRect.left * 100}%`,
                height: `${(displayRoiRect.bottom - displayRoiRect.top) * 100}%`,
                background: 'rgba(5, 13, 26, 0.58)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: `${displayRoiRect.top * 100}%`,
                width: `${(1 - displayRoiRect.right) * 100}%`,
                height: `${(displayRoiRect.bottom - displayRoiRect.top) * 100}%`,
                background: 'rgba(5, 13, 26, 0.58)',
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              left: `${displayRoiRect.left * 100}%`,
              top: `${displayRoiRect.top * 100}%`,
              width: `${(displayRoiRect.right - displayRoiRect.left) * 100}%`,
              height: `${(displayRoiRect.bottom - displayRoiRect.top) * 100}%`,
              border: '2px solid rgba(0, 212, 170, 0.9)',
              background: 'rgba(0, 212, 170, 0.06)',
              boxShadow: '0 0 0 1px rgba(5, 13, 26, 0.42) inset',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {(mode === 'heatmap' || mode === 'entry') && ready && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            display: 'flex',
            gap: 6,
            padding: 4,
            background: 'rgba(10, 22, 40, 0.85)',
            border: `1px solid ${palette.border}`,
            borderRadius: 8,
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}
        >
          {[
            { key: 'default', label: 'Default' },
            { key: 'translucent', label: 'Translucent' },
            { key: 'opaque', label: 'Opaque' },
          ].map((opt) => {
            const active = heatmapView === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setHeatmapView(opt.key)}
                style={{
                  padding: '6px 10px',
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  background: active ? 'rgba(0, 212, 170, 0.18)' : 'transparent',
                  color: active ? palette.accent : palette.textMuted,
                  borderRadius: 6,
                  fontSize: 11,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {status === 'error' && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            padding: '12px 16px',
            background: 'rgba(40, 10, 18, 0.92)',
            border: `1px solid ${palette.error}`,
            borderRadius: 8,
            color: palette.text,
            fontSize: 12,
            fontFamily: '"Courier New", Courier, monospace',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
