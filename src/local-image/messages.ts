export type ImageWorkerMessage =
  | { type: 'loading' }
  | { type: 'generating'; percent: number }
  | { type: 'result'; image: Blob }
  | { type: 'error'; message: string };

export type CoverWorkerMessage =
  | { type: 'loading' }
  | { type: 'analyzing' }
  | { type: 'selection'; index: number; description: string }
  | { type: 'error'; message: string };
