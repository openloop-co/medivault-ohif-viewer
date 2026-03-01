/**
 * MONAI Label Commands Module
 *
 * Based on the official MONAI Label OHIF v3 plugin implementation.
 * https://github.com/Project-MONAI/MONAILabel/tree/main/plugins/ohifv3
 */

import { MonaiLabelService, InferenceResult } from './services/MonaiLabelService';
import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import SegmentationReader from './utils/SegmentationReader';
import { getLabelColor } from './utils/GenericUtils';

const LABELMAP = csToolsEnums.SegmentationRepresentations.Labelmap;
const SEGMENTATION_ID = '1'; // Fixed ID like official plugin

// Color type matching getLabelColor return type
type SegmentColor =
  | number[]
  | [number, number, number, number]
  | { r: number; g: number; b: number }
  | string
  | null;

interface SegmentConfig {
  segmentIndex: number;
  label: string;
  active: boolean;
  locked: boolean;
  color: SegmentColor;
}

const getCommandsModule = ({
  servicesManager,
  commandsManager,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  servicesManager: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commandsManager: any;
}) => {
  const { segmentationService, viewportGridService, displaySetService } = servicesManager.services;

  const actions = {
    /**
     * Initialize segmentation for MONAI Label
     * Creates a labelmap segmentation if one doesn't exist
     */
    initMonaiSegmentation: async ({ labels }: { labels: string[] }) => {
      try {
        console.log('MONAI Label: Initializing segmentation with labels:', labels);

        // Check if segmentation already exists
        const existingSegmentation = segmentationService.getSegmentation(SEGMENTATION_ID);
        if (existingSegmentation) {
          console.log('MONAI Label: Segmentation already exists');
          return { segmentationId: SEGMENTATION_ID };
        }

        // Build segments configuration
        const segments = labels.reduce(
          (acc, label, index) => {
            const segmentIndex = index + 1; // Start from 1 (0 is background)
            acc[segmentIndex] = {
              segmentIndex,
              label,
              active: index === 0,
              locked: false,
              color: getLabelColor(label),
            };
            return acc;
          },
          {} as Record<number, SegmentConfig>
        );

        // Create segmentation configuration
        const segmentations = [
          {
            segmentationId: SEGMENTATION_ID,
            representation: {
              type: LABELMAP,
            },
            config: {
              label: 'Segmentations',
              segments,
            },
          },
        ];

        // Load segmentation for viewport
        await commandsManager.runCommand('loadSegmentationsForViewport', {
          segmentations,
        });

        console.log('MONAI Label: Segmentation initialized');
        return { segmentationId: SEGMENTATION_ID };
      } catch (error) {
        console.error('MONAI Label: Failed to initialize segmentation', error);
        throw error;
      }
    },

    /**
     * Create/update segmentation from MONAI Label inference result
     * Uses OHIF's proper segmentation creation API
     */
    createSegmentationFromMonaiResult: async ({
      result,
      displaySetUID,
      labels,
      modelLabelToIdxMap,
      override = false,
    }: {
      result: InferenceResult;
      displaySetUID: string;
      labels?: string[];
      modelLabelToIdxMap?: Record<string, number>;
      override?: boolean;
    }) => {
      try {
        console.log('MONAI Label: Processing inference result');

        // Parse NRRD data
        const parsed = SegmentationReader.parseNrrdData(result.label);
        if (!parsed) {
          throw new Error('Failed to parse NRRD data');
        }

        // Get raw data as Uint8Array (segmentation masks are typically uint8)
        const data = new Uint8Array(parsed.image);

        console.log('MONAI Label: NRRD parsed', {
          encoding: parsed.header.encoding,
          type: parsed.header.type,
          sizes: parsed.header.sizes,
          dataLength: data.length,
        });

        // Count non-zero voxels for debugging
        let nonZeroCount = 0;
        const uniqueValues = new Set<number>();
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== 0) {
            nonZeroCount++;
            uniqueValues.add(data[i]);
          }
        }
        console.log(
          'MONAI Label: Non-zero voxels:',
          nonZeroCount,
          'Unique values:',
          Array.from(uniqueValues)
        );

        if (nonZeroCount === 0) {
          console.warn('MONAI Label: Segmentation result is empty (no non-zero voxels)');
        }

        // Get label names from result or use provided labels
        const labelNames = labels || Object.keys(result.label_names || {});
        console.log('MONAI Label: Labels:', labelNames);

        // Get current segments info
        const currentSegs = getCurrentSegmentsInfo(segmentationService);
        const modelToSegMapping: Record<number, number> = { 0: 0 };

        // Build index mapping
        let tmpIdx = 1;
        for (const label of labelNames) {
          const existingSeg = currentSegs.info[label];
          let segmentIndex: number;

          if (existingSeg) {
            segmentIndex = existingSeg.segmentIndex;
          } else {
            for (let i = 1; i <= 255; i++) {
              if (!currentSegs.indices.has(i)) {
                segmentIndex = i;
                currentSegs.indices.add(i);
                break;
              }
            }
          }

          const modelIdx = modelLabelToIdxMap?.[label] ?? result.label_names?.[label] ?? tmpIdx;
          modelToSegMapping[modelIdx] = segmentIndex!;
          tmpIdx++;
        }

        console.log('MONAI Label: Index mapping:', modelToSegMapping);

        // Try to get existing labelmap volume
        let labelmapVolume = null;
        try {
          labelmapVolume = segmentationService.getLabelmapVolume(SEGMENTATION_ID);
        } catch (e) {
          console.log('MONAI Label: No existing labelmap volume');
        }

        // Create labelmap if it doesn't exist
        if (!labelmapVolume) {
          console.log('MONAI Label: Creating new labelmap...');

          // Get the display set
          const displaySet = displaySetService.getDisplaySetByUID(displaySetUID);
          if (!displaySet) {
            throw new Error('Display set not found');
          }

          // Build segments configuration
          const segments: Record<number, SegmentConfig> = {};
          labelNames.forEach((label, idx) => {
            const segIdx = modelToSegMapping[idx + 1] || idx + 1;
            segments[segIdx] = {
              segmentIndex: segIdx,
              label: label,
              active: idx === 0,
              locked: false,
              color: getLabelColor(label),
            };
          });

          // Create labelmap using OHIF's proper API
          await segmentationService.createLabelmapForDisplaySet(displaySet, {
            segmentationId: SEGMENTATION_ID,
            segments,
            label: 'MONAI Segmentation',
          });

          // Add representation to active viewport
          const { activeViewportId } = viewportGridService.getState();
          if (activeViewportId) {
            await segmentationService.addSegmentationRepresentation(activeViewportId, {
              segmentationId: SEGMENTATION_ID,
              type: LABELMAP,
            });
          }

          // Wait for initialization
          await new Promise(resolve => setTimeout(resolve, 500));

          // Get the newly created volume
          labelmapVolume = segmentationService.getLabelmapVolume(SEGMENTATION_ID);
        }

        if (!labelmapVolume) {
          throw new Error('Could not create labelmap volume');
        }

        console.log('MONAI Label: Got labelmap volume:', labelmapVolume);

        // Convert data using mapping
        let convertedData = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          const modelIdx = data[i];
          const segIdx = modelToSegMapping[modelIdx];
          if (modelIdx && segIdx !== undefined) {
            convertedData[i] = segIdx;
          } else if (override && labelNames.length === 1) {
            convertedData[i] = modelIdx ? modelToSegMapping[1] || 1 : 0;
          } else {
            convertedData[i] = 0;
          }
        }

        // Set the data
        const { voxelManager } = labelmapVolume;
        if (voxelManager) {
          const existingData = voxelManager.getCompleteScalarDataArray();

          // Handle size mismatch
          if (existingData?.length !== convertedData.length) {
            console.warn(
              'MONAI Label: Size mismatch:',
              existingData?.length,
              'vs',
              convertedData.length
            );
            const adjustedData = new Uint8Array(existingData.length);
            const minLength = Math.min(existingData.length, convertedData.length);
            adjustedData.set(convertedData.subarray(0, minLength));
            convertedData = adjustedData;
          }

          if (override && existingData) {
            const mergedData = new Uint8Array(existingData.length);
            mergedData.set(existingData);
            for (let i = 0; i < convertedData.length; i++) {
              if (convertedData[i] !== 0) {
                mergedData[i] = convertedData[i];
              }
            }
            voxelManager.setCompleteScalarDataArray(mergedData);
          } else {
            voxelManager.setCompleteScalarDataArray(convertedData);
          }

          triggerEvent(eventTarget, csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED, {
            segmentationId: SEGMENTATION_ID,
          });

          console.log('MONAI Label: Segmentation data updated');
        } else {
          console.error('MONAI Label: VoxelManager not available');
        }

        return {
          segmentationId: SEGMENTATION_ID,
          segments: labelNames.length,
        };
      } catch (error) {
        console.error('MONAI Label: Failed to create segmentation', error);
        throw error;
      }
    },

    /**
     * Run MONAI Label inference
     */
    runMonaiInference: async ({
      modelName,
      imageId,
      foregroundPoints,
      backgroundPoints,
    }: {
      modelName: string;
      imageId: string;
      foregroundPoints?: number[][];
      backgroundPoints?: number[][];
    }) => {
      const monaiService = servicesManager.services.monaiLabelService as MonaiLabelService;

      if (!monaiService) {
        throw new Error('MONAI Label service not configured');
      }

      if (foregroundPoints || backgroundPoints) {
        return monaiService.runInteractiveInference(
          modelName,
          imageId,
          foregroundPoints || [],
          backgroundPoints || []
        );
      }

      return monaiService.runInference(modelName, imageId);
    },

    /**
     * Submit current segmentation for active learning
     */
    submitMonaiLabel: async ({
      imageId,
      segmentationId,
    }: {
      imageId: string;
      segmentationId: string;
    }) => {
      const monaiService = servicesManager.services.monaiLabelService as MonaiLabelService;

      if (!monaiService) {
        throw new Error('MONAI Label service not configured');
      }

      const segmentation = segmentationService.getSegmentation(segmentationId);
      if (!segmentation) {
        throw new Error('Segmentation not found');
      }

      // Get labelmap data
      const volumeLoadObject = segmentationService.getLabelmapVolume(segmentationId);
      if (!volumeLoadObject?.voxelManager) {
        throw new Error('Labelmap volume not found');
      }

      const scalarData = volumeLoadObject.voxelManager.getCompleteScalarDataArray();
      const labelData = new Uint8Array(scalarData).buffer;

      await monaiService.submitLabel(imageId, labelData, {
        segmentationId,
        timestamp: new Date().toISOString(),
      });

      console.log('MONAI Label: Label submitted for training');
    },

    /**
     * Get next sample for active learning
     */
    getNextMonaiSample: async ({ strategy = 'random' }: { strategy?: string }) => {
      const monaiService = servicesManager.services.monaiLabelService as MonaiLabelService;

      if (!monaiService) {
        throw new Error('MONAI Label service not configured');
      }

      return monaiService.getNextSample(strategy);
    },
  };

  const definitions = {
    initMonaiSegmentation: {
      commandFn: actions.initMonaiSegmentation,
    },
    createSegmentationFromMonaiResult: {
      commandFn: actions.createSegmentationFromMonaiResult,
    },
    runMonaiInference: {
      commandFn: actions.runMonaiInference,
    },
    submitMonaiLabel: {
      commandFn: actions.submitMonaiLabel,
    },
    getNextMonaiSample: {
      commandFn: actions.getNextMonaiSample,
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'MONAILABEL',
  };
};

/**
 * Get current segments info from segmentation service
 * Based on official SegUtils.js
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCurrentSegmentsInfo(segmentationService: any): {
  info: Record<string, { segmentIndex: number; color: number[] }>;
  indices: Set<number>;
} {
  const info: Record<string, { segmentIndex: number; color: number[] }> = {};
  const indices = new Set<number>();

  const segmentations = segmentationService.getSegmentations();
  if (segmentations && Object.keys(segmentations).length > 0) {
    const segmentation = segmentations['0'] || segmentations[SEGMENTATION_ID];
    if (segmentation?.config?.segments) {
      const { segments } = segmentation.config;
      for (const segmentIndex of Object.keys(segments)) {
        const segment = segments[segmentIndex];
        info[segment.label] = {
          segmentIndex: segment.segmentIndex,
          color: segment.color,
        };
        indices.add(segment.segmentIndex);
      }
    }
  }
  return { info, indices };
}

export default getCommandsModule;
