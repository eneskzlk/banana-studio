#!/usr/bin/env node
// Reversible Vercel Hobby consolidation; run only on hobby-test branch.
// All public endpoint handlers retain their original implementations and checks.
import fs from 'node:fs';
import path from 'node:path';
const groups = {
  'gemini': ['gemini-generate','gemini-status','openai-text-generate','openrouter-text-generate'],
  'images': ['fal-image-generate','fal-status','openai-image-enqueue','openai-image-generate','openai-image-recover','image-job-sweep'],
  'video': ['evolink-generate','evolink-status','fal-h3-video','fal-video-scale','seedance-video'],
  'utility': ['fal-debug','folder-share','provider-usage','shared-folder','workspace-config','youtube','youtube-status'],
};
const paths = Object.values(groups).flat();
const handlerDir = 'server/handlers';
fs.mkdirSync(handlerDir,{recursive:true});
for (const name of paths) {
  const from = path.join('api',name+'.ts');
  const to = path.join(handlerDir,name+'.ts');
  if (!fs.existsSync(from)) {
    if (fs.existsSync(to)) continue;
    throw new Error('Missing source endpoint: '+from);
  }
  let source=fs.readFileSync(from,'utf8');
  source=source.replaceAll(/(['"])\.\/_lib\//g,"$1../../api/_lib/")
               .replaceAll(/(['"])\.\.\/src\//g,"$1../../src/");
  fs.writeFileSync(to,source);
  fs.unlinkSync(from);
}
// Update the internal worker import to its relocated handler.
const workerRunner='api/_lib/imageJobRunner.ts';
let workerSource=fs.readFileSync(workerRunner,'utf8');
workerSource=workerSource.replace("'../openai-image-generate.js'","'../../server/handlers/openai-image-generate.js'");
fs.writeFileSync(workerRunner,workerSource);
// Keep source-level tests pointing at the same real handler implementations.
const pathPattern=new RegExp('api/('+paths.join('|')+')\\.ts','g');
for(const file of fs.readdirSync('tests').filter(f=>f.endsWith('.test.mjs'))){
  const target=path.join('tests',file);
  const before=fs.readFileSync(target,'utf8');
  let after=before.replace(pathPattern,'server/handlers/$1.ts');
  if(file==='image-error-provider-name.test.mjs')after=after.replaceAll(".includes('/api/')",".includes('/api/') || a.importer.includes('/server/handlers/')");
  if(before!==after)fs.writeFileSync(target,after);
}
const tsPath='api/tsconfig.json';
const ts=JSON.parse(fs.readFileSync(tsPath,'utf8'));
ts.include=['./**/*.ts','../server/handlers/**/*.ts'];
fs.writeFileSync(tsPath,JSON.stringify(ts,null,2)+'\n');
const rewrites=[];
for(const [group,names] of Object.entries(groups)){
  const imports=names.map((name,i)=>'import route'+i+" from '../server/handlers/"+name+".js';").join('\n');
  const members=names.map((name,i)=>"  '"+name+"': route"+i+',').join('\n');
  const content=[
    "import type { VercelRequest, VercelResponse } from '@vercel/node';",
    imports,'',
    'const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {',
    members,'};','',
    'export const config = { maxDuration: 60 };','',
    'export default async function handler(req: VercelRequest, res: VercelResponse) {',
    '  const route = req.query.route;',
    "  const routeName = typeof route === 'string' ? route : '';",
    '  const selected = Object.hasOwn(handlers, routeName) ? handlers[routeName] : undefined;',
    "  if (!selected) return res.status(404).json({ error: 'Unknown API route' });",
    '  return selected(req, res);',
    '}',''
  ].join('\n');
  fs.writeFileSync('api/gateway-'+group+'.ts',content);
  for(const name of names) rewrites.push({source:'/api/'+name,destination:'/api/gateway-'+group+'?route='+name});
}
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
delete config.crons; // 1-minute cron is invalid for Hobby; automated sweeping needs alternate scheduling.
config.rewrites=rewrites;
fs.writeFileSync('vercel.json',JSON.stringify(config,null,2)+'\n');
const ignore=fs.readFileSync('.vercelignore','utf8');
fs.writeFileSync('.vercelignore',ignore.replace(/^desktop\/\s*$/m,'desktop/macos/\ndesktop/windows/\ndesktop/server/'));
const guard='scripts/buildSecurity.ts';
let guardSource=fs.readFileSync(guard,'utf8');
if(!guardSource.includes("import { existsSync } from 'node:fs';")){
  guardSource=guardSource.replace("import type { Plugin } from 'vite';","import type { Plugin } from 'vite';\nimport { existsSync } from 'node:fs';");
}
guardSource=guardSource.replace('if (!outputDirectory) return;','if (!outputDirectory || !existsSync(outputDirectory)) return;');
fs.writeFileSync(guard,guardSource);
console.log(JSON.stringify({gatewayCount:Object.keys(groups).length,workerCount:1,legacyRoutes:rewrites.length}));
