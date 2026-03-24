// @ts-nocheck
import { render, screen } from '@testing-library/react';
import { FormError } from './FormError';

describe('FormError', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<FormError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is undefined', () => {
    const { container } = render(<FormError message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<FormError message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error message when message is a non-empty string', () => {
    render(<FormError message="Company name is required" />);
    expect(screen.getByText('Company name is required')).toBeInTheDocument();
  });

  it('renders a <p> element with role="alert"', () => {
    render(<FormError message="Date is required" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.tagName).toBe('P');
  });
});
