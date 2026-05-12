/**
 * MONAI On-Demand Banner
 *
 * Compact status panel styled to match native OHIF panels (shadcn tokens:
 * muted/foreground/primary/destructive). Inline SVG icons keep the extension
 * self-contained — importing `@ohif/ui-next` would pull in ThemeWrapper +
 * mini-css-extract-plugin which the extension webpack config doesn't wire.
 */

import React, { useEffect, useState } from 'react';
import { MonaiOnDemandStatus } from '../services/MonaiOnDemandService';

export interface MonaiOnDemandBannerProps {
  status: MonaiOnDemandStatus;
  message?: string;
  estimatedWaitSeconds?: number;
  isWaiting: boolean;
  onStartClick?: () => void;
  isLoading?: boolean;
}

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `~${seconds} secondi`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
}

// Inline SVG icons — outline 20×20, color via currentColor so parent's
// text-* utility controls the tint.

const PowerOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const MonaiOnDemandBanner: React.FC<MonaiOnDemandBannerProps> = ({
  status,
  message,
  estimatedWaitSeconds,
  isWaiting,
  onStartClick,
  isLoading,
}) => {
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

  if (status === 'running') {
    return null;
  }

  const isStopped = status === 'stopped';
  const isStarting = status === 'starting';
  const isError = status === 'error';

  const title =
    isStopped ? 'MONAI Label non attivo' :
    isStarting ? 'Avvio MONAI Label in corso' :
    'Errore MONAI Label';

  const icon =
    isStopped ? <PowerOffIcon className="text-muted-foreground h-5 w-5" /> :
    isStarting ? <SpinnerIcon className="text-primary h-5 w-5 animate-spin" /> :
    <WarningIcon className="text-destructive h-5 w-5" />;

  return (
    <div className="bg-muted/40 border-input mb-3 rounded border p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-0.5">{icon}</div>

        <div className="min-w-0 flex-1">
          <h3 className="text-foreground text-base font-medium leading-tight">
            {title}
          </h3>

          {message && (
            <p className="text-muted-foreground mt-1 text-sm leading-snug">
              {message}
            </p>
          )}

          {isStarting && isWaiting && countdown > 0 && (
            <div className="mt-2">
              <p className="text-muted-foreground text-xs">
                Tempo stimato: {formatWaitTime(countdown)}
              </p>
              <div className="bg-input mt-1.5 h-1 w-full overflow-hidden rounded">
                <div
                  className="bg-primary h-full rounded transition-all duration-1000"
                  style={{
                    width: estimatedWaitSeconds
                      ? `${Math.max(0, 100 - (countdown / estimatedWaitSeconds) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}

          {isStarting && isWaiting && (
            <p className="text-muted-foreground mt-2 text-xs leading-snug">
              MONAI Label sta avviando un&apos;istanza GPU. Puoi continuare a navigare le immagini.
            </p>
          )}

          {isStopped && onStartClick && (
            <button
              onClick={onStartClick}
              disabled={isLoading}
              className="bg-primary/60 hover:bg-primary text-primary-foreground mt-3 inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <SpinnerIcon className="h-3 w-3 animate-spin" />
                  Avvio...
                </>
              ) : (
                <>
                  <PlayIcon className="h-3 w-3" />
                  Avvia MONAI Label
                </>
              )}
            </button>
          )}

          {isError && onStartClick && (
            <button
              onClick={onStartClick}
              disabled={isLoading}
              className="border-input hover:bg-muted text-foreground mt-3 inline-flex items-center rounded border bg-transparent px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Riprova
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonaiOnDemandBanner;
