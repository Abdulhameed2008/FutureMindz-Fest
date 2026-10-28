import { performance } from 'node:perf_hooks';
import { fieldNames, type Part, type Compatibility, type Checklist } from '../shared/types.js';
import { viewPart } from './engine.js';
export interface Answer { id:string;expected_fields:Record<string,string|null>;expected_gaps:string[];expected_conflicts:string[];required_defects:string[];compatibility_should_be_unclaimed:boolean; }
export interface Baseline {id:string;preparation_seconds:number;attributes:Record<string,string|null>;detected_gaps:string[];detected_conflicts:string[];disclosed_defects:string[];compatibility_claimed:boolean;corrections_before_approval:number;}
export function evaluate(parts:Part[],refs:Compatibility[],checklist:Checklist,key:Answer[],manual:Baseline[]) {
  const started=performance.now();
  const views=parts.map(p=>viewPart(p,refs,checklist));
  const elapsed=performance.now()-started;
  let facts=0,correct=0,manualCorrect=0,totalGaps=0,gaps=0,manualGaps=0,totalConflicts=0,conflicts=0,manualConflicts=0,totalDefects=0,defects=0,manualDefects=0,uncertain=0,safe=0,manualSafe=0,corrections=0;
  const rows=key.map(answer=>{
    const v=views.find(p=>p.id===answer.id);const m=manual.find(p=>p.id===answer.id);if(!v||!m)throw new Error('Evaluation packets do not match the answer key.');
    for(const k of fieldNames){facts++;const f=v.fields[k];const expected=answer.expected_fields[k];const predicted=f.status==='Conflicting'||k==='part_number'&&/\?/.test(f.value||'')?null:f.value;if(predicted===expected)correct++;if(m.attributes[k]===expected)manualCorrect++;}
    totalGaps+=answer.expected_gaps.length;gaps+=answer.expected_gaps.filter(k=>v.questions.some(q=>q.field===k)).length;manualGaps+=answer.expected_gaps.filter(k=>m.detected_gaps.includes(k)).length;
    totalConflicts+=answer.expected_conflicts.length;conflicts+=answer.expected_conflicts.filter(k=>v.fields[k as keyof typeof v.fields].status==='Conflicting').length;manualConflicts+=answer.expected_conflicts.filter(k=>m.detected_conflicts.includes(k)).length;
    totalDefects+=answer.required_defects.length;defects+=answer.required_defects.filter(d=>v.draft.description.includes(d)).length;manualDefects+=answer.required_defects.filter(d=>m.disclosed_defects.includes(d)).length;
    if(answer.compatibility_should_be_unclaimed){uncertain++;if(v.draft.compatibility==='Unverified - not claimed')safe++;if(!m.compatibility_claimed)manualSafe++;}
    corrections+=v.questions.length;
    return {id:v.id,status:v.readiness.status,questions:v.questions.length,defectsDisclosed:answer.required_defects.every(d=>v.draft.description.includes(d)),compatibility:v.draft.compatibility==='Unverified - not claimed'?'Correctly unclaimed':'Approved reference'};
  });
  const pct=(n:number,d:number)=>d?Math.round(n/d*100):100;
  const metrics=[
    {label:'Attribute accuracy',prototype:pct(correct,facts),manual:pct(manualCorrect,facts),unit:'%',numerator:correct,denominator:facts},
    {label:'Missing-information detection',prototype:pct(gaps,totalGaps),manual:pct(manualGaps,totalGaps),unit:'%',numerator:gaps,denominator:totalGaps},
    {label:'Conflict detection',prototype:pct(conflicts,totalConflicts),manual:pct(manualConflicts,totalConflicts),unit:'%',numerator:conflicts,denominator:totalConflicts},
    {label:'Condition disclosure',prototype:pct(defects,totalDefects),manual:pct(manualDefects,totalDefects),unit:'%',numerator:defects,denominator:totalDefects},
    {label:'Safe compatibility handling',prototype:pct(safe,uncertain),manual:pct(manualSafe,uncertain),unit:'%',numerator:safe,denominator:uncertain}
  ];
  return {generatedAt:new Date().toISOString(),sampleSize:parts.length,label:'Reproducible synthetic benchmark — not a user study',method:'Both workflows use the same original 20 source packets. Prototype generation is measured in-process; manual timings and outputs are simulated fixtures. Human reading/answer time is not measured. Correctly unclaimed compatibility is rewarded; unsupported claims are penalized. Evaluation uses original seed records, not current seller corrections.',metrics,preparation:{prototypeMachineMs:Number(elapsed.toFixed(2)),manualSimulatedSeconds:manual.reduce((n,m)=>n+m.preparation_seconds,0),humanReviewTime:'Not measured; seller review and answers still required'},corrections:{prototypeOpenQuestions:corrections,manualSimulated:manual.reduce((n,m)=>n+m.corrections_before_approval,0),note:'Open questions are intentional safety work, not invented completions. Counts are unresolved answers needed before approval; this is not a measured correction study.'},score:{prototype:Math.round(metrics.reduce((s,m)=>s+m.prototype,0)/metrics.length),manual:Math.round(metrics.reduce((s,m)=>s+m.manual,0)/metrics.length)},rows};
}
