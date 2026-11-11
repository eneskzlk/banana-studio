export type ImageWorkerMessage =
  | { type: 'loading' }
  | { type: 'generating'; percent: number }
  | { type: 'result'; image: Blob }
  | { type: 'error'; message: string };
