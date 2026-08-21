'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../../lib/supabase';

const identifierFields = [
  ['merchant_identification_number', 'Merchant ID (MID)'],
  ['terminal_identification_number', 'Terminal ID (TID)'],
  ['terminal_number', 'Terminal number'],
  ['store_number', 'Store number'],
  ['chain_number', 'Chain number'],
  ['agent_bank_number', 'Agent bank number'],
  ['acquirer_bin', 'Acquirer BIN'],
  ['merchant_location_number', 'Merchant location number'],
  ['merchant_category_code', 'Merchant category code (MCC)']
];

const merchantFields = [
  ['merchant_legal_name', 'Legal business name'], ['merchant_dba_name', 'DBA / receipt name'],
  ['statement_descriptor', 'Statement descriptor'], ['merchant_phone', 'Merchant phone'],
  ['address_line_1', 'Address line 1'], ['address_line_2', 'Address line 2'],
  ['city', 'City'], ['state_or_region', 'State / region'], ['postal_code', 'Postal code'],
  ['country_code', 'Country code'], ['currency_code', 'Currency code'], ['time_zone', 'Merchant time zone']
];

const hostFields = [
  ['primary_host', 'Primary host / IP'], ['primary_port', 'Primary port'],
  ['secondary_host', 'Secondary host / IP'], ['secondary_port', 'Secondary port'],
  ['gateway_name', 'Gateway name'], ['gateway_merchant_id', 'Gateway merchant ID'],
  ['gateway_terminal_id', 'Gateway terminal ID']
];

const softwareFields = [
  ['var_id', 'VAR ID'], ['software_id', 'Software ID'],
  ['payment_application_name', 'Payment application'], ['payment_application_version', 'Application version'],
  ['tms_profile_name', 'TMS profile name'], ['tms_config_version', 'TMS configuration version']
];

const checklistFields = [
  ['processor_approved', 'Processor approved'], ['hardware_received', 'Hardware received'],
  ['network_ready', 'Network ready'], ['tid_assigned', 'TID assigned'],
  ['tms_profile_ready', 'TMS profile ready'], ['contact_emv_certified', 'Contact EMV certified'],
  ['contactless_emv_certified', 'Contactless EMV certified'],
  ['closed_loop_configured', 'Closed-loop cards configured'], ['test_sale_passed', 'Test sale passed'],
  ['test_void_passed', 'Test void passed'], ['test_refund_passed', 'Test refund passed'],
  ['test_settlement_passed', 'Test settlement passed'], ['receipt_verified', 'Receipt verified'],
  ['reporting_verified', 'Reporting verified']
];

function statusStyle(status: string) {
  if (status === 'succeeded' || status === 'active' || status === 'complete') return 'bg-green-100 text-green-800';
  if (status === 'failed' || status === 'suspended') return 'bg-red-100 text-red-800';
  if (status === 'processing' || status === 'configuring') return 'bg-blue-100 text-blue-800';
  return 'bg-amber-100 text-amber-900';
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <label className="block text-sm font-medium text-gray-800">
      {label}
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal"
      />
    </label>
  );
}

