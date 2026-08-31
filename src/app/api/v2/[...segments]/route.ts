import {createServiceClient} from '../../../../lib/server-supabase';
// The tested protocol engine remains shared with the standalone host.
import {createTerminalHttpHandler} from '../../../../lib/gimml-terminal-backend/http-handler.mjs';
import {SupabaseTerminalRepository} from '../../../../lib/gimml-terminal-backend/supabase-terminal-repository.mjs';

export const dynamic='force-dynamic';
export const runtime='nodejs';

type Context={params:Promise<{segments:string[]}>};
async function handle(request:Request,context:Context){
  const {segments}=await context.params;
  const terminalPath=`/${segments.join('/')}`;
  if(!['/device/enroll','/device/login','/device/commands','/device/command-result','/device/status','/transaction/create'].includes(terminalPath))return Response.json({error:'Not found'},{status:404});
  const signedPath=`/api/v2${terminalPath}`;
  const responseKey=process.env.GIMML_RESPONSE_PRIVATE_KEY_DER_BASE64;
  const pairingPepper=process.env.GIMML_PAIRING_PEPPER;
  if(!responseKey||!pairingPepper)return Response.json({error:'Terminal service is not configured'},{status:503});
  const body=Buffer.from(await request.arrayBuffer());
  const headers=Object.fromEntries(request.headers.entries());
  const handler=createTerminalHttpHandler({repository:new SupabaseTerminalRepository(createServiceClient()),responsePrivateKeyDerBase64:responseKey,pairingPepper});
  const result=await handler({method:request.method,path:signedPath,headers,body});
  return new Response(result.body,{status:result.status,headers:result.headers});
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
