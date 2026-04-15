import React, { useMemo, useState } from 'react';
import BrainCanvas from './BrainCanvas.jsx';

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
};

const MAX_FINAL_TRAJECTORIES = 4;

const formatPoint = (point) =>
  `${point[0].toFixed(1)}, ${point[1].toFixed(1)}, ${point[2].toFixed(1)}`;

const dist3 = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const buildFinalTrajectories = (reviewState) => {
  const keptTargets = reviewState?.keptTargets || [];
  const targetMap = new Map(keptTargets.map((target) => [target.id, target]));
  const selections = Array.isArray(reviewState?.selections) ? reviewState.selections : [];
  const entryStyleMode =
    reviewState?.sourceMode === 'A' || reviewState?.sourceMode === 'D2';

  return selections
    .map((selection, index) => {
      const target = targetMap.get(selection.targetId) || null;
      const targetPosition = selection.targetPosition || target?.position;
      const entryPosition = selection.entryPosition || selection.pinPosition;
      if (!targetPosition || !entryPosition) return null;

      const scorePct = typeof selection.scorePct === 'number' ? selection.scorePct : 0;
      const riskPct =
        typeof selection.riskPct === 'number' ? selection.riskPct : Math.max(0, 100 - scorePct);
      const label =
        entryStyleMode
          ? `${selection.targetId} ${selection.entryLabel}`
          : `${selection.pinLabel} ${selection.targetId}`;

      return {
        id:
          entryStyleMode
            ? `final-${selection.targetId}-${selection.entryId || index}`
            : `final-${selection.pinId || index}`,
        label,
        shortLabel:
          entryStyleMode
            ? `${selection.targetId}/${selection.entryLabel}`
            : `${selection.pinLabel}/${selection.targetId}`,
        targetId: selection.targetId,
        targetColor: selection.targetColor || target?.color || '#8BA3BE',
        targetPosition,
        entryPosition,
        scorePct,
        riskPct,
        lengthMm: dist3(targetPosition, entryPosition),
        sourceLabel: entryStyleMode ? selection.entryLabel : selection.pinLabel,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.scorePct - a.scorePct)
    .slice(0, MAX_FINAL_TRAJECTORIES);
};

export default function FinalReviewScreen({
  reviewState,
  onBack,
  onConfirm = null,
}) {
  const trajectories = useMemo(() => buildFinalTrajectories(reviewState), [reviewState]);
  const [activeTrajectoryId, setActiveTrajectoryId] = useState(trajectories[0]?.id || null);
  const [confirmedTrajectoryId, setConfirmedTrajectoryId] = useState(null);
  const activeIndex = Math.max(
    0,
    trajectories.findIndex((trajectory) => trajectory.id === activeTrajectoryId)
  );
  const activeTrajectory = trajectories[activeIndex] || trajectories[0] || null;
  const keptTargets = reviewState?.keptTargets || [];
  const previousTrajectory = activeIndex > 0 ? trajectories[activeIndex - 1] : null;
  const nextTrajectory =
    activeIndex >= 0 && activeIndex < trajectories.length - 1
      ? trajectories[activeIndex + 1]
      : null;
  const wasTrimmed =
    Array.isArray(reviewState?.selections) &&
    reviewState.selections.length > MAX_FINAL_TRAJECTORIES;

  if (!reviewState) return null;

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
            Stage 3 / 3
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>Final Review</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {confirmedTrajectoryId && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${palette.accent}`,
                background: palette.accentSoft,
                color: palette.accent,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Final choice confirmed
            </div>
          )}
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

      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              borderBottom: `1px solid ${palette.border}`,
              background: palette.surface,
              overflowX: 'auto',
            }}
          >
            <button
              onClick={() => previousTrajectory && setActiveTrajectoryId(previousTrajectory.id)}
              disabled={!previousTrajectory}
              style={{
                flexShrink: 0,
                padding: '9px 12px',
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: previousTrajectory ? palette.surface2 : 'transparent',
                color: previousTrajectory ? palette.text : palette.textDim,
                fontSize: 12,
                fontWeight: 700,
                cursor: previousTrajectory ? 'pointer' : 'not-allowed',
              }}
            >
              {'< Prev'}
            </button>
            {trajectories.map((trajectory) => {
              const active = activeTrajectory?.id === trajectory.id;
              const confirmed = confirmedTrajectoryId === trajectory.id;
              return (
                <button
                  key={trajectory.id}
                  onClick={() => setActiveTrajectoryId(trajectory.id)}
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
                  {trajectory.shortLabel}
                  {confirmed ? ' *' : ''}
                </button>
              );
            })}
            <button
              onClick={() => nextTrajectory && setActiveTrajectoryId(nextTrajectory.id)}
              disabled={!nextTrajectory}
              style={{
                flexShrink: 0,
                padding: '9px 12px',
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: nextTrajectory ? palette.surface2 : 'transparent',
                color: nextTrajectory ? palette.text : palette.textDim,
                fontSize: 12,
                fontWeight: 700,
                cursor: nextTrajectory ? 'pointer' : 'not-allowed',
              }}
            >
              {'Next >'}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <BrainCanvas
              key="final-review-canvas"
              mode="final"
              targets={keptTargets}
              activeTargetId={activeTrajectory?.targetId || null}
              finalTrajectories={trajectories}
              activeFinalTrajectoryId={activeTrajectory?.id || null}
            />
          </div>
        </div>

        <aside
          style={{
            width: 368,
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
              padding: '18px',
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
              Final candidates
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              {trajectories.length} trajectory{trajectories.length === 1 ? '' : 'ies'} ready
            </div>
            <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.45 }}>
              Toggle through the shortlisted trajectories and confirm the one you want to keep as
              the final path.
            </div>
            {wasTrimmed && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  fontSize: 11,
                  color: palette.textMuted,
                  lineHeight: 1.45,
                }}
              >
                More than 4 trajectories were available, so Stage 3 is showing the top 4 by
                safety.
              </div>
            )}
          </div>

          {activeTrajectory && (
            <div style={{ padding: '16px 18px 18px' }}>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: `1px solid ${palette.accent}`,
                  background: palette.accentSoft,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{activeTrajectory.label}</div>
                <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 6 }}>
                  Target {activeTrajectory.targetId} · source {activeTrajectory.sourceLabel}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  {[
                    ['Final safety', `${activeTrajectory.scorePct}%`],
                    ['Final risk', `${activeTrajectory.riskPct}%`],
                    ['Length', `${activeTrajectory.lengthMm.toFixed(1)} mm`],
                    ['Source mode', reviewState.sourceModeLabel || reviewState.sourceMode],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid rgba(30, 53, 82, 0.8)`,
                        background: 'rgba(10, 22, 40, 0.42)',
                      }}
                    >
                      <div style={{ fontSize: 10, color: palette.textMuted, marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid rgba(30, 53, 82, 0.8)`,
                    background: 'rgba(10, 22, 40, 0.42)',
                  }}
                >
                  <div style={{ fontSize: 10, color: palette.textMuted, marginBottom: 4 }}>
                    Entry coordinate
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.text,
                      fontFamily: '"Courier New", Courier, monospace',
                    }}
                  >
                    {formatPoint(activeTrajectory.entryPosition)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setConfirmedTrajectoryId(activeTrajectory.id);
                    if (onConfirm) onConfirm(activeTrajectory);
                  }}
                  style={{
                    width: '100%',
                    marginTop: 14,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${palette.accent}`,
                    background: palette.accentSoft,
                    color: palette.accent,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {confirmedTrajectoryId === activeTrajectory.id
                    ? 'Final trajectory confirmed'
                    : 'Confirm Final Trajectory'}
                </button>
              </div>

              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: palette.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Shortlist
              </div>
              {trajectories.map((trajectory) => {
                const active = trajectory.id === activeTrajectory.id;
                const confirmed = trajectory.id === confirmedTrajectoryId;
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
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{trajectory.label}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: confirmed
                            ? palette.accent
                            : active
                              ? palette.text
                              : palette.textMuted,
                        }}
                      >
                        {confirmed ? 'confirmed' : active ? 'active' : 'view'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6 }}>
                      safety {trajectory.scorePct}% / risk {trajectory.riskPct}% / length{' '}
                      {trajectory.lengthMm.toFixed(1)} mm
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
