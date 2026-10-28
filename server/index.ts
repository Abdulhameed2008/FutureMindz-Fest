import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { fieldNames, type Part, type Source, type Compatibility } from '../shared/types.js';
import { allParts, getPart, savePart, refs, checklist, readFixture, setSetting, logEvent, dataPath, root } from './store.js';
import { addEvidence, confirmField, invalidate, missingField, viewPart, fingerprint, validateDraft, validateValue, prohibitedRequest } from './engine.js';
import { extract } from './llm.js';
import { evaluate, type Answer, type Baseline } from './evaluation.js';
const app=express();
app.use(cors({origin:['http://localhost:5173','http://127.0.0.1:5173']}));
app.use(express.json({limit:'1mb'}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:12}});
fs.mkdirSync(path.join(dataPath,'uploads'),{recursive:true});
app.use('/uploads',express.static(path.join(dataPath,'uploads'),{setHeaders:res=>res.setHeader('X-Content-Type-Options','nosniff')}));
app.use('/mirrors',express.static(path.join(root,'public','mirrors')));
const wrap=(fn:(req:Request,res:Response)=>unknown)=> (req:Request,res:Response,next:NextFunction)=>Promise.resolve(fn(req,res)).catch(next);
const current=(part:Part)=>viewPart(part,refs(),checklist());
const version=(part:Part,body:{revision:number})=>{if(body.revision!==part.revision)throw new Error('This record changed. Refresh before saving or approving.');};
app.get('/api/samples/:name',wrap((req,res)=>{
  const allowed=['inventory.csv','donor_records.csv','donor_records.json','whatsapp_en.txt','whatsapp_ar.txt','compatibility.csv','compatibility.json','checklist.json','answer_key.json','manual_baseline.json'];
  if(!allowed.includes(req.params.name))throw new Error('Sample file not found');
  res.download(path.join(dataPath,req.params.name));
}));
app.get('/api/health',(_req,res)=>res.json({ok:true,mode:'synthetic',provider:process.env.LLM_PROVIDER||'mock',corridor:'UAE → UK',livePublishing:false}));
app.get('/api/parts',(_req,res)=>res.json(allParts().map(current)));
app.get('/api/checklist',(_req,res)=>res.json(checklist()));
app.get('/api/compatibility',(_req,res)=>res.json(refs()));
app.get('/api/parts/:id',wrap((req,res)=>res.json(current(getPart(req.params.id)))));
app.patch('/api/parts/:id/fields/:field',wrap((req,res)=>{
  const body=z.object({value:z.string(),testNote:z.string().default(''),revision:z.number().int()}).parse(req.body);
  const key=z.enum(fieldNames).parse(req.params.field);const part=getPart(req.params.id);version(part,body);
  confirmField(part,key,body.value,body.testNote);savePart(part);res.json(current(part));
}));
app.put('/api/parts/:id/draft',wrap((req,res)=>{
  const body=z.object({title:z.string(),description:z.string().max(10000),category:z.string(),revision:z.number().int()}).parse(req.body);
  const part=getPart(req.params.id);version(part,body);validateDraft(part,body,refs());
  const old=current(part).draft;invalidate(part);part.draftOverride={title:body.title,description:body.description,category:body.category};
  part.audit.push({id:randomUUID(),who:'Noor',when:new Date().toISOString(),action:'Edited grounded listing; approval invalidated',old:{title:old.title,description:old.description},new:part.draftOverride,source:'seller-confirmed'});savePart(part);res.json(current(part));
}));
app.post('/api/parts/:id/approve',wrap((req,res)=>{
  const body=z.object({approved:z.literal(true),revision:z.number().int()}).parse(req.body);const part=getPart(req.params.id);version(part,body);
  if(current(part).readiness.status!=='Ready for seller review')throw new Error('Approval blocked: resolve missing information and conflicts first. Unverified compatibility must remain explicitly unclaimed.');
  part.approval={who:'Noor',when:new Date().toISOString(),revision:part.revision,fingerprint:fingerprint(part,refs(),checklist())};
  part.audit.push({id:randomUUID(),who:'Noor',when:part.approval.when,action:'Approved this exact listing revision',old:false,new:true,source:'seller-confirmed'});savePart(part);res.json(current(part));
}));
app.post('/api/parts/:id/publish',wrap((req,res)=>{
  const body=z.object({revision:z.number().int()}).parse(req.body);const part=getPart(req.params.id);version(part,body);const view=current(part);
  if(!view.approved||view.readiness.status!=='Ready for seller review')throw new Error('Mock publish blocked: Noor must approve the current record, draft, reference dataset and test checklist.');
  const payload={mock:true,live_api_called:false,sku:part.id,marketplaceId:'EBAY_GB',format:'FIXED_PRICE',availableQuantity:1,condition:'USED',conditionDescription:`Used. ${view.draft.specifics['Testing status']}. ${part.fields.defects.value}.`,product:{title:view.draft.title,description:view.draft.description,aspects:Object.fromEntries(Object.entries(view.draft.specifics).map(([k,v])=>[k,[v]])),imageUrls:part.photos},categorySuggestion:view.draft.category,pricingSummary:{price:{value:part.fields.asking_price.value,currency:'GBP'}},merchantLocationKey:part.fields.storage_location.value,compatibility:{text:view.draft.compatibility,referenceIds:view.draft.references},shippingReadiness:{testOnly:true,version:checklist().version,date:checklist().date,disclaimer:checklist().disclaimer,shippingPolicyId:null,fulfillmentPolicyId:null},sellerApproval:part.approval,revision:part.revision};
  part.published={when:new Date().toISOString(),payload};part.audit.push({id:randomUUID(),who:'Noor',when:part.published.when,action:'Published mock payload (no eBay API)',old:null,new:{sku:part.id,mock:true},source:'seller-approved'});savePart(part);res.json({part:current(part),payload});
}));
app.post('/api/assistant',wrap((req,res)=>{
  const body=z.object({message:z.string().min(1).max(2000)}).parse(req.body);const refusal=prohibitedRequest(body.message);
  logEvent({who:'Noor',when:new Date().toISOString(),action:refusal?'Unsafe claim refused':'Evidence guidance',message:body.message});
  res.json({refused:!!refusal,message:refusal||'I can help clarify recorded evidence. To change a fact, answer its focused question. Upload a clearer label photo for unreadable identifiers. Donor records never establish fitment; only an approved reference can support compatibility.'});
}));
const refSchema=z.object({id:z.string().min(1),manufacturer:z.string().min(1),part_number:z.string().min(1),side:z.enum(['Left','Right']),make:z.string().min(1),model:z.string().min(1),year_from:z.coerce.number().int().min(1900).max(2100),year_to:z.coerce.number().int().min(1900).max(2100),configuration:z.string().min(1),reference:z.string().min(1),approved:z.union([z.boolean(),z.enum(['true','false'])]).transform(v=>v===true||v==='true')});
const decodeRows=(text:string,filename:string):Record<string,unknown>[]=>{
  const parsed=filename.toLowerCase().endsWith('.json')?JSON.parse(text):parse(text,{columns:true,skip_empty_lines:true,bom:true,trim:true});
  if(!Array.isArray(parsed)||parsed.length>200||parsed.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw new Error('Upload an array of up to 200 records (CSV headers or JSON objects).');
  return parsed;
};
app.post('/api/compatibility/import',upload.single('file'),wrap((req,res)=>{
  if(req.body.sellerApproved!=='true')throw new Error('Noor must explicitly approve the independent reference dataset.');
  if(!req.file||! /\.(csv|json)$/i.test(req.file.originalname))throw new Error('Upload compatibility CSV or JSON.');
  const rows=z.array(refSchema).min(1).max(200).parse(decodeRows(req.file.buffer.toString('utf8'),req.file.originalname)) as Compatibility[];
  if(rows.some(r=>r.year_from>r.year_to||prohibitedRequest(r.configuration)))throw new Error('Reference rows contain invalid years or prohibited claims.');
  rows.forEach(r=>validateValue('part_number',r.part_number));
  setSetting('compatibility',rows);
  for(const p of allParts()){invalidate(p);p.audit.push({id:randomUUID(),who:'Noor',when:new Date().toISOString(),action:'Approved reference dataset replaced; draft regenerated and listing approval invalidated',old:null,new:rows.length,source:'seller-approved reference'});savePart(p);}
  logEvent({action:'Reference import',who:'Noor',when:new Date().toISOString(),rows:rows.length});res.json({rows:rows.length,message:'Reference dataset replaced. Exact matches recalculated; seller approval is required again.'});
}));
app.post('/api/import',upload.array('files',12),wrap(async(req,res)=>{
  const mode=z.enum(['spreadsheet','donor','notes','photos']).parse(req.body.mode);
  const selected=String(req.body.partId||'');const files=req.files as Express.Multer.File[]||[];
  const notes=String(req.body.notes||'').trim();if(!files.length&&!notes)throw new Error('Add at least one file or a pasted note.');
  if((mode==='photos'||mode==='notes')&&!selected)throw new Error('Select the part these photos/notes belong to. We never guess source-to-part identity.');
  const changed=new Map<string,Part>();const warnings:string[]=[];let observations=0;
  const target=(id:string):Part=>{
    if(changed.has(id))return changed.get(id)!;
    let p:Part;try{p=getPart(id);}catch {if(!/^[A-Za-z0-9_-]{1,40}$/.test(id))throw new Error('Use a stable part_id with letters, numbers, hyphens or underscores.');p={id,batch:'Imported',fields:Object.fromEntries(fieldNames.map(k=>[k,missingField()])) as Part['fields'],photos:[],notes:[],revision:0,createdAt:new Date().toISOString(),audit:[]};}
    changed.set(id,p);return p;
  };
  const put=(p:Part,key:typeof fieldNames[number],value:string,source:Source,reference:string,confidence:number)=>{
    try{const normalized=key==='testing_status'&&['Not tested','لم يتم الاختبار','غير مختبر'].includes(value)?'Not tested':validateValue(key,value);addEvidence(p,key,normalized,source,reference,confidence);observations++;}catch(e){warnings.push(`${p.id} / ${key}: ${(e as Error).message}`);}
  };
  for(const file of files) {
    if(mode==='photos') {
      const png=file.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=file.buffer[0]===255&&file.buffer[1]===216&&file.buffer[2]===255;const webp=file.buffer.subarray(0,4).toString()==='RIFF'&&file.buffer.subarray(8,12).toString()==='WEBP';
      if(!png&&!jpg&&!webp)throw new Error('Photos must be genuine PNG, JPG, or WebP files, maximum 8 MB.');
      const mime=png?'image/png':jpg?'image/jpeg':'image/webp';const ext=png?'png':jpg?'jpg':'webp';
      const filename=`${randomUUID()}.${ext}`;fs.writeFileSync(path.join(dataPath,'uploads',filename),file.buffer);const p=target(selected);p.photos.push(`/uploads/${filename}`);
      try{const result=await extract('Uploaded photo; unknown or unreadable details must be omitted.','photo',{mime,base64:file.buffer.toString('base64')});warnings.push(...result.warnings);result.observations.forEach(o=>put(p,o.field,o.value,'photo',`${file.originalname}: ${o.quote}`,o.confidence));}catch(e){warnings.push((e as Error).message);}
    } else {
      if(!/\.(csv|json)$/i.test(file.originalname))throw new Error('Inventory and donor files must be CSV or JSON.');
      const source:Source=mode==='donor'?'donor record':'spreadsheet';
      for(const row of decodeRows(file.buffer.toString('utf8'),file.originalname)) {
        const id=String(row.part_id||selected||'');if(!id)throw new Error('Every row needs part_id, or select an existing part to attach it.');const p=target(id);
        for(const key of fieldNames)if(row[key]!==undefined&&String(row[key]).trim())put(p,key,String(row[key]),source,`${file.originalname} / ${id} / ${key}`,0.9);
        if(row.short_description){p.notes.push({text:String(row.short_description),source,reference:file.originalname});const result=await extract(String(row.short_description),source);warnings.push(...result.warnings);result.observations.forEach(o=>put(p,o.field,o.value,source,`${file.originalname}: ${o.quote}`,o.confidence));}
      }
    }
  }
  if(notes) {
    const p=target(selected);const source:Source=/[\u0600-\u06ff]/.test(notes)?'Arabic note':'WhatsApp';
    p.notes.push({text:notes,source,reference:'Pasted seller note'});
    const refusal=prohibitedRequest(notes);if(refusal)warnings.push(refusal);
    else {try {const result=await extract(notes,source);warnings.push(...result.warnings);result.observations.forEach(o=>put(p,o.field,o.value,source,`Pasted note: ${o.quote}`,o.confidence));}catch(e){warnings.push((e as Error).message);}}
  }
  for(const p of changed.values()){invalidate(p);p.audit.push({id:randomUUID(),who:'Noor',when:new Date().toISOString(),action:'Imported and merged explicit source evidence; approval invalidated',old:null,new:{mode,files:files.map(f=>f.originalname)},source:mode});savePart(p);}
  const report={id:randomUUID(),when:new Date().toISOString(),mode,parts:[...changed.keys()],observations,warnings:[...new Set(warnings)],files:files.map(f=>f.originalname)};logEvent(report);res.json(report);
}));
app.get('/api/inbox',(_req,res)=>{
  const parts=allParts();res.json(parts.flatMap(p=>p.audit.filter(a=>a.action.startsWith('Imported')).map(a=>({part:p.id,...a}))).sort((a,b)=>b.when.localeCompare(a.when)));
});
app.get('/api/impact',wrap((_req,res)=>{
  const key=readFixture<{records:Answer[]}>('answer_key.json');const manual=readFixture<{records:Baseline[]}>('manual_baseline.json');
  const result=evaluate(readFixture<Part[]>('seed_records.json'),readFixture<Compatibility[]>('compatibility.json'),checklist(),key.records,manual.records);
  const live=allParts();res.json({...result,session:{sellerCorrections:live.reduce((n,p)=>n+p.audit.filter(a=>a.field).length,0),approvals:live.filter(p=>current(p).approved).length,mockPublished:live.filter(p=>p.published).length}});
}));
app.use(express.static(path.join(root,'dist')));
app.get('*',(_req,res)=>{if(fs.existsSync(path.join(root,'dist','index.html')))res.sendFile(path.join(root,'dist','index.html'));else res.status(404).json({error:'Use http://localhost:5173 for development, or run npm run build first.'});});
app.use((error:Error,_req:Request,res:Response,_next:NextFunction)=>{console.error(error.message);res.status(error.message==='Part not found'?404:400).json({error:error instanceof z.ZodError?error.issues.map(i=>i.message).join('; '):error.message});});
app.listen(Number(process.env.PORT||3001),'0.0.0.0',()=>console.log(`Gulf2Global API + production app: http://localhost:${process.env.PORT||3001} · synthetic data · mock publish only`));
