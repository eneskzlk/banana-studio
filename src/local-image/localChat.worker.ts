/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type Device = 'webgpu' | 'wasm';
type Model = { id: string; revision: string; dtype: 'q4' | 'q4f16'; thinking: boolean };
const worker = self as unknown as DedicatedWorkerGlobalScope;
const qwen3: Model = {
  id: 'onnx-community/Qwen3-0.6B-ONNX',
  revision: '79346d370dfae34801d26993fda9ae2372900fd0',
  dtype: 'q4f16',
  thinking: true,
};
const qwen2: Model = {
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  revision: '516c8d04add8a80c5228f32102b57953b8d421a9',
  dtype: 'q4',
  thinking: false,
};

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = undefined;
let current: { generate: TextGenerationPipeline; model: Model } | undefined;
let active = false;
const loadTextPipeline = pipeline as (task: 'text-generation', modelId: string, options: {
  revision: string;
  dtype: Model['dtype'];
  device: Device;
}) => Promise<TextGenerationPipeline>;

const options = { max_new_tokens: 180, do_sample: false, return_full_text: false };
async function reply(generate: TextGenerationPipeline, model: Model, messages: Message[]) {
  worker.postMessage({ type: 'chat-generating' });
  let output;
  if (model.thinking) {
    const template = { tokenize: false, add_generation_prompt: true, enable_thinking: false };
    const prompt = generate.tokenizer.apply_chat_template(messages, template);
    if (typeof prompt !== 'string') throw new Error('Sohbet girdisi hazırlanamadı.');
    output = await generate(prompt, { ...options, add_special_tokens: false });
  } else {
    output = await generate(messages, options);
  }
  const first = output[0];
  const generated = Array.isArray(first) ? undefined : first?.generated_text;
  const text = Array.isArray(generated) ? generated.at(-1)?.content.trim() : generated?.trim();
  if (!text) throw new Error('Yerel model boş yanıt verdi.');
  worker.postMessage({ type: 'chat-result', text: text.slice(0, 8000) });
}

worker.addEventListener('message', async ({ data: messages }: MessageEvent<Message[]>) => {
  if (active) return;
  active = true;
  try {
    if (current) {
      try {
        await reply(current.generate, current.model, messages);
        return;
      } catch {
        await current.generate.dispose().catch(() => {});
        current = undefined;
      }
    }

    for (const [model, device] of [
      ...('gpu' in navigator ? [[qwen3, 'webgpu']] as const : []),
      [qwen3, 'wasm'],
      [qwen2, 'wasm'],
    ] as const) {
      worker.postMessage({ type: 'chat-loading' });
      try {
        const generate = await loadTextPipeline('text-generation', model.id, { revision: model.revision, dtype: model.dtype, device });
        current = { generate, model };
        await reply(generate, model, messages);
        return;
      } catch {
        await current?.generate.dispose().catch(() => {});
        current = undefined;
      }
    }
    worker.postMessage({ type: 'error', message: 'Yerel sohbet modeli çalıştırılamadı.' });
  } finally {
    active = false;
  }
});
