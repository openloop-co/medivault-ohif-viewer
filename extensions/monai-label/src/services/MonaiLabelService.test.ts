/**
 * Tests for MONAI Label Service
 *
 * @module services/MonaiLabelService.test
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import MonaiLabelService, { MonaiServerInfo, MonaiLabelConfig } from './MonaiLabelService';

// Create mock adapter
let mock: MockAdapter;

const mockServerInfo: MonaiServerInfo = {
  name: 'MediVault MONAI Label',
  version: '1.0.0',
  models: [
    {
      name: 'vista3d',
      type: 'segmentation',
      labels: { liver: 1, spleen: 2 },
      description: 'Multi-organ segmentation',
    },
    {
      name: 'deepedit',
      type: 'deepedit',
      labels: { foreground: 1 },
      description: 'Interactive segmentation',
    },
  ],
};

const createService = (config?: Partial<MonaiLabelConfig>): MonaiLabelService => {
  return new MonaiLabelService({
    server: 'http://localhost:8000',
    ...config,
  });
};

describe('MonaiLabelService', () => {
  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const service = createService();
      expect(service).toBeDefined();
    });

    it('should create service with auth header function', () => {
      const getAuth = jest.fn().mockReturnValue({ Authorization: 'Bearer token' });
      const service = createService({ getAuthorizationHeader: getAuth });
      expect(service).toBeDefined();
    });
  });

  describe('getInfo', () => {
    it('should fetch server info successfully', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();
      const info = await service.getInfo();

      expect(info.name).toBe('MediVault MONAI Label');
      expect(info.models).toHaveLength(2);
    });

    it('should throw error on network failure', async () => {
      mock.onGet('/info').networkError();

      const service = createService();
      await expect(service.getInfo()).rejects.toThrow();
    });

    it('should throw error on server error', async () => {
      mock.onGet('/info').reply(500, { error: 'Internal server error' });

      const service = createService();
      await expect(service.getInfo()).rejects.toThrow();
    });
  });

  describe('getModels', () => {
    it('should return models after fetching info', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();
      const models = await service.getModels();

      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('vista3d');
      expect(models[1].name).toBe('deepedit');
    });

    it('should fetch info if not cached', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();

      // getModels should fetch info internally
      const models = await service.getModels();

      expect(mock.history.get.length).toBe(1);
      expect(models).toHaveLength(2);
    });

    it('should use cached info on subsequent calls', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();

      await service.getInfo();
      await service.getModels();

      // Only one GET request should have been made
      expect(mock.history.get.length).toBe(1);
    });
  });

  describe('runInference', () => {
    // Helper to create mock NRRD data that starts with 'NRRD' magic bytes
    const createMockNrrdData = (size: number = 1024): ArrayBuffer => {
      const buffer = new ArrayBuffer(size);
      const view = new Uint8Array(buffer);
      // Set NRRD magic bytes at the start
      view[0] = 'N'.charCodeAt(0);
      view[1] = 'R'.charCodeAt(0);
      view[2] = 'R'.charCodeAt(0);
      view[3] = 'D'.charCodeAt(0);
      return buffer;
    };

    it('should run inference successfully', async () => {
      const segmentationData = createMockNrrdData();
      const labelInfo = { labels: { liver: 1 }, latencies: { inference: 1.5 } };

      // Mock URL includes query parameter: /infer/vista3d?image=1.2.3.4.5
      mock.onPost(/\/infer\/vista3d/).reply(200, segmentationData, {
        'x-label-info': JSON.stringify(labelInfo),
      });

      const service = createService();
      const result = await service.runInference('vista3d', '1.2.3.4.5');

      expect(result.label).toBeDefined();
      expect(result.label_names).toEqual({ liver: 1 });
      expect(result.latencies).toEqual({ inference: 1.5 });
    });

    it('should include additional params in request', async () => {
      mock.onPost(/\/infer\/vista3d/).reply(config => {
        // Verify FormData contains params
        expect(config.data).toBeDefined();
        return [200, createMockNrrdData(0), {}];
      });

      const service = createService();
      await service.runInference('vista3d', '1.2.3.4.5', {
        label_prompt: ['liver'],
      });

      expect(mock.history.post.length).toBe(1);
    });

    it('should handle missing x-label-info header', async () => {
      mock.onPost(/\/infer\/vista3d/).reply(200, createMockNrrdData(), {});

      const service = createService();
      const result = await service.runInference('vista3d', '1.2.3.4.5');

      expect(result.label_names).toEqual({});
      expect(result.latencies).toEqual({});
    });

    it('should throw error on inference failure', async () => {
      mock.onPost(/\/infer\/vista3d/).reply(500, { error: 'Model failed' });

      const service = createService();
      await expect(service.runInference('vista3d', '1.2.3.4.5')).rejects.toThrow();
    });
  });

  describe('runInteractiveInference', () => {
    // Helper to create mock NRRD data
    const createMockNrrdData = (): ArrayBuffer => {
      const buffer = new ArrayBuffer(16);
      const view = new Uint8Array(buffer);
      view[0] = 'N'.charCodeAt(0);
      view[1] = 'R'.charCodeAt(0);
      view[2] = 'R'.charCodeAt(0);
      view[3] = 'D'.charCodeAt(0);
      return buffer;
    };

    it('should pass foreground and background points', async () => {
      mock.onPost(/\/infer\/deepedit/).reply(200, createMockNrrdData(), {});

      const service = createService();
      const foreground = [[100, 100, 50]];
      const background = [[200, 200, 50]];

      await service.runInteractiveInference('deepedit', '1.2.3.4.5', foreground, background);

      expect(mock.history.post.length).toBe(1);
    });

    it('should work with empty point arrays', async () => {
      mock.onPost(/\/infer\/deepedit/).reply(200, createMockNrrdData(), {});

      const service = createService();
      await service.runInteractiveInference('deepedit', '1.2.3.4.5', [], []);

      expect(mock.history.post.length).toBe(1);
    });
  });

  describe('submitLabel', () => {
    it('should submit label successfully', async () => {
      mock.onPost('/datastore/').reply(200, { status: 'ok' });

      const service = createService();
      const labelData = new ArrayBuffer(1024);

      await service.submitLabel('1.2.3.4.5', labelData, { model: 'vista3d' });

      expect(mock.history.post.length).toBe(1);
    });

    it('should work without label info', async () => {
      mock.onPost('/datastore/').reply(200, { status: 'ok' });

      const service = createService();
      const labelData = new ArrayBuffer(1024);

      await service.submitLabel('1.2.3.4.5', labelData);

      expect(mock.history.post.length).toBe(1);
    });

    it('should throw error on submission failure', async () => {
      mock.onPost('/datastore/').reply(400, { error: 'Invalid label' });

      const service = createService();
      const labelData = new ArrayBuffer(1024);

      await expect(service.submitLabel('1.2.3.4.5', labelData)).rejects.toThrow();
    });
  });

  describe('getNextSample', () => {
    it('should get next sample with default strategy', async () => {
      mock.onPost('/activelearning/').reply(200, { image_id: '1.2.3.4.5' });

      const service = createService();
      const result = await service.getNextSample();

      expect(result.image_id).toBe('1.2.3.4.5');
      expect(mock.history.post.length).toBe(1);
      // Check that request body contains default strategy
      const requestBody = JSON.parse(mock.history.post[0].data);
      expect(requestBody.strategy).toBe('random');
    });

    it('should use specified strategy', async () => {
      mock.onPost('/activelearning/').reply(200, { image_id: '1.2.3.4.5' });

      const service = createService();
      await service.getNextSample('epistemic');

      expect(mock.history.post.length).toBe(1);
      const requestBody = JSON.parse(mock.history.post[0].data);
      expect(requestBody.strategy).toBe('epistemic');
    });
  });

  describe('isAvailable', () => {
    it('should return true when server is available', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();
      const available = await service.isAvailable();

      expect(available).toBe(true);
    });

    it('should return false when server is unavailable', async () => {
      mock.onGet('/info').timeout();

      const service = createService();
      const available = await service.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false on network error', async () => {
      mock.onGet('/info').networkError();

      const service = createService();
      const available = await service.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('authorization header', () => {
    it('should add auth header to requests', async () => {
      const getAuth = jest.fn().mockReturnValue({ Authorization: 'Bearer test-token' });

      // We need to test with the actual interceptor
      // Since axios-mock-adapter doesn't expose interceptor data easily,
      // we verify the function is called
      mock.onGet('/info').reply(() => {
        // The interceptor should have been called
        expect(getAuth).toHaveBeenCalled();
        return [200, mockServerInfo];
      });

      const service = createService({ getAuthorizationHeader: getAuth });
      await service.getInfo();
    });

    it('should work without auth header function', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService(); // No getAuthorizationHeader
      const info = await service.getInfo();

      expect(info).toBeDefined();
    });
  });

  describe('training', () => {
    it('should start training', async () => {
      mock.onPost('/train/').reply(200, { status: 'started' });

      const service = createService();
      await service.startTraining({ max_epochs: 100 });

      expect(mock.history.post.length).toBe(1);
    });

    it('should stop training', async () => {
      mock.onDelete('/train/').reply(200, { status: 'stopped' });

      const service = createService();
      await service.stopTraining();

      expect(mock.history.delete.length).toBe(1);
    });

    it('should check if training is running', async () => {
      mock.onGet('/train/').reply(200, { status: 'running' });

      const service = createService();
      const isRunning = await service.isTrainingRunning();

      expect(isRunning).toBe(true);
    });

    it('should return false when training is not running', async () => {
      mock.onGet('/train/').reply(200, { status: 'idle' });

      const service = createService();
      const isRunning = await service.isTrainingRunning();

      expect(isRunning).toBe(false);
    });

    it('should return false when training check fails', async () => {
      mock.onGet('/train/').networkError();

      const service = createService();
      const isRunning = await service.isTrainingRunning();

      expect(isRunning).toBe(false);
    });
  });

  describe('serverUrl property', () => {
    it('should get the current server URL', () => {
      const service = createService();
      expect(service.serverUrl).toBe('http://localhost:8000');
    });

    it('should set a new server URL', () => {
      const service = createService();
      service.serverUrl = 'http://new-server:9000';

      expect(service.serverUrl).toBe('http://new-server:9000');
    });

    it('should clear cached server info when URL changes', async () => {
      mock.onGet('/info').reply(200, mockServerInfo);

      const service = createService();
      await service.getInfo();

      // Change URL should clear cache
      service.serverUrl = 'http://new-server:9000';

      // Next getModels should fetch info again
      mock.onGet('/info').reply(200, {
        ...mockServerInfo,
        name: 'New Server',
      });

      const models = await service.getModels();
      // Two GET requests should have been made (one before URL change, one after)
      expect(mock.history.get.length).toBe(2);
    });
  });
});

describe('MonaiLabelService error handling', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should handle 401 unauthorized', async () => {
    mock.onGet('/info').reply(401, { error: 'Unauthorized' });

    const service = createService();
    await expect(service.getInfo()).rejects.toThrow();
  });

  it('should handle 403 forbidden', async () => {
    mock.onPost(/\/infer\/vista3d/).reply(403, { error: 'Access denied' });

    const service = createService();
    await expect(service.runInference('vista3d', '1.2.3.4.5')).rejects.toThrow();
  });

  it('should handle timeout', async () => {
    mock.onPost(/\/infer\/vista3d/).timeout();

    const service = createService();
    await expect(service.runInference('vista3d', '1.2.3.4.5')).rejects.toThrow();
  });
});
