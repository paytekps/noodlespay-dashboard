'use client';

import Link from 'next/link';
import { useState } from 'react';

type Device = { id: string; name: string; serial_number: string; status: string; enrollment_state: string; config_revision: number; profile_key: string | null; layout_key: string | null };

export default function MerchantCombinedDevices({ devices }: { devices: Device[] }) {
  const [serialSearch, setSerialSearch] = useState('');
  const needle = serialSearch.trim().toLowerCase();
  const visibleDevices = needle ? devices.filter(device => device.serial_number.toLowerCase().includes(needle)) : devices;
  return <section className="mt-7 rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Combined Datecs devices</h2><p className="mt-1 text-sm text-gray-600">Only Datecs terminals assigned to the unified Gimml Terminal platform appear here.</p></div><Link href="/admin/devices" className="rounded border px-3 py-2 text-sm">Manage devices</Link></div><label className="mt-4 block text-sm font-medium">Search by serial number<input type="search" value={serialSearch} onChange={event => setSerialSearch(event.target.value)} placeholder="Enter any part of the serial number" className="mt-1 w-full rounded border px-3 py-2" /></label><div className="mt-4 grid gap-3 md:grid-cols-2">{visibleDevices.map(device => <Link key={device.id} href={`/admin/devices/${device.id}`} className="rounded-lg border p-4 hover:border-blue-400"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{device.name}</div><div className="mt-1 font-mono text-sm text-gray-600">S/N {device.serial_number}</div></div><span className={`rounded-full px-2 py-1 text-xs ${device.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{device.status}</span></div><div className="mt-3 text-sm text-gray-600">Profile: {device.profile_key || 'Not selected'} · Layout: {device.layout_key || 'Not selected'}</div><div className="mt-1 text-xs text-gray-500">Combined enrollment: {device.enrollment_state} · configuration revision {device.config_revision}</div></Link>)}{visibleDevices.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500 md:col-span-2">{devices.length === 0 ? 'No combined Datecs devices are assigned to this merchant.' : 'No device serial number matches this search.'}</div> : null}</div></section>;
}
