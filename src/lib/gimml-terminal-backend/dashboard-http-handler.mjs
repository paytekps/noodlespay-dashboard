const MAX_BODY=256*1024;

function parseBody(request){const body=Buffer.isBuffer(request.body)?request.body:Buffer.from(request.body??'');if(body.length>MAX_BODY)throw new Error('Request too large');if(!body.length)return {};const value=JSON.parse(body.toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('JSON object required');return value;}
function response(status,value){return {status,headers:{'content-type':'application/json','cache-control':'no-store'},body:Buffer.from(JSON.stringify(value))};}
function method(request,expected){if(String(request.method??'').toUpperCase()!==expected)throw new Error('Method not allowed');}

/** Authenticated merchant-dashboard HTTP boundary. Authentication is supplied by the host application. */
export function createDashboardHttpHandler({service,authenticateActor}){
 if(!service||typeof authenticateActor!=='function')throw new Error('Dashboard dependencies are required');
 return async request=>{try{const actor=await authenticateActor(request);if(!actor)throw new Error('Authentication required');const merchantId=request.params?.merchantId;if(!merchantId)throw new Error('Merchant required');const path=request.path;
  if(path.endsWith('/overview')){method(request,'GET');return response(200,await service.overview(actor,merchantId));}
  if(path.endsWith('/catalog')){method(request,'GET');return response(200,await service.catalog(actor,merchantId));}
  if(path.endsWith('/reports')){method(request,'GET');return response(200,await service.report(actor,merchantId,{from:request.query?.from,to:request.query?.to,deviceId:request.query?.device_id??null}));}
  const input=parseBody(request);
  if(path.endsWith('/device/profile')){method(request,'PUT');return response(200,await service.setProfile(actor,merchantId,input));}
  if(path.endsWith('/device/settings')){method(request,'PUT');return response(200,await service.setTerminalSettings(actor,merchantId,input));}
  if(path.endsWith('/entitlement')){method(request,'POST');return response(200,await service.setEntitlement(actor,merchantId,input));}
  if(path.endsWith('/device/assignment')){method(request,'PUT');return response(200,await service.assignCapability(actor,merchantId,input));}
  if(path.endsWith('/closed-loop-program')){method(request,'PUT');return response(200,await service.setClosedLoopProgram(actor,merchantId,input));}
  if(path.endsWith('/device/command')){method(request,'POST');return response(202,await service.queueCommand(actor,merchantId,input));}
  if(path.endsWith('/device/pairing')){method(request,'POST');return response(201,await service.createPairingCode(actor,merchantId,input));}
  return response(404,{error:'Not found'});
 }catch(error){const unauthorized=/Authentication|required|authorization denied/.test(error.message);return response(unauthorized?403:400,{error:unauthorized?'Access denied':String(error.message??'Request rejected').slice(0,200)});}};
}
