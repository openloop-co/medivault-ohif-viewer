/**
 * Segmentation API Service for OHIF v3
 *
 * Client for the MediVault async segmentation pipeline. The browser no
 * longer contacts MONAI Label directly — it POSTs a job request to the
 * backend, waits for the worker Lambda to complete (via WebSocket +
 * polling), then downloads the mask via a presigned S3 URL.
 *
 * @module services/SegmentationApiService
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface SegmentationLabel {
  id: number;
  name: string;
  color?: string;
}

export type SegmentationStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'DELETED';

export interface SegmentationSummary {
  segmentationId: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  modelName: string;
  labels: SegmentationLabel[];
  maskFormat: 'NRRD' | 'DICOM_SEG';
  maskSizeBytes: number;
  status: SegmentationStatus;
  createdAt: string;
  createdBy: string;
  queuedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface Segmentation extends SegmentationSummary {
  supersededBy?: string;
}

export interface MaskUrlResponse {
  presignedUrl: string;
  maskFormat: 'NRRD' | 'DICOM_SEG';
  expiresIn: number;
}

/**
 * Request to enqueue a new segmentation job. The mask itself is
 * produced server-side — the browser never uploads bytes.
 */
export interface StartSegmentationRequest {
  seriesInstanceUid: string;
  studyInstanceUid: string;
  modelName: string;
  /**
   * Re-run inference even if an ACTIVE segmentation already exists for
   * this (series, model). Defaults to false; the backend returns 409 in
   * that case so the caller can simply load the existing one.
   */
  force?: boolean;
}

export interface StartSegmentationResponse {
  segmentationId: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  modelName: string;
  status: 'PENDING';
  queuedAt: string;
}

export interface SegmentationApiConfig {
  apiUrl: string;
  getAuthorizationHeader?: () => Record<string, string>;
}

class SegmentationApiService {
  private client: AxiosInstance;
  private config: SegmentationApiConfig;

  constructor(config: SegmentationApiConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30_000,
    });

    this.client.interceptors.request.use(
      (requestConfig: InternalAxiosRequestConfig) => {
        if (this.config.getAuthorizationHeader) {
          const authHeaders = this.config.getAuthorizationHeader();
          if (authHeaders && Object.keys(authHeaders).length > 0) {
            Object.entries(authHeaders).forEach(([key, value]) => {
              requestConfig.headers.set(key, value);
            });
          }
        }
        return requestConfig;
      }
    );
  }

  /**
   * Enqueue a segmentation inference job.
   * Returns immediately with `status: PENDING`. Use `pollUntilComplete`
   * or subscribe to the `SEGMENTATION_READY` WebSocket event to know
   * when the mask is available.
   */
  async startSegmentation(
    request: StartSegmentationRequest
  ): Promise<StartSegmentationResponse> {
    const response = await this.client.post('/segmentations', request);
    return response.data;
  }

  async listSegmentations(
    seriesInstanceUid: string,
    status: SegmentationStatus = 'ACTIVE'
  ): Promise<SegmentationSummary[]> {
    const params = new URLSearchParams({ seriesInstanceUid, status });
    const response = await this.client.get(
      `/segmentations?${params.toString()}`
    );
    return response.data.segmentations || [];
  }

  async getSegmentation(segmentationId: string): Promise<Segmentation> {
    const response = await this.client.get(
      `/segmentations/${segmentationId}`
    );
    return response.data;
  }

  async getMaskUrl(segmentationId: string): Promise<MaskUrlResponse> {
    const response = await this.client.get(
      `/segmentations/${segmentationId}/mask`
    );
    return response.data;
  }

  /**
   * Download the NRRD/DICOM-SEG mask as an ArrayBuffer. Only callable
   * when the segmentation is ACTIVE or SUPERSEDED.
   */
  async downloadMask(segmentationId: string): Promise<ArrayBuffer> {
    const { presignedUrl } = await this.getMaskUrl(segmentationId);
    const response = await axios.get(presignedUrl, {
      responseType: 'arraybuffer',
    });
    return response.data;
  }

  async deleteSegmentation(
    segmentationId: string,
    hardDelete = false
  ): Promise<void> {
    const params = hardDelete ? '?hardDelete=true' : '';
    await this.client.delete(`/segmentations/${segmentationId}${params}`);
  }

  /**
   * Poll /segmentations/{id} until the job reaches a terminal state
   * (ACTIVE or FAILED). Used as a belt-and-suspenders fallback when
   * the WebSocket isn't available.
   */
  async pollUntilComplete(
    segmentationId: string,
    options: { intervalMs?: number; maxWaitMs?: number } = {}
  ): Promise<Segmentation> {
    const intervalMs = options.intervalMs ?? 3_000;
    const maxWaitMs = options.maxWaitMs ?? 300_000;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const seg = await this.getSegmentation(segmentationId);
      if (seg.status === 'ACTIVE' || seg.status === 'FAILED') {
        return seg;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
      `Segmentation ${segmentationId} did not complete within ${maxWaitMs}ms`
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/segmentations?seriesInstanceUid=test', {
        timeout: 5_000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export default SegmentationApiService;
export { SegmentationApiService };
