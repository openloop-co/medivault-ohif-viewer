import { addTool } from '@cornerstonejs/tools';
import { MonaiLabelService } from './services/MonaiLabelService';
import { SegmentationApiService } from './services/SegmentationApiService';
import ProbeMONAILabelTool from './tools/ProbeMONAILabelTool';

// Window interface extension is in extension-default/src/init.ts

/**
 * Pre-registration hook for MONAI Label extension
 *
 * This is called before the extension is registered, allowing us to
 * initialize the MONAI Label service based on configuration.
 *
 * Note: DICOMweb authentication is handled by extension-default, which configures
 * userAuthenticationService for ALL modes including the standard viewer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const preRegistration = ({ servicesManager, configuration }: { servicesManager: any; configuration: any }) => {
  // Register the ProbeMONAILabel tool for interactive segmentation
  try {
    addTool(ProbeMONAILabelTool);
    console.log('MONAI Label: ProbeMONAILabel tool registered');
  } catch (e) {
    console.warn('MONAI Label: ProbeMONAILabel tool may already be registered', e);
  }

  // Get MONAI Label configuration from OHIF config
  const monaiLabelConfig = window.config?.monaiLabel;

  if (!monaiLabelConfig?.server) {
    console.log('MONAI Label: No server configured, extension will be inactive');
    return;
  }

  // Create MONAI Label service instance
  const monaiLabelService = new MonaiLabelService({
    server: monaiLabelConfig.server,
    getAuthorizationHeader: monaiLabelConfig.getAuthorizationHeader,
  });

  // Register service with services manager
  servicesManager.registerService({
    name: 'monaiLabelService',
    altName: 'MonaiLabelService',
    create: () => monaiLabelService,
  });

  console.log('MONAI Label: Service registered', {
    server: monaiLabelConfig.server,
    authEnabled: !!monaiLabelConfig.getAuthorizationHeader,
  });

  // Register Segmentation API service for persistence
  const medivaultApiUrl = window.config?.medivaultApiUrl;
  if (medivaultApiUrl) {
    const segmentationApiService = new SegmentationApiService({
      apiUrl: medivaultApiUrl,
      getAuthorizationHeader: monaiLabelConfig.getAuthorizationHeader,
    });

    servicesManager.registerService({
      name: 'segmentationApiService',
      altName: 'SegmentationApiService',
      create: () => segmentationApiService,
    });

    console.log('MONAI Label: Segmentation API service registered', {
      apiUrl: medivaultApiUrl,
    });
  } else {
    console.log('MONAI Label: Segmentation persistence disabled (no medivaultApiUrl configured)');
  }

  // Check server availability on startup
  monaiLabelService.isAvailable().then(available => {
    if (available) {
      console.log('MONAI Label: Server is available');
      // Pre-fetch server info
      monaiLabelService.getInfo().then(info => {
        console.log('MONAI Label: Server info', info);
      });
    } else {
      console.warn('MONAI Label: Server is not available at', monaiLabelConfig.server);
    }
  });
};

export default preRegistration;