function Section({ title, description, children }: any) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DeviceSetupPage() {
  const params = useParams();
  const deviceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    return fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
  }, []);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch(`/api/admin/devices/provisioning?device_id=${encodeURIComponent(deviceId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Device setup could not be loaded.');
      setData(payload);
      setProfile(payload.profile);
      setSchedule({
        ...payload.schedule,
        settlement_time: String(payload.schedule.settlement_time || '03:00').slice(0, 5)
      });
      setCustomFields(Object.entries(payload.profile.processor_specific || {}).map(([key, value]) => ({ key, value: String(value ?? '') })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Device setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, deviceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const readiness = data?.readiness_errors ?? [];
  const checklistDone = profile ? checklistFields.filter(([key]) => profile[key]).length : 0;

  function updateProfile(key: string, value: any) {
    setNotice('');
    setProfile((current: any) => ({ ...current, [key]: value }));
    if (key === 'time_zone') setSchedule((current: any) => ({ ...current, time_zone: value }));
    if (key === 'capture_mode' && value === 'host') setSchedule((current: any) => ({ ...current, enabled: false }));
  }

  async function save() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const processorSpecific = Object.fromEntries(customFields
        .map((field) => [field.key.trim(), field.value.trim()])
        .filter(([key]) => Boolean(key)));
      const response = await authenticatedFetch('/api/admin/devices/provisioning', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, profile: { ...profile, processor_specific: processorSpecific }, schedule })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.readiness_errors) setData((current: any) => ({ ...current, readiness_errors: payload.readiness_errors }));
        throw new Error(payload.error || 'Device setup could not be saved.');
      }
      setProfile(payload.profile);
      setSchedule((current: any) => ({ ...payload.schedule, settlement_time: String(payload.schedule.settlement_time || current.settlement_time).slice(0, 5) }));
      setData((current: any) => ({ ...current, profile: payload.profile, schedule: payload.schedule, readiness_errors: payload.readiness_errors }));
      setNotice('Full device setup saved. Changes are recorded in the audit history.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Device setup could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-10">Loading full device setup…</div>;
  if (!profile || !schedule || !data?.device) {
    return <div className="mx-auto max-w-4xl p-10"><Link href="/dashboard/devices" className="text-blue-700 hover:underline">← Devices</Link><div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error || 'Device setup is unavailable.'}</div></div>;
  }

  const merchantName = Array.isArray(data.device.merchants) ? data.device.merchants[0]?.name : data.device.merchants?.name;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-10">
      <div>
        <Link href="/dashboard/devices" className="text-sm font-semibold text-blue-700 hover:underline">← Back to devices</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Full device setup</h1>
            <p className="mt-1 text-gray-600">{data.device.name} · {merchantName || 'Unknown merchant'} · Serial {data.device.serial_number}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusStyle(profile.activation_status)}`}>{profile.activation_status.replaceAll('_', ' ')}</span>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        This record stores the VAR/setup numbers needed to identify and route this terminal. Never enter passwords, API tokens, PIN keys, master keys, working keys, CVV, or card numbers here. Secure keys must be injected by the processor/TMS into the certified device.
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{notice}</div>}

      <Section title="1. Processor and deployment" description="The processor/platform determines which VAR fields and settlement method apply.">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Processor / acquirer" value={profile.processor_name} onChange={(value: string) => updateProfile('processor_name', value)} />
          <Field label="Processor platform" value={profile.processor_platform} onChange={(value: string) => updateProfile('processor_platform', value)} />
          <Field label="ISO / VAR name" value={profile.iso_or_var_name} onChange={(value: string) => updateProfile('iso_or_var_name', value)} />
          <Field label="Boarding / application reference" value={profile.boarding_reference} onChange={(value: string) => updateProfile('boarding_reference', value)} />
          <label className="text-sm font-medium">Capture mode<select value={profile.capture_mode} onChange={(event) => updateProfile('capture_mode', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="host">Host capture — processor settles</option><option value="terminal">Terminal capture — device settles</option></select></label>
          <label className="text-sm font-medium">Environment<select value={profile.deployment_environment} onChange={(event) => updateProfile('deployment_environment', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="test">Test</option><option value="production">Production</option></select></label>
          <label className="text-sm font-medium">Setup status<select value={profile.activation_status} onChange={(event) => updateProfile('activation_status', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="draft">Draft</option><option value="processor_approved">Processor approved</option><option value="configuring">Configuring</option><option value="ready">Ready</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          <label className="text-sm font-medium">Terminal location type<select value={profile.terminal_environment} onChange={(event) => updateProfile('terminal_environment', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="unattended">Unattended</option><option value="semi_attended">Semi-attended</option><option value="attended">Attended</option></select></label>
          <label className="text-sm font-medium">Card-reader capability<select value={profile.terminal_capability} onChange={(event) => updateProfile('terminal_capability', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="contact_and_contactless">Tap and insert</option><option value="contactless">Tap only</option><option value="contact">Insert only</option></select></label>
        </div>
      </Section>

      <Section title="2. VAR and terminal identifiers" description="Copy these values exactly from the processor’s boarding/VAR sheet."><div className="grid gap-4 md:grid-cols-3">{identifierFields.map(([key, label]) => <Field key={key} label={label} value={profile[key]} onChange={(value: string) => updateProfile(key, value)} />)}</div></Section>
      <Section title="3. Merchant location" description="These values are used for routing, receipts, processor reporting, and local settlement time."><div className="grid gap-4 md:grid-cols-3">{merchantFields.map(([key, label]) => <Field key={key} label={label} value={profile[key]} onChange={(value: string) => updateProfile(key, value)} />)}</div></Section>

      <Section title="4. Processor host and gateway" description="Connection destinations only—never place credentials or encryption keys here.">
        <div className="grid gap-4 md:grid-cols-3">
          {hostFields.map(([key, label]) => <Field key={key} label={label} type={key.endsWith('_port') ? 'number' : 'text'} value={profile[key]} onChange={(value: string) => updateProfile(key, value)} />)}
          <label className="text-sm font-medium">Host transport<select value={profile.host_transport} onChange={(event) => updateProfile('host_transport', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="tls">TLS</option><option value="tcp">TCP (only if processor requires it)</option></select></label>
        </div>
      </Section>

      <Section title="5. Software, TMS, and secure injection" description="Record package/version and completion status; the actual cryptographic material stays in the certified device and processor HSM.">
        <div className="grid gap-4 md:grid-cols-3">{softwareFields.map(([key, label]) => <Field key={key} label={label} value={profile[key]} onChange={(value: string) => updateProfile(key, value)} />)}
          <label className="text-sm font-medium">TMS download status<select value={profile.tms_download_status} onChange={(event) => updateProfile('tms_download_status', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="not_started">Not started</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="failed">Failed</option></select></label>
          <label className="text-sm font-medium">Secure key injection status<select value={profile.key_injection_status} onChange={(event) => updateProfile('key_injection_status', event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="not_started">Not started</option><option value="scheduled">Scheduled</option><option value="complete">Complete</option><option value="failed">Failed</option></select></label>
        </div>
      </Section>

      <Section title={`6. Activation checklist (${checklistDone}/${checklistFields.length})`} description="Core processor, device, certification, test, receipt, and reporting checks.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{checklistFields.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={Boolean(profile[key])} onChange={(event) => updateProfile(key, event.target.checked)} />{label}</label>)}</div>
        {!!readiness.length && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="font-semibold">Still needed before Ready/Active:</div><ul className="mt-1 list-disc pl-5">{readiness.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
      </Section>

      <Section title="7. Processor-specific fields" description="Use these for additional harmless IDs or numbers unique to this processor. Sensitive field names are blocked.">
        <div className="space-y-3">{customFields.map((field, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={field.key} onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder="Field name" className="rounded-lg border px-3 py-2" /><input value={field.value} onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Value" className="rounded-lg border px-3 py-2" /><button type="button" onClick={() => setCustomFields((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border px-3 py-2 text-sm">Remove</button></div>)}</div>
        <button type="button" onClick={() => setCustomFields((current) => [...current, { key: '', value: '' }])} className="mt-3 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Add processor field</button>
      </Section>

      <Section title="8. Settlement setup" description={profile.capture_mode === 'host' ? 'Host capture: the processor closes the batch. NoodlPay records the setup but does not command the terminal.' : 'Terminal capture: NoodlPay queues one normal End-of-Day close at the selected merchant-local time.'}>
        <div className="grid items-end gap-4 md:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={Boolean(schedule.enabled)} disabled={profile.capture_mode !== 'terminal'} onChange={(event) => setSchedule((current: any) => ({ ...current, enabled: event.target.checked }))} />Automatic daily settlement</label>
          <Field label="Local settlement time" type="time" value={schedule.settlement_time} onChange={(value: string) => setSchedule((current: any) => ({ ...current, settlement_time: value }))} />
          <Field label="Settlement time zone" value={schedule.time_zone} onChange={(value: string) => setSchedule((current: any) => ({ ...current, time_zone: value }))} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Link href="/dashboard/settlements" className="rounded-lg border border-blue-700 bg-white px-4 py-2 text-sm font-semibold text-blue-700">Open batch reports</Link><span className="text-xs text-gray-600">Batch results and manual administrator controls are kept separate from processor setup.</span></div>
        {!data.paired && <p className="mt-2 text-sm text-amber-800">Pair this device on the Devices page before remote settlement can run.</p>}
      </Section>

      <Section title="9. Support and internal notes"><div className="grid gap-4 md:grid-cols-2"><Field label="Processor support phone" value={profile.processor_support_phone} onChange={(value: string) => updateProfile('processor_support_phone', value)} /><Field label="Processor support email" value={profile.processor_support_email} onChange={(value: string) => updateProfile('processor_support_email', value)} /></div><label className="mt-4 block text-sm font-medium">Setup notes<textarea value={profile.notes} onChange={(event) => updateProfile('notes', event.target.value)} rows={5} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label></Section>

      <div className="sticky bottom-3 flex items-center justify-between gap-4 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur"><div className="text-sm text-gray-600">Every save is audit logged.</div><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving full setup…' : 'Save full setup'}</button></div>

    </main>
  );
}
