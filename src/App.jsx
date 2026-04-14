import React, { useState } from 'react';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TargetSelectionScreen from './components/TargetSelectionScreen.jsx';
import EntrySelectionScreen from './components/EntrySelectionScreen.jsx';
import FinalReviewScreen from './components/FinalReviewScreen.jsx';

export default function App() {
  const [screen, setScreen] = useState('welcome');
  const [targetSelectionState, setTargetSelectionState] = useState(null);
  const [entryReviewState, setEntryReviewState] = useState(null);
  const [finalReviewState, setFinalReviewState] = useState(null);

  if (screen === 'welcome') {
    return <WelcomeScreen onBegin={() => setScreen('target')} />;
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
          setScreen('final');
        }}
      />
    );
  }

  if (screen === 'final') {
    return (
      <FinalReviewScreen
        reviewState={finalReviewState}
        onBack={() => setScreen('entry')}
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
