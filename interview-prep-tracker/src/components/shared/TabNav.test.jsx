import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabNav } from './TabNav';

function setup(activeTab = 'kanban') {
  const onTabChange = jest.fn();
  render(<TabNav activeTab={activeTab} onTabChange={onTabChange} />);
  return { onTabChange };
}

describe('TabNav — rendering', () => {
  it('renders all three tab labels', () => {
    setup();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Prep Content')).toBeInTheDocument();
  });

  it('renders three buttons', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});

describe('TabNav — active tab styling', () => {
  it('applies active style to the kanban tab when activeTab is "kanban"', () => {
    setup('kanban');
    const pipelineBtn = screen.getByText('Pipeline').closest('button');
    expect(pipelineBtn.className).toContain('bg-blue-600');
  });

  it('applies active style to the timeline tab when activeTab is "timeline"', () => {
    setup('timeline');
    const timelineBtn = screen.getByText('Timeline').closest('button');
    expect(timelineBtn.className).toContain('bg-blue-600');
  });

  it('applies active style to the prep tab when activeTab is "prep"', () => {
    setup('prep');
    const prepBtn = screen.getByText('Prep Content').closest('button');
    expect(prepBtn.className).toContain('bg-blue-600');
  });

  it('does not apply active style to inactive tabs', () => {
    setup('kanban');
    const timelineBtn = screen.getByText('Timeline').closest('button');
    expect(timelineBtn.className).not.toContain('bg-blue-600');
  });
});

describe('TabNav — interaction', () => {
  it('calls onTabChange with "kanban" when Pipeline tab is clicked', () => {
    const { onTabChange } = setup('timeline');
    userEvent.click(screen.getByText('Pipeline'));
    expect(onTabChange).toHaveBeenCalledWith('kanban');
  });

  it('calls onTabChange with "timeline" when Timeline tab is clicked', () => {
    const { onTabChange } = setup('kanban');
    userEvent.click(screen.getByText('Timeline'));
    expect(onTabChange).toHaveBeenCalledWith('timeline');
  });

  it('calls onTabChange with "prep" when Prep Content tab is clicked', () => {
    const { onTabChange } = setup('kanban');
    userEvent.click(screen.getByText('Prep Content'));
    expect(onTabChange).toHaveBeenCalledWith('prep');
  });

  it('calls onTabChange exactly once per click', () => {
    const { onTabChange } = setup();
    userEvent.click(screen.getByText('Timeline'));
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });
});
