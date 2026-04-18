import { id } from './id';
import getPanelModule from './getPanelModule';
import getCommandsModule from './getCommandsModule';
import preRegistration from './init';

/**
 * MONAI Label Extension for OHIF v3
 *
 * Provides AI-assisted segmentation capabilities through integration
 * with MONAI Label server.
 *
 * Features:
 * - Model listing and selection
 * - Automatic segmentation
 * - Interactive segmentation (DeepEdit)
 * - Active learning support
 *
 * Integration with MediVault:
 * - Uses Cognito JWT for authentication
 * - Connects to MONAI Label server via HTTPS
 * - Results stored as DICOM-SEG
 */
const extension = {
  /**
   * Unique extension ID
   */
  id,

  /**
   * Pre-registration hook - initializes MONAI Label service
   */
  preRegistration,

  /**
   * Panel module - provides the MONAI Label panel for the sidebar
   */
  getPanelModule,

  /**
   * Commands module - provides commands for running inference
   */
  getCommandsModule,
};

export default extension;
export { id };
