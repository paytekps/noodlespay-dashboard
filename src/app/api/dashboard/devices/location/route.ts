import { NextResponse } from 'next/server';
import {
  canAccessMerchant,
  dashboardRequestContext
} from '../../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthlyMapLimit = 45_000;

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const deviceId = new URL(req.url).searchParams.get('device_id') ?? '';
  if (!uuidPattern.test(deviceId)) {
    return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });
  }

  const { data: device, error: deviceError } = await context.admin
    .from('devices')
    .select('id, merchant_id, location_latitude, location_longitude')
    .eq('id', deviceId)
    .eq('status', 'active')
    .maybeSingle();
  if (deviceError) {
    console.error('Location map device lookup failed:', deviceError);
    return NextResponse.json({ error: 'The device location could not be checked.' }, { status: 500 });
  }
  if (!device || !device.merchant_id || !canAccessMerchant(context, device.merchant_id)) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  }

  const latitude = Number(device.location_latitude);
  const longitude = Number(device.location_longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'This device does not have a GPS fix yet.' }, { status: 409 });
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? '';
  if (!mapboxToken) {
    return NextResponse.json({ error: 'The secure map service is not configured yet.' }, { status: 503 });
  }

  const { data: allowed, error: limitError } = await context.admin
    .rpc('claim_map_request', { p_limit: monthlyMapLimit });
  if (limitError) {
    console.error('Map usage limit check failed:', limitError);
    return NextResponse.json({ error: 'The map allowance could not be checked.' }, { status: 500 });
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'The monthly map safety limit has been reached.' },
      { status: 429 }
    );
  }

  const marker = `pin-s+16a34a(${longitude},${latitude})`;
  const camera = `${longitude},${latitude},15,0`;
  const mapUrl = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${camera}/800x450@2x`
  );
  mapUrl.searchParams.set('access_token', mapboxToken);
  mapUrl.searchParams.set('logo', 'true');
  mapUrl.searchParams.set('attribution', 'true');

  let mapResponse: Response;
  try {
    mapResponse = await fetch(mapUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    console.error('Mapbox image request failed:', error);
    return NextResponse.json({ error: 'The map service did not respond in time.' }, { status: 502 });
  }
  if (!mapResponse.ok) {
    console.error('Mapbox image request failed with status:', mapResponse.status);
    return NextResponse.json({ error: 'The map could not be loaded.' }, { status: 502 });
  }

  return new NextResponse(await mapResponse.arrayBuffer(), {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': mapResponse.headers.get('content-type') || 'image/png',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function POST(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  if (context.role === 'sales_rep') {
    return NextResponse.json(
      { error: 'Sales representatives can view location but cannot control a device.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!uuidPattern.test(deviceId)) {
    return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });
  }

  const { data: device, error: deviceError } = await context.admin
    .from('devices')
    .select('id, merchant_id')
    .eq('id', deviceId)
    .eq('status', 'active')
    .maybeSingle();
  if (deviceError) {
    console.error('Location control device lookup failed:', deviceError);
    return NextResponse.json({ error: 'The device could not be checked.' }, { status: 500 });
  }
  if (!device || !device.merchant_id || !canAccessMerchant(context, device.merchant_id)) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  }

  const { data: credential, error: credentialError } = await context.admin
    .from('device_command_credentials')
    .select('device_id')
    .eq('device_id', device.id)
    .is('disabled_at', null)
    .maybeSingle();
  if (credentialError) {
    console.error('Location control pairing lookup failed:', credentialError);
    return NextResponse.json({ error: 'The device connection could not be checked.' }, { status: 500 });
  }
  if (!credential) {
    return NextResponse.json(
      { error: 'Remote controls are not yet paired for this device.' },
      { status: 409 }
    );
  }

  const requestedAt = new Date().toISOString();
  const { data: request, error: updateError } = await context.admin
    .from('devices')
    .update({
      location_refresh_requested_at: requestedAt,
      location_refresh_requested_by: context.user.id,
      location_refresh_status: 'pending',
      location_refresh_status_updated_at: requestedAt
    })
    .eq('id', device.id)
    .select('location_refresh_requested_at, location_refresh_status')
    .single();
  if (updateError) {
    console.error('Location refresh request failed:', updateError);
    return NextResponse.json({ error: 'The GPS request could not be sent.' }, { status: 500 });
  }

  return NextResponse.json({ request });
}
