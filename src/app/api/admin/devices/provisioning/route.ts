import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timePattern = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const forbiddenExtraKey = /(password|passcode|secret|token|cryptographic|encryption|private[_ -]?key|master[_ -]?key|working[_ -]?key|pin|cvv|cvc|full[_ -]?pan|card[_ -]?number)/i;

const activationStatuses = new Set(['draft', 'processor_approved', 'configuring', 'ready', 'active', 'suspended']);
const environments = new Set(['test', 'production']);
const captureModes = new Set(['host', 'terminal']);
const terminalEnvironments = new Set(['attended', 'unattended', 'semi_attended']);
const terminalCapabilities = new Set(['contact', 'contactless', 'contact_and_contactless']);
const hostTransports = new Set(['tls', 'tcp']);
const tmsStatuses = new Set(['not_started', 'scheduled', 'in_progress', 'complete', 'failed']);
const keyStatuses = new Set(['not_started', 'scheduled', 'complete', 'failed']);

const stringFields = [
  'processor_name', 'processor_platform', 'iso_or_var_name', 'boarding_reference',
  'merchant_identification_number', 'terminal_identification_number', 'terminal_number',
  'store_number', 'chain_number', 'agent_bank_number', 'acquirer_bin',
  'merchant_location_number', 'merchant_category_code', 'merchant_legal_name',
  'merchant_dba_name', 'statement_descriptor', 'merchant_phone', 'address_line_1',
  'address_line_2', 'city', 'state_or_region', 'postal_code', 'country_code',
  'currency_code', 'time_zone', 'terminal_type', 'primary_host', 'secondary_host',
  'gateway_name', 'gateway_merchant_id', 'gateway_terminal_id', 'var_id', 'software_id',
  'payment_application_name', 'payment_application_version', 'tms_profile_name',
  'tms_config_version', 'processor_support_phone', 'processor_support_email', 'notes'
] as const;

const booleanFields = [
  'processor_approved', 'hardware_received', 'network_ready', 'tid_assigned',
  'tms_profile_ready', 'contact_emv_certified', 'contactless_emv_certified',
  'closed_loop_configured', 'test_sale_passed', 'test_void_passed',
  'test_refund_passed', 'test_settlement_passed', 'receipt_verified',
  'reporting_verified'
] as const;

const defaults = {
  activation_status: 'draft', deployment_environment: 'test', processor_name: '',
  processor_platform: '', capture_mode: 'host', iso_or_var_name: '', boarding_reference: '',
  merchant_identification_number: '', terminal_identification_number: '', terminal_number: '',
  store_number: '', chain_number: '', agent_bank_number: '', acquirer_bin: '',
  merchant_location_number: '', merchant_category_code: '', merchant_legal_name: '',
  merchant_dba_name: '', statement_descriptor: '', merchant_phone: '', address_line_1: '',
  address_line_2: '', city: '', state_or_region: '', postal_code: '', country_code: 'US',
  currency_code: 'USD', time_zone: 'America/New_York', terminal_environment: 'unattended',
  terminal_type: 'Datecs BlueCash-05', terminal_capability: 'contact_and_contactless',
  primary_host: '', primary_port: null, secondary_host: '', secondary_port: null,
  host_transport: 'tls', gateway_name: '', gateway_merchant_id: '', gateway_terminal_id: '',
  var_id: '', software_id: '', payment_application_name: 'NoodlPay',
  payment_application_version: '', tms_profile_name: '', tms_config_version: '',
  tms_download_status: 'not_started', key_injection_status: 'not_started',
  processor_approved: false, hardware_received: false, network_ready: false,
  tid_assigned: false, tms_profile_ready: false, contact_emv_certified: false,
  contactless_emv_certified: false, closed_loop_configured: false, test_sale_passed: false,
  test_void_passed: false, test_refund_passed: false, test_settlement_passed: false,
  receipt_verified: false, reporting_verified: false, processor_support_phone: '',
  processor_support_email: '', notes: '', processor_specific: {}
};

async function administratorContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role !== 'super_admin' && context.role !== 'admin') {
    return { error: 'Administrator access is required.', status: 403 };
  }
  return context;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanPort(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : Number.NaN;
}

function cleanProcessorSpecific(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().slice(0, 60);
    if (!key || forbiddenExtraKey.test(key)) {
      throw new Error('Custom fields cannot contain passwords, tokens, card data, PIN data, or encryption keys.');
    }
    if (rawValue === null) cleaned[key] = null;
    else if (typeof rawValue === 'boolean') cleaned[key] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) cleaned[key] = rawValue;
    else if (typeof rawValue === 'string') cleaned[key] = rawValue.trim().slice(0, 240);
    else throw new Error(`Custom field “${key}” must be plain text, a number, or yes/no.`);
  }
  return cleaned;
}

