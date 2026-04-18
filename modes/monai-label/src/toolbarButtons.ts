import type { Button } from '@ohif/core/types';
import i18n from 'i18next';

// Brush tool configuration constants
const MIN_SEGMENTATION_DRAWING_RADIUS = 1;
const MAX_SEGMENTATION_DRAWING_RADIUS = 100;

const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'volume3d'],
  },
};

export const toolbarButtons: Button[] = [
  // Primary toolbar tools
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level',
      label: i18n.t('Buttons:Window Level'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-move',
      label: i18n.t('Buttons:Pan'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Zoom',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-zoom',
      label: i18n.t('Buttons:Zoom'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Capture',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture',
      label: i18n.t('Buttons:Capture'),
      commands: 'showDownloadViewportModal',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Layout',
    uiType: 'ohif.layoutSelector',
    props: {
      rows: 3,
      columns: 4,
      evaluate: 'evaluate.action',
      commands: 'setViewportGridLayout',
    },
  },
  {
    id: 'Crosshairs',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-crosshair',
      label: i18n.t('Buttons:Crosshairs'),
      commands: {
        commandName: 'setToolActiveToolbar',
        commandOptions: {
          toolGroupIds: ['mpr'],
        },
      },
      evaluate: {
        name: 'evaluate.cornerstoneTool',
        disabledText: i18n.t('Buttons:Select an MPR viewport to enable this tool'),
      },
    },
  },
  // Section containers
  {
    id: 'MoreTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
    },
  },
  {
    id: 'BrushTools',
    uiType: 'ohif.toolBoxButtonGroup',
    props: {
      buttonSection: true,
    },
  },
  {
    id: 'LabelMapTools',
    uiType: 'ohif.toolBoxButtonGroup',
    props: {
      buttonSection: true,
    },
  },
  // Additional tools for MoreTools section
  {
    id: 'Reset',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-reset',
      label: i18n.t('Buttons:Reset View'),
      tooltip: i18n.t('Buttons:Reset View'),
      commands: 'resetViewport',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'rotate-right',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rotate-right',
      label: i18n.t('Buttons:Rotate Right'),
      tooltip: i18n.t('Buttons:Rotate +90'),
      commands: 'rotateViewportCW',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'flipHorizontal',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: i18n.t('Buttons:Flip Horizontal'),
      tooltip: i18n.t('Buttons:Flip Horizontally'),
      commands: 'flipViewportHorizontal',
      evaluate: 'evaluate.viewportProperties.toggle',
    },
  },
  {
    id: 'StackScroll',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-stack-scroll',
      label: i18n.t('Buttons:Stack Scroll'),
      tooltip: i18n.t('Buttons:Stack Scroll'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Magnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-magnify',
      label: i18n.t('Buttons:Zoom-in'),
      tooltip: i18n.t('Buttons:Zoom-in'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Cine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-cine',
      label: i18n.t('Buttons:Cine'),
      tooltip: i18n.t('Buttons:Cine'),
      commands: 'toggleCine',
      evaluate: 'evaluate.cine',
    },
  },
  {
    id: 'invert',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-invert',
      label: i18n.t('Buttons:Invert'),
      tooltip: i18n.t('Buttons:Invert Colors'),
      commands: 'invertViewport',
      evaluate: 'evaluate.viewportProperties.toggle',
    },
  },
  {
    id: 'TagBrowser',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'dicom-tag-browser',
      label: i18n.t('Buttons:Dicom Tag Browser'),
      tooltip: i18n.t('Buttons:Dicom Tag Browser'),
      commands: 'openDICOMTagViewer',
    },
  },
  // Segmentation brush tools
  {
    id: 'Brush',
    uiType: 'ohif.toolBoxButton',
    props: {
      icon: 'icon-tool-brush',
      label: i18n.t('Buttons:Brush'),
      evaluate: [
        {
          name: 'evaluate.cornerstone.segmentation',
          toolNames: ['CircularBrush', 'SphereBrush'],
          disabledText: i18n.t('Buttons:Create new segmentation to enable this tool.'),
        },
        {
          name: 'evaluate.cornerstone.segmentation.synchronizeDrawingRadius',
          radiusOptionId: 'brush-radius',
        },
        {
          name: 'evaluate.cornerstone.hasSegmentationOfType',
          segmentationRepresentationType: 'Labelmap',
        },
      ],
      commands: {
        commandName: 'activateSelectedSegmentationOfType',
        commandOptions: {
          segmentationRepresentationType: 'Labelmap',
        },
      },
      options: [
        {
          name: 'Radius (mm)',
          id: 'brush-radius',
          type: 'range',
          explicitRunOnly: true,
          min: MIN_SEGMENTATION_DRAWING_RADIUS,
          max: MAX_SEGMENTATION_DRAWING_RADIUS,
          step: 0.5,
          value: 25,
          commands: [
            {
              commandName: 'setBrushSize',
              commandOptions: { toolNames: ['CircularBrush', 'SphereBrush'] },
            },
          ],
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'brush-mode',
          value: 'CircularBrush',
          values: [
            { value: 'CircularBrush', label: 'Circle' },
            { value: 'SphereBrush', label: 'Sphere' },
          ],
          commands: ['setToolActiveToolbar'],
        },
      ],
    },
  },
  {
    id: 'Eraser',
    uiType: 'ohif.toolBoxButton',
    props: {
      icon: 'icon-tool-eraser',
      label: i18n.t('Buttons:Eraser'),
      evaluate: [
        {
          name: 'evaluate.cornerstone.segmentation',
          toolNames: ['CircularEraser', 'SphereEraser'],
        },
        {
          name: 'evaluate.cornerstone.segmentation.synchronizeDrawingRadius',
          radiusOptionId: 'eraser-radius',
        },
        {
          name: 'evaluate.cornerstone.hasSegmentationOfType',
          segmentationRepresentationType: 'Labelmap',
        },
      ],
      options: [
        {
          name: 'Radius (mm)',
          id: 'eraser-radius',
          type: 'range',
          explicitRunOnly: true,
          min: MIN_SEGMENTATION_DRAWING_RADIUS,
          max: MAX_SEGMENTATION_DRAWING_RADIUS,
          step: 0.5,
          value: 25,
          commands: {
            commandName: 'setBrushSize',
            commandOptions: { toolNames: ['CircularEraser', 'SphereEraser'] },
          },
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'eraser-mode',
          value: 'CircularEraser',
          values: [
            { value: 'CircularEraser', label: 'Circle' },
            { value: 'SphereEraser', label: 'Sphere' },
          ],
          commands: 'setToolActiveToolbar',
        },
      ],
      commands: {
        commandName: 'activateSelectedSegmentationOfType',
        commandOptions: {
          segmentationRepresentationType: 'Labelmap',
        },
      },
    },
  },
  {
    id: 'Threshold',
    uiType: 'ohif.toolBoxButton',
    props: {
      icon: 'icon-tool-threshold',
      label: 'Threshold Tool',
      evaluate: [
        {
          name: 'evaluate.cornerstone.segmentation',
          toolNames: ['ThresholdCircularBrush', 'ThresholdSphereBrush'],
        },
        {
          name: 'evaluate.cornerstone.segmentation.synchronizeDrawingRadius',
          radiusOptionId: 'threshold-radius',
        },
        {
          name: 'evaluate.cornerstone.hasSegmentationOfType',
          segmentationRepresentationType: 'Labelmap',
        },
      ],
      commands: {
        commandName: 'activateSelectedSegmentationOfType',
        commandOptions: {
          segmentationRepresentationType: 'Labelmap',
        },
      },
      options: [
        {
          name: 'Radius (mm)',
          id: 'threshold-radius',
          type: 'range',
          explicitRunOnly: true,
          min: MIN_SEGMENTATION_DRAWING_RADIUS,
          max: MAX_SEGMENTATION_DRAWING_RADIUS,
          step: 0.5,
          value: 25,
          commands: {
            commandName: 'setBrushSize',
            commandOptions: {
              toolNames: ['ThresholdCircularBrush', 'ThresholdSphereBrush'],
            },
          },
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'threshold-shape',
          value: 'ThresholdCircularBrush',
          values: [
            { value: 'ThresholdCircularBrush', label: 'Circle' },
            { value: 'ThresholdSphereBrush', label: 'Sphere' },
          ],
          commands: 'setToolActiveToolbar',
        },
      ],
    },
  },
  // Shape tools for segmentation
  {
    id: 'Shapes',
    uiType: 'ohif.toolBoxButton',
    props: {
      icon: 'icon-tool-shape',
      label: i18n.t('Buttons:Shapes'),
      evaluate: [
        {
          name: 'evaluate.cornerstone.segmentation',
          toolNames: ['CircleScissor', 'SphereScissor', 'RectangleScissor'],
          disabledText: i18n.t('Buttons:Create new segmentation to enable shapes tool.'),
        },
        {
          name: 'evaluate.cornerstone.hasSegmentationOfType',
          segmentationRepresentationType: 'Labelmap',
        },
      ],
      commands: {
        commandName: 'activateSelectedSegmentationOfType',
        commandOptions: {
          segmentationRepresentationType: 'Labelmap',
        },
      },
      options: [
        {
          name: 'Shape',
          type: 'radio',
          value: 'CircleScissor',
          id: 'shape-mode',
          values: [
            { value: 'CircleScissor', label: 'Circle' },
            { value: 'SphereScissor', label: 'Sphere' },
            { value: 'RectangleScissor', label: 'Rectangle' },
          ],
          commands: 'setToolActiveToolbar',
        },
      ],
    },
  },
];

export default toolbarButtons;
