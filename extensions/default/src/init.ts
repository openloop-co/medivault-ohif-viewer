import { DicomMetadataStore, classes } from '@ohif/core';
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';

import getPTImageIdInstanceMetadata from './getPTImageIdInstanceMetadata';
import { registerHangingProtocolAttributes } from './hangingprotocols';
import { HotkeysManager } from '@ohif/core';

const metadataProvider = classes.MetadataProvider;

// Extend Window interface for MediVault config
declare global {
  interface Window {
    config?: {
      // MediVault auth configuration for DICOMweb
      medivaultAuth?: {
        getAuthorizationHeader?: () => Record<string, string>;
      };
      // MONAI Label configuration
      monaiLabel?: {
        server?: string;
        getAuthorizationHeader?: () => Record<string, string>;
        autoFetchModels?: boolean;
        enabled?: boolean;
      };
      // MediVault backend API URL for segmentation persistence
      medivaultApiUrl?: string;
    };
  }
}

/**
 * Configure UserAuthenticationService to read token from localStorage.
 * This enables DICOMweb requests to include the Authorization header.
 *
 * MediVault uses a Lambda authorizer with Bearer token for AWS HealthImaging.
 * The token is stored in localStorage by react-oidc-context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configureUserAuthenticationService = (servicesManager: any) => {
  const { userAuthenticationService } = servicesManager.services;

  if (!userAuthenticationService) {
    console.warn('MediVault: UserAuthenticationService not found');
    return;
  }

  // Get auth header function from config (set by app-config.js)
  const getAuthorizationHeader = window.config?.medivaultAuth?.getAuthorizationHeader;

  if (!getAuthorizationHeader) {
    console.log('MediVault: No medivaultAuth configured (standalone mode)');
    return;
  }

  // Configure the service to use our custom auth header function
  userAuthenticationService.setServiceImplementation({
    getAuthorizationHeader: () => {
      const headers = getAuthorizationHeader();
      console.log('MediVault: Auth headers for DICOMweb', headers ? 'present' : 'missing');
      return headers;
    },
  });

  console.log('MediVault: UserAuthenticationService configured for DICOMweb');
};

/**
 *
 * @param {Object} servicesManager
 * @param {Object} configuration
 */
export default function init({
  servicesManager,
  commandsManager,
  hotkeysManager,
}: withAppTypes): void {
  // Configure MediVault authentication for DICOMweb requests
  configureUserAuthenticationService(servicesManager);

  const { toolbarService, cineService, viewportGridService } = servicesManager.services;

  toolbarService.registerEventForToolbarUpdate(cineService, [
    cineService.EVENTS.CINE_STATE_CHANGED,
  ]);

  toolbarService.registerEventForToolbarUpdate(hotkeysManager, [
    HotkeysManager.EVENTS.HOTKEY_PRESSED,
  ]);

  // Add
  DicomMetadataStore.subscribe(DicomMetadataStore.EVENTS.INSTANCES_ADDED, handleScalingModules);

  // If the metadata for PET has changed by the user (e.g. manually changing the PatientWeight)
  // we need to recalculate the SUV Scaling Factors
  DicomMetadataStore.subscribe(DicomMetadataStore.EVENTS.SERIES_UPDATED, handleScalingModules);

  // Adds extra custom attributes for use by hanging protocols
  registerHangingProtocolAttributes({ servicesManager });

  // Function to process and subscribe to events for a given set of commands and listeners
  const eventSubscriptions = [];
  const subscribeToEvents = listeners => {
    Object.entries(listeners).forEach(([event, commands]) => {
      const supportedEvents = [
        viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
        viewportGridService.EVENTS.VIEWPORTS_READY,
      ];

      if (supportedEvents.includes(event)) {
        const subscriptionKey = `${event}_${JSON.stringify(commands)}`;

        if (eventSubscriptions.includes(subscriptionKey)) {
          return;
        }

        viewportGridService.subscribe(event, eventData => {
          const viewportId = eventData?.viewportId ?? viewportGridService.getActiveViewportId();

          commandsManager.run(commands, { viewportId });
        });

        eventSubscriptions.push(subscriptionKey);
      }
    });
  };

  toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, state => {
    const { buttons } = state;
    for (const [id, button] of Object.entries(buttons)) {
      const { buttonSection, items, listeners } = button.props || {};

      // Handle group items' listeners
      if (buttonSection && items) {
        items.forEach(item => {
          if (item.listeners) {
            subscribeToEvents(item.listeners);
          }
        });
      }

      // Handle button listeners
      if (listeners) {
        subscribeToEvents(listeners);
      }
    }
  });
}

const handleScalingModules = ({ SeriesInstanceUID, StudyInstanceUID }) => {
  const { instances } = DicomMetadataStore.getSeries(StudyInstanceUID, SeriesInstanceUID);

  if (!instances?.length) {
    return;
  }

  const modality = instances[0].Modality;

  const allowedModality = ['PT', 'RTDOSE'];

  if (!allowedModality.includes(modality)) {
    return;
  }

  const imageIds = instances.map(instance => instance.imageId);
  const instanceMetadataArray = [];

  if (modality === 'RTDOSE') {
    const DoseGridScaling = instances[0].DoseGridScaling;
    const DoseSummation = instances[0].DoseSummation;
    const DoseType = instances[0].DoseType;
    const DoseUnit = instances[0].DoseUnit;
    const NumberOfFrames = instances[0].NumberOfFrames;
    const imageId = imageIds[0];

    // add scaling module to the metadata
    // since RTDOSE is always a multiframe we should add the scaling module to each frame
    for (let i = 0; i < NumberOfFrames; i++) {
      const frameIndex = i + 1;

      // Todo: we should support other things like wadouri, local etc
      const newImageId = `${imageId.replace(/\/frames\/\d+$/, '')}/frames/${frameIndex}`;
      metadataProvider.addCustomMetadata(newImageId, 'scalingModule', {
        DoseGridScaling,
        DoseSummation,
        DoseType,
        DoseUnit,
      });
    }

    return;
  }

  // try except block to prevent errors when the metadata is not correct
  try {
    imageIds.forEach(imageId => {
      const instanceMetadata = getPTImageIdInstanceMetadata(imageId);
      if (instanceMetadata) {
        instanceMetadataArray.push(instanceMetadata);
      }
    });

    if (!instanceMetadataArray.length) {
      return;
    }

    const suvScalingFactors = calculateSUVScalingFactors(instanceMetadataArray);
    instanceMetadataArray.forEach((instanceMetadata, index) => {
      metadataProvider.addCustomMetadata(
        imageIds[index],
        'scalingModule',
        suvScalingFactors[index]
      );
    });
  } catch (error) {
    console.log(error);
  }
};
