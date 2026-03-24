import { Wifi, WifiOff, Loader, AlertCircle } from 'lucide-react';
import type { AuthStatus, ConnectionStatus as ConnectionStatusType } from '../../types';

interface ConnectionStatusProps {
  authStatus: AuthStatus;
  connectionStatus: ConnectionStatusType;
}

/**
 * Status indicator for the SSE connection to the backend.
 */
export function ConnectionStatus({ authStatus, connectionStatus }: ConnectionStatusProps) {
  // Only show when authenticated — avoids visual clutter for unauthenticated users
  if (authStatus !== 'authenticated') return null;

  const config = {
    connecting:   { Icon: Loader,      colour: 'text-yellow-500', label: 'Connecting…'  },
    connected:    { Icon: Wifi,        colour: 'text-green-500',  label: 'Live'          },
    error:        { Icon: AlertCircle, colour: 'text-red-500',    label: 'Connection error' },
    disconnected: { Icon: WifiOff,     colour: 'text-gray-400',   label: 'Disconnected'  },
  }[connectionStatus] ?? { Icon: WifiOff, colour: 'text-gray-400', label: 'Disconnected' };

  const { Icon, colour, label } = config;
  const spin = connectionStatus === 'connecting' ? 'animate-spin' : '';

  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${colour}`}>
      <Icon size={13} className={spin} />
      {label}
    </span>
  );
}
