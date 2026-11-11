import type { VercelRequest, VercelResponse } from '@vercel/node';
import route0 from '../server/handlers/fal-image-generate.js';
import route1 from '../server/handlers/fal-status.js';
import route2 from '../server/handlers/openai-image-enqueue.js';
import route3 from '../server/handlers/openai-image-generate.js';
import route4 from '../server/handlers/openai-image-recover.js';
import route5 from '../server/handlers/image-job-sweep.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'fal-image-generate': route0,
  'fal-status': route1,
  'openai-image-enqueue': route2,
  'openai-image-generate': route3,
  'openai-image-recover': route4,
  'image-job-sweep': route5,
};

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route;
  const routeName = typeof route === 'string' ? route : '';
  const selected = Object.hasOwn(handlers, routeName) ? handlers[routeName] : undefined;
  if (!selected) return res.status(404).json({ error: 'Unknown API route' });
  return selected(req, res);
}
