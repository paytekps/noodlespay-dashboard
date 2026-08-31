import { createPrivateKey, sign } from 'node:crypto';
import { authenticateDevice, canonicalRequest } from './device-auth.mjs';
import { compileDeviceSnapshot, signSnapshot } from './config-snapshot.mjs';
import { acceptTransaction } from './transactions.mjs';
import { completeCommand } from './commands.mjs';
import { enrollDevice } from './enrollment.mjs';
import { acceptDeviceStatus } from './device-status.mjs';

const MAX_BODY = 1024 * 1024;

function json(value) { return Buffer.from(JSON.stringify(value)); }
function signed(status, body, privateKeyDerBase64) {
  const key = createPrivateKey({key:Buffer.from(privateKeyDerBase64,'base64'),format:'der',type:'pkcs8'});
  return {status,headers:{'content-type':'application/json','x-gimml-response-signature':sign('sha256',body,key).toString('base64')},body};
}
function header(request, name) {
  const value=request.headers?.[name] ?? request.headers?.[name.toLowerCase()] ?? request.headers?.[name.toUpperCase()];
  return Array.isArray(value)?value[0]:value;
}
function authenticatedRequest(request) {
  const body=Buffer.isBuffer(request.body)?request.body:Buffer.from(request.body ?? '');
  if(body.length>MAX_BODY)throw new Error('Request too large');
  const value={method:String(request.method??'').toUpperCase(),path:request.path,body,serial:header(request,'x-gimml-device-serial'),timestamp:Number(header(request,'x-gimml-timestamp')),nonce:header(request,'x-gimml-nonce'),signature:header(request,'x-gimml-signature')};
  value.canonical=canonicalRequest(value);return value;
}
function parse(body){if(!body.length)return {};const value=JSON.parse(body.toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('JSON object required');return value;}

/** Framework-neutral HTTPS route handler. The hosting adapter must preserve raw request bytes. */
export function createTerminalHttpHandler({repository,responsePrivateKeyDerBase64,pairingPepper,now=()=>new Date()}) {
  if(!repository||!responsePrivateKeyDerBase64)throw new Error('Backend dependencies are required');
  return async function handle(request){
    try{
      const authenticated=authenticatedRequest(request);
      const routePath=authenticated.path.replace(/^\/api\/v2/,'');
      if(routePath==='/device/enroll'){
        const input=parse(authenticated.body);const device=await enrollDevice(repository,authenticated,input,{pairingPepper,now:now()});
        return signed(200,json({enrolled:true,device_id:device.id}),responsePrivateKeyDerBase64);
      }
      const device=await authenticateDevice(authenticated,repository,Math.floor(now().getTime()/1000));
      if(routePath==='/device/login'){
        const snapshot=await compileDeviceSnapshot(repository,device.id,now());
        const output=signSnapshot(snapshot,responsePrivateKeyDerBase64);
        if(repository.storeConfigurationSnapshot)await repository.storeConfigurationSnapshot(device.id,snapshot,output);
        return {status:200,headers:{'content-type':'application/json','x-gimml-response-signature':output.signature.toString('base64')},body:output.body};
      }
      if(routePath==='/transaction/create'){
        const stored=await acceptTransaction(repository,device,parse(authenticated.body),now());
        return signed(200,json({accepted:true,transaction_id:stored?.transaction_id??stored?.id}),responsePrivateKeyDerBase64);
      }
      if(routePath==='/device/commands'){
        const command=await repository.claimNextCommand(device.id,now());
        const requested=repository.pendingLocationRequest?await repository.pendingLocationRequest(device.id,now()):null;
        const locationRequest=requested&&await repository.entitlementPermits(device.id,'FLEET_LOCATION',now())?requested:null;
        return signed(200,json(command||locationRequest?{...(command?{command}:{}),...(locationRequest?{location_request:locationRequest}:{})}:{empty:true}),responsePrivateKeyDerBase64);
      }
      if(routePath==='/device/command-result'){
        const completed=await completeCommand(repository,device,parse(authenticated.body));
        if(!completed)throw new Error('Command is not claimed by this device');
        return signed(200,json({accepted:true}),responsePrivateKeyDerBase64);
      }
      if(routePath==='/device/status'){
        await acceptDeviceStatus(repository,device,parse(authenticated.body),now());
        return signed(200,json({accepted:true}),responsePrivateKeyDerBase64);
      }
      throw new Error('Route not implemented');
    }catch(error){
      const message=['Request too large','JSON object required'].includes(error.message)?error.message:'Request rejected';
      return signed(400,json({error:message}),responsePrivateKeyDerBase64);
    }
  };
}