function readinessErrors(profile: Record<string, any>, scheduleEnabled: boolean) {
  const errors: string[] = [];
  const requiredText: Array<[string, string]> = [
    ['processor_name', 'Processor name'], ['processor_platform', 'Processor platform'],
    ['merchant_identification_number', 'MID'], ['terminal_identification_number', 'TID'],
    ['merchant_dba_name', 'Merchant DBA name'], ['currency_code', 'Currency code'],
    ['country_code', 'Country code'], ['time_zone', 'Time zone'],
    ['payment_application_version', 'Payment application version']
  ];
  for (const [key, label] of requiredText) if (!profile[key]) errors.push(`${label} is required before activation.`);
  const requiredChecks: Array<[string, string]> = [
    ['processor_approved', 'Processor approval'], ['hardware_received', 'Hardware received'],
    ['network_ready', 'Network ready'], ['tid_assigned', 'TID assigned'],
    ['tms_profile_ready', 'TMS profile ready'], ['contact_emv_certified', 'Contact EMV certified'],
    ['contactless_emv_certified', 'Contactless EMV certified']
  ];
  for (const [key, label] of requiredChecks) if (!profile[key]) errors.push(`${label} must be checked before activation.`);
  if (profile.tms_download_status !== 'complete') errors.push('TMS download must be complete before activation.');
  if (profile.key_injection_status !== 'complete') errors.push('Secure key injection must be complete before activation.');
  if (profile.capture_mode === 'terminal' && !scheduleEnabled) errors.push('Terminal-capture devices need an automatic settlement schedule.');
  return errors;
}

export async function GET(req: Request) {
  const context = await administratorContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const deviceId = new URL(req.url).searchParams.get('device_id')?.trim() ?? '';
  if (!uuidPattern.test(deviceId)) return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });

  const [deviceResult, profileResult, scheduleResult, runsResult, pairingResult, historyResult] = await Promise.all([
    context.admin.from('devices').select('id, name, serial_number, merchant_id, status, app_version, merchants(name)').eq('id', deviceId).maybeSingle(),
    context.admin.from('device_provisioning_profiles').select('*').eq('device_id', deviceId).maybeSingle(),
    context.admin.from('device_settlement_schedules').select('*').eq('device_id', deviceId).maybeSingle(),
    context.admin.from('settlement_runs').select('id, business_date, scheduled_for, request_source, status, requested_at, completed_at, attempt_count, transaction_count, total_amount, batch_id, device_message').eq('device_id', deviceId).order('requested_at', { ascending: false }).limit(25),
    context.admin.from('device_command_credentials').select('device_id').eq('device_id', deviceId).is('disabled_at', null).maybeSingle(),
    context.admin.from('device_provisioning_history').select('id, action, changed_at, changed_by').eq('device_id', deviceId).order('changed_at', { ascending: false }).limit(20)
  ]);

  if (deviceResult.error) {
    console.error('Provisioning device lookup failed:', deviceResult.error);
    return NextResponse.json({ error: 'Device setup could not be loaded.' }, { status: 500 });
  }
  if (!deviceResult.data) return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  const firstError = profileResult.error || scheduleResult.error || runsResult.error || pairingResult.error || historyResult.error;
  if (firstError) {
    console.error('Provisioning data lookup failed:', firstError);
    return NextResponse.json({ error: 'Device setup could not be loaded.' }, { status: 500 });
  }
  const profile = { ...defaults, ...(profileResult.data ?? {}) };
  const schedule = scheduleResult.data ?? { enabled: false, settlement_time: '03:00:00', time_zone: profile.time_zone };
  return NextResponse.json({
    device: deviceResult.data, profile, schedule, settlements: runsResult.data ?? [],
    history: historyResult.data ?? [], paired: Boolean(pairingResult.data),
    readiness_errors: readinessErrors(profile, Boolean(schedule.enabled))
  });
}

