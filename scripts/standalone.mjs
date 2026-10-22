import {cp,mkdir} from 'node:fs/promises';
await mkdir('.next/standalone/.next',{recursive:true});
await cp('.next/static','.next/standalone/.next/static',{recursive:true});
try{await cp('public','.next/standalone/public',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e}
console.log('Servidor pronto: .next/standalone/server.js');
