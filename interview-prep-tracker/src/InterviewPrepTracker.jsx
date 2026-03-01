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
import { findCompanyByFuzzyName, isInPipeline, matchSuggestionToInterview } from './utils/companyUtils';

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
      const matched = matchSuggestionToInterview(companies, suggestion);
      if (!matched) return;
      updateInterviewStatus(matched.companyId, matched.interviewId, 'cancelled');
      dismissSuggestion(suggestion);
      return;
    }

    if (action === 'update') {
      const matched = matchSuggestionToInterview(companies, suggestion);
      if (!matched) return;
      const values = {
        companyId: matched.companyId,
        type:      suggestion.type || '',
        date:      suggestion.date || '',
        time:      suggestion.time || '',
      };
      if (suggestion.duration) {
        values.duration = suggestion.duration;
      }
      setSuggestionDraft({ suggestion, initialValues: values, matchedInterview: matched });
      return;
    }

    // Default: action === 'add'
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
    if (suggestionDraft?.matchedInterview) {
      const { companyId: matchedCompanyId, interviewId } = suggestionDraft.matchedInterview;
      updateInterview(matchedCompanyId, interviewId, {
        date: interview.date,
        time: interview.time,
        ...(interview.duration != null ? { duration: interview.duration } : {}),
        ...(interview.type ? { type: interview.type } : {}),
      });
    } else {
      addInterview(companyId, interview);
    }
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

        {/* Schedule interview from suggestion */}
        {suggestionDraft && (
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
