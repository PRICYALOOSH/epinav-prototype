import { useState, useRef, useEffect } from "react";
import { Check, X, ChevronLeft, ChevronRight, Layers } from "lucide-react";

// ══════════════════════════════════════════════════════════════════════════════
// COLOUR PALETTE
// ══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:           "#070F1C",
  surface:      "#0D1B2E",
  surface2:     "#122034",
  surface3:     "#172840",
  border:       "#1E3552",
  borderBright: "#2A4A6A",
  textPrimary:  "#E2E8F0",
  textMuted:    "#8BA3BE",
  textDim:      "#4A6480",
  riskLow:      "#1D9E75",
  riskMid:      "#C77B1A",
  riskHigh:     "#E05555",
  riskNone:     "#2A3F55",
  lockActive:   "#7C3AED",
  highlight:    "#1B4F8A",
  accepted:     "#1D9E75",
  rejected:     "#E05555",
  s1Color:      "#00D4AA",
  s2Color:      "#7B5DD6",
};

const riskColour = (norm) => {
  if (norm === null || norm === undefined) return C.riskNone;
  if (norm < 0.33) return C.riskLow;
  if (norm < 0.66) return C.riskMid;
  return C.riskHigh;
};

const riskLabel = (norm) => {
  if (norm === null || norm === undefined) return "—";
  if (norm < 0.33) return "Safe";
  if (norm < 0.66) return "Moderate";
  return "High Risk";
};

const normRisk = (riskRank) => (riskRank - 1) / 35;

// ══════════════════════════════════════════════════════════════════════════════
// DATA — exact from CLAUDE.md Section 3
// ══════════════════════════════════════════════════════════════════════════════
const ENTRY_POINTS = {
  1:  { id: 1,  x: 5,    y: 5,    z: 10, color: "#E05555" },
  2:  { id: 2,  x: 4,    y: 9,    z: 10, color: "#378ADD" },
  3:  { id: 3,  x: 5,    y: 9,    z: 10, color: "#1D9E75" },
  4:  { id: 4,  x: 5,    y: 6,    z: 10, color: "#C77B1A" },
  5:  { id: 5,  x: 6,    y: 5,    z: 10, color: "#7B5DD6" },
  6:  { id: 6,  x: 0,    y: 9,    z: 10, color: "#C0C0C0" },
  7:  { id: 7,  x: 4.5,  y: 7,    z: 10, color: "#E8837A" },
  8:  { id: 8,  x: 3,    y: 8,    z: 10, color: "#90EE90" },
  9:  { id: 9,  x: 5.5,  y: 7,    z: 10, color: "#FFD700" },
  10: { id: 10, x: 2,    y: 6,    z: 10, color: "#FF8C69" },
};

const STRUCTURE_1_TARGETS = {
  A: { id: "A", x:  0, y:  0, z: 0, color: "#E8837A", region: "mesial-temporal"  },
  B: { id: "B", x:  1, y:  0, z: 0, color: "#7EC8E3", region: "mesial-temporal"  },
  C: { id: "C", x:  0, y:  1, z: 0, color: "#90EE90", region: "mesial-temporal"  },
  D: { id: "D", x: -5, y:  0, z: 0, color: "#F4A460", region: "lateral-temporal" },
  E: { id: "E", x: -5, y: -1, z: 0, color: "#DDA0DD", region: "lateral-temporal" },
  F: { id: "F", x: -5, y: -5, z: 0, color: "#C0C0C0", region: "lateral-temporal" },
};

