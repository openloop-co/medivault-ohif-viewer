/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Segmentation utilities for MONAI Label
 * Based on official MONAI Label OHIF plugin
 */

export function currentSegmentsInfo(segmentationService: any): {
  info: Record<string, { segmentIndex: number; color: number[] }>;
  indices: Set<number>;
} {
  const info: Record<string, { segmentIndex: number; color: number[] }> = {};
  const indices = new Set<number>();

  if (!segmentationService) {
    return { info, indices };
  }

  try {
    const segmentations = segmentationService.getSegmentations?.();

    if (!segmentations) {
      return { info, indices };
    }

    // Handle both object and Map types
    let segmentationEntries: [string, any][] = [];

    if (segmentations instanceof Map) {
      segmentationEntries = Array.from(segmentations.entries());
    } else if (typeof segmentations === 'object') {
      segmentationEntries = Object.entries(segmentations);
    }

    if (segmentationEntries.length > 0) {
      // Get first segmentation (either '0', '1', or first available)
      const [, segmentation] = segmentationEntries[0];

      if (segmentation?.config?.segments) {
        const { segments } = segmentation.config;
        for (const segmentIndex of Object.keys(segments)) {
          const segment = segments[segmentIndex];
          if (segment?.label && segment?.segmentIndex !== undefined) {
            info[segment.label] = {
              segmentIndex: segment.segmentIndex,
              color: segment.color || [128, 128, 128, 255],
            };
            indices.add(segment.segmentIndex);
          }
        }
      }
    }
  } catch (e) {
    console.warn('MONAI Label: Error getting segments info:', e);
  }

  return { info, indices };
}
