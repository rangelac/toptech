import {guard,json,failure,asaas,db} from '@/lib/server';
import {syncPage} from '@/lib/sync';
export async function POST(req:Request){
 try{guard(req,true);return json(await syncPage({db:db(),fetchPage:asaas}));}
 catch(e){console.error('sync_failed',{message:e instanceof Error?e.message:'Importação interrompida'});return failure(e)}
}
