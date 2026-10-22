import {guardPlatform,db,runtime,json,failure} from '@/lib/server';
import {verifyPassword,takeLoginAttempt,newToken,sha256,sessionCookie,SESSION_SECONDS} from '@/lib/auth';
export async function POST(req:Request){try{
 guardPlatform(req,true);const platform='toptech';
 if(!await takeLoginAttempt(db(),platform))return json({error:'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.'},429);
 const body=await req.json() as any;const password=typeof body.password==='string'?body.password:'';
 if(password.length>256||typeof body.username!=='string')return json({error:'Usuário ou senha incorretos.'},401);
 const expected=runtime().TOPTECH_PASSWORD_HASH;if(!expected)return json({error:'Acesso ainda não configurado no servidor.'},503);
 const valid=await verifyPassword(password,expected);
 if(!valid||body.username.trim()!=='toptech')return json({error:'Usuário ou senha incorretos.'},401);
 const token=newToken();await db().prepare('INSERT INTO sessions(id,platform_user,expires_at) VALUES(?,?,?)').bind(await sha256(token),platform,Date.now()+SESSION_SECONDS*1000).run();
 await db().prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()).run();
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(req,token)}});
 }catch(e){return failure(e)}}
