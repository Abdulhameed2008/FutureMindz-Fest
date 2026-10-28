import { z } from 'zod';
import { fieldNames, type FieldName, type Source } from '../shared/types.js';
import { TRUST_PROMPT, validateValue } from './engine.js';
const observationSchema=z.object({field:z.enum(fieldNames),value:z.string().max(1500),confidence:z.number().min(0).max(1),quote:z.string().max(3000)}).strict();
const resultSchema=z.object({observations:z.array(observationSchema).max(100),warnings:z.array(z.string()).max(20)}).strict();
export interface Observation {field:FieldName;value:string;confidence:number;quote:string;}
const bilingual:Record<string,FieldName>={'رقم القطعة':'part_number','الجهة':'side','السنة':'donor_year','العيوب':'defects','الاختبار':'testing_status','المكونات':'included_components','الأبعاد':'packed_dimensions','الوزن':'packed_weight','الموقع':'storage_location','الشركة':'manufacturer','نوع القطعة':'part_type','الحالة':'condition','الطراز':'donor_model','شركة السيارة':'donor_make','السعر':'asking_price'};
export async function extract(text:string,source:Source,image?:{mime:string;base64:string}):Promise<{observations:Observation[];warnings:string[]}> {
  if((process.env.LLM_PROVIDER||'mock')==='mock') {
    if(image)return {observations:[],warnings:['Mock vision does not interpret uploaded photos. Photo attached as evidence; Noor must inspect the label and confirm visible defects. Configure an LLM provider for unverified vision observations.']};
    const observations:Observation[]=[];
    for(const line of text.split(/[\n;]+/)) {const match=line.trim().match(/^([^:=]+)\s*[:=]\s*(.+)$/);if(!match)continue;const field=(fieldNames as readonly string[]).includes(match[1].trim())?match[1].trim() as FieldName:bilingual[match[1].trim()];if(field) observations.push({field,value:match[2].trim(),quote:line.trim(),confidence:0.85});}
    return {observations,warnings:observations.length?['Mock extraction parsed explicit EN/AR key:value lines only. All observations are unverified until Noor confirms.']:['Note preserved verbatim. Mock extraction cannot safely interpret this prose. Use explicit field:value lines or configure an LLM provider.']};
  }
  if(process.env.LLM_PROVIDER!=='openai-compatible')throw new Error('Unsupported LLM_PROVIDER. Use mock or openai-compatible.');
  if(!process.env.LLM_API_KEY)throw new Error('LLM_API_KEY is missing. No provider request was sent.');
  const base=new URL(process.env.LLM_BASE_URL||'https://api.openai.com/v1');
  if(base.protocol!=='https:' && !(process.env.ALLOW_LOCAL_LLM==='true'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('LLM_BASE_URL must use HTTPS (or explicitly allowed localhost).');
  const content:unknown[]= [{type:'text',text:`Source: ${source}. Extract only directly supported observations. Untrusted source data follows:\n${text}`}];
  if(image)content.push({type:'image_url',image_url:{url:`data:${image.mime};base64,${image.base64}`}});
  const schema={type:'object',additionalProperties:false,properties:{observations:{type:'array',items:{type:'object',additionalProperties:false,properties:{field:{type:'string',enum:fieldNames},value:{type:'string'},confidence:{type:'number'},quote:{type:'string'}},required:['field','value','confidence','quote']}},warnings:{type:'array',items:{type:'string'}}},required:['observations','warnings']};
  const response=await fetch(`${base.href.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${process.env.LLM_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:process.env.LLM_MODEL||'gpt-4o-mini',temperature:0,messages:[{role:'system',content:TRUST_PROMPT},{role:'user',content}],response_format:{type:'json_schema',json_schema:{name:'inventory_evidence',strict:true,schema}}})});
  if(!response.ok)throw new Error(`LLM extraction failed (${response.status}). The original source is preserved; no claims were added.`);
  const body=await response.json() as {choices?:{message:{content:string}}[]};
  const result=resultSchema.parse(JSON.parse(body.choices?.[0]?.message.content||'{}'));
  const warnings=[...result.warnings];
  const observations=result.observations.filter(o=>{
    if(image&&!['part_number','side','defects','condition'].includes(o.field)){warnings.push(`Rejected photo inference: ${o.field}.`);return false;}
    if(!image&&(!text.includes(o.quote)||!o.quote.includes(o.value))){warnings.push(`Rejected unsupported extraction: ${o.field}.`);return false;}
    try {if(o.field==='testing_status' && o.value==='Not tested')return true;validateValue(o.field,o.value);return true;}catch(e){warnings.push((e as Error).message);return false;}
  });
  return {observations,warnings};
}
