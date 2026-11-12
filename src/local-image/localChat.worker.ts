/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
const worker = self as unknown as DedicatedWorkerGlobalScope;
const model = 'onnx-community/Qwen2.5-0.5B-Instruct';
const revision = '516c8d04add8a80c5228f32102b57953b8d421a9';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = undefined;
let ready: Promise<TextGenerationPipeline> | undefined;
let active = false;
const loadTextPipeline = pipeline as (task: 'text-generation', modelId: string, options: {
  revision: string;
  dtype: 'q4';
  device: 'webgpu' | 'wasm';
}) => Promise<TextGenerationPipeline>;

async function load() {
  async function loadOn(device: 'webgpu' | 'wasm'): Promise<TextGenerationPipeline> {
    return await loadTextPipeline('text-generation', model, { revision, dtype: 'q4', device });
  }
  if ('gpu' in navigator) {
    try {
      return await loadOn('webgpu');
    } catch {
      return await loadOn('wasm');
    }
  }
  return await loadOn('wasm');
}

worker.addEventListener('message', async ({ data: messages }: MessageEvent<Message[]>) => {
  if (active) return;
  active = true;
  try {
    if (!ready) {
      worker.postMessage({ type: 'chat-loading' });
      ready = load();
    }
    const generate = await ready;
    worker.postMessage({ type: 'chat-generating' });
    const output = await generate(messages, {
      max_new_tokens: 300,
      do_sample: false,
      return_full_text: false,
    });
    const first = output[0];
    const generated = Array.isArray(first) ? undefined : first?.generated_text;
    const text = Array.isArray(generated) ? generated.at(-1)?.content.trim() : generated?.trim();
    if (!text) throw new Error('Yerel model boş yanıt verdi.');
    worker.postMessage({ type: 'chat-result', text: text.slice(0, 8000) });
  } catch {
    worker.postMessage({ type: 'error', message: 'Yerel sohbet modeli çalıştırılamadı.' });
  } finally {
    active = false;
  }
});
