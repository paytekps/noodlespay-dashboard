'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type TestData = { merchants: Array<{ id: string; display_name: string }>; devices: Array<{ id: string; merchant_id: string; serial_number: string; enrollment_state: string }>; configuredPrograms: Array<{ id: string; merchant_id: string; display_name: string; bin_prefix: string; enabled: boolean }>; testPrograms: Array<{ key: string; name: string; adapterStatus: string }> };
type TestResult = { provider: string; matchedProgram: string | null; passed: boolean; dryRun: boolean; checks: Array<{ key: string; label: string; passed: boolean; blocked?: boolean; detail: string }> };

function recommendedBin(data: TestData, merchantId: string, providerKey: string) {
  const marker = providerKey === 'donors_fund' ? 'donorsfund' : providerKey;
  return data.configuredPrograms.find(program => program.merchant_id === merchantId && program.display_name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(marker))?.bin_prefix ?? '';
}

export default function ClosedLoopTestCenter() {
  const [data, setData] = useState<TestData | null>(null);
  const [token, setToken] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [providerKey, setProviderKey] = useState('ojc');
  const [testBin, setTestBin] = useState('');
  const [amount, setAmount] = useState('1.00');
  const [result, setResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setMessage('Please sign in again.'); return; }
    setToken(session.access_token);
    const response = await fetch('/api/admin/closed-loop-tests', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error ?? 'Test configuration could not be loaded.'); return; }
    const firstMerchantId = payload.merchants[0]?.id ?? '';
    setData(payload); setMerchantId(firstMerchantId); setDeviceId(payload.devices.find((device: TestData['devices'][number]) => device.merchant_id === firstMerchantId)?.id ?? ''); setTestBin(recommendedBin(payload, firstMerchantId, 'ojc'));
  })(); }, []);

  const merchantDevices = useMemo(() => data?.devices.filter(device => device.merchant_id === merchantId) ?? [], [data, merchantId]);
  const merchantPrograms = useMemo(() => data?.configuredPrograms.filter(program => program.merchant_id === merchantId) ?? [], [data, merchantId]);

  async function runTest() {
    setBusy(true); setMessage(''); setResult(null);
    const response = await fetch('/api/admin/closed-loop-tests', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId, deviceId, providerKey, testBin, amountMinor: Math.round(Number(amount) * 100) }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setResult(payload); else setMessage(payload.error ?? 'The dry run could not be completed.');
    setBusy(false);
  }

  if (!data) return <div className="rounded-xl border bg-white p-6">{message || 'Loading closed-loop test configuration…'}</div>;
  return <div className="space-y-6">
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950"><strong>Safe dry-run testing only.</strong> This screen never sends a payment, never requests a PAN, and never writes a fake transaction into production reporting. It tests configuration, simulated BIN matching, routing readiness, and provider setup.</section>
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Merchant<select value={merchantId} onChange={event => { const nextMerchantId = event.target.value; setMerchantId(nextMerchantId); setDeviceId(data.devices.find(device => device.merchant_id === nextMerchantId)?.id ?? ''); setTestBin(recommendedBin(data, nextMerchantId, providerKey)); setResult(null); }} className="mt-1 w-full rounded border px-3 py-2">{data.merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.display_name}</option>)}</select></label>
        <label className="text-sm font-medium">Combined Datecs device<select value={deviceId} onChange={event => setDeviceId(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">{merchantDevices.map(device => <option key={device.id} value={device.id}>{device.serial_number} · {device.enrollment_state}</option>)}</select></label>
        <label className="text-sm font-medium">Closed-loop program<select value={providerKey} onChange={event => { const nextProviderKey = event.target.value; setProviderKey(nextProviderKey); setTestBin(recommendedBin(data, merchantId, nextProviderKey)); setResult(null); }} className="mt-1 w-full rounded border px-3 py-2">{data.testPrograms.map(program => <option key={program.key} value={program.key}>{program.name}</option>)}</select></label>
        <label className="text-sm font-medium">Simulated test BIN<input inputMode="numeric" value={testBin} onChange={event => setTestBin(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="6–8 digits" className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="text-sm font-medium">Test amount<input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
      </div>
      <div className="mt-4 text-xs text-gray-600">Configured programs for this merchant: {merchantPrograms.length ? merchantPrograms.map(program => `${program.display_name} (${program.bin_prefix}${program.enabled ? '' : ', disabled'})`).join(', ') : 'None'}</div>
      <button type="button" onClick={() => void runTest()} disabled={busy || !merchantId || !deviceId} className="mt-5 rounded bg-blue-700 px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Running safe test…' : 'Run safe dry test'}</button>
      {message ? <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{message}</div> : null}
    </section>
    {result ? <section className="rounded-xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{result.provider} test result</h2><p className="mt-1 text-sm text-gray-600">Matched program: {result.matchedProgram ?? 'None'}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${result.passed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{result.passed ? 'Simulation passed' : 'Needs attention'}</span></div><div className="mt-5 space-y-3">{result.checks.map(check => <div key={check.key} className="flex gap-3 rounded-lg border p-3"><span className={`font-bold ${check.blocked ? 'text-amber-600' : check.passed ? 'text-green-700' : 'text-red-700'}`}>{check.blocked ? 'WAIT' : check.passed ? 'PASS' : 'FIX'}</span><div><div className="font-medium">{check.label}</div><div className="mt-1 text-sm text-gray-600">{check.detail}</div></div></div>)}</div></section> : null}
  </div>;
}
