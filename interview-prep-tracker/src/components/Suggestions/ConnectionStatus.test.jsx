import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from './ConnectionStatus';

describe('ConnectionStatus — visibility', () => {
  it('renders nothing when authStatus is unauthenticated', () => {
    const { container } = render(
      <ConnectionStatus authStatus="unauthenticated" connectionStatus="disconnected" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when authStatus is checking', () => {
    const { container } = render(
      <ConnectionStatus authStatus="checking" connectionStatus="disconnected" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders when authStatus is authenticated', () => {
    render(
      <ConnectionStatus authStatus="authenticated" connectionStatus="connected" />
    );
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});

describe('ConnectionStatus — status labels', () => {
  it('shows "Live" when connected', () => {
    render(<ConnectionStatus authStatus="authenticated" connectionStatus="connected" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows "Connecting…" when connecting', () => {
    render(<ConnectionStatus authStatus="authenticated" connectionStatus="connecting" />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows "Connection error" when errored', () => {
    render(<ConnectionStatus authStatus="authenticated" connectionStatus="error" />);
    expect(screen.getByText('Connection error')).toBeInTheDocument();
  });

  it('shows "Disconnected" when disconnected', () => {
    render(<ConnectionStatus authStatus="authenticated" connectionStatus="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
