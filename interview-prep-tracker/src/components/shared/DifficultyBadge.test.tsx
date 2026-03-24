// @ts-nocheck
import { render, screen } from '@testing-library/react';
import { DifficultyBadge } from './DifficultyBadge';

describe('DifficultyBadge', () => {
  it('renders the difficulty text', () => {
    render(<DifficultyBadge difficulty="Hard" />);
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  it('applies red classes for Hard difficulty', () => {
    render(<DifficultyBadge difficulty="Hard" />);
    const badge = screen.getByText('Hard');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-700');
  });

  it('applies yellow classes for Medium difficulty', () => {
    render(<DifficultyBadge difficulty="Medium" />);
    const badge = screen.getByText('Medium');
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-700');
  });

  it('applies green classes for Easy difficulty', () => {
    render(<DifficultyBadge difficulty="Easy" />);
    const badge = screen.getByText('Easy');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-700');
  });

  it('applies gray fallback classes for an unknown difficulty', () => {
    render(<DifficultyBadge difficulty={'Unknown' as 'Easy'} />);
    const badge = screen.getByText('Unknown');
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-700');
  });

  it('renders a <span> element', () => {
    render(<DifficultyBadge difficulty="Easy" />);
    expect(screen.getByText('Easy').tagName).toBe('SPAN');
  });
});