export async function PUT(req: Request) {
  const context = await administratorContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!uuidPattern.test(deviceId)) return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });

  const { data: device, error: deviceError } = await context.admin.from('devices').select('id, merchant_id, status').eq('id', deviceId).maybeSingle();
  if (deviceError) {
    console.error('Provisioning save device lookup failed:', deviceError);
    return NextResponse.json({ error: 'Device setup could not be saved.' }, { status: 500 });
  }
  if (!device?.merchant_id) return NextResponse.json({ error: 'Device or merchant not found.' }, { status: 404 });

  const input = body.profile && typeof body.profile === 'object' ? body.profile : {};
  const profile: Record<string, any> = {};
  for (const field of stringFields) profile[field] = cleanString(input[field], field === 'notes' ? 4000 : field.includes('address') ? 160 : 254);
  profile.country_code = profile.country_code.toUpperCase();
  profile.currency_code = profile.currency_code.toUpperCase();
  profile.merchant_category_code = profile.merchant_category_code.replace(/\s/g, '');
  for (const field of booleanFields) profile[field] = input[field] === true;
  profile.activation_status = activationStatuses.has(input.activation_status) ? input.activation_status : 'draft';
  profile.deployment_environment = environments.has(input.deployment_environment) ? input.deployment_environment : 'test';
  profile.capture_mode = captureModes.has(input.capture_mode) ? input.capture_mode : 'host';
  profile.terminal_environment = terminalEnvironments.has(input.terminal_environment) ? input.terminal_environment : 'unattended';
  profile.terminal_capability = terminalCapabilities.has(input.terminal_capability) ? input.terminal_capability : 'contact_and_contactless';
  profile.host_transport = hostTransports.has(input.host_transport) ? input.host_transport : 'tls';
  profile.tms_download_status = tmsStatuses.has(input.tms_download_status) ? input.tms_download_status : 'not_started';
  profile.key_injection_status = keyStatuses.has(input.key_injection_status) ? input.key_injection_status : 'not_started';
  profile.primary_port = cleanPort(input.primary_port);
  profile.secondary_port = cleanPort(input.secondary_port);
  try {
    profile.processor_specific = cleanProcessorSpecific(input.processor_specific);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Custom fields are invalid.' }, { status: 400 });
  }

  if (!/^[A-Z]{2}$/.test(profile.country_code)) return NextResponse.json({ error: 'Country code must use two letters.' }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(profile.currency_code)) return NextResponse.json({ error: 'Currency code must use three letters.' }, { status: 400 });
  if (profile.merchant_category_code && !/^[0-9]{4}$/.test(profile.merchant_category_code)) return NextResponse.json({ error: 'Merchant category code must contain four digits.' }, { status: 400 });
  if (!isValidTimeZone(profile.time_zone)) return NextResponse.json({ error: 'Choose a valid IANA time zone.' }, { status: 400 });
  if (Number.isNaN(profile.primary_port) || Number.isNaN(profile.secondary_port)) return NextResponse.json({ error: 'Host ports must be between 1 and 65535.' }, { status: 400 });

  const scheduleInput = body.schedule && typeof body.schedule === 'object' ? body.schedule : {};
  const settlementTime = cleanString(scheduleInput.settlement_time, 5);
  const scheduleTimeZone = cleanString(scheduleInput.time_zone, 100) || profile.time_zone;
  const scheduleEnabled = scheduleInput.enabled === true;
  if (!timePattern.test(settlementTime)) return NextResponse.json({ error: 'Settlement time must be HH:MM.' }, { status: 400 });
  if (!isValidTimeZone(scheduleTimeZone)) return NextResponse.json({ error: 'Settlement time zone is invalid.' }, { status: 400 });
  if (profile.capture_mode === 'host' && scheduleEnabled) return NextResponse.json({ error: 'Host-capture settlement is controlled by the processor; turn off device auto-settlement.' }, { status: 400 });

  const errors = readinessErrors(profile, scheduleEnabled);
  if ((profile.activation_status === 'ready' || profile.activation_status === 'active') && errors.length) {
    return NextResponse.json({ error: errors[0], readiness_errors: errors }, { status: 400 });
  }

  const { data: existing, error: existingError } = await context.admin.from('device_provisioning_profiles').select('device_id').eq('device_id', device.id).maybeSingle();
  if (existingError) {
    console.error('Provisioning profile lookup failed:', existingError);
    return NextResponse.json({ error: 'Device setup could not be saved.' }, { status: 500 });
  }
  const profileValues = { ...profile, merchant_id: device.merchant_id, updated_by: context.user.id };
  const profileSave = existing
    ? await context.admin.from('device_provisioning_profiles').update(profileValues).eq('device_id', device.id).select('*').single()
    : await context.admin.from('device_provisioning_profiles').insert({ device_id: device.id, created_by: context.user.id, ...profileValues }).select('*').single();
  if (profileSave.error) {
    console.error('Provisioning profile save failed:', profileSave.error);
    return NextResponse.json({ error: 'Device setup could not be saved.' }, { status: 500 });
  }

  const { data: schedule, error: scheduleError } = await context.admin.from('device_settlement_schedules').upsert({
    device_id: device.id, merchant_id: device.merchant_id, enabled: scheduleEnabled,
    settlement_time: `${settlementTime}:00`, time_zone: scheduleTimeZone,
    updated_by: context.user.id, updated_at: new Date().toISOString()
  }, { onConflict: 'device_id' }).select('*').single();
  if (scheduleError) {
    console.error('Settlement schedule save failed:', scheduleError);
    return NextResponse.json({ error: 'Processor setup saved, but settlement scheduling could not be saved.' }, { status: 500 });
  }
  return NextResponse.json({ profile: profileSave.data, schedule, readiness_errors: readinessErrors(profileSave.data, Boolean(schedule.enabled)) });
}
