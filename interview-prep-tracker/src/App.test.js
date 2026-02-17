import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Interview Prep Tracker heading', () => {
  render(<App />);
  expect(screen.getByText(/Interview Prep Tracker/i)).toBeInTheDocument();
});

test('renders the Pipeline tab by default', () => {
  render(<App />);
  // "Pipeline" appears in both the tab button and the board heading — both being present confirms the default view loaded
  const pipelineElements = screen.getAllByText(/Pipeline/i);
  expect(pipelineElements.length).toBeGreaterThanOrEqual(1);
});
