type SyncDeps = { db: any; fetchPage: (path: string) => Promise<any> };
const put = (db: any, id: string, value: string) => db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind(id,value);
async function read(db:any,id:string){return (await db.prepare('SELECT value FROM settings WHERE id=?').bind(id).first())?.value||null}
export async function getSyncState(db:any){
 const raw=await read(db,'syncJob');if(!raw)return null;
 const job=JSON.parse(raw);
 const counts=await db.prepare('SELECT kind,COUNT(*) AS count FROM records WHERE generation=? GROUP BY kind').bind(job.id).all();
 const totals:any={customers:0,payments:0};for(const row of counts.results)totals[row.kind]=Number(row.count);
 return {pending:true,phase:job.kind,customers:totals.customers,payments:totals.payments,totalCustomers:job.totalCustomers??null,totalPayments:job.totalPayments??null};
}
export async function syncPage({db,fetchPage}:SyncDeps){
 // A short lease prevents two tabs from advancing the same cursor concurrently.
 const now=Date.now(), lease=String(now+45000);
 const claim=await db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<?').bind('syncLease',lease,now).run();
 if(!claim.meta.changes)return {next:true,waiting:true,progress:await getSyncState(db)};
 try{
  const raw=await read(db,'syncJob');
  const job=raw?JSON.parse(raw):{id:crypto.randomUUID(),kind:'customers',offset:0,time:now};
  if(!raw)await put(db,'syncJob',JSON.stringify(job)).run();
  const result=await fetchPage(`/${job.kind}?limit=100&offset=${job.offset}`);
  if(!Array.isArray(result.data)||result.data.some((item:any)=>typeof item.id!=='string'))throw Error('Resposta inesperada do Asaas. Tente retomar a importação.');
  if(result.hasMore&&!result.data.length)throw Error('O Asaas retornou uma página vazia. Tente retomar a importação.');
  const batch={kind:job.kind,count:result.data.length,items:result.data.slice(-4).reverse().map((item:any)=>job.kind==='customers'?{label:item.name||'Cliente',detail:'Cadastro de cliente recebido'}:{label:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(item.value||0)),detail:item.dueDate?'Vencimento em '+item.dueDate.split('-').reverse().join('/'):'Cobrança recebida'})};
  const writes=result.data.map((item:any)=>db.prepare('INSERT INTO records(key,generation,kind,id,data) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(`${job.id}:${job.kind}:${item.id}`,job.id,job.kind,item.id,JSON.stringify(item)));
  if(Number.isFinite(result.totalCount))job[job.kind==='customers'?'totalCustomers':'totalPayments']=result.totalCount;
  let done=false;
  if(result.hasMore)job.offset+=result.data.length;
  else if(job.kind==='customers'){job.kind='payments';job.offset=0;}
  else done=true;
  job.time=Date.now();
  // Rows and cursor commit together, so a lost response can safely resume.
  if(done){writes.push(put(db,'activeGeneration',job.id),put(db,'syncedAt',new Date().toISOString()),db.prepare('DELETE FROM settings WHERE id=?').bind('syncJob'));}
  else writes.push(put(db,'syncJob',JSON.stringify(job)));
  await db.batch(writes);
  if(done){
   // Cleanup is optional; it must not turn a committed import into a failure.
   try{await db.prepare('DELETE FROM records WHERE generation<>?').bind(job.id).run()}catch{}
   const totals=await db.prepare('SELECT kind,COUNT(*) AS count FROM records WHERE generation=? GROUP BY kind').bind(job.id).all();const counts:any={customers:0,payments:0};for(const row of totals.results)counts[row.kind]=Number(row.count);
   return {next:null,batch,progress:{pending:false,phase:'complete',...counts,totalCustomers:counts.customers,totalPayments:counts.payments}};
  }
  return {next:true,batch,progress:await getSyncState(db)};
 }finally{
  // Do not erase a lease taken by another request after expiration.
  await db.prepare('DELETE FROM settings WHERE id=? AND value=?').bind('syncLease',lease).run();
 }
}
