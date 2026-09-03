'use client';

import { useState } from 'react';
import type { TerminalDashboardData } from '../../lib/gimml-terminal-dashboard/types';
import { DeviceProfileCard } from './device-profile-card';
import { EntitlementEditor } from './entitlement-editor';

export function MerchantSubscriptions({ data, role, permissions, token }: { data: TerminalDashboardData; role: string; permissions: Set<string>; token: string }) {
  const merchantsWithDevices = data.merchants.filter(merchant => merchant.devices.some(device => /^6459/.test(device.serial_number)));
  const [merchantId, setMerchantId] = useState(merchantsWithDevices[0]?.id ?? '');
  const merchant = merchantsWithDevices.find(item => item.id === merchantId) ?? merchantsWithDevices[0];
  const isAdministrator = role === 'admin' || role === 'super_admin';

  return <section className="rounded-xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{isAdministrator ? 'Merchant subscriptions' : 'Your terminal plan and options'}</h2><p className="mt-1 text-sm text-gray-600">Review the assigned terminal type and only the options compatible with it.</p></div>{merchant ? <span className="rounded-full bg-gray-100 px-3 py-1 text-sm capitalize">Billing: {merchant.billing_status.replaceAll('_', ' ')}</span> : null}</div>
    {isAdministrator && merchantsWithDevices.length ? <label className="mt-5 block max-w-lg text-sm font-medium">Merchant<select value={merchant?.id ?? ''} onChange={event => setMerchantId(event.target.value)} className="mt-1 w-full rounded border bg-white px-3 py-2">{merchantsWithDevices.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label> : null}
    {!merchant ? <div className="mt-5 rounded-lg border border-dashed p-6 text-sm text-gray-500">No combined Datecs devices are assigned.</div> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{merchant.devices.filter(device => /^6459/.test(device.serial_number)).map(device => <div key={device.id} className="rounded-xl border p-4"><DeviceProfileCard device={device} canConfigure={isAdministrator} canEnroll={permissions.has('devices.enroll')} token={token} debugCertificateSha256={process.env.NEXT_PUBLIC_GIMML_DEBUG_CERT_SHA256} /><EntitlementEditor merchantId={merchant.id} device={device} capabilities={data.capabilities} initialEntitlements={data.entitlements} token={token} canEdit={permissions.has('features.assign')} /></div>)}</div>}
  </section>;
}
