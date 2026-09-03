import type { TerminalDevice, TerminalMerchant } from '../../lib/gimml-terminal-dashboard/types';

export type ListedDevice = TerminalDevice & { merchantId: string; merchantName: string };

export function UnifiedDeviceList({ devices, selectedId, nowMs, onSelect }: {
  devices: ListedDevice[];
  selectedId: string | null;
  nowMs: number;
  onSelect: (id: string) => void;
}) {
  if (!devices.length) return <div className="rounded-xl border bg-white p-10 text-center text-gray-500">No combined Datecs devices match this search.</div>;
  return <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
    <div className="hidden grid-cols-[1.2fr_1fr_1.2fr_auto] gap-4 border-b bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
      <div>Serial number</div><div>Terminal type</div><div>Merchant</div><div>Status</div>
    </div>
    {devices.map(device => {
      const profile = device.device_profiles?.[0]?.profile_key;
      const online = Boolean(device.last_seen_at && nowMs - Date.parse(device.last_seen_at) <= 75_000);
      return <button type="button" key={device.id} onClick={() => onSelect(device.id)}
        aria-current={selectedId === device.id ? 'true' : undefined}
        className="grid w-full gap-2 border-b px-5 py-4 text-left transition hover:bg-blue-50 focus:bg-blue-50 focus:outline-none last:border-b-0 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] sm:items-center sm:gap-4">
        <div className="font-mono font-semibold">{device.serial_number}</div>
        <div>{profile === 'GIMML_MINI' ? 'Gimml Mini' : profile === 'GIMML_ONE' ? 'Gimml One' : 'Setup required'}</div>
        <div>{device.merchantName}</div>
        <div className={'text-sm font-semibold ' + (online ? 'text-green-700' : 'text-gray-500')}>{online ? 'Connected' : 'Offline'} <span aria-hidden>›</span></div>
      </button>;
    })}
  </div>;
}

export function flattenMerchantDevices(merchants: TerminalMerchant[]): ListedDevice[] {
  return merchants.flatMap(merchant => merchant.devices.map(device => ({
    ...device, merchantId: merchant.id, merchantName: merchant.display_name
  })));
}
