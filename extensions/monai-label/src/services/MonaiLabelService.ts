/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MONAI Label Service for OHIF v3
 *
 * Provides API communication with MONAI Label server for AI-assisted segmentation.
 * Supports automatic segmentation, interactive refinement, and active learning workflows.
 *
 * @module services/MonaiLabelService
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * Custom error class for MONAI Label API errors with parsed details.
 */
class MonaiLabelError extends Error {
  /** HTTP status code */
  readonly statusCode: number;
  /** Error type/category */
  readonly errorType: string;
  /** Detailed error message */
  readonly detail: string;
  /** Quota information (if quota-related error) */
  readonly quota?: {
    type: string;
    current: number;
    limit: number;
  };

  constructor(options: {
    statusCode: number;
    errorType: string;
    detail: string;
    quota?: { type: string; current: number; limit: number };
  }) {
    // Create user-friendly message based on error type
    let message = options.detail;
    if (options.statusCode === 429 && options.quota) {
      message = `Crediti esauriti. Hai utilizzato ${options.quota.current} di ${options.quota.limit} crediti disponibili.`;
    } else if (options.statusCode === 429) {
      message = 'Crediti esauriti. Acquista crediti aggiuntivi per continuare.';
    } else if (options.errorType === 'Credit Processing Error') {
      message = 'Errore nel processare i crediti. Riprova più tardi.';
    }

    super(message);
    this.name = 'MonaiLabelError';
    this.statusCode = options.statusCode;
    this.errorType = options.errorType;
    this.detail = options.detail;
    this.quota = options.quota;
  }
}

/**
 * Represents an available AI segmentation model on the MONAI Label server.
 */
export interface MonaiModel {
  /** Unique model identifier (e.g., 'vista3d', 'wholeBody_ct_segmentation') */
  name: string;
  /** Model type: 'segmentation', 'deepedit', 'deepgrow', etc. */
  type: string;
  /** Map of label names to their indices in the output segmentation */
  labels: Record<string, number>;
  /** Human-readable description of the model */
  description?: string;
  /** Spatial dimension (2 for 2D, 3 for 3D) */
  dimension?: number;
}

/**
 * Server information returned by the MONAI Label /info endpoint.
 */
export interface MonaiServerInfo {
  /** Server name/identifier */
  name: string;
  /** Server version */
  version: string;
  /** List of available models */
  models: MonaiModel[];
  /** Global labels (optional) */
  labels?: string[];
}

/**
 * Result from running inference on the MONAI Label server.
 */
export interface InferenceResult {
  /** Binary segmentation data in NRRD format */
  label: ArrayBuffer;
  /** Map of label names to their indices in the segmentation */
  label_names: Record<string, number>;
  /** Timing information for various inference stages */
  latencies: Record<string, number>;
}

/**
 * Configuration for initializing the MONAI Label service.
 */
export interface MonaiLabelConfig {
  /** Base URL of the MONAI Label server (e.g., 'http://localhost:8000') */
  server: string;
  /** Optional function to get authorization headers for authenticated requests */
  getAuthorizationHeader?: () => Record<string, string>;
}

/**
 * MONAI Label Service for OHIF v3
 *
 * Provides API communication with MONAI Label server for:
 * - Model listing and info
 * - Inference execution
 * - Label submission
 */
/**
 * Parse an axios error into a MonaiLabelError with user-friendly message.
 */
function parseMonaiError(error: unknown): MonaiLabelError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      error?: string;
      detail?: string;
      quota?: { type: string; current: number; limit: number };
    }>;

    const statusCode = axiosError.response?.status || 500;
    let errorType = 'Unknown Error';
    let detail = axiosError.message;

    // Try to parse error response body
    const responseData = axiosError.response?.data;
    if (responseData) {
      // Handle arraybuffer response (inference endpoint returns arraybuffer)
      if (responseData instanceof ArrayBuffer) {
        try {
          const textDecoder = new TextDecoder('utf-8');
          const jsonText = textDecoder.decode(new Uint8Array(responseData));
          const parsed = JSON.parse(jsonText);
          errorType = parsed.error || errorType;
          detail = parsed.detail || detail;
        } catch {
          // If parsing fails, use default message
        }
      } else if (typeof responseData === 'object') {
        errorType = responseData.error || errorType;
        detail = responseData.detail || detail;
      }
    }

    return new MonaiLabelError({
      statusCode,
      errorType,
      detail,
      quota: typeof responseData === 'object' && responseData !== null && 'quota' in responseData
        ? (responseData as { quota?: { type: string; current: number; limit: number } }).quota
        : undefined,
    });
  }

  // Non-axios error
  return new MonaiLabelError({
    statusCode: 500,
    errorType: 'Unknown Error',
    detail: error instanceof Error ? error.message : String(error),
  });
}

