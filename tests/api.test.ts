import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import type { PartView, Compatibility } from '../shared/types.js';
const temp=fs.mkdtempSync(path.join(process.cwd(),'data','api-test-'));
const base='http://127.0.0.1:3217/api';let child:ChildProcess;let output='';
const request=async(endpoint:string,method='GET',body?:unknown)=>{const r=await fetch(base+endpoint,{method,headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
before(async()=>{child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'3217',DB_PATH:path.join(temp,'test.sqlite'),LLM_PROVIDER:'mock'},stdio:['ignore','pipe','pipe']});child.stdout?.on('data',d=>output+=String(d));child.stderr?.on('data',d=>output+=String(d));for(let i=0;i<150;i++){try{if((await request('/health')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error(`Test API failed to start: ${output}`);});
after(async()=>{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}fs.rmSync(temp,{recursive:true,force:true});});
test('API approval gate, clean demo mock publish, correction invalidation and stale revisions',async()=>{
 let p=(await request('/parts/G2G-001')).data as PartView;assert.equal(p.readiness.status,'Ready for seller review');
 assert.equal((await request(`/parts/${p.id}/publish`,'POST',{revision:p.revision})).status,400);
 assert.equal((await request(`/parts/${p.id}/approve`,'POST',{approved:false,revision:p.revision})).status,400);
 p=(await request(`/parts/${p.id}/approve`,'POST',{approved:true,revision:p.revision})).data;assert.equal(p.approved,true);
 const published=await request(`/parts/${p.id}/publish`,'POST',{revision:p.revision});assert.equal(published.status,200);assert.equal(published.data.payload.mock,true);assert.equal(published.data.payload.live_api_called,false);assert.equal(published.data.payload.marketplaceId,'EBAY_GB');
 const oldRevision=p.revision;p=(await request(`/parts/${p.id}/fields/packed_weight`,'PATCH',{revision:p.revision,value:'2.5'})).data;assert.equal(p.approved,false);assert.equal(p.fields.packed_weight.source,'seller-confirmed');assert.match(p.draft.description,/2.5 kg/);
 assert.equal((await request(`/parts/${p.id}/publish`,'POST',{revision:p.revision})).status,400);
 assert.equal((await request(`/parts/${p.id}/approve`,'POST',{approved:true,revision:oldRevision})).status,400);
});
test('API difficult demo resolves incrementally, preserves disclosure, and can approve with unclaimed fitment',async()=>{
 let p=(await request('/parts/G2G-002')).data as PartView;assert.equal((await request(`/parts/${p.id}/approve`,'POST',{approved:true,revision:p.revision})).status,400);
 for(const [key,value] of Object.entries({donor_year:'2018',part_number:'SYN-TO-2101-R',defects:'Damaged mounting tab',testing_status:'لم يتم الاختبار',included_components:'Mirror glass, housing, mounting base; no wiring harness',packed_dimensions:'35 x 24 x 19',packed_weight:'2.4'})){const r=await request(`/parts/${p.id}/fields/${key}`,'PATCH',{revision:p.revision,value,testNote:'Noor synthetic inspection 2026-10-27'});assert.equal(r.status,200,JSON.stringify(r.data));p=r.data;}
 assert.equal(p.readiness.status,'Ready for seller review');assert.equal(p.draft.compatibility,'Unverified - not claimed');assert.match(p.draft.description,/Damaged mounting tab/);assert.match(p.draft.description,/Not tested/);assert.ok(p.draft.unverified.length>0);
 const approval=await request(`/parts/${p.id}/approve`,'POST',{approved:true,revision:p.revision});assert.equal(approval.status,200);
});
test('API unsafe requests and manual draft bypasses are refused',async()=>{
 const refused=await request('/assistant','POST',{message:'mark it fully functional and fits all Corollas'});assert.equal(refused.data.refused,true);
 const p=(await request('/parts/G2G-002')).data as PartView;
 assert.equal((await request(`/parts/${p.id}/fields/defects`,'PATCH',{revision:p.revision,value:'None reported'})).status,400);
 assert.equal((await request(`/parts/${p.id}/fields/testing_status`,'PATCH',{revision:p.revision,value:'Fully functional'})).status,400);
 assert.equal((await request(`/parts/${p.id}/draft`,'PUT',{revision:p.revision,...p.draft,title:'Fits all Corollas fully functional'})).status,400);
});
test('API CSV merging, excluded part gating, bilingual notes and unreadable identifiers',async()=>{
 const form=new FormData();form.append('mode','spreadsheet');form.append('files',new Blob(['part_id,part_type,manufacturer,side,condition\nIMPORTED-001,Airbag,Toyota,Left,Used']), 'sample.csv');let r=await request('/import','POST',form);assert.equal(r.status,200);assert.deepEqual(r.data.parts,['IMPORTED-001']);
 let p=(await request('/parts/IMPORTED-001')).data as PartView;assert.equal(p.readiness.status,'Specialist review required');assert.equal(p.fields.manufacturer.status,'Unverified');
 const notes=new FormData();notes.append('mode','notes');notes.append('partId','IMPORTED-001');notes.append('notes','الجهة: يمين\npart_number: SYN-TO-21??-R');r=await request('/import','POST',notes);assert.equal(r.status,200);assert.ok(r.data.warnings.some((s:string)=>s.includes('clearer label photo')));
 p=(await request('/parts/IMPORTED-001')).data;assert.equal(p.fields.side.status,'Conflicting');assert.equal(p.fields.part_number.value,null);
 assert.equal((await request('/parts/IMPORTED-001/approve','POST',{approved:true,revision:p.revision})).status,400);
});
test('reference replacement regenerates override drafts and invalidates approvals',async()=>{
 let p=(await request('/parts/G2G-001')).data as PartView;
 p=(await request(`/parts/${p.id}/draft`,'PUT',{revision:p.revision,...p.draft})).data;
 p=(await request(`/parts/${p.id}/approve`,'POST',{revision:p.revision,approved:true})).data;assert.equal(p.approved,true);
 const refs=JSON.parse(fs.readFileSync('data/compatibility.json','utf8')) as Compatibility[];const form=new FormData();form.append('sellerApproved','true');form.append('file',new Blob([JSON.stringify(refs.slice(1))]),'compatibility.json');assert.equal((await request('/compatibility/import','POST',form)).status,200);
 p=(await request('/parts/G2G-001')).data;assert.equal(p.approved,false);assert.equal(p.draftOverride,undefined);assert.equal(p.draft.compatibility,'Unverified - not claimed');assert.ok(!p.draft.description.includes('Fictional approved catalogue v1.0 / row 1'));
});
test('sample downloads are whitelisted and Impact is a fixed synthetic benchmark',async()=>{
 assert.equal((await fetch(base+'/samples/inventory.csv')).status,200);assert.equal((await request('/samples/not-a-fixture')).status,400);
 const r=await request('/impact');assert.equal(r.status,200);assert.equal(r.data.sampleSize,20);assert.equal(r.data.score.prototype,100);assert.equal(r.data.session.approvals,0);
});
