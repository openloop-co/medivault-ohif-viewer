/**
 * MONAI Label Panel for OHIF v3
 *
 * This panel provides the user interface for MONAI Label AI segmentation:
 * - Auto-connect to MONAI Label server on mount
 * - Display available segmentation models
 * - Run inference and display segmentation results
 * - Support for both volume-based and stack-based labelmaps
 *
 * @module panels/MonaiLabelPanel
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MonaiLabelService, MonaiLabelError, MonaiModel, MonaiServerInfo } from '../services/MonaiLabelService';
import {
  SegmentationApiService,
  SegmentationSummary,
} from '../services/SegmentationApiService';
import { getLabelColor } from '../utils/GenericUtils';
import { useMonaiOnDemand } from '../hooks/useMonaiOnDemand';
import { MonaiOnDemandBanner } from '../components/MonaiOnDemandBanner';
import {
  Enums as csToolsEnums,
  segmentation as cornerstoneSegmentation,
} from '@cornerstonejs/tools';
import { triggerEvent, eventTarget, cache as cornerstoneCache } from '@cornerstonejs/core';
import SegmentationReader from '../utils/SegmentationReader';
import { currentSegmentsInfo } from '../utils/SegUtils';

const LABELMAP = csToolsEnums.SegmentationRepresentations.Labelmap;
const SEGMENTATION_ID = '1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceManager = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandsManager = any;

/** Props for the MonaiLabelPanel component */
interface MonaiLabelPanelProps {
  /** OHIF services manager providing access to segmentation, viewport, and other services */
  servicesManager: ServiceManager;
  /** OHIF commands manager for executing registered commands */
  commandsManager: CommandsManager;
  /** OHIF extension manager (optional) */
  extensionManager?: unknown;
}

/** Maps model names to their label indices for fast lookup */
interface ModelLabelMaps {
  /** Maps model name -> label name -> label index */
  modelLabelToIdxMap: Record<string, Record<string, number>>;
  /** Maps model name -> label index -> label name */
  modelIdxToLabelMap: Record<string, Record<number, string>>;
  /** Maps model name -> array of label names */
  modelLabelNames: Record<string, string[]>;
  /** Maps model name -> array of label indices */
  modelLabelIndices: Record<string, number[]>;
}

/** Response from MONAI Label inference endpoint */
interface InferenceResponse {
  /** Binary NRRD segmentation data */
  label: ArrayBuffer;
  /** Map of label names to indices returned in x-label-info header */
  label_names?: Record<string, number>;
  /** Inference timing latencies */
  latencies?: Record<string, number>;
}

/** Information about a single segment in the segmentation */
interface SegmentInfo {
  /** Index of this segment in the labelmap */
  segmentIndex: number;
  /** RGBA color for this segment */
  color?: number[];
}

/** Current segments state from the segmentation service */
interface CurrentSegments {
  /** Map of label name to segment info */
  info: Record<string, SegmentInfo>;
  /** Set of used segment indices */
  indices: Set<number>;
}

/** Configuration for creating a segment in OHIF */
interface SegmentConfig {
  /** Index of this segment in the labelmap */
  segmentIndex: number;
  /** Display label for this segment */
  label: string;
  /** Whether this segment is currently active */
  active: boolean;
  /** Whether this segment is locked for editing */
  locked: boolean;
  /** RGBA color array [r, g, b, a] */
  color: number[];
}

