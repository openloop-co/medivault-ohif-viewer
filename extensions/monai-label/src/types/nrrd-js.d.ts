declare module 'nrrd-js' {
  export interface NrrdFile {
    type: string;
    encoding: string;
    dimension: number;
    sizes: number[];
    space?: string;
    'space directions'?: number[][];
    'space origin'?: number[];
    kinds?: string[];
    endian?: string;
    data: Uint8Array | Uint16Array | Float32Array;
    buffer: ArrayBuffer;
  }

  export function parse(data: ArrayBuffer): NrrdFile;
}
