import React, { useState } from 'react';
import { AddCompanyModal } from './components/AddCompanyModal/AddCompanyModal';
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard';
import { PrepContentView } from './components/PrepContentView/PrepContentView';
import { CloudSyncMenu } from './components/shared/CloudSyncMenu';
import { TabNav } from './components/shared/TabNav';
import { ConnectionStatus } from './components/Suggestions/ConnectionStatus';
import { SuggestionPanel } from './components/Suggestions/SuggestionPanel';
import { TodayInterviews } from './components/shared/TodayInterviews';
import { AddInterviewModal } from './components/TimelineView/AddInterviewModal';
import { TimelineView } from './components/TimelineView/TimelineView';
import { APP_TITLE } from './constants/app';
import { INTERVIEW_TYPES } from './constants/interviewTypes';
import { DEFAULT_PIPELINE, PIPELINES, PIPELINE_LABELS } from './constants/pipelines';
import { POSITIONS } from './constants/positions';
import { ACTIVE_STAGES, CLOSED_STAGE, STAGES, STAGE_LABELS } from './constants/stages';
import { useInterviewTracker } from './hooks/useInterviewTracker';
import { findCompanyByFuzzyName, getTodaysUpcomingInterviews, isInPipeline, matchByNameOnly, matchSuggestionToInterview } from './utils/companyUtils';

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
  const [editingCompany,  setEditingCompany]  = useState(null);
  const [suggestionDraft,       setSuggestionDraft]       = useState(null);
  const [highlightedInterviewId, setHighlightedInterviewId] = useState(null);

  const {
    companies,
    addCompany,
    updateCompany,
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
    resetSuggestions,
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
    setEditingCompany(null);
    setCompanyDraft({ ...EMPTY_DRAFT, pipeline: [activePipeline] });
    setShowModal(true);
  }

  function handleOpenEditModal(company) {
    setEditingCompany(company);
    setCompanyDraft({
      name:     company.name,
      position: company.position,
      stage:    company.stage,
      pipeline: company.pipeline,
      domain:   company.domain,
      customLogoUrl: company.customLogoUrl,
    });
    setShowModal(true);
  }

  function handleEditCompany() {
    if (!editingCompany) return;
    updateCompany(editingCompany.id, {
      position:      companyDraft.position,
      stage:         companyDraft.stage,
      pipeline:      companyDraft.pipeline,
      domain:        companyDraft.domain,
      customLogoUrl: companyDraft.customLogoUrl,
    });
    setEditingCompany(null);
    setCompanyDraft(EMPTY_DRAFT);
    setShowModal(false);
  }

  const todaysInterviews = getTodaysUpcomingInterviews(companies);

  function handleTodayInterviewClick(interview) {
    setActiveTab('timeline');
    setHighlightedInterviewId(interview.id);
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

  /**
   * Matches a suggestion to a tracked interview using all available signals.
   *
   * Priority order:
   * 1. Exact match by name + suggestion date (works when date hasn't changed)
   * 2. Exact match by name + previousDate (works when date HAS changed — the
   *    tracker still holds the old date, and previousDate carries it)
   * 3. Relaxed match by name only with closest date tiebreaker (last resort)
   */
  function matchSuggestionToTracked(suggestion) {
    // 1. Try strict match with the suggestion's current date
    const strict = matchSuggestionToInterview(companies, suggestion);
    if (strict) return strict;

    // 2. Try strict match with the previous (original) date — handles
    //    update/cancel emails where the date changed
    if (suggestion.previousDate && suggestion.previousDate !== suggestion.date) {
      const withPrevDate = matchSuggestionToInterview(companies, {
        ...suggestion,
        date: suggestion.previousDate,
      });
      if (withPrevDate) return withPrevDate;
    }

    // 3. Relaxed match by company name only
    return matchByNameOnly(companies, suggestion);
  }

  function handleAcceptSuggestion(suggestion) {
    const action = suggestion.action || 'add';

    if (action === 'cancel') {
      const matched = matchSuggestionToTracked(suggestion);
      if (matched) {
        updateInterviewStatus(matched.companyId, matched.interviewId, 'cancelled');
        dismissSuggestion(suggestion);
        return;
      }
      // No tracked interview found — fall through to add flow so the user
      // can see the detected details and optionally add it to the tracker.
    }

    if (action === 'update') {
      const matched = matchSuggestionToTracked(suggestion);
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
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
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
              onReset={resetSuggestions}
              onConnect={connectGoogle}
              onDisconnect={disconnectGoogle}
            />
          </div>
        )}

        {/* Today's upcoming interviews */}
        <TodayInterviews
          interviews={todaysInterviews}
          onInterviewClick={handleTodayInterviewClick}
        />

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
              onEditCompany={handleOpenEditModal}
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
              highlightedInterviewId={highlightedInterviewId}
              onHighlightComplete={() => setHighlightedInterviewId(null)}
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

        {/* Add / Edit Company modal */}
        {showModal && (
          <AddCompanyModal
            draft={companyDraft}
            onDraftChange={setCompanyDraft}
            onAdd={handleAddCompany}
            onEdit={handleEditCompany}
            onClose={() => { setShowModal(false); setEditingCompany(null); }}
            stages={ACTIVE_STAGES}
            stageLabels={STAGE_LABELS}
            positions={POSITIONS}
            pipelines={PIPELINES}
            pipelineLabels={PIPELINE_LABELS}
            editingCompany={editingCompany}
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
