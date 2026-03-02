import React, { useState } from 'react';
import { AddCompanyModal } from './components/AddCompanyModal/AddCompanyModal';
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard';
import { PrepContentView } from './components/PrepContentView/PrepContentView';
import { CloudSyncMenu } from './components/shared/CloudSyncMenu';
import { TabNav } from './components/shared/TabNav';
import { ConnectionStatus } from './components/Suggestions/ConnectionStatus';
import { SuggestionPanel } from './components/Suggestions/SuggestionPanel';
import { AddInterviewModal } from './components/TimelineView/AddInterviewModal';
import { TimelineView } from './components/TimelineView/TimelineView';
import { APP_TITLE } from './constants/app';
import { INTERVIEW_TYPES } from './constants/interviewTypes';
import { DEFAULT_PIPELINE, PIPELINES, PIPELINE_LABELS } from './constants/pipelines';
import { POSITIONS } from './constants/positions';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGES, STAGE_LABELS } from './constants/stages';
import { useInterviewTracker } from './hooks/useInterviewTracker';
import { findCompanyByFuzzyName, isInPipeline, matchByNameOnly, matchSuggestionToInterview } from './utils/companyUtils';

const EMPTY_DRAFT = { name: '', position: '', stage: STAGES[0], pipeline: [DEFAULT_PIPELINE] };

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
  const [activePipeline,  setActivePipeline]  = useState(DEFAULT_PIPELINE);
  const [showModal,       setShowModal]       = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [companyDraft,    setCompanyDraft]    = useState(EMPTY_DRAFT);
  const [suggestionDraft, setSuggestionDraft] = useState(null);

  const {
    companies,
    addCompany,
    updateCompanyStage,
    deleteCompany,
    addInterview,
    deleteInterview,
    updateInterviewStatus,
    updateInterview,
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
    syncStatus,
    lastSaved,
    syncError,
    backups,
    saveToDrive,
    loadFromDrive,
  } = useInterviewTracker();

  function handleAddCompany() {
    addCompany(companyDraft);
    setCompanyDraft(EMPTY_DRAFT);
    setShowModal(false);
  }

  function handleOpenModal() {
    setCompanyDraft({ ...EMPTY_DRAFT, pipeline: [activePipeline] });
    setShowModal(true);
  }

  const pipelineCompanies = companies.filter(
    (c) => isInPipeline(c, activePipeline)
  );

  const pipelineCounts = {};
  for (const p of PIPELINES) {
    pipelineCounts[p] = companies.filter(
      (c) => isInPipeline(c, p)
    ).length;
  }

  function handleAcceptSuggestion(suggestion) {
    const action = suggestion.action || 'add';

    if (action === 'cancel') {
      const matched = matchSuggestionToInterview(companies, suggestion)
        || matchByNameOnly(companies, suggestion);
      if (matched) {
        updateInterviewStatus(matched.companyId, matched.interviewId, 'cancelled');
        dismissSuggestion(suggestion);
        return;
      }
      // No tracked interview found — fall through to add flow so the user
      // can see the detected details and optionally add it to the tracker.
    }

    if (action === 'update') {
      // Strict match first (name + date), then relaxed match (name only,
      // closest date). The relaxed match handles the common case where
      // an "update" email changes the interview date — the tracker still
      // holds the old date, so strict matching fails.
      const matched = matchSuggestionToInterview(companies, suggestion)
        || matchByNameOnly(companies, suggestion);
      if (matched) {
        const company   = companies.find((c) => c.id === matched.companyId);
        const interview = company?.interviews.find((i) => i.id === matched.interviewId);
        if (company && interview) {
          // Build a full interview object with the suggestion's proposed changes
          // pre-applied, so the edit modal opens with the new values ready to save.
          const editInterview = {
            ...interview,
            companyId:   company.id,
            companyName: company.name,
            position:    company.position,
            ...(suggestion.type     ? { type: suggestion.type }         : {}),
            ...(suggestion.date     ? { date: suggestion.date }         : {}),
            ...(suggestion.time     ? { time: suggestion.time }         : {}),
            ...(suggestion.duration ? { duration: suggestion.duration } : {}),
          };
          setSuggestionDraft({ suggestion, editInterview });
          return;
        }
      }
      // No tracked interview found — fall through to add flow so the user
      // can see the updated details and optionally add the interview.
    }

    // Default: action === 'add', or cancel/update with no tracked match.
    const match = findCompanyByFuzzyName(companies, suggestion.companyName);
    const values = {
      companyId: match?.id || '',
      type:      suggestion.type || '',
      date:      suggestion.date || '',
      time:      suggestion.time || '',
    };
    if (suggestion.duration) {
      values.duration = suggestion.duration;
    }
    setSuggestionDraft({ suggestion, initialValues: values });
  }

  function handleScheduleFromSuggestion(companyId, interview) {
    addInterview(companyId, interview);
    if (suggestionDraft?.suggestion) {
      dismissSuggestion(suggestionDraft.suggestion);
    }
    setSuggestionDraft(null);
  }

  function handleEditFromSuggestion(companyId, interviewId, updates) {
    updateInterview(companyId, interviewId, updates);
    if (suggestionDraft?.suggestion) {
      dismissSuggestion(suggestionDraft.suggestion);
    }
    setSuggestionDraft(null);
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
            <CloudSyncMenu
              authStatus={authStatus}
              syncStatus={syncStatus}
              lastSaved={lastSaved}
              syncError={syncError}
              backups={backups}
              onSave={saveToDrive}
              onLoad={loadFromDrive}
            />
            <ConnectionStatus authStatus={authStatus} connectionStatus={connectionStatus} />
            <button
              onClick={() => setShowSuggestions((v) => !v)}
              className="text-xs text-gray-500 hover:text-purple-600 transition underline"
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
              onAccept={handleAcceptSuggestion}
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
              companies={pipelineCompanies}
              stages={ACTIVE_STAGES}
              stageLabels={STAGE_LABELS}
              closedStage={CLOSED_STAGE}
              activePipeline={activePipeline}
              pipelines={PIPELINES}
              pipelineLabels={PIPELINE_LABELS}
              pipelineCounts={pipelineCounts}
              onPipelineChange={setActivePipeline}
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
              onDeleteInterview={deleteInterview}
              onUpdateInterview={updateInterview}
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
            stages={ACTIVE_STAGES}
            stageLabels={STAGE_LABELS}
            positions={POSITIONS}
            pipelines={PIPELINES}
            pipelineLabels={PIPELINE_LABELS}
          />
        )}

        {/* Interview modal from suggestion — edit mode for updates, add mode for new */}
        {suggestionDraft?.editInterview && (
          <AddInterviewModal
            companies={companies}
            interviewTypes={INTERVIEW_TYPES}
            interview={suggestionDraft.editInterview}
            onEdit={handleEditFromSuggestion}
            onClose={() => setSuggestionDraft(null)}
          />
        )}
        {suggestionDraft && !suggestionDraft.editInterview && (
          <AddInterviewModal
            companies={companies}
            interviewTypes={INTERVIEW_TYPES}
            onAdd={handleScheduleFromSuggestion}
            onClose={() => setSuggestionDraft(null)}
            initialValues={suggestionDraft.initialValues}
          />
        )}
      </div>
    </div>
  );
};

export default InterviewPrepTracker;
