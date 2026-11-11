/// <reference lib="webworker" />

import { AutoProcessor, BaseStreamer, env, MultiModalityCausalLM } from '@huggingface/transformers';
import type { ImageWorkerMessage } from './messages';

const worker = self as unknown as DedicatedWorkerGlobalScope;
const modelId = 'onnx-community/Janus-Pro-1B-ONNX';
const revision = '04efdf2e36cb07a034b0d94f7322356b292f0418';

env.allowLocalModels = false;
// Vite emits the runtime packaged with Transformers.js alongside the worker.
env.backends.onnx.wasm.wasmPaths = undefined;

const report = (message: ImageWorkerMessage) => worker.postMessage(message);

async function loadModel() {
  const navigator = worker.navigator as WorkerNavigator & {
    gpu?: { requestAdapter: () => Promise<{ features: ReadonlySet<string> } | null> };
  };
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU kullanılamıyor. Donanım hızlandırması açık bir Chrome veya Edge tarayıcısı deneyin.');
  }

  const useFloat16 = adapter.features.has('shader-f16');
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(modelId, { revision }),
    MultiModalityCausalLM.from_pretrained(modelId, {
      revision,
      dtype: {
        prepare_inputs_embeds: 'q4',
        language_model: useFloat16 ? 'q4f16' : 'q4',
        lm_head: useFloat16 ? 'fp16' : 'fp32',
        gen_head: useFloat16 ? 'fp16' : 'fp32',
        gen_img_embeds: useFloat16 ? 'fp16' : 'fp32',
        image_decode: 'fp32',
      },
      device: {
        prepare_inputs_embeds: 'wasm',
        language_model: 'webgpu',
        lm_head: 'webgpu',
        gen_head: 'webgpu',
        gen_img_embeds: 'webgpu',
        image_decode: 'webgpu',
      },
    }),
  ]);
  if (!(model instanceof MultiModalityCausalLM)
    || !('num_image_tokens' in processor)
    || typeof processor.num_image_tokens !== 'number'
    || processor.num_image_tokens <= 0) {
    throw new Error('Görsel modeli beklenen biçimde yüklenemedi.');
  }
  return { processor, model, tokenCount: processor.num_image_tokens };
}

let modelPromise: ReturnType<typeof loadModel> | undefined;
let generating = false;

class ImageProgress extends BaseStreamer {
  private tokens = -1;

  constructor(private readonly total: number) {
    super();
  }

  put() {
    this.tokens += 1;
    if (this.tokens % 8 === 0) {
      report({ type: 'generating', percent: Math.min(99, Math.floor(this.tokens * 100 / this.total)) });
    }
  }

  end() {}
}

worker.addEventListener('message', async ({ data: prompt }: MessageEvent<string>) => {
  if (generating || typeof prompt !== 'string' || !prompt.trim()) return;
  generating = true;
  try {
    if (!modelPromise) {
      report({ type: 'loading' });
      modelPromise = loadModel();
    }
    const { processor, model, tokenCount } = await modelPromise;
    report({ type: 'generating', percent: 0 });
    const inputs = await processor([{ role: '<|User|>', content: prompt }], { chat_template: 'text_to_image' });
    const images = await model.generate_images({
      ...inputs,
      min_new_tokens: tokenCount,
      max_new_tokens: tokenCount,
      do_sample: true,
      streamer: new ImageProgress(tokenCount),
    });
    if (!images[0]) throw new Error('Model görsel üretemedi.');
    report({ type: 'result', image: await images[0].toBlob('image/png') });
  } catch (error) {
    report({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    generating = false;
  }
});
