/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
const worker = self as unknown as DedicatedWorkerGlobalScope;
const model = 'onnx-community/Qwen3-0.6B-ONNX';
const revision = '79346d370dfae34801d26993fda9ae2372900fd0';

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
    const template = { tokenize: false, add_generation_prompt: true, enable_thinking: false };
    const prompt = generate.tokenizer.apply_chat_template(messages, template);
    if (typeof prompt !== 'string') throw new Error('Sohbet girdisi hazırlanamadı.');
    const output = await generate(prompt, {
      max_new_tokens: 300,
      do_sample: false,
      return_full_text: false,
      add_special_tokens: false,
    });
    const first = output[0];
    const text = !Array.isArray(first) && typeof first?.generated_text === 'string'
      ? first.generated_text.trim()
      : '';
    if (!text) throw new Error('Yerel model boş yanıt verdi.');
    worker.postMessage({ type: 'chat-result', text: text.slice(0, 8000) });
  } catch {
    worker.postMessage({ type: 'error', message: 'Yerel sohbet modeli çalıştırılamadı.' });
  } finally {
    active = false;
  }
});
