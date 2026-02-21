import { Briefcase, Building2, Calendar, Check, Clock, ExternalLink, Filter, Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { TYPE_CONFIG } from '../../constants/interviewTypes';

// System Design Questions Database
const SYSTEM_DESIGN_QUESTIONS = {
  Google: [
    { id: 'g1', title: 'Design YouTube', url: 'https://www.youtube.com/watch?v=jPKTo1iGQiE', difficulty: 'Hard' },
    { id: 'g2', title: 'Design Google Drive', url: 'https://www.youtube.com/watch?v=U0xTu6E2CT8', difficulty: 'Hard' },
    { id: 'g3', title: 'Design Google Maps', url: 'https://www.youtube.com/watch?v=jk3yvVfNvds', difficulty: 'Hard' },
    { id: 'g4', title: 'Design Gmail', url: 'https://www.youtube.com/watch?v=tndzLznxq40', difficulty: 'Medium' },
    { id: 'g5', title: 'Design Google Search', url: 'https://www.youtube.com/watch?v=CeGtqouT8eA', difficulty: 'Hard' },
    { id: 'g6', title: 'Design Google Docs', url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Medium' },
    { id: 'g7', title: 'Design Google Calendar', url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Medium' },
    { id: 'g8', title: 'Design Google Analytics', url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Hard' },
    { id: 'g9', title: 'Design Google Photos', url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Medium' },
  ],
  Microsoft: [
    { id: 'm1', title: 'Design Microsoft Teams', url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Hard' },
    { id: 'm2', title: 'Design OneDrive', url: 'https://www.youtube.com/watch?v=U0xTu6E2CT8', difficulty: 'Hard' },
    { id: 'm3', title: 'Design Outlook', url: 'https://www.youtube.com/watch?v=tndzLznxq40', difficulty: 'Medium' },
    { id: 'm4', title: 'Design Azure Blob Storage', url: 'https://www.youtube.com/watch?v=UzLMhqg3_Wc', difficulty: 'Hard' },
    { id: 'm5', title: 'Design Office 365', url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Hard' },
    { id: 'm6', title: 'Design Xbox Live', url: 'https://www.youtube.com/watch?v=K-_ha_lyKWY', difficulty: 'Medium' },
    { id: 'm7', title: 'Design Skype', url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Medium' },
    { id: 'm8', title: 'Design LinkedIn (Microsoft)', url: 'https://www.youtube.com/watch?v=QZ9d9F0CpXE', difficulty: 'Hard' },
    { id: 'm9', title: 'Design Power BI', url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Hard' },
  ],
  Facebook: [
    { id: 'f1', title: 'Design Facebook News Feed', url: 'https://www.youtube.com/watch?v=QmX2NPkJTKg', difficulty: 'Hard' },
    { id: 'f2', title: 'Design Facebook Messenger', url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Hard' },
    { id: 'f3', title: 'Design Instagram', url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Hard' },
    { id: 'f4', title: 'Design WhatsApp', url: 'https://www.youtube.com/watch?v=vvhC64hQZMk', difficulty: 'Hard' },
    { id: 'f5', title: 'Design Facebook Live', url: 'https://www.youtube.com/watch?v=jPKTo1iGQiE', difficulty: 'Hard' },
    { id: 'f6', title: 'Design Facebook Groups', url: 'https://www.youtube.com/watch?v=QmX2NPkJTKg', difficulty: 'Medium' },
    { id: 'f7', title: 'Design Facebook Marketplace', url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Medium' },
    { id: 'f8', title: 'Design Meta VR Platform', url: 'https://www.youtube.com/watch?v=K-_ha_lyKWY', difficulty: 'Hard' },
    { id: 'f9', title: 'Design Facebook Stories', url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Medium' },
  ],
};

const InterviewPrepTracker = () => {
  const [activeTab, setActiveTab] = useState('kanban');
  const [companies, setCompanies] = useState([]);
  const [seenQuestions, setSeenQuestions] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', position: '', stage: 'interested' });

  const stages = ['interested', 'applied', 'phone', 'technical', 'final', 'offer'];
  const stageLabels = {
    interested: 'Interested',
    applied: 'Applied',
    phone: 'Phone Screen',
    technical: 'Technical',
    final: 'Final Round',
    offer: 'Offer'
  };

  // Load data from storage on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const companiesResult = await window.storage.get('companies', false);
      const questionsResult = await window.storage.get('seenQuestions', false);
      
      if (companiesResult) {
        setCompanies(JSON.parse(companiesResult.value));
      }
      if (questionsResult) {
        setSeenQuestions(new Set(JSON.parse(questionsResult.value)));
      }
    } catch (error) {
      console.log('No saved data found, starting fresh');
    }
  };

  const saveData = async (newCompanies, newSeenQuestions) => {
    try {
      await window.storage.set('companies', JSON.stringify(newCompanies), false);
      if (newSeenQuestions) {
        await window.storage.set('seenQuestions', JSON.stringify([...newSeenQuestions]), false);
      }
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const addCompany = () => {
    if (!newCompany.name || !newCompany.position) return;
    
    const company = {
      id: Date.now().toString(),
      ...newCompany,
      interviews: [],
      notes: '',
      createdAt: new Date().toISOString()
    };
    
    const updated = [...companies, company];
    setCompanies(updated);
    saveData(updated, seenQuestions);
    setNewCompany({ name: '', position: '', stage: 'interested' });
    setShowAddModal(false);
  };

  const updateCompanyStage = (companyId, newStage) => {
    const updated = companies.map(c => 
      c.id === companyId ? { ...c, stage: newStage } : c
    );
    setCompanies(updated);
    saveData(updated, seenQuestions);
  };

  const deleteCompany = (companyId) => {
    const updated = companies.filter(c => c.id !== companyId);
    setCompanies(updated);
    saveData(updated, seenQuestions);
  };

  const addInterview = (companyId, interview) => {
    const updated = companies.map(c => 
      c.id === companyId 
        ? { ...c, interviews: [...c.interviews, { ...interview, id: Date.now().toString() }] }
        : c
    );
    setCompanies(updated);
    saveData(updated, seenQuestions);
  };

  const deleteInterview = (companyId, interviewToDelete, status) => {
    const updated = companies.map(c => 
      c.id === companyId 
        ? { 
            ...c, 
            interviews: c.interviews.filter(
              (interview) => interview.id !== interviewToDelete.id
            )
          }
        : c
    );
    setCompanies(updated);
    saveData(updated, seenQuestions);
  };

  const updateInterviewStatus = (companyId, interviewId, status) => {
    const updated = companies.map(c => 
      c.id === companyId 
        ? { 
            ...c, 
            interviews: c.interviews.map(i => 
              i.id === interviewId ? { ...i, status } : i
            )
          }
        : c
    );
    setCompanies(updated);
    saveData(updated, seenQuestions);
  };

  const markQuestionSeen = (questionId) => {
    const updated = new Set([...seenQuestions, questionId]);
    setSeenQuestions(updated);
    saveData(companies, updated);
  };

  const getAvailableQuestions = (company) => {
    const questions = SYSTEM_DESIGN_QUESTIONS[company] || [];
    return questions.filter(q => !seenQuestions.has(q.id)).slice(0, 3);
  };

  // Kanban View
  const KanbanBoard = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          <Plus size={20} />
          Add Company
        </button>
      </div>

      <div className="grid grid-cols-6 gap-4">
        {stages.map(stage => (
          <div key={stage} className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
              {stageLabels[stage]}
            </h3>
            <div className="space-y-3">
              {companies.filter(c => c.stage === stage).map(company => (
                <div key={company.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 text-sm">{company.name}</h4>
                      <p className="text-xs text-gray-600 mt-1">{company.position}</p>
                    </div>
                    <button
                      onClick={() => deleteCompany(company.id)}
                      className="text-gray-400 hover:text-red-600 transition"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {company.interviews.length > 0 && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                      <Calendar size={12} />
                      {company.interviews.length} interview{company.interviews.length > 1 ? 's' : ''}
                    </div>
                  )}
                  <select
                    value={company.stage}
                    onChange={(e) => updateCompanyStage(company.id, e.target.value)}
                    className="mt-2 w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {stages.map(s => (
                      <option key={s} value={s}>{stageLabels[s]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Timeline View
  const TimelineView = () => {
    const allInterviews = companies.flatMap(company => 
      company.interviews.map(interview => ({
        ...interview,
        companyName: company.name,
        position: company.position,
        companyId: company.id
      }))
    ).sort((a, b) => new Date(a.date) - new Date(b.date));

    const [showAddInterview, setShowAddInterview] = useState(null);
    const [newInterview, setNewInterview] = useState({ type: '', date: '', time: '', status: 'scheduled' });

    const handleAddInterview = (companyId) => {
      if (!newInterview.type || !newInterview.date) return;
      addInterview(companyId, newInterview);
      setNewInterview({ type: '', date: '', time: '', status: 'scheduled' });
      setShowAddInterview(null);
    };

    const InterviewIcon = TYPE_CONFIG[interview.type] || { Icon: Building2 };

    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Interview Timeline</h2>

        {/* Companies with Add Interview Option */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <h3 className="font-semibold text-gray-700 mb-3">Schedule Interview</h3>
          <div className="space-y-2">
            {companies.map(company => (
              <div key={company.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-800">{company.name}</h4>
                  <p className="text-sm text-gray-600">{company.position}</p>
                </div>
                {showAddInterview === company.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Interview type"
                      value={newInterview.type}
                      onChange={(e) => setNewInterview({...newInterview, type: e.target.value})}
                      className="px-3 py-1 text-sm border border-gray-300 rounded"
                    />
                    <input
                      type="date"
                      value={newInterview.date}
                      onChange={(e) => setNewInterview({...newInterview, date: e.target.value})}
                      className="px-3 py-1 text-sm border border-gray-300 rounded"
                    />
                    <input
                      type="time"
                      value={newInterview.time}
                      onChange={(e) => setNewInterview({...newInterview, time: e.target.value})}
                      className="px-3 py-1 text-sm border border-gray-300 rounded"
                    />
                    <button
                      onClick={() => handleAddInterview(company.id)}
                      className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddInterview(null)}
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddInterview(company.id)}
                    className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                  >
                    <Plus size={16} />
                    Add Interview
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Interview Timeline */}
        <div className="space-y-4">
          {allInterviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar size={48} className="mx-auto mb-4 opacity-50" />
              <p>No interviews scheduled yet</p>
            </div>
          ) : (
            allInterviews.map(interview => (
              <div key={interview.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <InterviewIcon size={20} className="text-purple-600" />
                      <div>
                        <h4 className="font-semibold text-gray-800">{interview.companyName}</h4>
                        <p className="text-sm text-gray-600">{interview.position}</p>
                      </div>
                    </div>
                    <div className="ml-8 space-y-1">
                      <p className="text-sm font-medium text-gray-700">{interview.type}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(interview.date).toLocaleDateString()}
                        </span>
                        {interview.time && (
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {interview.time}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <select
                    value={interview.status}
                    onChange={(e) => updateInterviewStatus(interview.companyId, interview.id, e.target.value)}
                    className={`px-3 py-1 text-sm rounded border ${
                      interview.status === 'completed' ? 'bg-green-50 border-green-300 text-green-700' :
                      interview.status === 'scheduled' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                      'bg-red-50 border-red-300 text-red-700'
                    }`}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button 
                    onClick={() => {
                      if (window.confirm('Delete this interview?')) {
                        deleteInterview(interview.companyId, interview);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete Interview"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Prep Content View
  const PrepContentView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Interview Prep Resources</h2>
      
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-purple-800">
          <strong>System Design Practice:</strong> Work through these curated questions from top tech companies. 
          Mark questions as "seen" to get fresh recommendations.
        </p>
      </div>

      {['Google', 'Microsoft', 'Facebook'].map(company => {
        const availableQuestions = getAvailableQuestions(company);
        const totalSeen = SYSTEM_DESIGN_QUESTIONS[company].filter(q => seenQuestions.has(q.id)).length;
        
        return (
          <div key={company} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800">{company}</h3>
              <span className="text-sm text-gray-600">
                {totalSeen} / {SYSTEM_DESIGN_QUESTIONS[company].length} completed
              </span>
            </div>

            {availableQuestions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Check size={32} className="mx-auto mb-2 text-green-600" />
                <p>You've seen all available questions! 🎉</p>
                <button
                  onClick={() => {
                    const companyQuestions = SYSTEM_DESIGN_QUESTIONS[company].map(q => q.id);
                    const updated = new Set([...seenQuestions].filter(id => !companyQuestions.includes(id)));
                    setSeenQuestions(updated);
                    saveData(companies, updated);
                  }}
                  className="mt-3 text-sm text-purple-600 hover:underline"
                >
                  Reset {company} questions
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {availableQuestions.map(question => (
                  <div key={question.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-800">{question.title}</h4>
                      <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                        question.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                        question.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {question.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={question.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
                      >
                        <ExternalLink size={16} />
                        Watch
                      </a>
                      <button
                        onClick={() => markQuestionSeen(question.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                      >
                        <Check size={16} />
                        Mark Seen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Interview Prep Tracker</h1>
          <p className="text-gray-600">Track your job applications, schedule interviews, and prep for success</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex">
            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'kanban'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              } rounded-tl-lg`}
            >
              <Briefcase size={20} className="inline mr-2" />
              Pipeline
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'timeline'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Calendar size={20} className="inline mr-2" />
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('prep')}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'prep'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              } rounded-tr-lg`}
            >
              <Filter size={20} className="inline mr-2" />
              Prep Content
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {activeTab === 'kanban' && <KanbanBoard />}
          {activeTab === 'timeline' && <TimelineView />}
          {activeTab === 'prep' && <PrepContentView />}
        </div>

        {/* Add Company Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Add Company</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={newCompany.name}
                    onChange={(e) => setNewCompany({...newCompany, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Google"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                  <input
                    type="text"
                    value={newCompany.position}
                    onChange={(e) => setNewCompany({...newCompany, position: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Senior Software Engineer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stage</label>
                  <select
                    value={newCompany.stage}
                    onChange={(e) => setNewCompany({...newCompany, stage: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {stages.map(s => (
                      <option key={s} value={s}>{stageLabels[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={addCompany}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  Add Company
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewPrepTracker;