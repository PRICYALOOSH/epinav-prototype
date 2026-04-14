import React from 'react';

const palette = {
  bg: '#050D1A',
  surface: '#0A1628',
  surface2: '#0F1F35',
  border: '#1E3552',
  text: '#E8F0F8',
  textMuted: '#8BA3BE',
  accent: '#00D4AA',
  accentDim: '#007a63',
};

const stages = [
  {
    n: 1,
    title: 'Target selection',
    body: 'Inspect each candidate target with a live cortical risk heatmap. Accept up to four.',
  },
  {
    n: 2,
    title: 'Entry selection',
    body: 'Compare overlay or carousel views, optionally filter to a region of interest.',
  },
  {
    n: 3,
    title: 'Final trajectory',
    body: 'Side-by-side comparison of surviving trajectories, then confirm one.',
  },
];

export default function WelcomeScreen({ onBegin }) {
  return (
    <div
      className="screen-enter"
      style={{
        position: 'fixed',
        inset: 0,
        background: `radial-gradient(ellipse at top, #0A1A30 0%, ${palette.bg} 70%)`,
        color: palette.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          background: palette.surface,
          border: `1px solid ${palette.border}`,
          borderRadius: 14,
          padding: '48px 56px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            color: palette.accent,
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          EpiNav · CAP Assessment
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            margin: 0,
            marginBottom: 14,
            letterSpacing: -0.3,
          }}
        >
          Trajectory Navigation Prototype
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: palette.textMuted,
            margin: 0,
            marginBottom: 36,
          }}
        >
          A redesigned planning workflow for SEEG electrode implantation in
          drug-resistant focal epilepsy. You'll select targets, explore entry
          regions, and confirm a single trajectory across three short stages.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 40,
          }}
        >
          {stages.map((s) => (
            <div
              key={s.n}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                background: palette.surface2,
                border: `1px solid ${palette.border}`,
                borderRadius: 10,
                padding: '14px 18px',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: palette.accentDim,
                  color: palette.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {s.n}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, lineHeight: 1.45 }}>
                  {s.body}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onBegin}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px 24px',
            borderRadius: 10,
            border: 'none',
            background: palette.accent,
            color: '#04211A',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0.5,
            transition: 'transform 0.12s ease, box-shadow 0.12s ease',
            boxShadow: '0 6px 24px rgba(0, 212, 170, 0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 10px 32px rgba(0, 212, 170, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 212, 170, 0.25)';
          }}
        >
          Begin →
        </button>

        <div
          style={{
            marginTop: 20,
            fontSize: 11,
            color: '#3D5A78',
            textAlign: 'center',
            letterSpacing: 0.4,
          }}
        >
          KCL · MSc Healthcare Technologies 2025–26
        </div>
      </div>
    </div>
  );
}