const STRUCTURE_1_TRAJECTORIES = [
  { id: "A1",  target: "A", entry: 1,  riskRank: 1  },
  { id: "B4",  target: "B", entry: 4,  riskRank: 2  },
  { id: "B5",  target: "B", entry: 5,  riskRank: 3  },
  { id: "D2",  target: "D", entry: 2,  riskRank: 4  },
  { id: "D3",  target: "D", entry: 3,  riskRank: 5  },
  { id: "E3",  target: "E", entry: 3,  riskRank: 6  },
  { id: "E2",  target: "E", entry: 2,  riskRank: 7  },
  { id: "B6",  target: "B", entry: 6,  riskRank: 8  },
  { id: "A2",  target: "A", entry: 2,  riskRank: 9  },
  { id: "F3",  target: "F", entry: 3,  riskRank: 10 },
  { id: "F4",  target: "F", entry: 4,  riskRank: 11 },
  { id: "C4",  target: "C", entry: 4,  riskRank: 12 },
  { id: "A4",  target: "A", entry: 4,  riskRank: 13 },
  { id: "D4",  target: "D", entry: 4,  riskRank: 14 },
  { id: "E4",  target: "E", entry: 4,  riskRank: 15 },
  { id: "F6",  target: "F", entry: 6,  riskRank: 16 },
  { id: "F5",  target: "F", entry: 5,  riskRank: 17 },
  { id: "D6",  target: "D", entry: 6,  riskRank: 18 },
  { id: "C2",  target: "C", entry: 2,  riskRank: 19 },
  { id: "C6",  target: "C", entry: 6,  riskRank: 20 },
  { id: "E1",  target: "E", entry: 1,  riskRank: 21 },
  { id: "D1",  target: "D", entry: 1,  riskRank: 22 },
  { id: "F2",  target: "F", entry: 2,  riskRank: 23 },
  { id: "F1",  target: "F", entry: 1,  riskRank: 24 },
  { id: "B2",  target: "B", entry: 2,  riskRank: 25 },
  { id: "B1",  target: "B", entry: 1,  riskRank: 26 },
  { id: "D5",  target: "D", entry: 5,  riskRank: 27 },
  { id: "C3",  target: "C", entry: 3,  riskRank: 28 },
  { id: "C5",  target: "C", entry: 5,  riskRank: 29 },
  { id: "C1",  target: "C", entry: 1,  riskRank: 29 },
  { id: "B3",  target: "B", entry: 3,  riskRank: 30 },
  { id: "A5",  target: "A", entry: 5,  riskRank: 31 },
  { id: "A3",  target: "A", entry: 3,  riskRank: 32 },
  { id: "A6",  target: "A", entry: 6,  riskRank: 33 },
  { id: "E5",  target: "E", entry: 5,  riskRank: 35 },
  { id: "E6",  target: "E", entry: 6,  riskRank: 36 },
];

const STRUCTURE_1_EXTRA = [
  { id: "A7",  target: "A", entry: 7,  riskRank: 11 },
  { id: "B7",  target: "B", entry: 7,  riskRank: 4  },
  { id: "C7",  target: "C", entry: 7,  riskRank: 13 },
  { id: "D7",  target: "D", entry: 7,  riskRank: 6  },
  { id: "E7",  target: "E", entry: 7,  riskRank: 8  },
  { id: "F7",  target: "F", entry: 7,  riskRank: 10 },
  { id: "A8",  target: "A", entry: 8,  riskRank: 16 },
  { id: "B8",  target: "B", entry: 8,  riskRank: 9  },
  { id: "C8",  target: "C", entry: 8,  riskRank: 14 },
  { id: "D8",  target: "D", entry: 8,  riskRank: 5  },
  { id: "E8",  target: "E", entry: 8,  riskRank: 7  },
  { id: "F8",  target: "F", entry: 8,  riskRank: 12 },
  { id: "A9",  target: "A", entry: 9,  riskRank: 8  },
  { id: "B9",  target: "B", entry: 9,  riskRank: 3  },
  { id: "C9",  target: "C", entry: 9,  riskRank: 11 },
  { id: "D9",  target: "D", entry: 9,  riskRank: 7  },
  { id: "E9",  target: "E", entry: 9,  riskRank: 5  },
  { id: "F9",  target: "F", entry: 9,  riskRank: 9  },
  { id: "A10", target: "A", entry: 10, riskRank: 22 },
  { id: "B10", target: "B", entry: 10, riskRank: 18 },
  { id: "C10", target: "C", entry: 10, riskRank: 20 },
  { id: "D10", target: "D", entry: 10, riskRank: 15 },
  { id: "E10", target: "E", entry: 10, riskRank: 17 },
  { id: "F10", target: "F", entry: 10, riskRank: 19 },
];

