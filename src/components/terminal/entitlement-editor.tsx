'use client';

import { useState } from 'react';
import { capabilityCompatibilityLabel, capabilityLabel, capabilityWorksWithLayout, profileLabel } from '../../lib/gimml-terminal-dashboard/compatibility';
import type { TerminalCapability, TerminalDashboardData, TerminalDevice } from '../../lib/gimml-terminal-dashboard/types';

export function EntitlementEditor({ merchantId, device, capabilities, initialEntitlements, token, canEdit }: { merchantId: string; device: TerminalDevice; capabilities: TerminalCapability[]; initialEntitlements: TerminalDashboardData['entitlements']; token: string; canEdit: boolean }) {
  const layout = device.device_profiles[0]?.layout_key ?? 'ONE';
  const compatibleCapabilities = capabilities.filter(capability => capabilityWorksWithLayout(capability.key, layout));
  const initial = new Set(initialEntitlements.filter(e => e.merchant_id === merchantId && (capabilities.find(c => c.key === e.capability_key)?.scope === 'merchant' || e.device_assignments.some(a => a.device_id === device.id && !a.revoked_at))).map(e => e.capability_key));
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function toggle(capability: string, checked: boolean) {
    setBusy(capability); setMessage('');
    const response = await fetch('/api/dashboard/terminal', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId, deviceId: device.id, capabilityKey: capability, enabled: checked }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.checkoutUrl) {
      setMessage('Opening secure billing checkout…');
      window.location.assign(payload.checkoutUrl);
      return;
    }
    if (response.ok) { setEnabled(current => { const next = new Set(current); checked ? next.add(capability) : next.delete(capability); return next; }); setMessage('Feature assignment saved.'); } else setMessage(payload.error ?? 'Feature assignment could not be saved.');
    setBusy('');
  }
  return <div className="mt-4 border-t pt-4"><h4 className="text-sm font-semibold">Options for {profileLabel(device.device_profiles[0]?.profile_key ?? 'GIMML_ONE')}</h4><p className="mt-1 text-xs text-gray-500">Only options compatible with this terminal type appear below.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{compatibleCapabilities.map(capability => <label key={capability.key} className="rounded border p-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={enabled.has(capability.key)} disabled={!canEdit || busy === capability.key} onChange={e => void toggle(capability.key, e.target.checked)} /><span className="font-medium">{capabilityLabel(capability.key)}</span></span><span className="mt-1 flex justify-between pl-5 text-xs text-gray-500"><span>{capabilityCompatibilityLabel(capability.key)}</span><span>per {capability.scope}</span></span></label>)}</div>{message && <div className="mt-2 text-xs text-gray-600">{message}</div>}</div>;
}
