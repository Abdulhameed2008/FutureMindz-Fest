import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import type { Part, Compatibility, Checklist } from '../shared/types.js';
export const root=process.cwd();
export const dataPath=path.join(root,'data');
if(!fs.existsSync(path.join(dataPath,'seed_records.json'))) execFileSync(process.execPath,[path.join(root,'scripts','fixtures.mjs')],{stdio:'inherit'});
const dbPath=path.resolve(root,process.env.DB_PATH||'data/gulf2global.sqlite');
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
export const db=new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, body TEXT NOT NULL);');
export function readFixture<T>(name:string): T {return JSON.parse(fs.readFileSync(path.join(dataPath,name),'utf8')) as T;}
export function savePart(part:Part):void {db.prepare('INSERT INTO parts (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(part.id,JSON.stringify(part));}
export function getPart(id:string):Part {const row=db.prepare('SELECT body FROM parts WHERE id=?').get(id) as {body:string}|undefined;if(!row)throw new Error('Part not found');return JSON.parse(row.body);}
export function allParts():Part[] {return (db.prepare('SELECT body FROM parts ORDER BY id').all() as {body:string}[]).map(r=>JSON.parse(r.body));}
export function setting<T>(key:string,fallback:()=>T):T {const row=db.prepare('SELECT body FROM settings WHERE key=?').get(key) as {body:string}|undefined;return row?JSON.parse(row.body):fallback();}
export function setSetting(key:string,value:unknown):void {db.prepare('INSERT INTO settings (key,body) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,JSON.stringify(value));}
export function refs():Compatibility[] {return setting('compatibility',()=>readFixture('compatibility.json'));}
export function checklist():Checklist {return readFixture('checklist.json');}
export function logEvent(event:unknown):void {db.prepare('INSERT INTO events (body) VALUES (?)').run(JSON.stringify(event));}
if((db.prepare('SELECT COUNT(*) AS count FROM parts').get() as {count:number}).count===0) readFixture<Part[]>('seed_records.json').forEach(savePart);
