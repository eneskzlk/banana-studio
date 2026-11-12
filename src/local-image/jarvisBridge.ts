import type { CoverWorkerMessage, CutoutWorkerMessage, ImageWorkerMessage } from './messages';

type WorkerMessage = CoverWorkerMessage | CutoutWorkerMessage | ImageWorkerMessage;

const jarvisOrigin = 'https://jarvis-v5-6tn4.onrender.com';
let active: { id: string; worker: Worker } | null = null;

function report(id: string, message: WorkerMessage) {
  window.parent.postMessage({ channel: 'banana-studio:image', id, ...message }, jarvisOrigin);
}

if (window.parent !== window) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== jarvisOrigin || event.source !== window.parent) return;
    const request = event.data as { channel?: unknown; type?: unknown; id?: unknown; prompt?: unknown; montage?: unknown; frames?: unknown } | null;
    if (!request || request.channel !== 'banana-studio:image' || typeof request.id !== 'string') return;
    const { id, prompt, type, montage, frames } = request;
    if (type === 'cancel' && active?.id === id) {
      active.worker.terminate();
      active = null;
      return;
    }
    let input: string | { montage: Blob } | { frames: Blob[] } | undefined;
    if (type === 'generate' && typeof prompt === 'string' && prompt.trim() && prompt.length <= 1200) {
      input = prompt.trim();
    } else if (type === 'choose-cover' && montage instanceof Blob && montage.type === 'image/jpeg' && montage.size <= 1024 * 1024) {
      input = { montage };
    } else if (type === 'cutout' && Array.isArray(frames) && frames.length >= 1 && frames.length <= 2
      && frames.every(frame => frame instanceof Blob && frame.type === 'image/jpeg' && frame.size > 0 && frame.size <= 2 * 1024 * 1024)) {
      input = { frames };
    }
    if (!input) return;
    if (active) {
      report(id, { type: 'error', message: 'Bir görsel üretimi zaten devam ediyor.' });
      return;
    }

    function finish(message: WorkerMessage) {
      if (active?.id !== id) return;
      if (message.type === 'result' || message.type === 'selection' || message.type === 'cutouts' || message.type === 'error') {
        active.worker.terminate();
        active = null;
      }
      report(id, message);
    }

    try {
      const worker = new Worker(new URL('./localImage.worker.ts', import.meta.url), { type: 'module' });
      active = { id, worker };
      worker.onmessage = (response: MessageEvent<WorkerMessage>) => finish(response.data);
      worker.onerror = () => finish({ type: 'error', message: 'Görsel motoru başlatılamadı.' });
      worker.postMessage(input);
    } catch {
      active?.worker.terminate();
      active = null;
      report(id, { type: 'error', message: 'Görsel motoru başlatılamadı.' });
    }
  });

  window.parent.postMessage({ channel: 'banana-studio:image', type: 'ready' }, jarvisOrigin);
}
