import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {Database} from '../lib/database.ts';
import {syncPage,getSyncState} from '../lib/sync.ts';
import {takeLoginAttempt,validSession,newToken,sha256} from '../lib/auth.ts';

// This test intentionally clears its dedicated database. Refuse production names.
if(!/^toptech_test_[a-z0-9_]+$/.test(process.env.DB_NAME||''))throw Error('Use a dedicated DB_NAME starting with toptech_test_.');
const direct=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
const db=new Database();
try {
 await db.prepare('SELECT value FROM settings WHERE id=?').bind('initialize').first();
 for(const table of ['settings','records','events','messages','sessions','login_attempts','contacts'])await direct.query('DELETE FROM `'+table+'`');
 const get=async id=>(await db.prepare('SELECT value FROM settings WHERE id=?').bind(id).first())?.value;
 const put=(id,value)=>db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind(id,value);
 await put('unicode','João 🚗').run();await put('unicode','Cobrança ✅').run();assert.equal(await get('unicode'),'Cobrança ✅');
 const customers=[{id:'cus_1',name:'João'}],payments=Array.from({length:205},(_,i)=>({id:'pay_'+i,value:50}));
 const upstream=async path=>{const u=new URL(path,'https://test.invalid');const all=u.pathname==='/customers'?customers:payments;const offset=Number(u.searchParams.get('offset'));return {data:all.slice(offset,offset+100),hasMore:offset+100<all.length,totalCount:all.length}};
 await syncPage({db,fetchPage:upstream});await syncPage({db,fetchPage:upstream});
 assert.equal((await getSyncState(db)).payments,100);assert.equal(await get('activeGeneration'),undefined);
 // Closing/reopening the pool must preserve the cursor and rows.
 await db.close();await syncPage({db,fetchPage:upstream});const completed=await syncPage({db,fetchPage:upstream});
 assert.equal(completed.next,null);assert.equal(completed.progress.payments,205);assert.equal(await getSyncState(db),null);
 const generation=await get('activeGeneration');assert.ok(generation);
 const key=generation+':payments:pay_0';
 await db.prepare('INSERT INTO records(key,generation,kind,id,data) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(key,generation,'payments','pay_0',JSON.stringify({id:'pay_0',value:60})).run();
 assert.equal(JSON.parse((await db.prepare('SELECT data FROM records WHERE id=?').bind('pay_0').first()).data).value,60);
 await assert.rejects(db.batch([put('mustRollback','yes'),db.prepare('INSERT INTO settings(id,value) VALUES(?,?)').bind('unicode','duplicate')]));
 assert.equal(await get('mustRollback'),undefined);
 await assert.rejects(syncPage({db,fetchPage:async()=>{throw Error('upstream failure')}}),/upstream failure/);
 assert.equal(await get('syncLease'),undefined);assert.equal(await get('activeGeneration'),generation);
 let release;
 const pending=syncPage({db,fetchPage:path=>new Promise(resolve=>{release=()=>upstream(path).then(resolve)})});
 while(!release)await new Promise(resolve=>setTimeout(resolve,5));
 const competing=await syncPage({db,fetchPage:async()=>{throw Error('must not fetch')}});assert.equal(competing.waiting,true);release();await pending;
 // An expired lease can be claimed; the current one cannot.
 await put('syncLease','1').run();await syncPage({db,fetchPage:upstream});
 for(let i=0;i<5;i++)assert.equal(await takeLoginAttempt(db,'toptech'),true);
 assert.equal(await takeLoginAttempt(db,'toptech'),false);
 await direct.query('UPDATE login_attempts SET window_start=0');assert.equal(await takeLoginAttempt(db,'toptech'),true);
 await direct.query('DELETE FROM login_attempts');
 const concurrent=await Promise.all(Array.from({length:8},()=>takeLoginAttempt(db,'toptech')));
 assert.equal(concurrent.filter(Boolean).length,5);
 const token=newToken();await db.prepare('INSERT INTO sessions(id,platform_user,expires_at) VALUES(?,?,?)').bind(await sha256(token),'toptech',Date.now()+60000).run();
 const req=new Request('https://toptech.test/api/dashboard',{headers:{cookie:'__Host-toptech_session='+token}});
 assert.equal(await validSession(req,db),true);
 await db.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(token)).run();assert.equal(await validSession(req,db),false);
 const msg=()=>db.prepare("INSERT OR IGNORE INTO messages(id,customer,state,created_at) VALUES(?,?,'pending',?)").bind('test-message','cus_1',new Date().toISOString()).run();
 assert.equal((await msg()).meta.changes,1);assert.equal((await msg()).meta.changes,0);
 await db.prepare('INSERT INTO contacts(id,customer,kind,note,created_at) VALUES(?,?,?,?,?)').bind('test-contact','cus_1','phone','Contato de teste',new Date().toISOString()).run();
 const contacts=await db.prepare("SELECT customer,MAX(created_at) AS last_contact FROM (SELECT customer,created_at FROM contacts WHERE kind<>'note' UNION ALL SELECT customer,created_at FROM messages) AS contact_events GROUP BY customer").all();
 assert.equal(contacts.results[0].customer,'cus_1');
 console.log('PASS MySQL: Unicode, upserts, pagination, persisted resume, atomic rollback, competing sync, expired lease, concurrent login throttling, sessions, duplicate sends and contact aggregation.');
} finally {await db.close();await direct.end()}
