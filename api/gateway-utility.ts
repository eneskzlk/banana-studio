import type { VercelRequest, VercelResponse } from '@vercel/node';
import route0 from '../server/handlers/fal-debug.js';
import route1 from '../server/handlers/folder-share.js';
import route2 from '../server/handlers/provider-usage.js';
import route3 from '../server/handlers/shared-folder.js';
import route4 from '../server/handlers/workspace-config.js';
import route5 from '../server/handlers/youtube.js';
import route6 from '../server/handlers/youtube-status.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'fal-debug': route0,
  'folder-share': route1,
  'provider-usage': route2,
  'shared-folder': route3,
  'workspace-config': route4,
  'youtube': route5,
  'youtube-status': route6,
};

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route;
  const routeName = typeof route === 'string' ? route : '';
  const selected = Object.hasOwn(handlers, routeName) ? handlers[routeName] : undefined;
  if (!selected) return res.status(404).json({ error: 'Unknown API route' });
  return selected(req, res);
}
