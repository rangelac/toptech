import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {syncPage,getSyncState} from '../lib/sync.ts';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE settings(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE records(key TEXT PRIMARY KEY,generation TEXT,kind TEXT,id TEXT,data TEXT);');let failBatch=false;const db={prepare(query){return {bind(...args){return {run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}},first(){return sql.prepare(query).get(...args)||null},all(){return {results:sql.prepare(query).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items){item.run();if(failBatch){failBatch=false;throw Error('simulated database failure')}}sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}},failNextBatch(){failBatch=true},sql};return db}
const get=(db,id)=>db.sql.prepare('SELECT value FROM settings WHERE id=?').get(id)?.value;
const rows=(db)=>Number(db.sql.prepare('SELECT COUNT(*) AS n FROM records').get().n);
const customers=[{id:'cus_1'},{id:'cus_2'}],payments=Array.from({length:205},(_,i)=>({id:'pay_'+i}));
function upstream(path){const u=new URL(path,'https://test.invalid');const records=u.pathname==='/customers'?customers:payments;const offset=Number(u.searchParams.get('offset'));return Promise.resolve({data:records.slice(offset,offset+100),totalCount:records.length,hasMore:offset+100<records.length})}
const db=database();
await syncPage({db,fetchPage:upstream});assert.equal(rows(db),2);assert.equal(get(db,'activeGeneration'),undefined);
await syncPage({db,fetchPage:upstream});assert.equal((await getSyncState(db)).payments,100);
// A page reload discards the response and cursor; a fresh request resumes server state.
await syncPage({db,fetchPage:upstream});assert.equal((await getSyncState(db)).payments,200);
const completed=await syncPage({db,fetchPage:upstream});assert.equal(completed.next,null);assert.equal(rows(db),207);assert.ok(get(db,'activeGeneration'));assert.equal(await getSyncState(db),null);
// Upstream failures release the lease and keep the committed snapshot/cursor.
const before=get(db,'activeGeneration');await assert.rejects(syncPage({db,fetchPage:async()=>{throw Error('network failure')}}),/network failure/);assert.equal(get(db,'syncLease'),undefined);assert.equal(get(db,'activeGeneration'),before);assert.equal(JSON.parse(get(db,'syncJob')).offset,0);
await syncPage({db,fetchPage:upstream});db.failNextBatch();const cursor=get(db,'syncJob'),count=rows(db);await assert.rejects(syncPage({db,fetchPage:upstream}),/simulated/);assert.equal(get(db,'syncJob'),cursor);assert.equal(rows(db),count);assert.equal(get(db,'syncLease'),undefined);
// Two tabs cannot fetch the same page at once.
let release;const pending=syncPage({db,fetchPage:path=>new Promise(resolve=>{release=()=>upstream(path).then(resolve)})});while(!release)await new Promise(resolve=>setTimeout(resolve,1));const competing=await syncPage({db,fetchPage:async()=>{throw Error('must not fetch')}});assert.equal(competing.waiting,true);release();await pending;
// Resume the legacy cursor used by the first release; don't restart at zero.
const legacy=database();legacy.sql.prepare('INSERT INTO settings VALUES(?,?)').run('syncJob',JSON.stringify({id:'old',kind:'payments',offset:500,time:0}));let requested='';const result=await syncPage({db:legacy,fetchPage:async path=>{requested=path;return {data:[{id:'pay_500'}],hasMore:false,totalCount:501}}});assert.match(requested,/offset=500/);assert.equal(result.next,null);assert.equal(get(legacy,'activeGeneration'),'old');
console.log('PASS: page reload resume, atomic publication, network retry, transaction rollback, concurrent tabs and legacy cursor recovery.');