const S1_ALL = [...STRUCTURE_1_TRAJECTORIES, ...STRUCTURE_1_EXTRA];

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const mapRange = (val, inMin, inMax, outMin, outMax) =>
  outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);

// Target SVG: viewBox 0 0 380 490, data x[-6,2] y[-6,2]
const tgtToSVG = (pt) => ({
  x: mapRange(pt.x, -6, 2, 55, 325),
  y: mapRange(pt.y, -6, 2, 455, 65),
});

const buildRiskMap = (targetId) => {
  const map = {};
  S1_ALL.forEach((t) => { if (t.target === targetId) map[t.entry] = t.riskRank; });
  return map;
};

// ══════════════════════════════════════════════════════════════════════════════
// SKETCHFAB BRAIN — 3D MRI model embed
// ══════════════════════════════════════════════════════════════════════════════
function SketchfabBrain() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#070a10" }}>
      <iframe
        title="3D MRI Brain"
        src="https://sketchfab.com/models/2a140e43433d43f1be7e1feea43a295e/embed?autostart=1&ui_hint=0&ui_infos=0&ui_controls=1&ui_watermark=0&ui_watermark_link=0&dnt=1&camera=0"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="autoplay; fullscreen; xr-spatial-tracking"
        allowFullScreen
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPACT ENTRY HEATMAP — SVG for right panel
// ══════════════════════════════════════════════════════════════════════════════
function CompactEntryHeatmap({ currentTarget = "A", currentEntry = 1 }) {
  const riskMap = buildRiskMap(currentTarget);

  // Map entry coords x[0,6] y[5,9] → SVG x[18,274] y[82,12]
  const entToSVG = (ep) => ({
    x: mapRange(ep.x, -0.3, 6.3, 18, 274),
    y: mapRange(ep.y, 4.6, 9.4, 85, 10),
  });

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div style={{
        padding: "5px 12px 3px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase",
          color: C.textDim, fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>Entry Risk Map</span>
        <span style={{
          fontSize: 9, color: C.textMuted, fontFamily: "'Courier New', monospace",
        }}>Target {currentTarget}</span>
      </div>
      <svg viewBox="0 0 292 98" style={{ width: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="eGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* skull outline hint */}
        <ellipse cx="146" cy="48" rx="128" ry="40"
          fill="none" stroke={C.border} strokeWidth="0.8"
          strokeDasharray="3,2.5" opacity="0.45" />
        {Object.values(ENTRY_POINTS).map((ep) => {
          const { x, y } = entToSVG(ep);
          const rr = riskMap[ep.id];
          const norm = rr != null ? normRisk(rr) : null;
          const col = riskColour(norm);
          const isCur = ep.id === currentEntry;
          const r = isCur ? 7.5 : 5;
          return (
            <g key={ep.id}>
              {isCur && (
                <circle cx={x} cy={y} r={r + 6}
                  fill={col} opacity="0.14" />
              )}
              <circle cx={x} cy={y} r={r}
                fill={col} opacity={norm != null ? 0.9 : 0.35}
                stroke={isCur ? "#fff" : col}
                strokeWidth={isCur ? 1.2 : 0.4}
                strokeOpacity={isCur ? 1 : 0.3}
                filter={isCur ? "url(#eGlow)" : undefined}
              />
              <text x={x} y={y + 3.5} textAnchor="middle"
                fill="#fff" fontSize="5.5" fontWeight={isCur ? "700" : "400"}
                fontFamily="'Courier New', monospace"
                style={{ pointerEvents: "none", userSelect: "none" }}>
                {ep.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ORGANIC TARGET PANEL — SVG brain slice
// ══════════════════════════════════════════════════════════════════════════════
function OrganicTargetPanel({ currentTarget = "A" }) {
  // Organic coronal brain-section path — viewBox 0 0 380 490
  const brainPath =
    "M 188,32 " +
    "C 215,24 256,34 288,56 " +
    "C 322,80 344,118 350,160 " +
    "C 356,202 348,248 332,290 " +
    "C 316,332 290,368 258,396 " +
    "C 232,420 202,436 170,444 " +
    "C 142,450 114,446 88,430 " +
    "C 58,410 34,380 20,344 " +
    "C 6,306 4,264 14,222 " +
    "C 26,178 52,140 82,112 " +
    "C 114,84 152,60 184,38 " +
    "C 186,36 188,32 188,32 Z";

  const p = (pt) => tgtToSVG(pt);
  const abcCenter = p({ x: 0.3, y: 0.3 });
  const defCenter = p({ x: -5, y: -2 });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.surface }}>
      <div style={{
        padding: "9px 14px 6px", fontSize: 9, letterSpacing: "0.14em",
        textTransform: "uppercase", color: C.textDim,
        borderBottom: `1px solid ${C.border}`,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>Target Points — Structure 1</span>
        <span style={{ color: C.s1Color, fontSize: 10, fontFamily: "'Courier New', monospace" }}>
          {currentTarget} active
        </span>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 380 490"
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id="brainClip"><path d={brainPath} /></clipPath>
            <filter id="tgtGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="brainGrad" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#162030" />
              <stop offset="100%" stopColor="#0D1A28" />
            </radialGradient>
          </defs>

          {/* Brain silhouette */}
          <path d={brainPath} fill="url(#brainGrad)" stroke="#2A4A6A" strokeWidth="1.5" />

          {/* Region shading */}
          <g clipPath="url(#brainClip)">
            <ellipse cx={abcCenter.x} cy={abcCenter.y} rx={55} ry={58}
              fill={C.riskLow} opacity="0.08" />
            <ellipse cx={defCenter.x} cy={defCenter.y} rx={40} ry={120}
              fill="#F4A460" opacity="0.08" />
          </g>

          {/* Sulcal fold hints */}
          <g stroke={C.border} strokeWidth="0.9" fill="none" opacity="0.4" clipPath="url(#brainClip)">
            <path d="M 188,36 C 188,68 186,98 184,128" />
            <path d="M 40,232 C 62,216 86,208 110,206" />
            <path d="M 322,224 C 300,210 276,204 250,204" />
            <path d="M 56,292 C 80,280 106,274 130,276" />
            <path d="M 258,110 C 272,138 274,165 267,192" />
            <path d="M 150,80 C 156,106 156,132 150,158" />
          </g>

          {/* Cluster labels */}
          <text x={abcCenter.x} y={abcCenter.y - 66} textAnchor="middle"
            fill={C.riskLow} fontSize="7.5" opacity="0.6"
            fontFamily="'Segoe UI', system-ui, sans-serif" letterSpacing="0.12em">
            MESIAL
          </text>
          <text x={defCenter.x} y={defCenter.y - 130} textAnchor="middle"
            fill="#F4A460" fontSize="7.5" opacity="0.6"
            fontFamily="'Segoe UI', system-ui, sans-serif" letterSpacing="0.12em">
            LATERAL
          </text>

          {/* Target dots */}
          {Object.values(STRUCTURE_1_TARGETS).map((tp) => {
            const { x, y } = p(tp);
            const isSel = tp.id === currentTarget;
            const r = isSel ? 16 : 11;
            return (
              <g key={tp.id} filter={isSel ? "url(#tgtGlow)" : undefined}>
                {isSel && (
                  <circle cx={x} cy={y} r={r + 10} fill="none"
                    stroke={tp.color} strokeWidth="1" opacity="0.25" />
                )}
                <circle cx={x} cy={y} r={r}
                  fill={tp.color} fillOpacity={isSel ? 1.0 : 0.72}
                  stroke={isSel ? "#ffffff" : tp.color}
                  strokeWidth={isSel ? 2 : 0.8}
                  strokeOpacity={isSel ? 1 : 0.4} />
                <text x={x} y={y + 4} textAnchor="middle"
                  fill="#ffffff" fontSize={isSel ? 11 : 9}
                  fontFamily="'Courier New', monospace"
                  fontWeight={isSel ? "bold" : "normal"}
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {tp.id}
                </text>
                <text x={x} y={y + r + 13} textAnchor="middle"
                  fill={C.textDim} fontSize="6.5"
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                  style={{ pointerEvents: "none" }}>
                  {tp.region}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAJECTORY LIST
// ══════════════════════════════════════════════════════════════════════════════
function TrajectoryList({ currentTrajId = "A1", acceptedPool = [], rejectedTrajs = [] }) {
  const listRef = useRef(null);

  const sorted = [...S1_ALL].sort((a, b) =>
    a.riskRank !== b.riskRank ? a.riskRank - b.riskRank : a.id.localeCompare(b.id)
  );

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-traj="${currentTrajId}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentTrajId]);

  return (
    <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {sorted.map((t) => {
        const norm = normRisk(t.riskRank);
        const col = riskColour(norm);
        const label = riskLabel(norm);
        const isCurrent = t.id === currentTrajId;
        const isAccepted = acceptedPool.includes(t.id);
        const isRejected = rejectedTrajs.includes(t.id);
        const tgt = STRUCTURE_1_TARGETS[t.target];
        const ent = ENTRY_POINTS[t.entry];

        return (
          <div
            key={t.id}
            data-traj={t.id}
            style={{
              padding: "7px 9px",
              borderRadius: 5,
              border: `1px solid ${isCurrent ? C.s1Color : isAccepted ? C.accepted + "88" : C.border}`,
              borderLeft: `3px solid ${isCurrent ? C.s1Color : isAccepted ? C.accepted : C.border}`,
              background: isCurrent
                ? "rgba(27,79,138,0.42)"
                : isAccepted ? "rgba(29,158,117,0.07)" : C.surface,
              opacity: isRejected ? 0.28 : 1,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
              transition: "border-color 0.1s, background 0.1s",
            }}
          >
            {/* Risk rank badge */}
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: col,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9.5, fontWeight: 700, color: "#fff",
              fontFamily: "'Courier New', monospace", flexShrink: 0,
            }}>
              {t.riskRank}
            </div>

            {/* Main info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{
                  fontSize: 9.5, padding: "1px 6px", borderRadius: 3,
                  background: C.surface3, border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  fontFamily: "'Segoe UI', system-ui, sans-serif", whiteSpace: "nowrap",
                }}>
                  {t.target} · {tgt.region}
                </span>
                {isCurrent && (
                  <span style={{
                    fontSize: 8.5, padding: "1px 5px", borderRadius: 3,
                    background: "#1A3F6A", color: "#7EC8E3",
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    letterSpacing: "0.04em",
                  }}>CURRENT</span>
                )}
              </div>
              <div style={{
                fontSize: 9, color: C.textDim,
                fontFamily: "'Courier New', monospace", lineHeight: 1.55,
              }}>
                T: {t.target} ({tgt.x.toFixed(1)}, {tgt.y.toFixed(1)})
                {"  "}·{"  "}
                E: {t.entry} ({ent.x.toFixed(1)}, {ent.y.toFixed(1)})
              </div>
            </div>

            {/* Risk score */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                padding: "2px 7px", borderRadius: 4,
                background: col + "2A", border: `1px solid ${col}55`,
                color: col, fontSize: 11, fontWeight: 700,
                fontFamily: "'Courier New', monospace", marginBottom: 2,
              }}>
                {norm.toFixed(2)}
              </div>
              <div style={{
                fontSize: 8, color: C.textDim,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
              }}>
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL
// ══════════════════════════════════════════════════════════════════════════════
const navBtnStyle = (disabled) => ({
  width: 28, height: 28, borderRadius: 4,
  background: "transparent",
  border: `1px solid ${disabled ? C.border : C.borderBright}`,
  color: disabled ? C.textDim : C.textMuted,
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

function RightPanel({ minDist, currentTrajId = "A1" }) {
  const currentTraj = S1_ALL.find((t) => t.id === currentTrajId);
  const currentTgtRegion = currentTraj ? STRUCTURE_1_TARGETS[currentTraj.target]?.region : "—";
  const currentTarget = currentTraj?.target ?? "A";
  const currentEntry = currentTraj?.entry ?? 1;

  const divider = <div style={{ height: 1, background: C.border, margin: "0" }} />;

  return (
    <div style={{
      width: 308, flexShrink: 0,
      background: C.surface2,
      borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Map Mode */}
      <div style={{
        padding: "7px 12px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 7, opacity: 0.4,
      }}>
        <Layers size={12} color={C.textDim} />
        <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          Map Mode
        </span>
        <span style={{ fontSize: 8, color: C.textDim, marginLeft: 2, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          · Step 5
        </span>
      </div>

      {/* Compact entry heatmap */}
      <CompactEntryHeatmap currentTarget={currentTarget} currentEntry={currentEntry} />

      {/* List header */}
      <div style={{
        padding: "5px 12px 4px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 8.5, color: C.textDim, letterSpacing: "0.12em",
          textTransform: "uppercase", fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          All Trajectories · {S1_ALL.length}
        </span>
        <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Courier New', monospace" }}>
          Δ {minDist}mm
        </span>
      </div>

      {/* Scrollable trajectory list */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "5px 7px",
        scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`,
      }}>
        <TrajectoryList currentTrajId={currentTrajId} />
      </div>

      {divider}

      {/* Target navigation */}
      <div style={{
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 8,
        borderTop: `1px solid ${C.border}`,
      }}>
        <button disabled style={navBtnStyle(true)}><ChevronLeft size={12} /></button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.textDim, fontFamily: "'Segoe UI', system-ui, sans-serif", marginBottom: 1 }}>
            Target
          </div>
          <div style={{
            fontSize: 10, color: C.textPrimary,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {currentTrajId[0]} — {currentTgtRegion}
          </div>
        </div>
        <button disabled style={navBtnStyle(true)}><ChevronRight size={12} /></button>
      </div>

      {divider}

      {/* Accept / Reject */}
      <div style={{
        padding: "7px 12px", display: "flex", gap: 7,
        borderTop: `1px solid ${C.border}`,
      }}>
        <button style={{
          flex: 1, padding: "7px 0",
          background: "transparent", border: `1px solid ${C.riskLow}`,
          borderRadius: 5, color: C.riskLow, fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          <Check size={12} /> Accept
        </button>
        <button style={{
          flex: 1, padding: "7px 0",
          background: "transparent", border: `1px solid ${C.riskHigh}`,
          borderRadius: 5, color: C.riskHigh, fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          <X size={12} /> Reject
        </button>
      </div>

      {divider}

      {/* Shortlist */}
      <div style={{ padding: "7px 12px 10px", borderTop: `1px solid ${C.border}` }}>
        <div style={{
          fontSize: 8.5, color: C.textDim, letterSpacing: "0.12em",
          textTransform: "uppercase", marginBottom: 6,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          Shortlist 0 / 5
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              flex: 1, height: 26, borderRadius: 4,
              border: `1px dashed ${C.border}`, background: "transparent",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function NavigationScreen({ minDist }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: C.bg, color: C.textPrimary, overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      {/* Header strip */}
      <div style={{
        height: 38, background: C.surface2,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center",
        padding: "0 18px", gap: 16, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color: C.s1Color,
          letterSpacing: "0.06em",
        }}>EpiNav</span>
        <span style={{ color: C.textDim, fontSize: 11 }}>CAP Assessment</span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 9, color: C.textMuted,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: "2px 8px",
          fontFamily: "'Courier New', monospace",
        }}>Structure 1 of 2</span>
        <span style={{ fontSize: 10, color: C.textDim }}>Session 001</span>
      </div>

      {/* 3-column content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left — organic target SVG */}
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${C.border}`, overflow: "hidden" }}>
          <OrganicTargetPanel currentTarget="A" />
        </div>

        {/* Centre — Sketchfab 3D brain */}
        <div style={{ flex: 1.3, minWidth: 0, position: "relative" }}>
          <div style={{
            position: "absolute", top: 10, left: 14, zIndex: 10,
            fontSize: 9, letterSpacing: "0.12em", color: C.textDim,
            textTransform: "uppercase", pointerEvents: "none",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
          }}>
            3D Brain · drag to rotate
          </div>
          <SketchfabBrain />
        </div>

        {/* Right panel */}
        <RightPanel minDist={minDist} currentTrajId="A1" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function WelcomeScreen({ onStart }) {
  const [minDist, setMinDist] = useState(3);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      color: C.textPrimary,
    }}>
      {/* Background brain glow hint */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%) rotate(-12deg)",
        width: 560, height: 640, borderRadius: "50%",
        background: `radial-gradient(ellipse, ${C.s1Color}07 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{
        width: 460, background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "48px 42px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          fontSize: 9, letterSpacing: "0.18em", color: C.s1Color,
          textTransform: "uppercase", marginBottom: 10,
        }}>
          KCL / UCL · Neurosurgical Planning
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          EpiNav CAP Assessment
        </h1>
        <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 20 }}>
          SEEG Trajectory Planning · KCL / UCL
        </div>
        <div style={{
          fontSize: 12, color: C.textDim, lineHeight: 1.65,
          borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
          padding: "12px 0", marginBottom: 24,
        }}>
          SEEG electrode planning for drug-resistant focal epilepsy.
          Navigate candidate trajectories by risk rank and spatial constraints.
        </div>

        {/* minDist selector */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, letterSpacing: "0.05em" }}>
            Minimum distance constraint
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 3].map((d) => (
              <button key={d} onClick={() => setMinDist(d)} style={{
                flex: 1, padding: "9px 0", borderRadius: 6,
                border: `1px solid ${minDist === d ? C.s1Color : C.border}`,
                background: minDist === d ? "rgba(0,212,170,0.09)" : "transparent",
                color: minDist === d ? C.s1Color : C.textMuted,
                fontSize: 13, fontWeight: minDist === d ? 700 : 400,
                fontFamily: "'Courier New', monospace",
                cursor: "pointer", transition: "all 0.12s",
              }}>
                {d} mm
              </button>
            ))}
          </div>
        </div>

        {/* Map mode — greyed */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 32, padding: "10px 14px",
          background: C.surface2, borderRadius: 6,
          border: `1px solid ${C.border}`, opacity: 0.45,
        }}>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Map Mode</div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>Coming in Step 5</div>
          </div>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: C.border, position: "relative" }}>
            <div style={{ position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff" }} />
          </div>
        </div>

        <button onClick={() => onStart(minDist)} style={{
          width: "100%", padding: "14px 0",
          background: "linear-gradient(135deg, #1D9E75, #158a62)",
          border: "none", borderRadius: 7, color: "#fff",
          fontSize: 15, fontWeight: 600,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          cursor: "pointer", letterSpacing: "0.04em",
          boxShadow: "0 4px 24px rgba(29,158,117,0.35)",
          transition: "all 0.15s",
        }}>
          Begin Planning
        </button>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 10, color: C.textDim }}>
          Session data not persisted · Research use only
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SURVEY + DONE (placeholders)
// ══════════════════════════════════════════════════════════════════════════════
function SurveyScreen({ onFinish }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.textPrimary,
    }}>
      <div style={{
        width: 420, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "44px 40px", textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
          Post-Task Survey
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>Survey</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 32 }}>
          Available after both structures — coming in Step 7.
        </div>
        <button onClick={onFinish} style={{
          padding: "10px 32px", background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 6,
          color: C.textMuted, fontSize: 13, cursor: "pointer",
        }}>Finish Session</button>
      </div>
    </div>
  );
}

function DoneScreen({ onReset }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.textPrimary,
    }}>
      <div style={{
        width: 360, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "44px 40px", textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(29,158,117,0.12)", border: `2px solid ${C.riskLow}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <Check size={22} color={C.riskLow} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Session Complete</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 32 }}>Thank you.</div>
        <button onClick={onReset} style={{
          padding: "10px 28px", background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 6,
          color: C.textMuted, fontSize: 13, cursor: "pointer",
        }}>Reset Session</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [minDist, setMinDist] = useState(3);

  const handleStart = (dist) => { setMinDist(dist); setScreen("navigation"); };

  if (screen === "welcome")    return <WelcomeScreen onStart={handleStart} />;
  if (screen === "navigation") return <NavigationScreen minDist={minDist} />;
  if (screen === "survey")     return <SurveyScreen onFinish={() => setScreen("done")} />;
  if (screen === "done")       return <DoneScreen onReset={() => setScreen("welcome")} />;
  return null;
}
