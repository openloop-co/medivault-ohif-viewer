/**
 * NRRD Segmentation Reader for MONAI Label
 *
 * Based on the official MONAI Label OHIF plugin implementation.
 * Parses NRRD format segmentation data returned from MONAI Label inference.
 */

import { parse as nrrdParse, NrrdFile } from 'nrrd-js';
import pako from 'pako';

/**
 * NRRD file header containing metadata about the volume.
 * @see https://teem.sourceforge.net/nrrd/format.html
 */
export interface NrrdHeader {
  /** Data type (e.g., 'uint8', 'uint16', 'float') */
  type: string;
  /** Encoding method (e.g., 'raw', 'gzip') */
  encoding: string;
  /** Number of dimensions (usually 3 for volumetric data) */
  dimension: number;
  /** Size in each dimension [width, height, depth] */
  sizes: number[];
  /** Coordinate space (e.g., 'right-anterior-superior') */
  space?: string;
  /** Direction vectors for each dimension */
  'space directions'?: number[][];
  /** Origin point in physical coordinates */
  'space origin'?: number[];
  /** Semantic meaning of each dimension */
  kinds?: string[];
  /** Byte order for multi-byte types */
  endian?: string;
}

/**
 * Result from parsing an NRRD file.
 */
export interface ParsedNrrd {
  /** NRRD header with metadata */
  header: NrrdHeader;
  /** Raw image data as ArrayBuffer */
  image: ArrayBuffer;
}

export default class SegmentationReader {
  /**
   * Parse NRRD data from ArrayBuffer
   *
   * @param data - Raw NRRD data as ArrayBuffer
   * @returns Parsed header and image buffer
   */
  static parseNrrdData(data: ArrayBuffer): ParsedNrrd {
    const nrrdfile: NrrdFile = nrrdParse(data);

    console.log('SegmentationReader: NRRD encoding:', nrrdfile.encoding);
    console.log('SegmentationReader: NRRD type:', nrrdfile.type);
    console.log('SegmentationReader: NRRD sizes:', nrrdfile.sizes);

    // Handle gzip encoding (not natively supported by nrrd-js)
    if (nrrdfile.encoding === 'gzip') {
      console.log('SegmentationReader: Decompressing gzip data...');
      const buffer = pako.inflate(nrrdfile.buffer).buffer;

      nrrdfile.encoding = 'raw';
      nrrdfile.data = new Uint16Array(buffer);
      nrrdfile.buffer = buffer;
      console.log('SegmentationReader: Decompressed, new size:', buffer.byteLength);
    }

    const image = nrrdfile.buffer;
    const header = { ...nrrdfile };
    delete header.data;
    delete header.buffer;

    return {
      header,
      image,
    };
  }

  /**
   * Get typed array from parsed NRRD based on data type
   *
   * @param parsed - Parsed NRRD result
   * @returns Typed array of appropriate type
   */
  static getTypedArray(parsed: ParsedNrrd): Uint8Array | Uint16Array | Float32Array {
    const type = parsed.header.type?.toLowerCase() || 'uint8';

    if (type === 'uint8' || type === 'unsigned char' || type === 'uchar') {
      return new Uint8Array(parsed.image);
    } else if (type === 'uint16' || type === 'unsigned short' || type === 'ushort') {
      return new Uint16Array(parsed.image);
    } else if (type === 'int16' || type === 'short' || type === 'signed short') {
      return new Int16Array(parsed.image) as unknown as Uint16Array;
    } else if (type === 'float' || type === 'float32') {
      return new Float32Array(parsed.image);
    }

    // Default to uint8 for segmentation masks
    console.warn('SegmentationReader: Unknown type, defaulting to uint8:', type);
    return new Uint8Array(parsed.image);
  }
}
