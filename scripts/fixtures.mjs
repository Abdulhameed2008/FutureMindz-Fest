import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'data');
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(path.join(root, 'public', 'mirrors'), { recursive: true });
const names = ['part_type','manufacturer','part_number','side','donor_make','donor_model','donor_year','condition','defects','testing_status','included_components','packed_dimensions','packed_weight','storage_location','asking_price'];
const models = [['Toyota','Camry',2019],['Toyota','Corolla',2017],['Nissan','Altima',2018],['Mercedes-Benz','C-Class',2016],['BMW','3 Series',2018],['Toyota','RAV4',2020],['Lexus','IS',2017],['Nissan','Patrol',2019],['Honda','Accord',2018],['Hyundai','Tucson',2020],['Kia','Sportage',2019],['Toyota','Yaris',2016],['Nissan','Sentra',2017],['Mazda','CX-5',2020],['Ford','Focus',2018],['Volkswagen','Golf',2017],['Audi','A4',2019],['Mitsubishi','ASX',2018],['Honda','Civic',2019],['Hyundai','Elantra',2017]];
const now = '2026-10-27T08:00:00.000Z';
const field = (value, source = 'seller-confirmed', reference = 'Synthetic seller intake signed by Noor') => ({ value, source: value ? source : null, status: value ? (source === 'seller-confirmed' ? 'Confirmed' : 'Unverified') : 'Missing', confidence: value ? (source === 'seller-confirmed' ? 1 : 0.88) : 0, evidence: value ? [{ value, source, reference, confidence: source === 'seller-confirmed' ? 1 : 0.88, recordedAt: now }] : [] });
const parts = models.map(([make, model, year], i) => {
  const id = `G2G-${String(i + 1).padStart(3,'0')}`;
  const side = i % 2 === 0 ? 'Left' : 'Right';
  const values = { part_type:'Side-view mirror', manufacturer:make, part_number:`SYN-${make.slice(0,2).toUpperCase()}-${2100+i}-${side[0]}`, side, donor_make:make, donor_model:model, donor_year:String(year), condition:'Used', defects:'None reported', testing_status:i % 4 === 0 ? 'Seller tested: adjustment motor only' : 'Not tested', included_components:'Mirror glass, housing, mounting base; no wiring harness', packed_dimensions:'35 x 24 x 19', packed_weight:'2.4', storage_location:`DXB · A${Math.floor(i/5)+1}-${String(i%5+1).padStart(2,'0')}`, asking_price:String(48+i*6) };
  const fields = Object.fromEntries(names.map(k => [k, field(values[k], k.startsWith('donor_') ? 'donor record' : k === 'asking_price' || k === 'storage_location' ? 'spreadsheet' : 'seller-confirmed')]));
  for (const k of ['asking_price', 'storage_location']) {
    const confirmed = field(values[k]);
    confirmed.evidence.unshift(...fields[k].evidence);
    fields[k] = confirmed;
  }
  if (i % 4 === 0) fields.testing_status.evidence[0].reference = 'Noor synthetic test log / 2026-10-27: bench 12V supply, adjustment motor moved both axes; heating and folding not tested.';
  const notes = [{ text:`${id}: used ${side.toLowerCase()} mirror. ${i%4 === 0 ? 'Noor recorded: adjustment motor tested only; heating and folding not tested.' : 'Not tested. Do not claim functionality.'}`, source:'WhatsApp', reference:`whatsapp_en.txt / ${id}` }, { text:`${id}: مرآة مستعملة. لا تدّعِ التوافق دون مرجع مستقل.`, source:'Arabic note', reference:`whatsapp_ar.txt / ${id}` }];
  if ([2,5,8,10,12,15,18].includes(i)) fields.packed_weight = field(null);
  if ([2,6,9,11,14,17].includes(i)) fields.packed_dimensions = field(null);
  if ([11,16].includes(i)) fields.part_number = field(null);
  if ([5,12,18].includes(i)) fields.included_components = field(null);
  if ([3,6,9,13,16,19].includes(i)) {
    fields.defects = field(i%2 ? 'Scratches on outer housing' : 'Crack on mirror glass', 'photo', `Synthetic placeholder inspection ${id}`);
    notes.push({text:`${id}: ${fields.defects.value}. Please confirm before listing.`,source:'WhatsApp',reference:`whatsapp_en.txt / ${id}`});
  }
  if (i === 1) {
    fields.part_number = field('SYN-TO-21??-R','photo','Label partly unreadable; unknown digits must not be inferred');
    fields.donor_year.status = 'Conflicting'; fields.donor_year.value = null;
    fields.donor_year.evidence.push({value:'2018',source:'Arabic note',reference:'Dismantling note: السيارة المانحة كورولا 2018',confidence:0.9,recordedAt:now});
    fields.donor_year.evidence[0].source = 'spreadsheet'; fields.donor_year.source = 'spreadsheet';
    fields.defects = field('Damaged mounting tab','photo','Synthetic photo: broken mounting tab');
    fields.testing_status = field('Not tested','WhatsApp','Noor intake message: لم يتم الاختبار');
    fields.packed_dimensions = field(null); fields.packed_weight = field(null); fields.included_components = field(null);
    notes.push({text:`${id}: Corolla 2017 in spreadsheet; dismantling note says 2018. Part label partly unreadable. Damaged mounting tab. Not tested.`,source:'WhatsApp',reference:'Difficult demo intake'}, {text:`${id}: كورولا 2018. لسان التثبيت مكسور. رقم القطعة غير واضح. لم يتم الاختبار.`,source:'Arabic note',reference:'Dismantling message'});
  }
  if (i === 7) {
    fields.side.value = null; fields.side.status = 'Conflicting';
    fields.side.evidence.push({value:'Left',source:'WhatsApp',reference:'Note disagrees with donor label',confidence:0.8,recordedAt:now});
  }
  return {id,batch:i<10 ? 'Demo batch · 10 mirrors' : 'Extended sample',fields,photos:[`/mirrors/${id}.svg`],notes,revision:1,createdAt:now,audit:[{id:`seed-${id}`,who:'Noor (synthetic)',when:now,action:'Merged synthetic intake sources',old:null,new:id,source:'seed fixtures'}]};
});
const write = (name, value) => fs.writeFileSync(path.join(data,name), typeof value === 'string' ? value : JSON.stringify(value,null,2));
write('seed_records.json',parts);
write('inventory.csv','part_id,short_description,asking_price,storage_location,donor_year\n'+parts.map(p=>`${p.id},Used ${p.fields.donor_make.value} ${p.fields.donor_model.value} side-view mirror,${p.fields.asking_price.value},${p.fields.storage_location.value},${p.id==='G2G-002' ? 2017 : p.fields.donor_year.value}`).join('\n'));
write('donor_records.json',parts.map(p=>({part_id:p.id,donor_make:p.fields.donor_make.value,donor_model:p.fields.donor_model.value,donor_year:p.id==='G2G-002' ? '2018' : p.fields.donor_year.value})));
write('donor_records.csv','part_id,donor_make,donor_model,donor_year\n'+parts.map(p=>`${p.id},${p.fields.donor_make.value},${p.fields.donor_model.value},${p.id==='G2G-002' ? '2018' : p.fields.donor_year.value}`).join('\n'));
write('whatsapp_en.txt',parts.flatMap(p=>p.notes.filter(n=>n.source==='WhatsApp').map(n=>n.text)).join('\n'));
write('whatsapp_ar.txt',parts.flatMap(p=>p.notes.filter(n=>n.source==='Arabic note').map(n=>n.text)).join('\n'));
const compatibility = [0,2,4,8].map(i=>({id:`SYN-REF-${i+1}`,manufacturer:models[i][0],part_number:parts[i].fields.part_number.evidence[0]?.value || 'SYN-BM-2104-L',side:parts[i].fields.side.value,make:models[i][0],model:models[i][1],year_from:models[i][2],year_to:models[i][2],configuration:'Synthetic reference: same side; adjustment motor; connector and UK configuration must be independently checked',reference:`Fictional approved catalogue v1.0 / row ${i+1}`,approved:true}));
write('compatibility.json',compatibility);
write('compatibility.csv',Object.keys(compatibility[0]).join(',')+'\n'+compatibility.map(r=>Object.values(r).map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'));
write('checklist.json',{version:'TEST-1.0',date:'2026-10-27',label:'TEST listing + shipping-readiness checklist',corridor:'UAE → UK',disclaimer:'Test checklist only. Not legal or customs clearance.',rules:[
  {id:'scope',title:'Eligible, non-excluded side-view mirror',title_ar:'مرآة جانبية ضمن النطاق المسموح',fields:['part_type'],severity:'specialist'},
  {id:'identity',title:'Identifier, manufacturer and position verified',title_ar:'تأكيد الرقم والشركة والجهة',fields:['manufacturer','part_number','side'],severity:'required'},
  {id:'donor',title:'Donor records have no unresolved conflicts',title_ar:'لا توجد تناقضات في بيانات السيارة المانحة',fields:['donor_make','donor_model','donor_year'],severity:'specialist'},
  {id:'condition',title:'Used condition, all defects and test status disclosed',title_ar:'توضيح الحالة المستعملة والعيوب والاختبار',fields:['condition','defects','testing_status'],severity:'required'},
  {id:'components',title:'Included components identified',title_ar:'تحديد المكونات المشمولة',fields:['included_components'],severity:'required'},
  {id:'packing',title:'Packed dimensions and weight recorded',title_ar:'تسجيل أبعاد ووزن التغليف',fields:['packed_dimensions','packed_weight'],severity:'required'},
  {id:'storage',title:'Storage location and asking price recorded',title_ar:'تسجيل موقع التخزين والسعر',fields:['storage_location','asking_price'],severity:'required'},
  {id:'compatibility',title:'Compatibility supported or explicitly not claimed',title_ar:'التوافق مدعوم بمرجع أو غير مزعوم',fields:[],severity:'required'},
  {id:'shipping',title:'UK carrier, service, import charges and packaging need seller review',title_ar:'مراجعة الناقل والرسوم والتغليف مطلوبة',fields:[],severity:'required'}
]});
const answerKey = parts.map(p=>({id:p.id,expected_fields:Object.fromEntries(names.map(k=>[k,p.fields[k].status==='Conflicting' || k==='part_number' && /\?/.test(p.fields[k].value || '') ? null : p.fields[k].value])),expected_gaps:names.filter(k=>p.fields[k].status==='Missing'||p.fields[k].status==='Conflicting'||['part_number','defects','testing_status'].includes(k)&&p.fields[k].status==='Unverified'),expected_conflicts:names.filter(k=>p.fields[k].status==='Conflicting'),required_defects:p.fields.defects.value==='None reported'?[]:[p.fields.defects.value],compatibility_should_be_unclaimed:!compatibility.some(r=>r.part_number===p.fields.part_number.value&&p.fields.part_number.status==='Confirmed')}));
write('answer_key.json',{label:'Synthetic judge answer key. Never used by extraction or listing generation.',version:'1.0',records:answerKey});
write('manual_baseline.json',{label:'Simulated manual baseline, not a measured user study',method:'Same 20 source packets; fictional operator timings and deliberate source-reconciliation omissions for reproducible comparison.',records:answerKey.map((k,i)=>({id:k.id,preparation_seconds:180+i%5*35,attributes:{...k.expected_fields,...(k.expected_conflicts.includes('donor_year')?{donor_year:'2017'}:{}),...(k.expected_fields.part_number===null?{part_number:'UNKNOWN-GUESSED'}:{})},detected_gaps:k.expected_gaps.filter((_,j)=>j%2===0),detected_conflicts:[],disclosed_defects:i%3===0?[]:k.required_defects,compatibility_claimed:i%2===0,corrections_before_approval:k.expected_gaps.length+ k.expected_conflicts.length+ (i%3===0?k.required_defects.length:0)}))});
for (const p of parts) {
 const damage = p.fields.defects.value==='Damaged mounting tab';
 const scratch = p.fields.defects.value!=='None reported';
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 340"><defs><linearGradient id="h" x2=".8" y2="1"><stop stop-color="#444d50"/><stop offset=".5" stop-color="#171f23"/><stop offset="1" stop-color="#4e5557"/></linearGradient><linearGradient id="g" x2=".8" y2="1"><stop stop-color="#d0e5e5"/><stop offset=".45" stop-color="#9bb8be"/><stop offset="1" stop-color="#67818a"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="15" stdDeviation="13" flood-opacity=".18"/></filter></defs><rect width="480" height="340" fill="#eaece6"/><ellipse cx="243" cy="268" rx="158" ry="18" fill="#23382f" opacity=".06"/><g filter="url(#s)" transform="rotate(-12 240 180)"><path d="M315 174 L390 223 L393 264 L351 258 L293 203Z" fill="#242e30"/><path d="M96 145 Q91 94 148 86 L286 95 Q337 111 338 178 Q331 222 275 230 L132 211 Q83 191 96 145Z" fill="url(#h)"/><path d="M108 143 Q108 108 151 100 L281 107 Q315 117 322 162 Q326 200 277 212 L139 198 Q100 189 108 143Z" fill="url(#g)" stroke="#66787d" stroke-width="3"/><path d="M124 124 Q182 101 275 124" fill="none" stroke="#f5faf7" opacity=".6" stroke-width="5"/>${scratch?'<path d="M167 175 l34 -18 m-17 32 l28 -23" stroke="#dfe6df" stroke-width="2"/>':''}${damage?'<path d="M355 233 l16 6 -11 9 15 7 -19 1" fill="#eaece6"/>':''}</g><text x="22" y="320" font-size="11" fill="#718079" font-family="Arial">SYNTHETIC PLACEHOLDER · ${p.id} · NOT EVIDENCE OF FITMENT</text></svg>`;
 fs.writeFileSync(path.join(root,'public','mirrors',`${p.id}.svg`),svg);
}
console.log('Generated 20 synthetic mirrors, EN/AR sources, compatibility, checklist and judge fixtures.');
