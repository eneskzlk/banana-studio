import type { ImageWorkerMessage } from './messages';

const jarvisOrigin = 'https://jarvis-v5-6tn4.onrender.com';
let active: { id: string; worker: Worker } | null = null;

function report(id: string, message: ImageWorkerMessage) {
  window.parent.postMessage({ channel: 'banana-studio:image', id, ...message }, jarvisOrigin);
}

if (window.parent !== window) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== jarvisOrigin || event.source !== window.parent) return;
    const request = event.data as { channel?: unknown; type?: unknown; id?: unknown; prompt?: unknown } | null;
    if (!request || request.channel !== 'banana-studio:image' || typeof request.id !== 'string') return;
    const { id, prompt, type } = request;
    if (type === 'cancel' && active?.id === id) {
      active.worker.terminate();
      active = null;
      return;
    }
    if (type !== 'generate' || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1200) return;
    if (active) {
      report(id, { type: 'error', message: 'Bir görsel üretimi zaten devam ediyor.' });
      return;
    }

    function finish(message: ImageWorkerMessage) {
      if (active?.id !== id) return;
      if (message.type === 'result' || message.type === 'error') {
        active.worker.terminate();
        active = null;
      }
      report(id, message);
    }

    try {
      const worker = new Worker(new URL('./localImage.worker.ts', import.meta.url), { type: 'module' });
      active = { id, worker };
      worker.onmessage = (response: MessageEvent<ImageWorkerMessage>) => finish(response.data);
      worker.onerror = () => finish({ type: 'error', message: 'Görsel motoru başlatılamadı.' });
      worker.postMessage(prompt.trim());
    } catch {
      active?.worker.terminate();
      active = null;
      report(id, { type: 'error', message: 'Görsel motoru başlatılamadı.' });
    }
  });

  window.parent.postMessage({ channel: 'banana-studio:image', type: 'ready' }, jarvisOrigin);
}
