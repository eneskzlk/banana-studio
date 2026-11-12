export type ImageWorkerMessage =
  | { type: 'loading' }
  | { type: 'generating'; percent: number }
  | { type: 'result'; image: Blob }
  | { type: 'variant-progress'; index: number; percent: number }
  | { type: 'variants'; images: Array<{ index: number; image: Blob }> }
  | { type: 'error'; message: string };

export type CoverWorkerMessage =
  | { type: 'loading' }
  | { type: 'analyzing' }
  | { type: 'selection'; index: number; description: string }
  | { type: 'error'; message: string };

export type CutoutWorkerMessage =
  | { type: 'cutting' }
  | { type: 'cutouts'; images: Blob[] }
  | { type: 'error'; message: string };
