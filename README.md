# EpiNav CAP Assessment — Trajectory Navigation Prototype

A browser-based React prototype of a redesigned navigation interface for the
EpiNav CAP Assessment plugin — neurosurgical planning software for SEEG
(Stereoelectroencephalography) electrode implantation in drug-resistant focal
epilepsy.

The user picks sub-cortical target points, reviews per-target cortex entry
heatmaps, refines candidate entries with an optional ROI filter, and confirms
a final trajectory.

## Stack

- React + Vite
- `@niivue/niivue` for 3D cortex and sub-cortical mesh rendering
- Inline styles (no Tailwind in shipped components)

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Flow

1. **Welcome** — intro card, single Begin button.
2. **Target Selection** — dual brain view. Left canvas shows sub-cortical
   target structures with a pin on the active target; right canvas shows that
   target's entry risk heatmap on the cortex. Accept 1–4 targets.
3. **Entry Selection** — cortex canvas with two modes:
   - *Mode A (Overlay):* all accepted targets' heatmaps blended on one cortex
     with per-target toggles.
   - *Mode B (Individual):* one target at a time, with `N` + `search radius`
     controls driving greedy top-N clustering over the entry field.
   - An optional screen-space ROI rectangle filters candidate entries in both
     modes.
4. **Final Comparison** — all surviving (target, entry) trajectory lines
   drawn together; user cycles through and confirms one.

## Repo layout

```
epinav-prototype/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── meshes/            Slicer-exported .mz3 cortex + sub-cortical meshes
└── src/
    ├── App.jsx            Screen router
    ├── main.jsx
    ├── index.css          Base page styles only
    ├── components/
    │   ├── WelcomeScreen.jsx
    │   ├── TargetSelectionScreen.jsx
    │   ├── EntrySelectionScreen.jsx
    │   ├── FinalReviewScreen.jsx
    │   └── BrainCanvas.jsx      niivue wrapper
    ├── data/
    │   ├── targets.js           Random target placement
    │   └── entries.js           Fibonacci cortex entry sampling
    └── logic/
        ├── risk.js / fakeHeatmap.js   Per-vertex risk field
        ├── clustering.js              Greedy top-N for Mode B
        ├── citAnalysis.js             CIT168 sub-cortical mesh analysis
        └── extractSubMesh.js
```

## Context

Built as a prototype for the KCL/UCL MSc Healthcare Technologies module
7MRI0120. Supervisors: Dr Thomas Primidis and Dr Rachel Sparks.
