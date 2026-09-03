'use client';

import { useState } from 'react';
import { capabilityCompatibilityLabel, capabilityLabel } from '../../lib/gimml-terminal-dashboard/compatibility';
import type { TerminalCapability } from '../../lib/gimml-terminal-dashboard/types';

export function CapabilityCatalog({ capabilities, canEdit, token }: { capabilities: TerminalCapability[]; canEdit: boolean; token: string }) {
  const [prices, setPrices] = useState(() => Object.fromEntries(capabilities.map(capability => [capability.catalog_items[0]?.sku, capability.catalog_items[0]?.unit_price_cents ?? 0])));
  const [message, setMessage] = useState('');
  async function savePrice(sku: string) {
    setMessage('Saving price…');
    const response = await fetch('/api/dashboard/terminal', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, unitPriceCents: prices[sku] }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Price saved.' : payload.error ?? 'Price could not be saved.');
  }
  return <section className="rounded-xl border bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold">Owner pricing</h2>
    <p className="mt-1 text-sm text-gray-600">Only the owner can change catalog prices. A $0.00 price is still an intentional catalog price.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Feature</th><th className="p-2">Available on</th><th className="p-2">Type</th><th className="p-2">Charged</th><th className="p-2">Price</th></tr></thead><tbody>
      {capabilities.map(capability => { const item = capability.catalog_items[0]; return <tr className="border-b" key={capability.key}><td className="p-2 font-medium">{capabilityLabel(capability.key)}</td><td className="p-2"><span className="inline-block rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">{capabilityCompatibilityLabel(capability.key)}</span></td><td className="p-2 capitalize">{capability.classification.replaceAll('_', ' ')}</td><td className="p-2 capitalize">Per {capability.scope}</td><td className="p-2">{canEdit && item ? <div className="flex items-center gap-1"><span>$</span><input aria-label={`${capabilityLabel(capability.key)} price`} className="w-24 rounded border p-1" type="number" min="0" step="0.01" value={(prices[item.sku] / 100).toFixed(2)} onChange={event => setPrices(current => ({ ...current, [item.sku]: Math.round(Number(event.target.value) * 100) }))} /><button className="rounded border px-2 py-1" onClick={() => void savePrice(item.sku)}>Save</button></div> : `$${((item?.unit_price_cents ?? 0) / 100).toFixed(2)}`}<div className="text-xs text-gray-500">per {item?.billing_interval ?? 'month'}</div></td></tr>; })}
    </tbody></table></div>{message && <div className="mt-3 text-sm text-gray-600">{message}</div>}
  </section>;
}