const MonaiLabelPanel: React.FC<MonaiLabelPanelProps> = ({ servicesManager, commandsManager }) => {
  const [serverInfo, setServerInfo] = useState<MonaiServerInfo | null>(null);
  const [models, setModels] = useState<MonaiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastResult, setLastResult] = useState<{ segmentationId: string; segments: number } | null>(
    null
  );
  const [labelMaps, setLabelMaps] = useState<ModelLabelMaps | null>(null);

  // State for segmentation persistence
  const [savedSegmentations, setSavedSegmentations] = useState<SegmentationSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMask, setIsLoadingMask] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);
  const [currentSeriesUid, setCurrentSeriesUid] = useState<string | null>(null);
  const fetchedSeriesRef = useRef<string | null>(null); // Track fetched series to avoid duplicates

  // Active async segmentation job (populated after POST /segmentations).
  // In the async pipeline the browser never holds the NRRD — when the
  // worker Lambda finishes, we fetch the mask via presigned URL.
  const [activeJob, setActiveJob] = useState<
    { segmentationId: string; status: 'PENDING' | 'ACTIVE' | 'FAILED' } | null
  >(null);

  // Keep the latest labelMaps readable from async callbacks without
  // putting it in their dependency arrays (which would churn subscriptions
  // every time labelMaps changes).
  const labelMapsRef = useRef<ModelLabelMaps | null>(labelMaps);
  useEffect(() => {
    labelMapsRef.current = labelMaps;
  }, [labelMaps]);

  // Forward-declared ref to the paint-on-complete handler — the actual
  // useCallback is defined later in the file (after viewResponse), so we
  // use a ref to break the temporal-dead-zone cycle between the WebSocket
  // useEffect (which needs to call it) and its dependency on viewResponse.
  const paintSegmentationRef = useRef<
    ((segmentation: SegmentationSummary) => Promise<void>) | null
  >(null);

  // Get MONAI Label service from services manager
  const monaiService = servicesManager.services.monaiLabelService as MonaiLabelService | undefined;
  const segmentationApiService = servicesManager.services.segmentationApiService as
    | SegmentationApiService
    | undefined;

  // On-demand MONAI management
  // Check if on-demand mode is enabled (minCapacity = 0 in config)
  const monaiLabelConfig = (window as any).config?.monaiLabel;
  const medivaultApiUrl = (window as any).config?.medivaultApiUrl;
  const onDemandEnabled = !!(medivaultApiUrl && monaiLabelConfig?.onDemandEnabled !== false);

  const {
    status: onDemandStatus,
    message: onDemandMessage,
    estimatedWaitSeconds,
    isWaiting,
    isChecking: isCheckingOnDemand,
    ensureRunning: ensureMonaiRunning,
    isReady: isMonaiReady,
  } = useMonaiOnDemand({
    enabled: onDemandEnabled,
    apiUrl: medivaultApiUrl,
    getAuthorizationHeader: monaiLabelConfig?.getAuthorizationHeader,
    autoCheck: true,
  });

  // Segment color helper - converts various color formats to RGBA array
  const segmentColor = (label: string): number[] => {
    const color = getLabelColor(label);
    if (Array.isArray(color)) {
      return color;
    }
    if (typeof color === 'object' && color !== null) {
      const c = color as { r?: number; g?: number; b?: number };
      return [c.r ?? 128, c.g ?? 128, c.b ?? 128, 255];
    }
    return [128, 128, 128, 255];
  };

  // Get active viewport info
  const getActiveViewportInfo = useCallback(() => {
    const { viewportGridService, displaySetService } = servicesManager.services;
    const { viewports, activeViewportId } = viewportGridService.getState();
    const viewport = viewports.get(activeViewportId);
    if (!viewport?.displaySetInstanceUIDs?.length) {
      return null;
    }
    const displaySet = displaySetService.getDisplaySetByUID(viewport.displaySetInstanceUIDs[0]);
    return { viewport, displaySet };
  }, [servicesManager]);

  // Fetch server info and pre-create segmentation (auto-connect on mount)
  const fetchServerInfo = useCallback(async () => {
    if (!monaiService) {
      setError('MONAI Label service not configured. Check window.config.monaiLabel settings.');
      setServerStatus('offline');
      return;
    }

    // In on-demand mode, don't try to connect if MONAI is not running
    if (onDemandEnabled && !isMonaiReady) {
      console.log('MONAI Label: On-demand mode - MONAI not ready, skipping server check');
      setServerStatus('offline');
      // Don't set error - the banner will explain the situation
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const available = await monaiService.isAvailable();
      if (!available) {
        setServerStatus('offline');
        // In on-demand mode, this is expected when MONAI is stopped
        if (!onDemandEnabled) {
          setError('MONAI Label server is not available');
        }
        return;
      }

      setServerStatus('online');
      const info = await monaiService.getInfo();
      setServerInfo(info);
      setModels(info.models || []);

      // Select first model by default
      if (info.models && info.models.length > 0) {
        setSelectedModel(info.models[0].name);
      }

      // Build label maps from all models
      const allModels = info.models || [];
      const modelLabelToIdxMap: Record<string, Record<string, number>> = {};
      const modelIdxToLabelMap: Record<string, Record<number, string>> = {};
      const modelLabelNames: Record<string, string[]> = {};
      const modelLabelIndices: Record<string, number[]> = {};
      const labelsSet = new Set<string>();

      for (const model of allModels) {
        modelLabelToIdxMap[model.name] = {};
        modelIdxToLabelMap[model.name] = {};

        const labels = model.labels || {};
        if (Array.isArray(labels)) {
          for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            const labelIdx = i + 1;
            labelsSet.add(label);
            modelLabelToIdxMap[model.name][label] = labelIdx;
            modelIdxToLabelMap[model.name][labelIdx] = label;
          }
        } else {
          for (const label of Object.keys(labels)) {
            const labelIdx = labels[label];
            labelsSet.add(label);
            modelLabelToIdxMap[model.name][label] = labelIdx;
            modelIdxToLabelMap[model.name][labelIdx] = label;
          }
        }
        modelLabelNames[model.name] = Object.keys(modelLabelToIdxMap[model.name]).sort();
        modelLabelIndices[model.name] = Object.keys(modelIdxToLabelMap[model.name])
          .sort()
          .map(Number);
      }

      setLabelMaps({ modelLabelToIdxMap, modelIdxToLabelMap, modelLabelNames, modelLabelIndices });

      // Note: We no longer pre-create segmentation here.
      // Segmentation will be created on-demand when running inference using
      // segmentationService.createLabelmapForDisplaySet() which properly creates
      // the underlying labelmap volume.
      console.log('MONAI Label: Ready. Segmentation will be created when inference runs.');
    } catch (err) {
      setServerStatus('offline');
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaiService, onDemandEnabled, isMonaiReady]);

  useEffect(() => {
    fetchServerInfo();
  }, [fetchServerInfo]);

  // Re-fetch server info when MONAI becomes ready (on-demand mode)
  useEffect(() => {
    if (onDemandEnabled && isMonaiReady && serverStatus !== 'online') {
      console.log('MONAI Label: MONAI is now ready, fetching server info...');
      fetchServerInfo();
    }
  }, [onDemandEnabled, isMonaiReady, serverStatus, fetchServerInfo]);

  // Check if persistence is enabled
  useEffect(() => {
    setPersistenceEnabled(!!segmentationApiService);
    if (segmentationApiService) {
      console.log('MONAI Label: Segmentation persistence enabled');
    }
  }, [segmentationApiService]);

  // Fetch saved segmentations for the current series
  const fetchSavedSegmentations = useCallback(async () => {
    if (!segmentationApiService) return;

    const viewportInfo = getActiveViewportInfo();
    if (!viewportInfo?.displaySet?.SeriesInstanceUID) return;

    const seriesInstanceUid = viewportInfo.displaySet.SeriesInstanceUID;

    setIsLoadingList(true);
    try {
      const segmentations = await segmentationApiService.listSegmentations(seriesInstanceUid);
      setSavedSegmentations(segmentations);
      console.log('MONAI Label: Fetched saved segmentations', segmentations.length);
    } catch (err) {
      console.error('MONAI Label: Failed to fetch saved segmentations', err);
    } finally {
      setIsLoadingList(false);
    }
  }, [segmentationApiService, getActiveViewportInfo]);

  // React to async segmentation completion — WebSocket first, polling fallback.
  useEffect(() => {
    if (!segmentationApiService) return;
    if (!activeJob || activeJob.status !== 'PENDING') return;

    const { uiNotificationService } = servicesManager.services;
    const segmentationId = activeJob.segmentationId;
    let finished = false;

    const handleComplete = async (status: 'ACTIVE' | 'FAILED', errMessage?: string) => {
      if (finished) return;
      finished = true;

      if (status === 'FAILED') {
        setActiveJob({ segmentationId, status: 'FAILED' });
        setError(errMessage || 'Segmentation failed');
        setIsRunning(false);
        if (uiNotificationService) {
          uiNotificationService.show({
            title: 'Segmentazione fallita',
            message: errMessage || 'Il worker non ha completato la segmentazione.',
            type: 'error',
            duration: 6000,
          });
        }
        return;
      }

      try {
        const seg = await segmentationApiService.getSegmentation(segmentationId);
        await paintSegmentationRef.current?.(seg);
        setActiveJob({ segmentationId, status: 'ACTIVE' });
        if (uiNotificationService) {
          uiNotificationService.show({
            title: 'Segmentation Complete',
            message: `${seg.labels.length} segments ready`,
            type: 'success',
            duration: 3000,
          });
        }
        await fetchSavedSegmentations();
      } catch (err) {
        console.error('MONAI Label: Failed to fetch completed segmentation', err);
        setError(err instanceof Error ? err.message : 'Failed to load mask');
        setActiveJob({ segmentationId, status: 'FAILED' });
      } finally {
        setIsRunning(false);
        // Clear the in-flight marker after a short delay so the "Complete"
        // block is briefly visible to the user.
        setTimeout(() => {
          setActiveJob((prev) =>
            prev && prev.segmentationId === segmentationId ? null : prev
          );
        }, 2_000);
      }
    };

    const wsHandler = (event: Event) => {
      const custom = event as CustomEvent<{
        type?: string;
        payload?: {
          segmentationId?: string;
          status?: 'ACTIVE' | 'FAILED';
          errorMessage?: string;
        };
      }>;
      const msg = custom.detail;
      if (!msg) return;
      if (msg.type !== 'SEGMENTATION_READY' && msg.type !== 'SEGMENTATION_FAILED') {
        return;
      }
      if (msg.payload?.segmentationId !== segmentationId) return;
      const nextStatus =
        msg.type === 'SEGMENTATION_FAILED' || msg.payload?.status === 'FAILED'
          ? 'FAILED'
          : 'ACTIVE';
      handleComplete(nextStatus, msg.payload?.errorMessage);
    };

    window.addEventListener('medivault:ws:message', wsHandler);

    // Polling fallback — handles the case where the WebSocket is not
    // available or the push event is missed.
    const pollInterval = window.setInterval(async () => {
      if (finished) return;
      try {
        const seg = await segmentationApiService.getSegmentation(segmentationId);
        if (seg.status === 'ACTIVE') handleComplete('ACTIVE');
        else if (seg.status === 'FAILED') handleComplete('FAILED', seg.errorMessage);
      } catch (err) {
        console.warn('MONAI Label: polling error', err);
      }
    }, 3_000);

    const pollTimeout = window.setTimeout(() => {
      if (finished) return;
      handleComplete('FAILED', 'Segmentation timed out');
    }, 300_000); // 5 min

    return () => {
      window.removeEventListener('medivault:ws:message', wsHandler);
      window.clearInterval(pollInterval);
      window.clearTimeout(pollTimeout);
    };
  }, [activeJob, segmentationApiService, servicesManager, fetchSavedSegmentations]);

  // Fetch saved segmentations when viewport is ready or series changes
  useEffect(() => {
    if (!segmentationApiService) return;

    const { viewportGridService } = servicesManager.services;
    if (!viewportGridService) return;

    const fetchForCurrentSeries = () => {
      const viewportInfo = getActiveViewportInfo();
      const seriesUid = viewportInfo?.displaySet?.SeriesInstanceUID;

      // Avoid duplicate fetches for the same series
      if (seriesUid && seriesUid !== fetchedSeriesRef.current) {
        console.log('MONAI Label: Fetching saved segmentations for series', seriesUid);
        fetchedSeriesRef.current = seriesUid;
        setCurrentSeriesUid(seriesUid);
        setSavedSegmentations([]);
        fetchSavedSegmentations();
      }
    };

    // Subscribe to VIEWPORTS_READY event (fires when viewports are ready)
    const viewportsReadySubscription = viewportGridService.subscribe(
      viewportGridService.EVENTS?.VIEWPORTS_READY || 'event::viewportGridService:viewportsReady',
      () => {
        console.log('MONAI Label: VIEWPORTS_READY event received');
        fetchForCurrentSeries();
      }
    );

    // Subscribe to GRID_STATE_CHANGED for series changes after initial load
    const gridStateSubscription = viewportGridService.subscribe(
      viewportGridService.EVENTS?.GRID_STATE_CHANGED || 'event::viewportGridService:gridStateChanged',
      () => {
        console.log('MONAI Label: GRID_STATE_CHANGED event received');
        fetchForCurrentSeries();
      }
    );

    return () => {
      viewportsReadySubscription?.unsubscribe?.();
      gridStateSubscription?.unsubscribe?.();
    };
  }, [segmentationApiService, servicesManager, getActiveViewportInfo, currentSeriesUid, fetchSavedSegmentations]);

  // View response - update segmentation with inference result
  const viewResponse = async (
    response: InferenceResponse,
    modelId: string,
    labels: string[],
    override = false
  ) => {
    console.log('ViewResponse:', { modelId, labels, override });

    const ret = SegmentationReader.parseNrrdData(response.label);
    if (!ret) {
      throw new Error('Failed to parse NRRD data');
    }

    const { segmentationService } = servicesManager.services;
    if (!segmentationService) {
      throw new Error('Segmentation service not available');
    }

    // Get current segments info with error handling
    let currentSegs: CurrentSegments;
    try {
      currentSegs = currentSegmentsInfo(segmentationService);
    } catch (e) {
      console.warn('MONAI Label: Could not get current segments, using empty:', e);
      currentSegs = { info: {}, indices: new Set() };
    }

    const modelToSegMapping: Record<number, number> = { 0: 0 };

    let tmpModelSegIdx = 1;
    for (const label of labels) {
      const s = currentSegs.info[label];
      let segmentIndex: number = 1;

      if (!s) {
        for (let i = 1; i <= 255; i++) {
          if (!currentSegs.indices.has(i)) {
            segmentIndex = i;
            currentSegs.indices.add(i);
            break;
          }
        }
      } else {
        segmentIndex = s.segmentIndex;
      }

      let modelSegIdx = labelMapsRef.current?.modelLabelToIdxMap[modelId]?.[label];
      modelSegIdx = modelSegIdx ? modelSegIdx : tmpModelSegIdx;
      modelToSegMapping[modelSegIdx] = 0xff & segmentIndex;
      tmpModelSegIdx++;
    }

    console.log('Index Remap', labels, modelToSegMapping);
    console.log('MONAI Label: NRRD data length:', ret.image.byteLength);
    const data = new Uint8Array(ret.image);

    // Count non-zero voxels in NRRD data
    let nonZeroCount = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) {
        nonZeroCount++;
      }
    }
    console.log('MONAI Label: Non-zero voxels in NRRD:', nonZeroCount);

    // Get the viewport info to access the displaySet
    const viewportInfo = getActiveViewportInfo();
    if (!viewportInfo?.displaySet) {
      throw new Error('No display set available');
    }

    // Try to get existing labelmap volume using OHIF segmentation service
    let labelmapVolume = null;
    try {
      labelmapVolume = segmentationService.getLabelmapVolume(SEGMENTATION_ID);
      console.log('MONAI Label: Existing labelmap volume:', labelmapVolume);
    } catch (e) {
      console.log('MONAI Label: No existing labelmap volume');
    }

    // Build segments configuration
    const segments: Record<number, SegmentConfig> = {};
    labels.forEach((label, idx) => {
      const segIdx = modelToSegMapping[idx + 1] || idx + 1;
      segments[segIdx] = {
        segmentIndex: segIdx,
        label: label,
        active: idx === 0,
        locked: false,
        color: segmentColor(label),
      };
    });

    if (!labelmapVolume) {
      console.log('MONAI Label: Creating new labelmap for display set...');

      try {
        // Use OHIF's proper segmentation creation API
        const segmentationId = await segmentationService.createLabelmapForDisplaySet(
          viewportInfo.displaySet,
          {
            segmentationId: SEGMENTATION_ID,
            segments,
            label: 'MONAI Segmentation',
          }
        );
        console.log('MONAI Label: Created segmentation with ID:', segmentationId);

        // Add representation to viewport
        if (viewportInfo.viewport?.viewportId) {
          await segmentationService.addSegmentationRepresentation(
            viewportInfo.viewport.viewportId,
            {
              segmentationId: SEGMENTATION_ID,
              type: LABELMAP,
            }
          );
          console.log('MONAI Label: Added segmentation representation to viewport');
        }

        // Wait for the segmentation to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to get the volume again
        labelmapVolume = segmentationService.getLabelmapVolume(SEGMENTATION_ID);
        console.log('MONAI Label: Labelmap volume after creation:', labelmapVolume);
      } catch (createError) {
        console.error('MONAI Label: Failed to create labelmap:', createError);
      }
    }

    // Convert NRRD data using the label mapping
    let convertedData = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const midx = data[i];
      const sidxVal = modelToSegMapping[midx];
      if (midx && sidxVal) {
        convertedData[i] = sidxVal;
      } else if (override && labels.length === 1) {
        const labelInfo = currentSegs.info[labels[0]];
        convertedData[i] = midx ? labelInfo?.segmentIndex || 1 : 0;
      } else if (labels.length > 0) {
        convertedData[i] = 0;
      }
    }

    // Count non-zero in converted data
    let convertedNonZero = 0;
    for (let i = 0; i < convertedData.length; i++) {
      if (convertedData[i] !== 0) {
        convertedNonZero++;
      }
    }
    console.log('MONAI Label: Non-zero voxels after conversion:', convertedNonZero);

    // Try volume-based approach first
    if (labelmapVolume?.voxelManager) {
      const voxelManager = labelmapVolume.voxelManager;
      console.log('MONAI Label: Using volume-based labelmap');

      const existingData = voxelManager.getCompleteScalarDataArray();
      console.log('MONAI Label: Existing scalar data length:', existingData?.length);

      if (existingData?.length !== convertedData.length) {
        console.warn(
          'MONAI Label: Data size mismatch!',
          existingData?.length,
          'vs',
          convertedData.length
        );
        const minLength = Math.min(existingData?.length || 0, convertedData.length);
        if (minLength > 0) {
          const adjustedData = new Uint8Array(existingData.length);
          adjustedData.set(convertedData.subarray(0, minLength));
          convertedData = adjustedData;
        }
      }

      if (override && existingData) {
        const currentSegArray = new Uint8Array(existingData.length);
        currentSegArray.set(existingData);
        for (let i = 0; i < convertedData.length; i++) {
          if (convertedData[i] !== 0) {
            currentSegArray[i] = convertedData[i];
          }
        }
        convertedData = currentSegArray;
      }

      voxelManager.setCompleteScalarDataArray(convertedData);
      console.log('MONAI Label: Set scalar data via voxelManager');

      triggerEvent(eventTarget, csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED, {
        segmentationId: SEGMENTATION_ID,
      });
      console.log('MONAI Label: Updated segmentation and triggered event');
      return;
    }

    // Fallback: Try stack-based approach using labelmap imageIds
    console.log('MONAI Label: Volume not available, trying stack-based approach...');

    const segmentation = cornerstoneSegmentation.state.getSegmentation(SEGMENTATION_ID);
    console.log('MONAI Label: Segmentation state:', segmentation);

    if (segmentation?.representationData?.Labelmap) {
      // Cast to any to access dynamic properties that may exist on stack-based labelmaps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const labelmapData = segmentation.representationData.Labelmap as any;
      console.log('MONAI Label: Labelmap representation data:', labelmapData);

      // Check for imageIds (stack-based labelmap)
      const imageIds = labelmapData.imageIds || labelmapData.data?.imageIds;
      if (imageIds && imageIds.length > 0) {
        console.log('MONAI Label: Found stack-based labelmap with', imageIds.length, 'images');

        // Get NRRD dimensions from parsed header
        const nrrdSizes = ret.header?.sizes || [];
        const sliceSize = nrrdSizes[0] * nrrdSizes[1]; // width * height per slice
        const numSlices = nrrdSizes[2] || imageIds.length;

        console.log(
          'MONAI Label: NRRD dimensions:',
          nrrdSizes,
          'slice size:',
          sliceSize,
          'slices:',
          numSlices
        );

        // Fill each image with the corresponding slice from NRRD data
        // Note: NRRD Z-axis is often inverted relative to DICOM, so we reverse the slice order
        const totalSlices = Math.min(imageIds.length, numSlices);
        for (let sliceIdx = 0; sliceIdx < totalSlices; sliceIdx++) {
          try {
            const image = cornerstoneCache.getImage(imageIds[sliceIdx]);
            if (image) {
              const voxelManager = image.voxelManager;
              if (voxelManager) {
                // Reverse the NRRD slice index to match DICOM ordering
                const nrrdSliceIdx = numSlices - 1 - sliceIdx;
                const sliceData = convertedData.slice(
                  nrrdSliceIdx * sliceSize,
                  (nrrdSliceIdx + 1) * sliceSize
                );
                const scalarData = voxelManager.getScalarData();
                if (scalarData && scalarData.length === sliceData.length) {
                  scalarData.set(sliceData);
                }
              }
            }
          } catch (e) {
            console.warn('MONAI Label: Error setting slice', sliceIdx, e);
          }
        }

        triggerEvent(eventTarget, csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED, {
          segmentationId: SEGMENTATION_ID,
        });
        console.log('MONAI Label: Updated stack-based segmentation');
        return;
      }
    }

    console.error('MONAI Label: Could not get or create labelmap!');
    throw new Error('Failed to create labelmap for segmentation');
  };

  // Paint a fetched segmentation (from presigned URL) onto the viewport.
  // Reads labelMaps via ref so repeated calls always see the current
  // value even if labelMaps changed between enqueue and completion.
  const paintSegmentationFromApi = useCallback(
    async (segmentation: SegmentationSummary) => {
      if (!segmentationApiService) return;

      const maskData = await segmentationApiService.downloadMask(
        segmentation.segmentationId
      );

      const inferenceResponse: InferenceResponse = {
        label: maskData,
        label_names: segmentation.labels.reduce(
          (acc, l) => {
            acc[l.name] = l.id;
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      const labels = segmentation.labels.map((l) => l.name);
      const currentMaps = labelMapsRef.current;

      if (!currentMaps?.modelLabelToIdxMap[segmentation.modelName]) {
        const newLabelMaps = { ...currentMaps } as ModelLabelMaps;
        newLabelMaps.modelLabelToIdxMap[segmentation.modelName] = {};
        newLabelMaps.modelIdxToLabelMap[segmentation.modelName] = {};
        newLabelMaps.modelLabelNames[segmentation.modelName] = [];
        newLabelMaps.modelLabelIndices[segmentation.modelName] = [];

        segmentation.labels.forEach((l) => {
          newLabelMaps.modelLabelToIdxMap[segmentation.modelName][l.name] = l.id;
          newLabelMaps.modelIdxToLabelMap[segmentation.modelName][l.id] = l.name;
          newLabelMaps.modelLabelNames[segmentation.modelName].push(l.name);
          newLabelMaps.modelLabelIndices[segmentation.modelName].push(l.id);
        });

        setLabelMaps(newLabelMaps);
        labelMapsRef.current = newLabelMaps;
      }

      await viewResponse(inferenceResponse, segmentation.modelName, labels, true);
      setLastResult({
        segmentationId: SEGMENTATION_ID,
        segments: labels.length,
      });
    },
    // viewResponse is a stable lexical closure; labelMaps is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segmentationApiService]
  );

  // Keep the ref in sync — the WebSocket useEffect above calls through
  // this ref to avoid a forward reference to paintSegmentationFromApi.
  useEffect(() => {
    paintSegmentationRef.current = paintSegmentationFromApi;
  }, [paintSegmentationFromApi]);

  // Enqueue an async segmentation job. The worker Lambda runs MONAI,
  // uploads the mask to S3, and emits a SEGMENTATION_READY WebSocket
  // event (which we consume below).
  const handleRunSegmentation = async () => {
    if (!segmentationApiService || !selectedModel) {
      return;
    }

    if (onDemandEnabled && !isMonaiReady) {
      const started = await ensureMonaiRunning();
      if (!started) {
        const { uiNotificationService } = servicesManager.services;
        if (uiNotificationService) {
          uiNotificationService.show({
            title: 'MONAI Label in avvio',
            message: 'MONAI Label sta avviando. Riprova tra qualche minuto.',
            type: 'info',
            duration: 5000,
          });
        }
        return;
      }
    }

    setIsRunning(true);
    setError(null);
    setLastResult(null);

    try {
      const viewportInfo = getActiveViewportInfo();
      if (
        !viewportInfo?.displaySet?.StudyInstanceUID ||
        !viewportInfo?.displaySet?.SeriesInstanceUID
      ) {
        throw new Error('No image loaded in active viewport');
      }

      const studyInstanceUid = viewportInfo.displaySet.StudyInstanceUID;
      const seriesInstanceUid = viewportInfo.displaySet.SeriesInstanceUID;

      const { segmentationId, status } = await segmentationApiService.startSegmentation({
        seriesInstanceUid,
        studyInstanceUid,
        modelName: selectedModel,
        force: true,
      });

      console.log('MONAI Label: Job enqueued', { segmentationId, status });
      setActiveJob({ segmentationId, status });
      // Spinner stays on until the WebSocket / polling observer closes the job.
    } catch (err) {
      console.error('MONAI Label: Failed to enqueue segmentation', err);
      setError(err instanceof Error ? err.message : 'Segmentation failed');
      setIsRunning(false);
    }
  };

  // Reset segmentation - clear all segmentation data or remove segmentation entirely
  const handleResetSegmentation = async () => {
    try {
      const { segmentationService, uiNotificationService } = servicesManager.services;

      // Try to get the labelmap volume
      let labelmapVolume = null;
      try {
        labelmapVolume = segmentationService.getLabelmapVolume(SEGMENTATION_ID);
      } catch (e) {
        console.log('MONAI Label: No labelmap volume to reset');
      }

      if (labelmapVolume?.voxelManager) {
        // Clear the voxel data
        const { voxelManager } = labelmapVolume;
        const scalarData = voxelManager.getCompleteScalarDataArray();
        const clearedData = new Uint8Array(scalarData.length);
        clearedData.fill(0);
        voxelManager.setCompleteScalarDataArray(clearedData);

        triggerEvent(eventTarget, csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED, {
          segmentationId: SEGMENTATION_ID,
        });

        console.log('MONAI Label: Segmentation data cleared');
        setLastResult(null);

        if (uiNotificationService) {
          uiNotificationService.show({
            title: 'Segmentation Reset',
            message: 'Segmentation data has been cleared',
            type: 'success',
            duration: 2000,
          });
        }
      } else {
        // No volume exists - try to remove segmentation entirely
        try {
          const existingSeg = segmentationService.getSegmentation(SEGMENTATION_ID);
          if (existingSeg) {
            segmentationService.remove(SEGMENTATION_ID);
            console.log('MONAI Label: Removed segmentation');
          }
        } catch (e) {
          console.log('MONAI Label: No segmentation to remove');
        }

        setLastResult(null);

        if (uiNotificationService) {
          uiNotificationService.show({
            title: 'Segmentation Reset',
            message: 'Segmentation has been reset',
            type: 'success',
            duration: 2000,
          });
        }
      }
    } catch (err) {
      console.error('MONAI Label: Error resetting segmentation:', err);
      setError('Failed to reset segmentation');
    }
  };

  // Load a saved segmentation
  const handleLoadSegmentation = async (segmentation: SegmentationSummary) => {
    if (!segmentationApiService) return;

    setIsLoadingMask(true);
    setError(null);

    try {
      const { uiNotificationService } = servicesManager.services;

      console.log('MONAI Label: Loading segmentation', segmentation.segmentationId);

      // Download the mask
      const maskData = await segmentationApiService.downloadMask(segmentation.segmentationId);

      // Get labels for display
      const labels = segmentation.labels.map(l => l.name);

      // Create inference response format and use viewResponse
      const inferenceResponse: InferenceResponse = {
        label: maskData,
        label_names: segmentation.labels.reduce(
          (acc, l) => {
            acc[l.name] = l.id;
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      // Update the labelMaps for this model if needed
      if (!labelMaps?.modelLabelToIdxMap[segmentation.modelName]) {
        const newLabelMaps = { ...labelMaps } as ModelLabelMaps;
        newLabelMaps.modelLabelToIdxMap[segmentation.modelName] = {};
        newLabelMaps.modelIdxToLabelMap[segmentation.modelName] = {};
        newLabelMaps.modelLabelNames[segmentation.modelName] = [];
        newLabelMaps.modelLabelIndices[segmentation.modelName] = [];

        segmentation.labels.forEach(l => {
          newLabelMaps.modelLabelToIdxMap[segmentation.modelName][l.name] = l.id;
          newLabelMaps.modelIdxToLabelMap[segmentation.modelName][l.id] = l.name;
          newLabelMaps.modelLabelNames[segmentation.modelName].push(l.name);
          newLabelMaps.modelLabelIndices[segmentation.modelName].push(l.id);
        });

        setLabelMaps(newLabelMaps);
      }

      await viewResponse(inferenceResponse, segmentation.modelName, labels, true);
      setSelectedModel(segmentation.modelName);

      setLastResult({
        segmentationId: SEGMENTATION_ID,
        segments: labels.length,
      });

      if (uiNotificationService) {
        uiNotificationService.show({
          title: 'Segmentation Loaded',
          message: `Loaded ${labels.length} segments from ${segmentation.modelName}`,
          type: 'success',
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('MONAI Label: Failed to load segmentation', err);
      setError(err instanceof Error ? err.message : 'Failed to load segmentation');
    } finally {
      setIsLoadingMask(false);
    }
  };

  // Delete a saved segmentation
  const handleDeleteSavedSegmentation = async (segmentationId: string) => {
    if (!segmentationApiService) return;

    try {
      const { uiNotificationService } = servicesManager.services;

      await segmentationApiService.deleteSegmentation(segmentationId);

      if (uiNotificationService) {
        uiNotificationService.show({
          title: 'Segmentation Deleted',
          message: 'Segmentation has been deleted',
          type: 'success',
          duration: 2000,
        });
      }

      // Refresh the list
      await fetchSavedSegmentations();
    } catch (err) {
      console.error('MONAI Label: Failed to delete segmentation', err);
      setError(err instanceof Error ? err.message : 'Failed to delete segmentation');
    }
  };

  // Render status indicator
  const renderStatusIndicator = () => {
    // In on-demand mode the offline state is fully described by the banner
    // below (with an explicit "Avvia" CTA). Showing a second "Server offline"
    // dot here is redundant noise.
    if (onDemandEnabled && serverStatus !== 'online') {
      return null;
    }

    const dotClass =
      serverStatus === 'online' ? 'bg-green-500' :
      serverStatus === 'checking' ? 'bg-muted-foreground/60' :
      'bg-destructive';

    const label =
      serverStatus === 'checking' ? 'Connessione al server in corso...' :
      serverStatus === 'online' ? 'Server online' :
      'Server offline';

    return (
      <div className="mb-3 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-muted-foreground text-sm">{label}</span>
        <button
          onClick={fetchServerInfo}
          className="text-primary hover:text-primary/80 ml-auto text-xs disabled:opacity-50"
          disabled={isLoading}
        >
          Aggiorna
        </button>
      </div>
    );
  };

  // Render segmentation content
  const renderSegmentationTab = () => (
    <>
      {/* Model Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium">Model</label>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          disabled={isRunning}
        >
          {models.map(model => (
            <option
              key={model.name}
              value={model.name}
            >
              {model.name} ({model.type})
            </option>
          ))}
        </select>
      </div>

      {/* Model Info */}
      {selectedModel && (
        <div className="mb-4 rounded bg-gray-800 p-3 text-xs">
          {(() => {
            const model = models.find(m => m.name === selectedModel);
            if (!model) {
              return null;
            }
            return (
              <>
                <p>
                  <strong>Type:</strong> {model.type}
                </p>
                {model.description && (
                  <p>
                    <strong>Description:</strong> {model.description}
                  </p>
                )}
                {model.labels && (
                  <p>
                    <strong>Labels:</strong>{' '}
                    {Object.keys(model.labels).length > 5
                      ? `${Object.keys(model.labels).slice(0, 5).join(', ')}... (+${Object.keys(model.labels).length - 5} more)`
                      : Object.keys(model.labels).join(', ')}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Run Button */}
      <div className="flex gap-2">
        <button
          onClick={handleRunSegmentation}
          disabled={isRunning || !selectedModel || isWaiting}
          className="flex-1 rounded bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Running...
            </span>
          ) : isWaiting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Avvio MONAI...
            </span>
          ) : onDemandEnabled && !isMonaiReady ? (
            'Avvia MONAI e Segmenta'
          ) : (
            'Run Segmentation'
          )}
        </button>
        <button
          onClick={handleResetSegmentation}
          disabled={isRunning}
          className="rounded bg-gray-600 px-4 py-3 font-medium transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:bg-gray-700"
          title="Reset segmentation data"
        >
          Reset
        </button>
      </div>

      {/* In-flight job status */}
      {activeJob && activeJob.status === 'PENDING' && (
        <div className="mt-4 rounded border border-blue-500 bg-blue-900/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-blue-300">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Segmentation in progress...
          </p>
          <p className="mt-1 text-xs text-gray-400">
            The mask will appear automatically when ready.
          </p>
        </div>
      )}

      {/* Last result — the mask is already persisted server-side */}
      {lastResult && !activeJob && (
        <div className="mt-4 rounded border border-green-500 bg-green-900/50 p-3 text-sm">
          <p className="font-medium text-green-400">Segmentation Complete</p>
          <p className="mt-1 text-xs text-gray-300">Segments: {lastResult.segments}</p>
        </div>
      )}

      {/* Saved Segmentations List */}
      {persistenceEnabled && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Saved Segmentations</h3>
            <button
              onClick={fetchSavedSegmentations}
              disabled={isLoadingList}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {isLoadingList ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {savedSegmentations.length === 0 ? (
            <p className="text-xs text-gray-500">No saved segmentations for this series</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {savedSegmentations.map(seg => (
                <div
                  key={seg.segmentationId}
                  className="rounded bg-gray-800 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{seg.modelName}</span>
                    <span className="text-gray-400">
                      {new Date(seg.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-400">
                    {seg.labels.length} segments
                    {seg.labels.length > 0 && (
                      <>
                        {': '}
                        {seg.labels
                          .slice(0, 3)
                          .map(l => l.name)
                          .join(', ')}
                        {seg.labels.length > 3 && ` +${seg.labels.length - 3} more`}
                      </>
                    )}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleLoadSegmentation(seg)}
                      disabled={isLoadingMask}
                      className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium hover:bg-blue-700 disabled:bg-gray-600"
                    >
                      {isLoadingMask ? 'Loading...' : 'Load'}
                    </button>
                    <button
                      onClick={() => handleDeleteSavedSegmentation(seg.segmentationId)}
                      className="rounded bg-red-600/50 px-2 py-1 text-xs font-medium hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tip */}
      <div className="mt-4 text-xs text-gray-400">
        <p>
          <strong>Tip:</strong> For interactive models (DeepEdit/VISTA-3D), select specific labels
          and use point prompts for refinement.
        </p>
      </div>
    </>
  );

  return (
    <div className="p-4 text-white">
      <h2 className="mb-4 text-lg font-semibold">MONAI Label</h2>

      {renderStatusIndicator()}

      {/* On-demand MONAI status banner */}
      {onDemandEnabled && (
        <MonaiOnDemandBanner
          status={onDemandStatus}
          message={onDemandMessage}
          estimatedWaitSeconds={estimatedWaitSeconds}
          isWaiting={isWaiting}
          onStartClick={ensureMonaiRunning}
          isLoading={isCheckingOnDemand}
        />
      )}

      {error && (
        <div className="mb-4 rounded border border-red-500 bg-red-900/50 p-3 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading models...</p>
        </div>
      ) : serverStatus === 'online' ? (
        <>
          {/* Server Info */}
          {serverInfo && (
            <div className="mb-4 rounded bg-gray-800 p-3 text-sm">
              <p>
                <strong>Server:</strong> {serverInfo.name}
              </p>
              <p>
                <strong>Version:</strong> {serverInfo.version}
              </p>
              <p>
                <strong>Models:</strong> {models.length}
              </p>
            </div>
          )}

          {/* Segmentation Content - Active Learning and Options tabs hidden for now */}
          {renderSegmentationTab()}
        </>
      ) : !onDemandEnabled ? (
        // Fallback only for always-on deployments: when the server is
        // genuinely unreachable. In on-demand mode the banner above already
        // explains stopped/starting/error states, so don't duplicate.
        <div className="border-input bg-muted/40 rounded border p-4 text-center">
          <p className="text-foreground text-base font-medium">
            Server MONAI Label irraggiungibile
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Verifica che il server sia attivo al recapito mostrato sopra.
          </p>
          <button
            onClick={fetchServerInfo}
            disabled={isLoading}
            className="bg-primary/60 hover:bg-primary text-primary-foreground mt-3 inline-flex items-center justify-center rounded px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isLoading ? 'Connessione...' : 'Riprova connessione'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default MonaiLabelPanel;
