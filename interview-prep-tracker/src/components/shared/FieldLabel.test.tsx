// @ts-nocheck
import { render, screen } from '@testing-library/react';
import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it('renders the label text', () => {
    render(<FieldLabel>Company Name</FieldLabel>);
    expect(screen.getByText('Company Name')).toBeInTheDocument();
  });

  it('does not render an asterisk when required is false (default)', () => {
    render(<FieldLabel>Position</FieldLabel>);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders an asterisk when required is true', () => {
    render(<FieldLabel required>Interview Type</FieldLabel>);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('associates the label with the input via htmlFor', () => {
    render(<FieldLabel htmlFor="my-input">Date</FieldLabel>);
    const label = screen.getByText('Date').closest('label');
    expect(label).toHaveAttribute('for', 'my-input');
  });

  it('renders a <label> element', () => {
    render(<FieldLabel htmlFor="x">Stage</FieldLabel>);
    expect(screen.getByText('Stage').closest('label')).toBeInTheDocument();
  });

  it('marks the asterisk as aria-hidden so screen readers skip it', () => {
    render(<FieldLabel required>Time</FieldLabel>);
    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveAttribute('aria-hidden', 'true');
  });
});
