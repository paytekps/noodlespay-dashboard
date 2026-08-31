'use client';

import { useState } from 'react';
import { profileLabel } from '../../lib/gimml-terminal-dashboard/compatibility';
import type { TerminalDevice, TerminalLayout, TerminalProfile } from '../../lib/gimml-terminal-dashboard/types';

export function DeviceProfileCard({ device, canEdit, token }: { device: TerminalDevice; canEdit: boolean; token: string }) {
  const current = device.device_profiles[0];
  const [profile, setProfile] = useState<TerminalProfile>(current?.profile_key ?? 'GIMML_ONE');
  const [layout, setLayout] = useState<TerminalLayout>(current?.layout_key ?? 'ONE');
  const [state, setState] = useState('');
  async function save() {
    setState('Saving…');
    const response = await fetch('/api/dashboard/terminal', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device.id, profileKey: profile, layoutKey: layout }) });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? 'Saved — the terminal will receive the next configuration revision.' : payload.error ?? 'Could not save.');
  }
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><div><div className="font-semibold">Serial {device.serial_number}</div><div className="text-xs text-gray-500">{device.enrollment_state} · revision {device.config_revision}</div></div><span className="rounded bg-gray-100 px-2 py-1 text-xs">{profileLabel(profile)}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Starting profile<select disabled={!canEdit} value={profile} onChange={e => { const value = e.target.value as TerminalProfile; setProfile(value); if (value === 'GIMML_ONE') setLayout('ONE'); if (value === 'GIMML_MINI') setLayout('MINI'); }} className="mt-1 w-full rounded border p-2"><option value="GIMML_ONE">Gimml One</option><option value="GIMML_MINI">Gimml Mini</option><option value="CUSTOM">Custom</option></select></label><label className="text-sm">Screen layout<select disabled={!canEdit || profile !== 'CUSTOM'} value={layout} onChange={e => setLayout(e.target.value as TerminalLayout)} className="mt-1 w-full rounded border p-2"><option value="ONE">One</option><option value="MINI">Mini</option></select></label></div>
    {canEdit && <button onClick={save} className="mt-4 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Save terminal profile</button>} {state && <span className="ml-3 text-sm text-gray-600">{state}</span>}
  </article>;
}
