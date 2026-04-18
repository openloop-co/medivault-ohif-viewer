# MONAI Label Extension for OHIF v3

AI-assisted medical image segmentation extension for MediVault PACS.

## Features

- **Server Integration**: Connects to MONAI Label server for AI inference
- **Model Selection**: Lists available models (VISTA-3D, wholeBody_ct_segmentation, DeepEdit, etc.)
- **Automatic Segmentation**: Run inference on loaded studies with visual overlay
- **Interactive Segmentation**: Support for click-based refinement (DeepEdit)
- **Multi-tenant Authentication**: Uses Cognito JWT for secure access
- **NRRD Parsing**: Handles NRRD format segmentation results with multipart response support

## Project Structure

```
extensions/monai-label/
├── src/
│   ├── index.tsx              # Extension entry point
│   ├── id.ts                  # Extension identifier
│   ├── init.ts                # Extension initialization
│   ├── getCommandsModule.ts   # OHIF commands registration
│   ├── getPanelModule.tsx     # Panel registration
│   ├── panels/
│   │   └── MonaiLabelPanel.tsx    # Main UI panel component
│   ├── services/
│   │   ├── MonaiLabelService.ts       # API client for MONAI Label server
│   │   └── MonaiLabelService.test.ts  # Unit tests (35 tests)
│   ├── tools/
│   │   └── ProbeMONAILabelTool.ts # Interactive probe tool for DeepEdit
│   ├── utils/
│   │   ├── SegmentationReader.ts  # NRRD file parser
│   │   ├── SegUtils.ts            # Segmentation utilities
│   │   ├── GenericUtils.ts        # Color and helper utilities
│   │   └── GenericAnatomyColors.ts # Predefined anatomy colors
│   └── types/
│       └── nrrd-js.d.ts           # TypeScript definitions for nrrd-js
└── README.md
```

## Configuration

The extension is configured via `window.config.monaiLabel` in the OHIF configuration:

```javascript
window.config = {
  // ... other config
  monaiLabel: {
    server: 'https://monai.medivault.it',
    getAuthorizationHeader: function() {
      // Return JWT token from OIDC session
      return { Authorization: 'Bearer <token>' };
    }
  }
};
```

## Usage

1. Open a study in OHIF Viewer
2. Select "MONAI Label" mode from the mode selector
3. The MONAI Label panel appears on the right sidebar
4. Select a model from the dropdown
5. Click "Run Segmentation" to generate AI predictions
6. The segmentation overlay appears on the images
7. Use "Reset" to clear the segmentation
8. Use brush tools to refine the segmentation if needed

## API Integration

The extension communicates with MONAI Label server via REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/info` | GET | Server info and available models |
| `/infer/{model}?image={studyUID}` | POST | Run inference on a study |
| `/datastore/` | POST | Submit labels for training |
| `/activelearning/` | POST | Get next sample for annotation |
| `/train/` | POST | Start model training |
| `/train/` | DELETE | Stop model training |
| `/train/` | GET | Check training status |

### Inference Response

The inference endpoint returns a multipart response containing:
- **Body**: NRRD format segmentation mask (binary)
- **Header `x-label-info`**: JSON with label names and latencies

```json
{
  "labels": { "liver": 1, "spleen": 2 },
  "latencies": { "inference": 1.5, "pre": 0.2, "post": 0.1 }
}
```

## Technical Details

### Segmentation Handling

The extension supports both **volume-based** and **stack-based** labelmaps:

1. **Volume-based**: Uses `segmentationService.getLabelmapVolume()` with voxelManager
2. **Stack-based**: Falls back to per-slice imageIds when volume is not available

### NRRD Slice Ordering

NRRD Z-axis is often inverted relative to DICOM ordering. The extension reverses slice indices when copying data:

```typescript
const nrrdSliceIdx = numSlices - 1 - sliceIdx;
```

### Multipart Response Parsing

For models with many labels (e.g., wholeBody_ct with 104 labels), multipart headers can exceed 10KB. The extension searches up to 50KB for the NRRD magic bytes:

```typescript
const searchSize = Math.min(50000, labelData.byteLength);
```

## MediVault Integration

- **Authentication**: JWT tokens from Cognito are passed via axios interceptor
- **Storage**: Segmentation results are stored as DICOM-SEG in S3
- **Multi-tenant**: Each tenant accesses only their own data via ABAC
- **GPU Service**: MONAI Label runs on ECS with GPU (g4dn.xlarge)

## Development

```bash
# From ohif-viewer root
yarn install
yarn dev

# Run tests
yarn test -- --testPathPattern="MonaiLabelService"

# Build
yarn build
```

## Testing

The extension includes 35 unit tests covering:

- Service initialization and configuration
- Server info and model fetching
- Inference execution with various parameters
- Interactive inference with foreground/background points
- Label submission
- Active learning sample retrieval
- Training start/stop/status
- Authorization header handling
- Error handling (401, 403, timeout, network errors)
- Server URL property management

## Dependencies

- `@ohif/core` - OHIF core utilities
- `@ohif/extension-cornerstone` - Cornerstone.js integration
- `@cornerstonejs/tools` - Segmentation tools and annotations
- `axios` - HTTP client for API requests
- `nrrd-js` - NRRD file format parser
- `pako` - Gzip decompression for compressed NRRD
