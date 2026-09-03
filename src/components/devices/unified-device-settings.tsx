'use client';

import { useState } from 'react';
import type { ListedDevice } from './unified-device-list';

type Settings = { default_cents: number; preset_cents: number[]; increment_cents: number; maximum_cents: number; reset_seconds: number };
const defaults: Settings = { default_cents: 100, preset_cents: [500, 1000, 2000], increment_cents: 100, maximum_cents: 100000, reset_seconds: 15 };
const dollars = (value: number) => (value / 100).toFixed(2);
const cents = (value: string) => Math.round(Number(value) * 100);

export function UnifiedDeviceSettings({ device, token, canConfigure, onSaved }: {
  device: ListedDevice; token: string; canConfigure: boolean; onSaved: () => Promise<void>;
}) {
  const profile = device.device_profiles?.[0]?.profile_key;
  const isMini = profile === 'GIMML_MINI';
  const [settings, setSettings] = useState<Settings>({ ...defaults, ...(device.terminal_settings?.value_json ?? {}) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function update(value: Partial<Settings>) { setSettings(current => ({ ...current, ...value })); setMessage(''); }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/dashboard/terminal', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, settings: { ...settings, default_cents: isMini ? 0 : settings.default_cents, increment_cents: isMini ? 0 : settings.increment_cents } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Settings could not be saved.');
      setMessage('Saved — the terminal will receive this configuration automatically.');
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{device.serial_number}</h2><p className="text-sm text-gray-500">{device.merchantName}</p></div>
      <div className="text-right text-sm"><div className="font-semibold">{isMini ? 'Gimml Mini' : profile === 'GIMML_ONE' ? 'Gimml One' : 'Setup required'}</div><div className="text-gray-500">Configuration revision {device.config_revision}</div></div>
    </div>
    {!profile && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">An administrator must assign Gimml One or Gimml Mini before configuring this terminal.</div>}
    <fieldset disabled={!canConfigure || !profile || busy} className="space-y-4 disabled:opacity-60">
      {!isMini && <label className="block text-sm font-medium">Default amount
        <input type="number" min="0" step="0.01" value={dollars(settings.default_cents)} onChange={event => update({ default_cents: cents(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2" />
      </label>}
      <div><div className="text-sm font-medium">Preset amounts</div><div className="mt-1 grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map(index => <input key={index} aria-label={'Preset ' + (index + 1)} type="number" min="0.01" step="0.01" value={dollars(settings.preset_cents[index] ?? 0)}
          onChange={event => update({ preset_cents: settings.preset_cents.map((value, item) => item === index ? cents(event.target.value) : value) })} className="rounded border px-3 py-2" />)}
      </div></div>
      {!isMini && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Increment amount<input type="number" min="0" step="0.01" value={dollars(settings.increment_cents)} onChange={event => update({ increment_cents: cents(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="text-sm font-medium">Maximum amount<input type="number" min="0.01" step="0.01" value={dollars(settings.maximum_cents)} onChange={event => update({ maximum_cents: cents(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2" /></label>
      </div>}
      <label className="block text-sm font-medium">Automatic reset countdown (seconds)
        <input type="number" min="5" max="300" step="1" value={settings.reset_seconds} onChange={event => update({ reset_seconds: Number(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <button type="button" onClick={() => void save()} className="rounded bg-blue-700 px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save device settings'}</button>
    </fieldset>
    {!canConfigure && <p className="text-sm text-gray-500">Your account has view-only access to device settings.</p>}
    {message && <div role="status" className={'rounded-lg border p-3 text-sm ' + (message.startsWith('Saved') ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800')}>{message}</div>}
  </section>;
}
