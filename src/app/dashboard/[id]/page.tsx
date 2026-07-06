'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useParams } from 'next/navigation';

export default function MerchantDetail() {
  const { id } = useParams();

  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('merchant_id', id);

    if (!data) return;

    const devicesWithConfig = await Promise.all(
      data.map(async (device: any) => {

        const { data: configs } = await supabase
          .from('device_config')
          .select('*')
          .eq('device_id', device.id);

        const config =
          configs && configs.length > 0 ? configs[0] : null;

        return {
          ...device,
          configId: config?.id,
          deviceId: device.id,
          enable_presets: config?.enable_presets ?? false,
          enable_increment: config?.enable_increment ?? false
        };
      })
    );

    setDevices(devicesWithConfig);
  }

  // ✅ ✅ FIXED — uses BOTH id + device_id
  async function toggle(configId: string, deviceId: string, field: string, value: boolean) {
    await supabase
      .from('device_config')
      .update({ [field]: value })
      .match({
        id: configId,
        device_id: deviceId
      });

    loadDevices();
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Device Controls</h1>

      {devices.map((d) => (
        <div key={d.id} className="border p-4 mb-3 rounded">

          <div className="font-semibold mb-2">{d.name}</div>

          <div className="flex gap-4">

            <label>
              Presets
              <input
                type="checkbox"
                checked={d.enable_presets}
                onChange={(e) =>
                  toggle(d.configId, d.id, 'enable_presets', e.target.checked)
                }
                className="ml-2"
              />
            </label>

            <label>
              Increment
              <input
                type="checkbox"
                checked={d.enable_increment}
                onChange={(e) =>
                  toggle(d.configId, d.id, 'enable_increment', e.target.checked)
                }
                className="ml-2"
              />
            </label>

          </div>

        </div>
      ))}
    </div>
  );
}
