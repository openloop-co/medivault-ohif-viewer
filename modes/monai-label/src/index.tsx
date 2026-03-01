import { id } from './id';
import initToolGroups from './initToolGroups';
import toolbarButtons from './toolbarButtons';

// Extension dependencies for MONAI Label mode
const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
  '@ohif/extension-monai-label': '^3.0.0',
};

// Extension IDs
const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
};

const cornerstone = {
  viewport: '@ohif/extension-cornerstone.viewportModule.cornerstone',
  // panelSegmentation is in extension-cornerstone, not cornerstone-dicom-seg
  labelMapSegmentationPanel:
    '@ohif/extension-cornerstone.panelModule.panelSegmentation',
};

const monaiLabel = {
  panel: '@ohif/extension-monai-label.panelModule.monai-label',
};

const segmentation = {
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
  sopClassHandler:
    '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
};

function modeFactory({ modeConfiguration }) {
  return {
    /**
     * Mode ID - unique identifier for this mode
     */
    id,
    routeName: 'monai-label',
    /**
     * Display name shown in mode selector
     */
    displayName: 'MONAI Label',
    /**
     * Called when mode is entered
     */
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }: withAppTypes) => {
      const {
        measurementService,
        toolbarService,
        toolGroupService,
        segmentationService,
      } = servicesManager.services;

      measurementService.clearMeasurements();

      // Initialize tool groups for segmentation
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      // Register toolbar buttons using the new API
      toolbarService.register(toolbarButtons);

      // Configure primary toolbar section
      toolbarService.updateSection(toolbarService.sections.primary, [
        'WindowLevel',
        'Pan',
        'Zoom',
        'Capture',
        'Layout',
        'Crosshairs',
        'MoreTools',
      ]);

      // Configure MoreTools dropdown section
      toolbarService.updateSection('MoreTools', [
        'Reset',
        'rotate-right',
        'flipHorizontal',
        'StackScroll',
        'invert',
        'Cine',
        'Magnify',
        'TagBrowser',
      ]);

      // Configure labelmap segmentation toolbox
      toolbarService.updateSection(toolbarService.sections.labelMapSegmentationToolbox, [
        'LabelMapTools',
      ]);

      toolbarService.updateSection('LabelMapTools', [
        'BrushTools',
        'Shapes',
      ]);

      // Configure brush tools section
      toolbarService.updateSection('BrushTools', ['Brush', 'Eraser', 'Threshold']);
    },
    /**
     * Called when mode is exited
     */
    onModeExit: ({ servicesManager }: withAppTypes) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
      } = servicesManager.services;

      uiDialogService.hideAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },
    /**
     * Validation tags for mode applicability
     */
    validationTags: {
      study: [],
      series: [],
    },
    /**
     * Check if mode is valid for given modalities
     */
    isValidMode: ({ modalities }) => {
      const modalitiesArray = modalities.split('\\');
      // MONAI Label works best with volumetric data (CT, MR, PT)
      // Exclude slide microscopy, ECG, documents
      return {
        valid:
          modalitiesArray.length === 1
            ? !['SM', 'ECG', 'OT', 'DOC'].includes(modalitiesArray[0])
            : true,
        description:
          'MONAI Label mode does not support studies that ONLY include: SM, ECG, OT, DOC modalities',
      };
    },
    /**
     * Mode routes define the layout
     */
    routes: [
      {
        path: 'template',
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [ohif.thumbnailList],
              leftPanelResizable: true,
              rightPanels: [
                monaiLabel.panel, // MONAI Label panel
                cornerstone.labelMapSegmentationPanel, // Segmentation panel
              ],
              rightPanelResizable: true,
              viewports: [
                {
                  namespace: cornerstone.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: segmentation.viewport,
                  displaySetsToDisplay: [segmentation.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    /** Extensions used by this mode */
    extensions: extensionDependencies,
    /** Hanging protocol */
    hangingProtocol: ['@ohif/mnGrid'],
    /** SOP Class handlers */
    sopClassHandlers: [ohif.sopClassHandler, segmentation.sopClassHandler],
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