class MonaiLabelService {
  private client: AxiosInstance;
  private config: MonaiLabelConfig;
  private serverInfo: MonaiServerInfo | null = null;

  constructor(config: MonaiLabelConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.server,
      timeout: 600000, // 10 minutes for inference (large models like wholeBody_ct can take 5+ minutes)
    });

    // Add auth interceptor
    this.client.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      if (this.config.getAuthorizationHeader) {
        const authHeaders = this.config.getAuthorizationHeader();
        console.log('MONAI Label: Auth headers from config:', authHeaders);
        if (authHeaders && Object.keys(authHeaders).length > 0) {
          // Use .set() method for axios 1.x compatibility
          Object.entries(authHeaders).forEach(([key, value]) => {
            requestConfig.headers.set(key, value);
          });
        } else {
          console.warn('MONAI Label: No auth headers available - user may not be authenticated');
        }
      } else {
        console.warn('MONAI Label: No getAuthorizationHeader function configured');
      }
      return requestConfig;
    });
  }

  /**
   * Get MONAI Label server info and available models
   */
  async getInfo(): Promise<MonaiServerInfo> {
    try {
      const response = await this.client.get('/info');
      const data = response.data;

      // Transform models from object format to array format
      // MONAI Label returns: { models: { modelName: { type, labels, ... }, ... } }
      // We need: { models: [{ name, type, labels, ... }, ...] }
      let models: MonaiModel[] = [];
      if (data.models) {
        if (Array.isArray(data.models)) {
          // Already an array (legacy format)
          models = data.models;
        } else if (typeof data.models === 'object') {
          // Object format - transform to array
          models = Object.entries(data.models).map(([name, info]: [string, any]) => ({
            name,
            type: info.type || 'segmentation',
            labels: info.labels || {},
            description: info.description,
            dimension: info.dimension,
          }));
        }
      }

      this.serverInfo = {
        name: data.name || 'MONAI Label',
        version: data.version || 'unknown',
        models,
        labels: data.labels,
      };

      return this.serverInfo;
    } catch (error) {
      console.error('MONAI Label: Failed to get server info', error);
      throw error;
    }
  }

  /**
   * Get list of available models
   */
  async getModels(): Promise<MonaiModel[]> {
    if (!this.serverInfo) {
      await this.getInfo();
    }
    return this.serverInfo?.models || [];
  }

  /**
   * Run inference on an image
   *
   * @param modelName - Name of the model to use
   * @param imageId - Study/Image ID
   * @param params - Additional parameters (e.g., foreground/background points for DeepEdit)
   */
  async runInference(
    modelName: string,
    imageId: string,
    params?: Record<string, unknown>
  ): Promise<InferenceResult> {
    try {
      // MONAI Label /infer API expects:
      // - image as query parameter
      // - params as JSON-stringified form field
      const formData = new FormData();

      // Params should be JSON stringified in the 'params' form field
      // IMPORTANT: result_extension must be .nrrd for OHIF compatibility
      // and to avoid issues with StudyInstanceUIDs containing dots
      // being misinterpreted as file extensions
      // result_compress: false ensures raw encoding (not gzip) for browser compatibility
      const inferParams = {
        result_extension: '.nrrd',
        result_dtype: 'uint8',
        result_compress: false,
        ...params,
      };
      formData.append('params', JSON.stringify(inferParams));

      // Image ID goes in query parameter, not form data
      const response = await this.client.post(
        `/infer/${modelName}?image=${encodeURIComponent(imageId)}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'arraybuffer',
        }
      );

      console.log('MONAI Label: Response status:', response.status);
      console.log('MONAI Label: Response headers:', response.headers);
      console.log('MONAI Label: Response data type:', typeof response.data);
      console.log('MONAI Label: Response data size:', response.data?.byteLength || 0);

      // Check if response is arraybuffer
      let labelData = response.data;

      // Debug: check first bytes to see what format we got
      if (labelData instanceof ArrayBuffer && labelData.byteLength > 0) {
        const firstBytes = new Uint8Array(labelData.slice(0, 100));
        const firstChars = String.fromCharCode.apply(null, Array.from(firstBytes.slice(0, 50)));
        console.log('MONAI Label: First 50 chars:', firstChars);

        // Check if it starts with NRRD magic
        if (!firstChars.startsWith('NRRD')) {
          console.warn(
            'MONAI Label: Response does not start with NRRD magic, checking for multipart...'
          );

          // MONAI Label returns multipart response - extract NRRD part
          // For models with many labels (e.g., wholeBody with 104 labels),
          // the multipart headers can be very large (>10KB), so we search more data
          const searchSize = Math.min(50000, labelData.byteLength); // Search up to 50KB for NRRD magic
          const textDecoder = new TextDecoder('utf-8');
          const fullText = textDecoder.decode(new Uint8Array(labelData.slice(0, searchSize)));

          // Look for NRRD magic in the response
          const nrrdIndex = fullText.indexOf('NRRD');
          if (nrrdIndex > 0) {
            console.log('MONAI Label: Found NRRD at offset', nrrdIndex);
            labelData = labelData.slice(nrrdIndex);
          } else {
            console.error('MONAI Label: Could not find NRRD magic in first', searchSize, 'bytes');
          }
        }
      }

      // Parse response headers for label info
      const labelHeader = response.headers['x-label-info'];
      const labelInfo = labelHeader ? JSON.parse(labelHeader) : {};

      return {
        label: labelData,
        label_names: labelInfo.labels || {},
        latencies: labelInfo.latencies || {},
      };
    } catch (error) {
      console.error('MONAI Label: Inference failed', error);
      throw parseMonaiError(error);
    }
  }

  /**
   * Run inference with clicks (for DeepEdit/DeepGrow models)
   *
   * @param modelName - Name of the model
   * @param imageId - Image ID
   * @param foregroundPoints - Array of [x, y, z] foreground points
   * @param backgroundPoints - Array of [x, y, z] background points
   */
  async runInteractiveInference(
    modelName: string,
    imageId: string,
    foregroundPoints: number[][],
    backgroundPoints: number[][]
  ): Promise<InferenceResult> {
    return this.runInference(modelName, imageId, {
      foreground: foregroundPoints,
      background: backgroundPoints,
    });
  }

  /**
   * Submit a label for training (active learning)
   *
   * @param imageId - Image ID
   * @param labelData - Label/segmentation data (DICOM-SEG or NIfTI)
   * @param labelInfo - Label metadata
   */
  async submitLabel(
    imageId: string,
    labelData: ArrayBuffer,
    labelInfo?: Record<string, unknown>
  ): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('image', imageId);
      formData.append('label', new Blob([labelData]));

      if (labelInfo) {
        formData.append('label_info', JSON.stringify(labelInfo));
      }

      await this.client.post('/datastore/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (error) {
      console.error('MONAI Label: Failed to submit label', error);
      throw error;
    }
  }

  /**
   * Get next sample for active learning
   *
   * @param strategy - Active learning strategy (e.g., 'random', 'epistemic')
   * @param params - Additional parameters for the strategy
   */
  async getNextSample(strategy: string = 'random', params?: Record<string, unknown>): Promise<any> {
    try {
      const response = await this.client.post('/activelearning/', {
        strategy,
        ...params,
      });
      return response.data;
    } catch (error) {
      console.error('MONAI Label: Failed to get next sample', error);
      throw error;
    }
  }

  /**
   * Start training
   *
   * @param params - Training parameters
   */
  async startTraining(params?: Record<string, unknown>): Promise<void> {
    try {
      await this.client.post('/train/', params || {});
    } catch (error) {
      console.error('MONAI Label: Failed to start training', error);
      throw error;
    }
  }

  /**
   * Stop training
   */
  async stopTraining(): Promise<void> {
    try {
      await this.client.delete('/train/');
    } catch (error) {
      console.error('MONAI Label: Failed to stop training', error);
      throw error;
    }
  }

  /**
   * Check if training is running
   */
  async isTrainingRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/train/');
      return response.data?.status === 'running';
    } catch {
      return false;
    }
  }

  /**
   * Check if server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/info', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set server URL (for dynamic server switching)
   */
  set serverUrl(url: string) {
    this.client.defaults.baseURL = url;
    this.serverInfo = null;
  }

  get serverUrl(): string {
    return this.client.defaults.baseURL || '';
  }
}

export default MonaiLabelService;
export { MonaiLabelService, MonaiLabelError };
