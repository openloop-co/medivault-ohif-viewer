// Brush tool configuration constants
const MIN_SEGMENTATION_DRAWING_RADIUS = 1;
const MAX_SEGMENTATION_DRAWING_RADIUS = 100;

function createTools({ utilityModule }) {
  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
      },
    ],
    passive: [
      // Brush tools with proper parentTool and configuration
      {
        toolName: 'CircularBrush',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'FILL_INSIDE_CIRCLE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      {
        toolName: 'CircularEraser',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'ERASE_INSIDE_CIRCLE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      {
        toolName: 'SphereBrush',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'FILL_INSIDE_SPHERE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      {
        toolName: 'SphereEraser',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'ERASE_INSIDE_SPHERE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      {
        toolName: 'ThresholdCircularBrush',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      {
        toolName: 'ThresholdSphereBrush',
        parentTool: 'Brush',
        configuration: {
          activeStrategy: 'THRESHOLD_INSIDE_SPHERE',
          minRadius: MIN_SEGMENTATION_DRAWING_RADIUS,
          maxRadius: MAX_SEGMENTATION_DRAWING_RADIUS,
        },
      },
      // Scissors tools
      { toolName: toolNames.CircleScissors },
      { toolName: toolNames.RectangleScissors },
      { toolName: toolNames.SphereScissors },
      // Other tools
      { toolName: toolNames.Magnify },
    ],
    enabled: [
      { toolName: toolNames.SegmentationDisplay },
    ],
    disabled: [
      { toolName: toolNames.ReferenceLines },
    ],
  };

  return tools;
}

function initDefaultToolGroup(
  extensionManager,
  toolGroupService,
  commandsManager,
  toolGroupId
) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const tools = createTools({ utilityModule });
  toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
}

function initVolume3DToolGroup(extensionManager, toolGroupService) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.TrackballRotateTool,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
    ],
  };

  toolGroupService.createToolGroupAndAddTools('volume3d', tools);
}

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  initDefaultToolGroup(
    extensionManager,
    toolGroupService,
    commandsManager,
    'default'
  );
  initDefaultToolGroup(
    extensionManager,
    toolGroupService,
    commandsManager,
    'mpr'
  );
  initVolume3DToolGroup(extensionManager, toolGroupService);
}

export default initToolGroups;
