/// <reference lib="webworker" />

import { AutoProcessor, BaseStreamer, env, MultiModalityCausalLM, pipeline, RawImage } from '@huggingface/transformers';
import type { CoverWorkerMessage, CutoutWorkerMessage, ImageWorkerMessage } from './messages';

const worker = self as unknown as DedicatedWorkerGlobalScope;
const modelId = 'onnx-community/Janus-Pro-1B-ONNX';
const revision = '04efdf2e36cb07a034b0d94f7322356b292f0418';

env.allowLocalModels = false;
// Vite emits the runtime packaged with Transformers.js alongside the worker.
env.backends.onnx.wasm.wasmPaths = undefined;

const report = (message: ImageWorkerMessage | CoverWorkerMessage | CutoutWorkerMessage) => worker.postMessage(message);

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

  constructor(private readonly total: number, private readonly progress: (percent: number) => void) {
    super();
  }

  put() {
    this.tokens += 1;
    if (this.tokens % 8 === 0) {
      this.progress(Math.min(99, Math.floor(this.tokens * 100 / this.total)));
    }
  }

  end() {}
}

async function chooseCover(montage: Blob, loaded: Awaited<ReturnType<typeof loadModel>>) {
  const { processor, model } = loaded;
  report({ type: 'analyzing' });
  const image = await RawImage.fromBlob(montage);
  const prompt = '<image_placeholder>\nFour frames from one video. Choose the strongest thumbnail frame that shows the main person, product, or action clearly. Avoid transitions, side details, hands alone when a face or main product is shown, and subtitle-heavy frames. Describe the main subject, action, and real setting using visible details. Start with the frame number followed by a colon.';
  const inputs = await processor([{ role: '<|User|>', content: prompt, images: [image] }]);
  const output = await model.generate({ ...inputs, max_new_tokens: 55, do_sample: false });
  if (!('slice' in output) || typeof output.slice !== 'function') throw new Error('Model yanıtı okunamadı.');
  const tokens = output.slice(null, [inputs.input_ids.dims.at(-1), null]);
  const answer = processor.batch_decode(tokens, { skip_special_tokens: true })[0]?.trim() ?? '';
  const choice = answer.match(/^(?:the best (?:frame|image) is\s*)?(?:(?:frame|image|number)\s*)?[#*\s]*([1-4])\b\s*[:.)–-]?\s*([\s\S]*)/i);
  if (!choice) throw new Error('Model bir kare seçemedi.');
  report({ type: 'selection', index: Number(choice[1]) - 1, description: choice[2].trim().slice(0, 200) });
}

async function cutOutFrames(frames: Blob[]) {
  report({ type: 'cutting' });
  const model = 'wonfy/BiRefNet_lite-ONNX-webgpu';
  const revision = 'c40eaa22fb1af9edcf75c7b79d25ed8a8e901140';
  async function run(device: 'webgpu' | 'wasm') {
    const segmenter = await pipeline('background-removal', model, {
      device, revision, dtype: device === 'webgpu' ? 'fp16' : 'fp32',
    });
    try {
      const images: Blob[] = [];
      for (const frame of frames) {
        const [image] = await segmenter(await RawImage.fromBlob(frame));
        if (!image || image.channels !== 4) throw new Error('Ön plan maskesi oluşturulamadı.');
        images.push(await image.toBlob('image/png'));
      }
      return images;
    } finally {
      await segmenter.dispose();
    }
  }
  const images = await run('webgpu').catch(() => run('wasm'));
  report({ type: 'cutouts', images });
}

async function renderImage(prompt: string, loaded: Awaited<ReturnType<typeof loadModel>>, progress: (percent: number) => void) {
  const { processor, model, tokenCount } = loaded;
  progress(0);
  const inputs = await processor([{ role: '<|User|>', content: prompt }], { chat_template: 'text_to_image' });
  const images = await model.generate_images({
    ...inputs,
    min_new_tokens: tokenCount,
    max_new_tokens: tokenCount,
    do_sample: true,
    streamer: new ImageProgress(tokenCount, progress),
  });
  if (!images[0]) throw new Error('Model görsel üretemedi.');
  return images[0].toBlob('image/png');
}

worker.addEventListener('message', async ({ data }: MessageEvent<string | { prompts: string[] } | { montage: Blob } | { frames: Blob[] }>) => {
  if (generating) return;
  const prompt = typeof data === 'string' ? data.trim() : '';
  const montage = typeof data === 'object' && data && 'montage' in data ? data.montage : undefined;
  const frames = typeof data === 'object' && data && 'frames' in data ? data.frames : undefined;
  const prompts = typeof data === 'object' && data && 'prompts' in data ? data.prompts : undefined;
  if (!prompt && !(montage instanceof Blob) && !frames?.length && !prompts?.length) return;
  generating = true;
  try {
    if (frames?.length) {
      await cutOutFrames(frames);
      return;
    }
    if (!modelPromise) {
      report({ type: 'loading' });
      modelPromise = loadModel();
    }
    const loaded = await modelPromise;
    if (montage) {
      await chooseCover(montage, loaded);
      return;
    }
    if (prompts) {
      const images: Array<{ index: number; image: Blob }> = [];
      for (const [index, variant] of prompts.entries()) {
        try {
          const image = await renderImage(variant, loaded, percent => report({ type: 'variant-progress', index, percent }));
          images.push({ index, image });
        } catch (error) {
          if (index === prompts.length - 1 && !images.length) throw error;
        }
      }
      report({ type: 'variants', images });
      return;
    }
    report({ type: 'result', image: await renderImage(prompt, loaded, percent => report({ type: 'generating', percent })) });
  } catch (error) {
    report({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    generating = false;
  }
});
