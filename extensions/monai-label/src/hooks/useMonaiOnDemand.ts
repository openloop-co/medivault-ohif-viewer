/**
 * useMonaiOnDemand Hook
 *
 * React hook for managing MONAI Label on-demand status.
 * Provides status checking, auto-start functionality, and polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MonaiOnDemandService,
  MonaiOnDemandStatus,
  MonaiStatusResponse,
} from '../services/MonaiOnDemandService';

export interface UseMonaiOnDemandOptions {
  /** Whether on-demand mode is enabled */
  enabled: boolean;
  /** MediVault API URL */
  apiUrl?: string;
  /** Function to get auth headers */
  getAuthorizationHeader?: () => Record<string, string>;
  /** Polling interval when starting (ms) */
  pollingInterval?: number;
  /** Auto-check status on mount */
  autoCheck?: boolean;
}

export interface UseMonaiOnDemandResult {
  /** Current MONAI service status */
  status: MonaiOnDemandStatus;
  /** MONAI Label URL (when running) */
  url?: string;
  /** Status message */
  message?: string;
  /** Estimated wait time in seconds (when starting) */
  estimatedWaitSeconds?: number;
  /** Whether a status check is in progress */
  isChecking: boolean;
  /** Whether we're waiting for MONAI to start */
  isWaiting: boolean;
  /** Error message if any */
  error?: string;
  /** Check current status */
  checkStatus: () => Promise<void>;
  /** Ensure MONAI is running (starts if stopped) */
  ensureRunning: () => Promise<boolean>;
  /** Whether MONAI is ready for use */
  isReady: boolean;
}

/**
 * Hook for managing MONAI on-demand status
 */
export function useMonaiOnDemand(options: UseMonaiOnDemandOptions): UseMonaiOnDemandResult {
  const {
    enabled,
    apiUrl,
    getAuthorizationHeader,
    pollingInterval = 5000,
    autoCheck = true,
  } = options;

  const [status, setStatus] = useState<MonaiOnDemandStatus>('stopped');
  const [url, setUrl] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState<number>();
  const [isChecking, setIsChecking] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<string>();

  const serviceRef = useRef<MonaiOnDemandService | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize service
  useEffect(() => {
    if (enabled && apiUrl) {
      serviceRef.current = new MonaiOnDemandService({
        apiUrl,
        getAuthorizationHeader,
      });
    } else {
      serviceRef.current = null;
    }
  }, [enabled, apiUrl, getAuthorizationHeader]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Update state from status response
  const updateFromResponse = useCallback((response: MonaiStatusResponse) => {
    setStatus(response.status);
    setUrl(response.url);
    setMessage(response.message);
    setEstimatedWaitSeconds(response.estimatedWaitSeconds);
    if (response.status === 'error') {
      setError(response.message);
    } else {
      setError(undefined);
    }
  }, []);

  // Check status
  const checkStatus = useCallback(async () => {
    if (!serviceRef.current) {
      // Not in on-demand mode - assume MONAI is always available
      setStatus('running');
      return;
    }

    setIsChecking(true);
    try {
      const response = await serviceRef.current.getStatus();
      updateFromResponse(response);
    } finally {
      setIsChecking(false);
    }
  }, [updateFromResponse]);

  // Start polling for status
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling

    pollingRef.current = setInterval(async () => {
      if (!serviceRef.current) return;

      const response = await serviceRef.current.getStatus();
      updateFromResponse(response);

      // Stop polling when running or error
      if (response.status === 'running' || response.status === 'error') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsWaiting(false);
      }
    }, pollingInterval);
  }, [pollingInterval, updateFromResponse]);

  // Ensure MONAI is running
  const ensureRunning = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current) {
      // Not in on-demand mode - assume always ready
      return true;
    }

    setIsWaiting(true);
    setError(undefined);

    try {
      const response = await serviceRef.current.ensureRunning();

      if (response.status === 'running') {
        setStatus('running');
        setUrl(response.url);
        setMessage(response.message);
        setIsWaiting(false);
        return true;
      }

      if (response.status === 'starting') {
        setStatus('starting');
        setUrl(response.url);
        setMessage(response.message);
        setEstimatedWaitSeconds(response.estimatedWaitSeconds);
        // Start polling for status updates
        startPolling();
        return false; // Not ready yet
      }

      // Error
      setStatus('error');
      setMessage(response.message);
      setError(response.message);
      setIsWaiting(false);
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start MONAI');
      setIsWaiting(false);
      return false;
    }
  }, [startPolling]);

  // Auto-check status on mount
  useEffect(() => {
    if (autoCheck && enabled && serviceRef.current) {
      checkStatus();
    }
  }, [autoCheck, enabled, checkStatus]);

  // If not in on-demand mode, always report as ready
  const isReady = !enabled || status === 'running';

  return {
    status: enabled ? status : 'running',
    url,
    message,
    estimatedWaitSeconds,
    isChecking,
    isWaiting,
    error,
    checkStatus,
    ensureRunning,
    isReady,
  };
}

export default useMonaiOnDemand;
