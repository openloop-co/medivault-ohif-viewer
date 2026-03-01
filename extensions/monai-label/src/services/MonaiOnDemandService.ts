/**
 * MONAI On-Demand Service
 *
 * Manages the on-demand MONAI Label ECS service lifecycle.
 * When MONAI is configured with minCapacity=0, it starts stopped to save costs.
 * This service handles:
 * - Checking MONAI service status via MediVault API
 * - Starting MONAI when user needs segmentation
 * - Polling for service readiness
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * MONAI on-demand status from the MediVault API
 */
export type MonaiOnDemandStatus = 'running' | 'starting' | 'stopped' | 'error';

/**
 * Response from GET /monai/status
 */
export interface MonaiStatusResponse {
  status: MonaiOnDemandStatus;
  url?: string;
  message?: string;
  estimatedWaitSeconds?: number;
}

/**
 * Response from POST /monai/ensure-running
 */
export interface MonaiEnsureRunningResponse {
  status: 'running' | 'starting' | 'error';
  url?: string;
  message: string;
  estimatedWaitSeconds?: number;
}

/**
 * Configuration for MonaiOnDemandService
 */
export interface MonaiOnDemandConfig {
  /** MediVault API base URL */
  apiUrl: string;
  /** Function to get authorization headers */
  getAuthorizationHeader?: () => Record<string, string>;
}

/**
 * Service for managing MONAI Label on-demand lifecycle
 */
export class MonaiOnDemandService {
  private client: AxiosInstance;
  private config: MonaiOnDemandConfig;

  constructor(config: MonaiOnDemandConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
    });

    // Add auth interceptor
    this.client.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      if (this.config.getAuthorizationHeader) {
        const authHeaders = this.config.getAuthorizationHeader();
        if (authHeaders && Object.keys(authHeaders).length > 0) {
          Object.entries(authHeaders).forEach(([key, value]) => {
            requestConfig.headers.set(key, value);
          });
        }
      }
      return requestConfig;
    });
  }

  /**
   * Get the current MONAI service status
   */
  async getStatus(): Promise<MonaiStatusResponse> {
    try {
      const response = await this.client.get<MonaiStatusResponse>('/monai/status');
      return response.data;
    } catch (error) {
      console.error('MONAI On-Demand: Failed to get status', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get MONAI status',
      };
    }
  }

  /**
   * Ensure MONAI is running (starts if stopped)
   */
  async ensureRunning(): Promise<MonaiEnsureRunningResponse> {
    try {
      const response = await this.client.post<MonaiEnsureRunningResponse>('/monai/ensure-running');
      return response.data;
    } catch (error) {
      console.error('MONAI On-Demand: Failed to ensure running', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to start MONAI',
      };
    }
  }

  /**
   * Poll for MONAI to become ready
   * @param intervalMs Polling interval in milliseconds
   * @param timeoutMs Maximum time to wait
   * @param onStatusChange Callback for status updates
   * @returns True if MONAI is running, false if timeout
   */
  async waitForReady(
    intervalMs: number = 5000,
    timeoutMs: number = 300000, // 5 minutes default
    onStatusChange?: (status: MonaiStatusResponse) => void
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStatus();
      onStatusChange?.(status);

      if (status.status === 'running') {
        return true;
      }

      if (status.status === 'error') {
        console.error('MONAI On-Demand: Error while waiting for ready:', status.message);
        return false;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    console.warn('MONAI On-Demand: Timeout waiting for MONAI to be ready');
    return false;
  }
}

export default MonaiOnDemandService;
