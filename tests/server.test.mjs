import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import mysql from 'mysql2/promise';
import {hashPassword,newToken} from '../lib/auth.ts';
if(!/^toptech_test_[a-z0-9_]+$/.test(process.env.DB_NAME||''))throw Error('Use a dedicated DB_NAME starting with toptech_test_.');
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
await db.query('DELETE FROM login_attempts');await db.end();
const password=newToken(),salt=newToken();
const origin='https://toptech.test',base='http://127.0.0.1:33308';
const server=spawn(process.execPath,['.next/standalone/server.js'],{windowsHide:true,env:{...process.env,PORT:'33308',HOSTNAME:'127.0.0.1',APP_URL:origin,ENCRYPTION_KEY:newToken(),TOPTECH_PASSWORD_HASH:'pbkdf2:100000:'+salt+':'+await hashPassword(password,salt)},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const post=(path,body={},cookie='',requestOrigin=origin)=>fetch(base+path,{method:'POST',headers:{origin:requestOrigin,'Content-Type':'application/json',cookie},body:JSON.stringify(body)});
try {
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth/session')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.ok(ready,'Standalone server did not start: '+logs);
 const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();
 const asset=html.match(/src="([^\"]*\/_next\/static\/[^\"]+\.js)"/)?.[1];assert.ok(asset);assert.equal((await fetch(base+asset)).status,200);
 assert.equal((await fetch(base+'/api/dashboard',{headers:{'oai-authenticated-user-id':'forged'}})).status,401);
 assert.equal((await post('/api/auth/login',{username:'toptech',password},'','https://wrong.test')).status,400);
 assert.equal((await post('/api/auth/login',{username:'toptech',password:'wrong'})).status,401);
 const login=await post('/api/auth/login',{username:'toptech',password});assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/__Host-toptech_session=/);assert.match(setCookie,/Secure/);assert.match(setCookie,/HttpOnly/);
 const cookie=setCookie.split(';')[0];
 assert.equal((await (await fetch(base+'/api/auth/session',{headers:{cookie}})).json()).authenticated,true);
 const dashboard=await fetch(base+'/api/dashboard',{headers:{cookie}});assert.equal(dashboard.status,200);const data=await dashboard.json();assert.equal(data.customers.length,1);assert.equal(data.payments.length,205);
 const contacts=await post('/api/contacts',{customer:'cus_1',kind:'note',note:'Teste de persistência HTTP'},cookie);assert.equal(contacts.status,200);
 assert.equal((await fetch(base+'/api/contacts?customer=cus_1',{headers:{cookie}})).status,200);
 assert.equal((await post('/api/webhooks/asaas',{})).status,401);
 assert.equal((await post('/api/auth/logout',{},cookie)).status,200);
 assert.equal((await fetch(base+'/api/dashboard',{headers:{cookie}})).status,401);
 console.log('PASS standalone HTTP: page and static assets, origin validation behind proxy, password login without ChatGPT, secure cookies, authenticated dashboard, contact persistence, webhook protection and logout.');
} finally {server.kill();await new Promise(resolve=>server.once('exit',resolve));}
