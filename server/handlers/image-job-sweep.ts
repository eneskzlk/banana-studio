import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { createServiceRoleClient } from '../../api/_lib/auth.js';
import { publishImageJob, type ImageJobMessage } from '../../api/_lib/imageJobQueue.js';

export const config={maxDuration:60};
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','no-store');
  const expected=process.env.CRON_SECRET?Buffer.from(`Bearer ${process.env.CRON_SECRET}`):null;
  const actual=Buffer.from(typeof req.headers?.authorization==='string'?req.headers.authorization:'');
  if(!expected||actual.length!==expected.length||!timingSafeEqual(actual,expected)) return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production') return res.status(503).json({error:'Production queue only'});
  const db=createServiceRoleClient(); if(!db) return res.status(503).json({error:'Queue storage unavailable'});
  const {data,error}=await db.rpc('image_job_outbox',{p_limit:40});
  if(error||!Array.isArray(data)) return res.status(503).json({error:'Queue outbox unavailable'});
  const jobs=data as ImageJobMessage[];
  const outcomes=await Promise.allSettled(jobs.map(job=>publishImageJob(db,job)));
  return res.status(outcomes.some(result=>result.status==='rejected')?503:200).json({checked:jobs.length,published:outcomes.filter(result=>result.status==='fulfilled').length});
}
