import React from 'react';
import { Briefcase, Calendar, Filter } from 'lucide-react';

/**
 * Tab configuration drives the navigation bar declaratively.
 * Adding a new tab only requires adding an entry here.
 */
const TABS = [
  { id: 'kanban',   label: 'Pipeline',     Icon: Briefcase, rounded: 'rounded-tl-lg' },
  { id: 'timeline', label: 'Timeline',     Icon: Calendar,  rounded: '' },
  { id: 'prep',     label: 'Prep Content', Icon: Filter,    rounded: 'rounded-tr-lg' },
];

/**
 * Three-tab navigation bar.
 *
 * @param {{ activeTab: string, onTabChange: (tabId: string) => void }} props
 */
export function TabNav({ activeTab, onTabChange }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex">
        {TABS.map(({ id, label, Icon, rounded }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 px-6 py-3 font-medium transition ${
              activeTab === id
                ? 'bg-purple-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            } ${rounded}`}
          >
            <Icon size={20} className="inline mr-2" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
