import React, { useState, useCallback, useEffect, useRef } from 'react';
import BrainCanvas from './BrainCanvas.jsx';
import { generateTargetsFromRegion, pickAmygdala } from '../data/targets.js';

const palette = {
  bg: '#050D1A',
  surface: '#0A1628',
  surface2: '#0F1F35',
  border: '#1E3552',
  text: '#E8F0F8',
  textMuted: '#8BA3BE',
  textDim: '#3D5A78',
  accent: '#00D4AA',
  accepted: '#00D4AA',
  rejected: '#FF4757',
  highlight: '#1B4F8A',
};

const MIN_ACCEPTED = 1;
const MAX_ACCEPTED = 4;
const cloneTargets = (targets) =>
  (targets || []).map((target) => ({
    ...target,
    position: Array.isArray(target.position) ? [...target.position] : target.position,
  }));
const buildStage1Checkpoint = (state) =>
  state
    ? {
        targets: cloneTargets(state.targets),
        decisions: Object.fromEntries(
          (state.targets || []).map((target) => [target.id, 'undecided'])
        ),
        activeTargetId: state.targets?.[0]?.id || null,
      }
    : null;

export default function TargetSelectionScreen({ onBack, onContinue, initialState = null }) {
  const [regions, setRegions] = useState(null);
  const [targets, setTargets] = useState(initialState?.targets || []);
  const [activeId, setActiveId] = useState(initialState?.activeTargetId || null);
  const [decisions, setDecisions] = useState(initialState?.decisions || {});
  const checkpointRef = useRef(buildStage1Checkpoint(initialState));

  useEffect(() => {
    checkpointRef.current = buildStage1Checkpoint(initialState);
  }, [initialState]);

  const handleRegionsReady = useCallback((regs) => {
    setRegions(regs);
    if ((initialState?.targets && initialState.targets.length > 0) || targets.length > 0) {
      return;
    }
    const amyg = pickAmygdala(regs);
    if (!amyg) return;
    const generated = generateTargetsFromRegion(amyg, { count: 10, seed: 7 });
    setTargets(generated);
    setDecisions(
      Object.fromEntries(generated.map((target) => [target.id, 'undecided']))
    );
    if (generated.length > 0) setActiveId(generated[0].id);
    checkpointRef.current = buildStage1Checkpoint({
      targets: generated,
      decisions: Object.fromEntries(generated.map((target) => [target.id, 'undecided'])),
      activeTargetId: generated[0]?.id || null,
    });
  }, [initialState, targets.length]);

  const acceptedIds = Object.keys(decisions).filter((id) => decisions[id] === 'accept');
  const rejectedIds = Object.keys(decisions).filter((id) => decisions[id] === 'reject');
  const undecidedIds = Object.keys(decisions).filter((id) => decisions[id] === 'undecided');
  const activeIds = targets
    .filter((target) => decisions[target.id] !== 'reject')
    .map((target) => target.id);
  const canContinue =
    activeIds.length <= MAX_ACCEPTED && acceptedIds.length >= MIN_ACCEPTED;
  const remainingToTrim = Math.max(0, activeIds.length - MAX_ACCEPTED);
  const pruningMode = remainingToTrim > 0;
  const activeIndex = targets.findIndex((target) => target.id === activeId);
  const activeTarget = activeIndex >= 0 ? targets[activeIndex] : null;
  const previousTarget = activeIndex > 0 ? targets[activeIndex - 1] : null;
  const nextTarget = activeIndex >= 0 && activeIndex < targets.length - 1
    ? targets[activeIndex + 1]
    : null;

  const setDecision = (id, value) => {
    setDecisions((prev) => ({ ...prev, [id]: value }));
  };

  const moveToIndex = (index) => {
    if (index < 0 || index >= targets.length) return;
    setActiveId(targets[index].id);
  };

  const handleResetToCheckpoint = () => {
    const checkpoint = checkpointRef.current;
    if (!checkpoint) return;
    if (!window.confirm('Reset Stage 1 to the last checkpoint?')) return;
    setTargets(cloneTargets(checkpoint.targets));
    setDecisions({ ...checkpoint.decisions });
    setActiveId(checkpoint.activeTargetId || checkpoint.targets[0]?.id || null);
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
            Stage 1 / 3
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
            Target Selection
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleResetToCheckpoint}
            disabled={!checkpointRef.current}
            style={{
              background: checkpointRef.current ? palette.surface2 : 'transparent',
              color: checkpointRef.current ? palette.text : palette.textDim,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 13,
              cursor: checkpointRef.current ? 'pointer' : 'not-allowed',
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

      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', borderRight: `1px solid ${palette.border}` }}>
          <BrainCanvas
            mode="structures"
            targets={targets}
            activeTargetId={activeId}
            onRegionsReady={handleRegionsReady}
            label="structures"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', borderRight: `1px solid ${palette.border}` }}>
          <BrainCanvas
            mode="heatmap"
            targets={targets}
            activeTargetId={activeId}
            label="entry heatmap"
          />
        </div>

        <aside
          style={{
            width: 320,
            flexShrink: 0,
            background: palette.surface,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px 18px 12px',
              borderBottom: `1px solid ${palette.border}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: palette.textMuted,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Candidate targets
            </div>
            <div style={{ fontSize: 13, color: palette.textDim }}>
              {targets.length === 0
                ? 'Waiting for mesh analysis...'
                : pruningMode
                  ? `${activeIds.length} active / reject ${remainingToTrim} more`
                  : `${activeIds.length} active / shortlist ready`}
            </div>
            {targets.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: pruningMode ? palette.surface2 : 'rgba(0, 212, 170, 0.1)',
                  border: `1px solid ${pruningMode ? palette.border : 'rgba(0, 212, 170, 0.35)'}`,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: pruningMode ? palette.textMuted : palette.accent,
                }}
              >
                {pruningMode
                  ? `Reject targets until 4 or fewer remain. ${remainingToTrim} more to remove.`
                  : 'Four or fewer targets remain. Only accepted targets will carry forward to stage 2.'}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {targets.map((t) => {
              const decision = decisions[t.id];
              const isActive = t.id === activeId;
              const isAccepted = decision === 'accept';
              const isRejected = decision === 'reject';
              const isUndecided = decision === 'undecided';
              const statusLabel = isAccepted
                ? 'Accepted'
                : isRejected
                  ? 'Rejected'
                  : 'Undecided';
              const statusColor = isAccepted
                ? palette.accepted
                : isRejected
                  ? palette.rejected
                  : palette.textMuted;

              return (
                <div
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 8,
                    background: isActive ? palette.highlight : palette.surface2,
                    border: `1px solid ${isActive ? palette.accent : palette.border}`,
                    cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                    opacity: isRejected ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: t.color,
                      border: '1px solid rgba(255,255,255,0.2)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t.id}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: palette.textMuted,
                        fontFamily: '"Courier New", Courier, monospace',
                      }}
                    >
                      {t.position[0].toFixed(1)}, {t.position[1].toFixed(1)}, {t.position[2].toFixed(1)}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        color: statusColor,
                      }}
                    >
                      {statusLabel}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecision(t.id, 'accept');
                    }}
                    title={isUndecided || isRejected ? 'accept' : 'accepted'}
                    style={{
                      minWidth: 78,
                      height: 26,
                      borderRadius: 6,
                      border: `1px solid ${
                        isAccepted ? palette.accepted : isUndecided || isRejected ? palette.accepted : palette.border
                      }`,
                      background: isAccepted
                        ? 'rgba(0, 212, 170, 0.18)'
                        : isUndecided || isRejected
                          ? 'transparent'
                          : 'transparent',
                      color: isAccepted ? palette.accepted : palette.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      padding: '0 10px',
                    }}
                  >
                    {isAccepted ? 'Accepted' : 'Accept'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecision(t.id, 'reject');
                    }}
                    title={isAccepted || isUndecided ? 'reject' : 'rejected'}
                    style={{
                      minWidth: 68,
                      height: 26,
                      borderRadius: 6,
                      border: `1px solid ${
                        isRejected ? palette.rejected : palette.rejected
                      }`,
                      background: isRejected
                        ? 'rgba(255, 71, 87, 0.18)'
                        : pruningMode
                          ? palette.rejected
                          : 'transparent',
                      color: isRejected
                        ? palette.rejected
                        : pruningMode
                          ? '#fff'
                          : palette.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      padding: '0 10px',
                    }}
                  >
                    {isRejected ? 'Rejected' : 'Reject'}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </main>

      <footer
        style={{
          padding: '14px 24px',
          borderTop: `1px solid ${palette.border}`,
          background: palette.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: palette.textMuted,
            fontFamily: '"Courier New", Courier, monospace',
            minWidth: 240,
          }}
        >
          active {activeIds.length} / {targets.length || MAX_ACCEPTED}
          {pruningMode && ` / ${remainingToTrim} more to remove`}
          {undecidedIds.length > 0 && ` / ${undecidedIds.length} undecided`}
          {acceptedIds.length > 0 && ` / ${acceptedIds.length} accepted`}
          {rejectedIds.length > 0 && ` / ${rejectedIds.length} rejected`}
          {acceptedIds.length < MIN_ACCEPTED && ' / accept at least 1 target to continue'}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flex: 1,
            minWidth: 0,
          }}
        >
          {activeTarget ? (
            <>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface2,
                  fontSize: 12,
                  color: palette.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                Active: <span style={{ color: palette.text, fontWeight: 700 }}>{activeTarget.id}</span>
              </div>
              <button
                onClick={() => moveToIndex(activeIndex - 1)}
                disabled={!previousTarget}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: previousTarget ? palette.surface2 : 'transparent',
                  color: previousTarget ? palette.text : palette.textDim,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: previousTarget ? 'pointer' : 'not-allowed',
                }}
              >
                {previousTarget ? `< Previous: ${previousTarget.id}` : '< Previous'}
              </button>
              <button
                onClick={() => activeTarget && setDecision(activeTarget.id, 'accept')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${palette.accepted}`,
                  background: 'rgba(0, 212, 170, 0.12)',
                  color: palette.accepted,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Accept
              </button>
              <button
                onClick={() => activeTarget && setDecision(activeTarget.id, 'reject')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${palette.rejected}`,
                  background: palette.rejected,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reject
              </button>
              <button
                onClick={() => moveToIndex(activeIndex + 1)}
                disabled={!nextTarget}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: nextTarget ? palette.surface2 : 'transparent',
                  color: nextTarget ? palette.text : palette.textDim,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: nextTarget ? 'pointer' : 'not-allowed',
                }}
              >
                {nextTarget ? `Next: ${nextTarget.id} >` : 'Next >'}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: palette.textDim }}>
              Waiting for targets...
            </div>
          )}
        </div>
        {canContinue ? (
          <button
            onClick={() =>
              onContinue && onContinue({
                targets,
                decisions,
                activeTargetId: activeId,
                acceptedIds,
              })
            }
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: palette.accent,
              color: '#04211A',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.4,
              cursor: 'pointer',
              transition: 'background 0.12s',
            }}
          >
            {'Continue ->'}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
