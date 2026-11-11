import type { VercelRequest, VercelResponse } from '@vercel/node';
import route0 from '../server/handlers/gemini-generate.js';
import route1 from '../server/handlers/gemini-status.js';
import route2 from '../server/handlers/openai-text-generate.js';
import route3 from '../server/handlers/openrouter-text-generate.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'gemini-generate': route0,
  'gemini-status': route1,
  'openai-text-generate': route2,
  'openrouter-text-generate': route3,
};

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route;
  const routeName = typeof route === 'string' ? route : '';
  const selected = Object.hasOwn(handlers, routeName) ? handlers[routeName] : undefined;
  if (!selected) return res.status(404).json({ error: 'Unknown API route' });
  return selected(req, res);
}
