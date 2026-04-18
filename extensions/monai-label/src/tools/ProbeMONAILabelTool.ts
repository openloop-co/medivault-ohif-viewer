/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Probe tool for MONAI Label interactive segmentation
 * Based on official MONAI Label OHIF plugin
 */

import { ProbeTool, annotation, drawing, Types } from '@cornerstonejs/tools';

const { getAnnotations } = annotation.state;

interface StyleSpecifier {
  toolGroupId: string;
  toolName: string;
  viewportId: string;
  annotationUID?: string;
}

export default class ProbeMONAILabelTool extends ProbeTool {
  static toolName = 'ProbeMONAILabel';

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        customColor: undefined,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  renderAnnotation = (enabledElement: any, svgDrawingHelper: any): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(element, annotations);

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotationData = annotations[i] as Types.Annotation;
      const annotationUID = annotationData.annotationUID;
      const data = annotationData.data as { handles: { points: number[][] } };
      const point = data.handles.points[0];
      const canvasCoordinates = viewport.worldToCanvas(point);

      styleSpecifier.annotationUID = annotationUID;

      const color =
        (this.configuration as any)?.customColor ??
        this.getStyle('color', styleSpecifier, annotationData);

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      const handleGroupUID = '0';

      drawing.drawHandles(svgDrawingHelper, annotationUID, handleGroupUID, [canvasCoordinates], {
        color,
      });

      renderStatus = true;
    }

    return renderStatus;
  };
}
