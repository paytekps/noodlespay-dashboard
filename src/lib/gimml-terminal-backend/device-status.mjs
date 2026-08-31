const HEALTH=new Set(['app_version','connected_to_processor','network_connected','battery_percent','location_permission_granted','location_service_enabled','location_refresh_status']);
const LOCATION=new Set(['location_latitude','location_longitude','location_accuracy_m','location_recorded_at_ms','location_provider']);

export async function acceptDeviceStatus(repository,device,input,now=new Date()){
  if(!input||Array.isArray(input)||typeof input!=='object')throw new Error('Invalid status');
  for(const key of Object.keys(input))if(!HEALTH.has(key)&&!LOCATION.has(key))throw new Error(`Unsafe status field: ${key}`);
  if(!await repository.entitlementPermits(device.id,'FLEET_HEALTH',now))throw new Error('Fleet health is not entitled');
  const hasLocation=Object.keys(input).some(key=>LOCATION.has(key));
  if(hasLocation&&!await repository.entitlementPermits(device.id,'FLEET_LOCATION',now))throw new Error('Fleet location is not entitled');
  if(hasLocation){const lat=Number(input.location_latitude),lon=Number(input.location_longitude),accuracy=Number(input.location_accuracy_m??0);if(!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)throw new Error('Invalid location');}
  return repository.upsertDeviceStatus(device.id,{...input,received_at:now.toISOString()});
}
