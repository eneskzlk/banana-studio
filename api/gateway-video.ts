import type { VercelRequest, VercelResponse } from '@vercel/node';
import route0 from '../server/handlers/evolink-generate.js';
import route1 from '../server/handlers/evolink-status.js';
import route2 from '../server/handlers/fal-h3-video.js';
import route3 from '../server/handlers/fal-video-scale.js';
import route4 from '../server/handlers/seedance-video.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'evolink-generate': route0,
  'evolink-status': route1,
  'fal-h3-video': route2,
  'fal-video-scale': route3,
  'seedance-video': route4,
};

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route;
  const routeName = typeof route === 'string' ? route : '';
  const selected = Object.hasOwn(handlers, routeName) ? handlers[routeName] : undefined;
  if (!selected) return res.status(404).json({ error: 'Unknown API route' });
  return selected(req, res);
}
