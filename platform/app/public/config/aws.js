/** @type {AppTypes.Config} */

window.config = {
  routerBasename: null,
  extensions: [],
  modes: [],
  showStudyList: true,
  // below flag is for performance reasons, but it might not work for all servers

  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  // filterQueryParam: false,
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'dcmjs DICOMWeb Server',
        name: 'DCM4CHEE',
        // Something here to check build
        wadoUriRoot: 'https://myserver.com/dicomweb',
        qidoRoot: 'https://myserver.com/dicomweb',
        wadoRoot: 'https://myserver.com/dicomweb',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        staticWado: true,
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  httpErrorHandler: error => {
    // This is 429 when rejected from the public idc sandbox too often.
    console.warn(error.status);

    // Could use services manager here to bring up a dialog/modal if needed.
    console.warn('test, navigate to https://ohif.org/');
  },

  // MediVault API URL for backend services (segmentation persistence, MONAI on-demand control)
  // Will be set dynamically in production
  medivaultApiUrl: 'http://localhost:3001',

  // MONAI Label configuration for AI-assisted segmentation
  monaiLabel: {
    // Server URL - will be set dynamically based on environment
    server: 'http://localhost:8000/',
    // Enable on-demand mode: MONAI starts when needed and auto-stops after idle
    // When enabled, MONAI service status is checked via MediVault API
    onDemandEnabled: true,
    // Function to get authorization header with JWT token
    getAuthorizationHeader: () => {
      // Try to get token from localStorage (set by MediVault frontend)
      const token = localStorage.getItem('medivault_access_token') ||
                    localStorage.getItem('accessToken') ||
                    sessionStorage.getItem('accessToken');
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
      return {};
    },
  },
};
