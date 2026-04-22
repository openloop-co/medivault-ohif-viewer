/**
 * Tests for MONAI Label Service stub.
 * After the async refactor, MonaiLabelService no longer makes HTTP calls —
 * it surfaces a static model catalog to the panel and rejects direct
 * inference attempts so callers are forced onto SegmentationApiService.
 */

import MonaiLabelService, {
  MonaiLabelError,
  MonaiModel,
} from './MonaiLabelService';

describe('MonaiLabelService (stub)', () => {
  const models: MonaiModel[] = [
    {
      name: 'wholeBody_ct_segmentation',
      type: 'segmentation',
      labels: { liver: 1, spleen: 2 },
    },
  ];

  it('returns the configured model catalog from getInfo', async () => {
    const service = new MonaiLabelService({ models });
    const info = await service.getInfo();

    expect(info.models).toEqual(models);
    expect(info.name).toBe('MediVault MONAI');
  });

  it('caches getInfo result across calls', async () => {
    const service = new MonaiLabelService({ models });
    const first = await service.getInfo();
    const second = await service.getInfo();
    expect(first).toBe(second);
  });

  it('getModels surfaces the same catalog', async () => {
    const service = new MonaiLabelService({ models });
    const result = await service.getModels();
    expect(result).toEqual(models);
  });

  it('isAvailable is true when a catalog is configured', async () => {
    const service = new MonaiLabelService({ models });
    await expect(service.isAvailable()).resolves.toBe(true);
  });

  it('isAvailable is false when the catalog is empty', async () => {
    const service = new MonaiLabelService({ models: [] });
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('runInference throws — direct inference is disabled', async () => {
    const service = new MonaiLabelService({ models });
    await expect(service.runInference()).rejects.toBeInstanceOf(MonaiLabelError);
  });
});
