import { NextResponse } from 'next/server';
import { dashboardRequestContext, hasDashboardPermission } from '../../../../../lib/dashboard-request';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!hasDashboardPermission(context, 'users.manage')) return NextResponse.json({ error: 'You do not have permission to view merchant administration.' }, { status: 403 });
  const slug = (await params).slug;
  const { data: merchant, error: merchantError } = await context.admin.from('merchants').select('id,name,status,billing_status,primary_contact_name,primary_contact_email').eq('slug', slug).maybeSingle();
  if (merchantError) return NextResponse.json({ error: 'Merchant details could not be loaded.' }, { status: 500 });
  if (!merchant) return NextResponse.json({ error: 'Merchant not found.' }, { status: 404 });

  const terminal = context.admin.schema('gimml_terminal');
  const [{ data: combinedDevices, error: combinedError }, { data: profiles, error: profilesError }, { data: programs, error: programsError }] = await Promise.all([
    terminal.from('devices').select('id,serial_number,enrollment_state,config_revision').eq('merchant_id', merchant.id).order('serial_number'),
    terminal.from('device_profiles').select('device_id,profile_key,layout_key'),
    terminal.from('closed_loop_programs').select('id,display_name,bin_prefix,enabled').eq('merchant_id', merchant.id).order('display_name')
  ]);
  if (combinedError || profilesError || programsError) return NextResponse.json({ error: 'Combined terminal details could not be loaded.' }, { status: 500 });
  const profilesById = new Map((profiles ?? []).map(profile => [profile.device_id, profile]));
  const devices = (combinedDevices ?? []).map(device => { const profile = profilesById.get(device.id); return { ...device, name: 'Datecs ' + device.serial_number, status: device.enrollment_state, profile_key: profile?.profile_key ?? null, layout_key: profile?.layout_key ?? null }; });
  return NextResponse.json({ merchant, devices, closedLoopPrograms: programs ?? [] });
}
