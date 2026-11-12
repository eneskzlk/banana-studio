import type { CoverWorkerMessage, CutoutWorkerMessage, ImageWorkerMessage } from './messages';

type WorkerMessage = CoverWorkerMessage | CutoutWorkerMessage | ImageWorkerMessage;
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type ChatWorkerMessage = { type: 'chat-loading' | 'chat-generating' }
  | { type: 'chat-result'; text: string }
  | { type: 'error'; message: string };

const jarvisOrigin = 'https://jarvis-v5-6tn4.onrender.com';
let active: { id: string; worker: Worker } | null = null;
let chatWorker: Worker | undefined;

function report(id: string, message: WorkerMessage | ChatWorkerMessage) {
  window.parent.postMessage({ channel: 'banana-studio:image', id, ...message }, jarvisOrigin);
}

if (window.parent !== window) {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== jarvisOrigin || event.source !== window.parent) return;
    const request = event.data as { channel?: unknown; type?: unknown; id?: unknown; prompt?: unknown; prompts?: unknown; montage?: unknown; frames?: unknown; messages?: unknown } | null;
    if (!request || request.channel !== 'banana-studio:image' || typeof request.id !== 'string') return;
    const { id, prompt, prompts, type, montage, frames, messages } = request;
    if (type === 'cancel' && active?.id === id) {
      if (active.worker === chatWorker) chatWorker = undefined;
      active.worker.terminate();
      active = null;
      return;
    }
    let input: string | { prompts: string[] } | { montage: Blob } | { frames: Blob[] } | ChatMessage[] | undefined;
    if (type === 'generate' && typeof prompt === 'string' && prompt.trim() && prompt.length <= 1200) {
      input = prompt.trim();
    } else if (type === 'generate-variants' && Array.isArray(prompts) && prompts.length === 2
      && prompts.every(value => typeof value === 'string' && value.trim() && value.length <= 1200)) {
      input = { prompts: prompts.map(value => value.trim()) };
    } else if (type === 'choose-cover' && montage instanceof Blob && montage.type === 'image/jpeg' && montage.size <= 1024 * 1024) {
      input = { montage };
    } else if (type === 'cutout' && Array.isArray(frames) && frames.length >= 1 && frames.length <= 2
      && frames.every(frame => frame instanceof Blob && frame.type === 'image/jpeg' && frame.size > 0 && frame.size <= 2 * 1024 * 1024)) {
      input = { frames };
    } else if (type === 'local-chat' && Array.isArray(messages) && messages.length >= 2 && messages.length <= 10
      && messages.every(message => message && ['system', 'user', 'assistant'].includes(message.role)
        && typeof message.content === 'string' && message.content.length > 0 && message.content.length <= 4000)) {
      input = messages;
    }
    if (!input) return;
    if (active) {
      report(id, { type: 'error', message: 'Bir görsel üretimi zaten devam ediyor.' });
      return;
    }

    function finish(message: WorkerMessage | ChatWorkerMessage) {
      if (active?.id !== id) return;
      if (message.type === 'result' || message.type === 'selection' || message.type === 'cutouts' || message.type === 'variants' || message.type === 'chat-result' || message.type === 'error') {
        if (message.type !== 'chat-result') {
          if (active.worker === chatWorker) chatWorker = undefined;
          active.worker.terminate();
        }
        active = null;
      }
      report(id, message);
    }

    try {
      const worker = type === 'local-chat'
        ? (chatWorker ??= new Worker(new URL('./localChat.worker.ts', import.meta.url), { type: 'module' }))
        : new Worker(new URL('./localImage.worker.ts', import.meta.url), { type: 'module' });
      active = { id, worker };
      worker.onmessage = (response: MessageEvent<WorkerMessage | ChatWorkerMessage>) => finish(response.data);
      worker.onerror = () => finish({ type: 'error', message: 'Görsel motoru başlatılamadı.' });
      worker.postMessage(input);
    } catch {
      if (active?.worker === chatWorker) chatWorker = undefined;
      active?.worker.terminate();
      active = null;
      report(id, { type: 'error', message: 'Görsel motoru başlatılamadı.' });
    }
  });

  window.parent.postMessage({ channel: 'banana-studio:image', type: 'ready' }, jarvisOrigin);
}
