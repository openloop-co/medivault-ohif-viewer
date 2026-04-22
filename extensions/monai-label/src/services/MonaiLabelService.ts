/**
 * MONAI Label Service for OHIF v3 — stub after the async refactor.
 *
 * MONAI Label is VPC-internal and no longer reachable from the browser.
 * The panel never invokes inference directly: it calls
 * POST /segmentations on the backend, which enqueues a job consumed by
 * the segmentation-worker Lambda.
 *
 * This service now reads the model catalog from `window.config.monaiLabel.models`
 * to keep the panel's model selector working without contacting MONAI.
 * All inference-bound methods remain on the surface for compatibility
 * but throw — callers must migrate to `SegmentationApiService.startSegmentation`.
 *
 * @module services/MonaiLabelService
 */

/**
 * Custom error class for MONAI Label API errors with parsed details.
 * Kept for compatibility with existing panel error-handling code paths.
 */
class MonaiLabelError extends Error {
  readonly statusCode: number;
  readonly errorType: string;
  readonly detail: string;
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
    super(options.detail);
    this.name = 'MonaiLabelError';
    this.statusCode = options.statusCode;
    this.errorType = options.errorType;
    this.detail = options.detail;
    this.quota = options.quota;
  }
}

export interface MonaiModel {
  name: string;
  type: string;
  labels: Record<string, number> | string[];
  description?: string;
  dimension?: number;
}

export interface MonaiServerInfo {
  name: string;
  version: string;
  models: MonaiModel[];
  labels?: string[];
}

export interface InferenceResult {
  label: ArrayBuffer;
  label_names: Record<string, number>;
  latencies: Record<string, number>;
}

export interface MonaiLabelConfig {
  /**
   * Kept for backwards compatibility — unused. MONAI is no longer
   * reached from the browser.
   */
  server?: string;
  getAuthorizationHeader?: () => Record<string, string>;
  /**
   * Static model catalog surfaced to the panel. Configured from
   * `window.config.monaiLabel.models`.
   */
  models?: MonaiModel[];
}

class MonaiLabelService {
  private serverInfo: MonaiServerInfo | null = null;
  private config: MonaiLabelConfig;

  constructor(config: MonaiLabelConfig = {}) {
    this.config = config;
  }

  /**
   * Return a synthetic server info derived from the configured model
   * catalog. No network I/O.
   */
  async getInfo(): Promise<MonaiServerInfo> {
    if (this.serverInfo) return this.serverInfo;

    const models =
      this.config.models ??
      ((typeof window !== 'undefined' &&
        (window as unknown as { config?: { monaiLabel?: { models?: MonaiModel[] } } })
          .config?.monaiLabel?.models) ||
        []);

    this.serverInfo = {
      name: 'MediVault MONAI',
      version: 'async-v2',
      models,
    };
    return this.serverInfo;
  }

  async getModels(): Promise<MonaiModel[]> {
    const info = await this.getInfo();
    return info.models;
  }

  /**
   * Inference is server-side in the async pipeline.
   * Use `SegmentationApiService.startSegmentation` instead.
   */
  async runInference(): Promise<InferenceResult> {
    throw new MonaiLabelError({
      statusCode: 501,
      errorType: 'Not Implemented',
      detail:
        'Direct inference is disabled. Use SegmentationApiService.startSegmentation instead.',
    });
  }

  async isAvailable(): Promise<boolean> {
    const models = await this.getModels();
    return models.length > 0;
  }
}

export { MonaiLabelError, MonaiLabelService };
export default MonaiLabelService;
