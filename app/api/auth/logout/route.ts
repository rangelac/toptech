import {guardPlatform,db,failure} from '@/lib/server';
import {sha256,sessionToken,sessionCookie} from '@/lib/auth';
export async function POST(req:Request){try{guardPlatform(req,true);const token=sessionToken(req);if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(token)).run();return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(req,'',true)}})}catch(e){return failure(e)}}
