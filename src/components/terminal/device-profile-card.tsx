'use client';

import { useState } from 'react';
import { profileLabel } from '../../lib/gimml-terminal-dashboard/compatibility';
import type { TerminalDevice, TerminalLayout, TerminalProfile } from '../../lib/gimml-terminal-dashboard/types';

export function DeviceProfileCard({ device, canConfigure, canEnroll, token, debugCertificateSha256 }: { device: TerminalDevice; canConfigure: boolean; canEnroll: boolean; token: string; debugCertificateSha256?: string }) {
  const current = device.device_profiles[0];
  const [profile, setProfile] = useState<TerminalProfile>(current?.profile_key ?? 'GIMML_ONE');
  const [layout, setLayout] = useState<TerminalLayout>(current?.layout_key ?? 'ONE');
  const [state, setState] = useState('');
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  async function save() {
    setState('Saving…');
    const response = await fetch('/api/dashboard/terminal', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device.id, profileKey: profile, layoutKey: layout }) });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? 'Saved — the terminal will receive the next configuration revision.' : payload.error ?? 'Could not save.');
  }
  async function createPairingCode() {
    setState('Creating pairing code…');
    const response = await fetch('/api/dashboard/terminal', { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device.id, applicationId: 'com.gimml.terminal.debug', signingCertificateSha256: debugCertificateSha256 }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setPairing({ code: payload.pairingCode, expiresAt: payload.expiresAt }); setState(''); } else setState(payload.error ?? 'Pairing code could not be created.');
  }
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><div><div className="font-semibold">Serial {device.serial_number}</div><div className="text-xs text-gray-500">{device.enrollment_state} · revision {device.config_revision}</div></div><span className="rounded bg-gray-100 px-2 py-1 text-xs">{profileLabel(profile)}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Starting profile<select disabled={!canConfigure} value={profile} onChange={e => { const value = e.target.value as TerminalProfile; setProfile(value); if (value === 'GIMML_ONE') setLayout('ONE'); if (value === 'GIMML_MINI') setLayout('MINI'); }} className="mt-1 w-full rounded border p-2"><option value="GIMML_ONE">Gimml One</option><option value="GIMML_MINI">Gimml Mini</option></select></label><label className="text-sm">Screen layout<select disabled value={layout} className="mt-1 w-full rounded border p-2"><option value="ONE">One</option><option value="MINI">Mini</option></select></label></div>
    {(canConfigure || canEnroll) && <div className="mt-4 flex flex-wrap gap-2">{canConfigure && <button onClick={save} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save terminal profile</button>}{canEnroll && debugCertificateSha256 && <button onClick={createPairingCode} className="rounded border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700">Create test-app pairing code</button>}</div>} {state && <span className="mt-2 block text-sm text-gray-600">{state}</span>}{pairing && <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3"><div className="text-sm">Enter this one-time code on the unified test app:</div><div className="my-2 font-mono text-2xl font-bold tracking-widest">{pairing.code}</div><div className="text-xs">Expires {new Date(pairing.expiresAt).toLocaleTimeString()}.</div></div>}
  </article>;
}
