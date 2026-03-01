/**
 * Segmentation API Service for OHIF v3
 *
 * Provides API communication with MediVault backend for segmentation persistence:
 * - Save segmentation masks to S3/DynamoDB
 * - List saved segmentations for a series
 * - Load segmentation masks for display
 * - Delete saved segmentations
 *
 * @module services/SegmentationApiService
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * Label information for a segmentation
 */
export interface SegmentationLabel {
  /** Numeric ID of the label in the mask */
  id: number;
  /** Human-readable label name */
  name: string;
  /** Optional display color */
  color?: string;
}

/**
 * Saved segmentation summary (list response)
 */
export interface SegmentationSummary {
  /** Unique segmentation ID */
  segmentationId: string;
  /** Series this segmentation belongs to */
  seriesInstanceUid: string;
  /** Study this segmentation belongs to */
  studyInstanceUid: string;
  /** Model used to generate the segmentation */
  modelName: string;
  /** Labels in this segmentation */
  labels: SegmentationLabel[];
  /** Mask format (NRRD or DICOM_SEG) */
  maskFormat: 'NRRD' | 'DICOM_SEG';
  /** Size of mask file in bytes */
  maskSizeBytes: number;
  /** Current status */
  status: 'ACTIVE' | 'SUPERSEDED' | 'DELETED';
  /** When this segmentation was created */
  createdAt: string;
  /** Who created this segmentation */
  createdBy: string;
}

/**
 * Full segmentation details
 */
export interface Segmentation extends SegmentationSummary {
  /** If superseded, which segmentation replaced this one */
  supersededBy?: string;
}

/**
 * Response from mask download endpoint
 */
export interface MaskUrlResponse {
  /** Presigned URL for downloading the mask */
  presignedUrl: string;
  /** Mask format */
  maskFormat: 'NRRD' | 'DICOM_SEG';
  /** URL expiration time in seconds */
  expiresIn: number;
}

/**
 * Request to create a new segmentation
 */
export interface CreateSegmentationRequest {
  /** Series Instance UID */
  seriesInstanceUid: string;
  /** Study Instance UID */
  studyInstanceUid: string;
  /** Model name used for inference */
  modelName: string;
  /** Labels in this segmentation */
  labels: SegmentationLabel[];
  /** Base64-encoded mask data */
  maskData: string;
  /** Mask format (defaults to NRRD) */
  maskFormat?: 'NRRD' | 'DICOM_SEG';
}

/**
 * Configuration for initializing the Segmentation API service
 */
export interface SegmentationApiConfig {
  /** Base URL of the MediVault backend API */
  apiUrl: string;
  /** Function to get authorization headers */
  getAuthorizationHeader?: () => Record<string, string>;
}

/**
 * Segmentation API Service
 *
 * Handles communication with the MediVault backend for segmentation persistence.
 */
class SegmentationApiService {
  private client: AxiosInstance;
  private config: SegmentationApiConfig;

  constructor(config: SegmentationApiConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 60000, // 60 seconds for upload
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
   * Save a new segmentation
   *
   * @param request - Segmentation creation request
   * @returns Created segmentation summary
   */
  async saveSegmentation(request: CreateSegmentationRequest): Promise<SegmentationSummary> {
    try {
      console.log('SegmentationAPI: Saving segmentation', {
        seriesInstanceUid: request.seriesInstanceUid,
        modelName: request.modelName,
        labelsCount: request.labels.length,
        maskSize: request.maskData.length,
      });

      const response = await this.client.post('/segmentations', request);
      console.log('SegmentationAPI: Segmentation saved', response.data);
      return response.data;
    } catch (error) {
      console.error('SegmentationAPI: Failed to save segmentation', error);
      throw error;
    }
  }

  /**
   * List segmentations for a series
   *
   * @param seriesInstanceUid - Series Instance UID
   * @param status - Optional status filter (defaults to ACTIVE)
   * @returns List of segmentation summaries
   */
  async listSegmentations(
    seriesInstanceUid: string,
    status: 'ACTIVE' | 'SUPERSEDED' | 'DELETED' = 'ACTIVE'
  ): Promise<SegmentationSummary[]> {
    try {
      const params = new URLSearchParams({
        seriesInstanceUid,
        status,
      });

      const response = await this.client.get(`/segmentations?${params.toString()}`);
      return response.data.segmentations || [];
    } catch (error) {
      console.error('SegmentationAPI: Failed to list segmentations', error);
      throw error;
    }
  }

  /**
   * Get segmentation details
   *
   * @param segmentationId - Segmentation ID
   * @returns Segmentation details
   */
  async getSegmentation(segmentationId: string): Promise<Segmentation> {
    try {
      const response = await this.client.get(`/segmentations/${segmentationId}`);
      return response.data;
    } catch (error) {
      console.error('SegmentationAPI: Failed to get segmentation', error);
      throw error;
    }
  }

  /**
   * Get presigned URL for mask download
   *
   * @param segmentationId - Segmentation ID
   * @returns Presigned URL response
   */
  async getMaskUrl(segmentationId: string): Promise<MaskUrlResponse> {
    try {
      const response = await this.client.get(`/segmentations/${segmentationId}/mask`);
      return response.data;
    } catch (error) {
      console.error('SegmentationAPI: Failed to get mask URL', error);
      throw error;
    }
  }

  /**
   * Download mask data as ArrayBuffer
   *
   * @param segmentationId - Segmentation ID
   * @returns Mask data as ArrayBuffer
   */
  async downloadMask(segmentationId: string): Promise<ArrayBuffer> {
    try {
      // First get the presigned URL
      const { presignedUrl } = await this.getMaskUrl(segmentationId);

      // Then download the mask directly from S3
      const response = await axios.get(presignedUrl, {
        responseType: 'arraybuffer',
      });

      console.log('SegmentationAPI: Downloaded mask', {
        segmentationId,
        size: response.data.byteLength,
      });

      return response.data;
    } catch (error) {
      console.error('SegmentationAPI: Failed to download mask', error);
      throw error;
    }
  }

  /**
   * Delete a segmentation (soft delete by default)
   *
   * @param segmentationId - Segmentation ID
   * @param hardDelete - Whether to permanently delete
   */
  async deleteSegmentation(segmentationId: string, hardDelete = false): Promise<void> {
    try {
      const params = hardDelete ? '?hardDelete=true' : '';
      await this.client.delete(`/segmentations/${segmentationId}${params}`);
      console.log('SegmentationAPI: Deleted segmentation', { segmentationId, hardDelete });
    } catch (error) {
      console.error('SegmentationAPI: Failed to delete segmentation', error);
      throw error;
    }
  }

  /**
   * Check if API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to list segmentations with a dummy UID - will return empty array if no auth issues
      await this.client.get('/segmentations?seriesInstanceUid=test', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export default SegmentationApiService;
export { SegmentationApiService };
