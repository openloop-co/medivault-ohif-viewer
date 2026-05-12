/**
 * MONAI On-Demand Banner
 *
 * Compact status panel styled to match native OHIF panels (shadcn tokens:
 * muted/foreground/primary/destructive). Iconless — the title + token
 * colors carry the semantics.
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

  const titleColor = isError ? 'text-destructive' : 'text-foreground';

  return (
    <div className="bg-muted/40 border-input mb-3 rounded border p-3">
      <h3 className={`${titleColor} text-base font-medium leading-tight`}>
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
          className="bg-primary/60 hover:bg-primary text-primary-foreground mt-3 inline-flex items-center rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Avvio...' : 'Avvia MONAI Label'}
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
  );
};

export default MonaiOnDemandBanner;
