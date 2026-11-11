import '../styles/index.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { ImageWorkerMessage } from './messages';

type Work = { phase: 'loading' } | { phase: 'generating'; percent: number };

function LocalImageStudio() {
  const worker = useRef<Worker | null>(null);
  const [prompt, setPrompt] = useState('');
  const [work, setWork] = useState<Work | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const webGpuAvailable = 'gpu' in navigator;

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function stopWorker() {
    worker.current?.terminate();
    worker.current = null;
    setWork(null);
  }

  function handleMessage({ data }: MessageEvent<ImageWorkerMessage>) {
    switch (data.type) {
      case 'loading':
        setWork({ phase: 'loading' });
        break;
      case 'generating':
        setWork({ phase: 'generating', percent: data.percent });
        break;
      case 'result':
        setImage(data.image);
        setWork(null);
        break;
      case 'error':
        stopWorker();
        setError(data.message.startsWith('WebGPU kullanılamıyor')
          ? data.message
          : 'Görsel üretilemedi. İnternet bağlantısını ve donanım hızlandırmasını kontrol edip tekrar deneyin.');
        break;
    }
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = prompt.trim();
    if (!description || work || !webGpuAvailable) return;
    setError('');
    setWork({ phase: 'loading' });
    try {
      if (!worker.current) {
        worker.current = new Worker(new URL('./localImage.worker.ts', import.meta.url), { type: 'module' });
        worker.current.onmessage = handleMessage;
        worker.current.onerror = () => {
          stopWorker();
          setError('Görsel üretim aracı başlatılamadı. Sayfayı yenileyip tekrar deneyin.');
        };
      }
      worker.current.postMessage(description);
    } catch {
      stopWorker();
      setError('Görsel üretim aracı başlatılamadı. Sayfayı yenileyip tekrar deneyin.');
    }
  }

  const status = work?.phase === 'loading'
    ? 'Model hazırlanıyor. İlk indirme bağlantı hızına göre birkaç dakika veya daha uzun sürebilir.'
    : work?.phase === 'generating'
      ? `Görsel oluşturuluyor · %${work.percent}`
      : '';

  return (
    <main className="min-h-screen bg-[#0d1117] px-5 py-9 text-slate-100 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <a href="/" className="flex items-center gap-3 font-semibold text-white">
            <img src="/favicon.png" alt="" className="h-9 w-9 rounded-lg" />
            Banana Studio
          </a>
          <a href="/" className="text-sm text-violet-200 hover:underline">Giriş sayfası</a>
        </header>
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Galerisiz görsel üret</h1>
          <p className="mt-3 text-slate-300">Bir sahne tarif et, görseli tarayıcında oluştur ve PNG olarak indir.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={generate} className="rounded-2xl border border-slate-800 bg-[#161b22] p-5 sm:p-6">
            <label htmlFor="image-description" className="block text-sm font-semibold">Görsel tarifi</label>
            <textarea
              id="image-description"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              maxLength={1200}
              rows={5}
              required
              placeholder="Örnek: A yellow sports car on a wet city street at night"
              className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-[#0d1117] p-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
            />
            <p className="mt-3 text-sm text-slate-400">
              Janus-Pro modeli cihazında çalışır. Tarifi ve görseli bir sunucuya göndermeden kullanabilirsin.
            </p>
            <p className="mt-2 text-sm text-slate-400">İlk kullanımda model dosyaları indirilir. İndirme birkaç GB olabilir.</p>
            {!webGpuAvailable && <p role="alert" className="mt-4 text-sm text-amber-300">Bu tarayıcıda WebGPU kullanılamıyor. Chrome veya Edge’de donanım hızlandırmasını açıp tekrar deneyin.</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="submit" disabled={!!work || !prompt.trim() || !webGpuAvailable} className="rounded-xl bg-violet-300 px-5 py-3 font-semibold text-violet-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-45">
                Görsel üret
              </button>
              {work && <button type="button" onClick={stopWorker} className="rounded-xl border border-slate-600 px-5 py-3 hover:bg-slate-800">İptal</button>}
            </div>
            {status && <p role="status" className="mt-4 text-sm text-violet-200">{status}</p>}
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          </form>
          <section aria-labelledby="result-heading" className="rounded-2xl border border-slate-800 bg-[#161b22] p-5 sm:p-6">
            <h2 id="result-heading" className="text-sm font-semibold">Görsel önizleme</h2>
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="Oluşturulan görsel" className="mt-4 aspect-square w-full rounded-xl bg-[#0d1117] object-contain" />
                <a href={imageUrl} download="banana-studio.png" className="mt-4 inline-flex rounded-xl border border-violet-400/40 px-5 py-3 font-semibold text-violet-200 hover:bg-violet-400/10">PNG indir</a>
              </>
            ) : (
              <div className="mt-4 grid min-h-60 place-items-center rounded-xl border border-dashed border-slate-700 bg-[#0d1117] p-5 text-center text-sm text-slate-400">
                Oluşturduğun görsel burada görünecek.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<LocalImageStudio />);
