import React, { useState } from 'react';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TargetSelectionScreen from './components/TargetSelectionScreen.jsx';
import EntrySelectionScreen from './components/EntrySelectionScreen.jsx';
import FinalReviewScreen from './components/FinalReviewScreen.jsx';
import DraftTwoWorkspace from './components/DraftTwoWorkspace.jsx';

export default function App() {
  const [screen, setScreen] = useState('welcome');
  const [draftMode, setDraftMode] = useState('draft1');
  const [targetSelectionState, setTargetSelectionState] = useState(null);
  const [entryReviewState, setEntryReviewState] = useState(null);
  const [finalReviewState, setFinalReviewState] = useState(null);
  const [draftTwoState, setDraftTwoState] = useState(null);

  if (screen === 'welcome') {
    return (
      <WelcomeScreen
        onSelectMode={(mode) => {
          setDraftMode(mode);
          if (mode === 'draft2') {
            setScreen('draft2');
            return;
          }
          setScreen('target');
        }}
      />
    );
  }

  if (screen === 'target') {
    return (
      <TargetSelectionScreen
        initialState={targetSelectionState}
        onBack={() => setScreen('welcome')}
        onContinue={(nextState) => {
          setTargetSelectionState(nextState);
          setEntryReviewState(null);
          setFinalReviewState(null);
          setDraftMode('draft1');
          setScreen('entry');
        }}
      />
    );
  }

  if (screen === 'entry') {
    return (
      <EntrySelectionScreen
        selectionState={targetSelectionState}
        initialReviewState={entryReviewState}
        onBack={() => setScreen('target')}
        onContinue={(nextState) => {
          setEntryReviewState(nextState.stage2Snapshot || null);
          setFinalReviewState(nextState);
          setDraftMode('draft1');
          setScreen('final');
        }}
      />
    );
  }

  if (screen === 'draft2') {
    return (
      <DraftTwoWorkspace
        initialState={draftTwoState}
        onBack={() => setScreen('welcome')}
        onContinue={(nextState) => {
          setDraftTwoState(nextState.stage2Snapshot || null);
          setFinalReviewState(nextState);
          setDraftMode('draft2');
          setScreen('final');
        }}
      />
    );
  }

  if (screen === 'final') {
    return (
      <FinalReviewScreen
        reviewState={finalReviewState}
        onBack={() => setScreen(draftMode === 'draft2' ? 'draft2' : 'entry')}
        onConfirm={(trajectory) =>
          setFinalReviewState((prev) =>
            prev ? { ...prev, finalSelection: trajectory } : prev
          )
        }
      />
    );
  }

  return null;
}
