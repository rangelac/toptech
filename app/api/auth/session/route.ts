import {guardPlatform,db,json,failure} from '@/lib/server';
import {validSession} from '@/lib/auth';
export async function GET(req:Request){try{guardPlatform(req);return json({authenticated:await validSession(req,db()),username:'toptech'})}catch(e){return failure(e)}}
