/**
 * MONAI On-Demand Banner Component
 *
 * Displays the current MONAI service status when in on-demand mode.
 * Shows a banner with status indicator and estimated wait time when starting.
 */

import React, { useEffect, useState } from 'react';
import { MonaiOnDemandStatus } from '../services/MonaiOnDemandService';

export interface MonaiOnDemandBannerProps {
  /** Current status */
  status: MonaiOnDemandStatus;
  /** Status message */
  message?: string;
  /** Estimated wait time in seconds */
  estimatedWaitSeconds?: number;
  /** Whether we're actively waiting for MONAI to start */
  isWaiting: boolean;
  /** Callback to start MONAI */
  onStartClick?: () => void;
  /** Whether a check/start is in progress */
  isLoading?: boolean;
}

/**
 * Format seconds into human-readable time
 */
function formatWaitTime(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds} secondi`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
}

/**
 * Banner showing MONAI on-demand status
 */
export const MonaiOnDemandBanner: React.FC<MonaiOnDemandBannerProps> = ({
  status,
  message,
  estimatedWaitSeconds,
  isWaiting,
  onStartClick,
  isLoading,
}) => {
  // Countdown timer for estimated wait
  const [countdown, setCountdown] = useState(estimatedWaitSeconds || 0);

  useEffect(() => {
    setCountdown(estimatedWaitSeconds || 0);
  }, [estimatedWaitSeconds]);

  useEffect(() => {
    if (!isWaiting || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isWaiting, countdown]);

  // Don't show banner if running
  if (status === 'running') {
    return null;
  }

  // Status-specific styles
  const statusStyles = {
    stopped: {
      bg: 'bg-yellow-900/50',
      border: 'border-yellow-500',
      icon: '⏸️',
      iconBg: 'bg-yellow-500',
    },
    starting: {
      bg: 'bg-blue-900/50',
      border: 'border-blue-500',
      icon: '🚀',
      iconBg: 'bg-blue-500',
    },
    error: {
      bg: 'bg-red-900/50',
      border: 'border-red-500',
      icon: '❌',
      iconBg: 'bg-red-500',
    },
  };

  const style = statusStyles[status] || statusStyles.error;

  return (
    <div className={`mb-4 rounded border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start gap-3">
        {/* Status icon with animation for starting */}
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${style.iconBg}`}>
          {status === 'starting' && isWaiting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <span className="text-sm">{style.icon}</span>
          )}
        </div>

        <div className="flex-1">
          {/* Title based on status */}
          <h3 className="font-medium text-white">
            {status === 'stopped' && 'MONAI Label non attivo'}
            {status === 'starting' && 'Avvio MONAI Label in corso...'}
            {status === 'error' && 'Errore MONAI Label'}
          </h3>

          {/* Message */}
          {message && (
            <p className="mt-1 text-sm text-gray-300">{message}</p>
          )}

          {/* Estimated wait time with countdown */}
          {status === 'starting' && isWaiting && countdown > 0 && (
            <div className="mt-2">
              <p className="text-sm text-gray-400">
                Tempo stimato: {formatWaitTime(countdown)}
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full animate-pulse rounded-full bg-blue-500"
                  style={{
                    width: estimatedWaitSeconds
                      ? `${Math.max(0, 100 - (countdown / estimatedWaitSeconds) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Start button for stopped state */}
          {status === 'stopped' && onStartClick && (
            <button
              onClick={onStartClick}
              disabled={isLoading}
              className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Avvio...
                </span>
              ) : (
                'Avvia MONAI Label'
              )}
            </button>
          )}

          {/* Tip for starting state */}
          {status === 'starting' && isWaiting && (
            <p className="mt-3 text-xs text-gray-500">
              MONAI Label sta avviando un'istanza GPU. Puoi continuare a navigare le immagini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonaiOnDemandBanner;
