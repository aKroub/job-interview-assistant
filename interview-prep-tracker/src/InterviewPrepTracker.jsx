import React, { useState } from 'react';
import { useInterviewTracker } from './hooks/useInterviewTracker';
import { STAGES, STAGE_LABELS } from './constants/stages';
import { POSITIONS } from './constants/positions';
import { INTERVIEW_TYPES } from './constants/interviewTypes';
import { APP_TITLE } from './constants/app';
import { TabNav } from './components/shared/TabNav';
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard';
import { TimelineView } from './components/TimelineView/TimelineView';
import { PrepContentView } from './components/PrepContentView/PrepContentView';
import { AddCompanyModal } from './components/AddCompanyModal/AddCompanyModal';
import { SuggestionPanel } from './components/Suggestions/SuggestionPanel';
import { ConnectionStatus } from './components/Suggestions/ConnectionStatus';

const EMPTY_DRAFT = { name: '', position: '', stage: STAGES[0] };

/**
 * Root application component — the thin orchestrating shell.
 *
 * Responsibilities:
 *  - Calls useInterviewTracker() to get all state and mutations
 *  - Owns only pure UI state: active tab, modal visibility, suggestion panel toggle
 *  - Routes to the correct view based on activeTab
 *  - Passes data and callbacks down as props (no prop drilling through multiple levels)
 */
const InterviewPrepTracker = () => {
  const [activeTab,       setActiveTab]       = useState('kanban');
  const [showModal,       setShowModal]       = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [companyDraft,    setCompanyDraft]    = useState(EMPTY_DRAFT);

  const {
    companies,
    addCompany,
    updateCompanyStage,
    deleteCompany,
    addInterview,
    updateInterviewStatus,
    markQuestionSeen,
    resetCompanyQuestionsFor,
    getAvailableQuestionsFor,
    getTotalSeenFor,
    suggestions,
    authStatus,
    connectionStatus,
    dismissSuggestion,
    triggerScan,
    connectGoogle,
    disconnectGoogle,
  } = useInterviewTracker();

  function handleAddCompany() {
    addCompany(companyDraft);
    setCompanyDraft(EMPTY_DRAFT);
    setShowModal(false);
  }

  function handleOpenModal() {
    setCompanyDraft(EMPTY_DRAFT);
    setShowModal(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">{APP_TITLE}</h1>
            <p className="text-gray-600">
              Track your job applications, schedule interviews, and prep for success
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2 shrink-0">
            <ConnectionStatus authStatus={authStatus} connectionStatus={connectionStatus} />
            <button
              onClick={() => setShowSuggestions((v) => !v)}
              className="text-xs text-gray-500 hover:text-blue-600 transition underline"
            >
              {showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
            </button>
          </div>
        </div>

        {/* Suggestion panel */}
        {showSuggestions && (
          <div className="mb-6">
            <SuggestionPanel
              suggestions={suggestions}
              authStatus={authStatus}
              connectionStatus={connectionStatus}
              onDismiss={dismissSuggestion}
              onScan={triggerScan}
              onConnect={connectGoogle}
              onDisconnect={disconnectGoogle}
            />
          </div>
        )}

        {/* Tab navigation */}
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Active view */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {activeTab === 'kanban' && (
            <KanbanBoard
              companies={companies}
              stages={STAGES}
              stageLabels={STAGE_LABELS}
              onAddCompany={handleOpenModal}
              onDeleteCompany={deleteCompany}
              onUpdateStage={updateCompanyStage}
            />
          )}
          {activeTab === 'timeline' && (
            <TimelineView
              companies={companies}
              interviewTypes={INTERVIEW_TYPES}
              onAddInterview={addInterview}
              onUpdateInterviewStatus={updateInterviewStatus}
            />
          )}
          {activeTab === 'prep' && (
            <PrepContentView
              getAvailableQuestionsFor={getAvailableQuestionsFor}
              getTotalSeenFor={getTotalSeenFor}
              onMarkSeen={markQuestionSeen}
              onResetCompany={resetCompanyQuestionsFor}
            />
          )}
        </div>

        {/* Add Company modal */}
        {showModal && (
          <AddCompanyModal
            draft={companyDraft}
            onDraftChange={setCompanyDraft}
            onAdd={handleAddCompany}
            onClose={() => setShowModal(false)}
            stages={STAGES}
            stageLabels={STAGE_LABELS}
            positions={POSITIONS}
          />
        )}
      </div>
    </div>
  );
};

export default InterviewPrepTracker;
