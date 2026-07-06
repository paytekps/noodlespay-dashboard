'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useParams } from 'next/navigation';

export default function DeviceControl() {
  const { id } = useParams(); // ✅ this is merchant slug now

  const [devices, setDevices] = useState<any[]>([]);
  const [transactionsMap, setTransactionsMap] = useState<any>({});
  const [newDeviceName, setNewDeviceName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!id) return;
    loadDevices();
  }, [id]);

  async function loadDevices() {
    // ✅ FIX: ensure id is treated as string
    const slug = Array.isArray(id) ? id[0] : id;

    const { data: merchant } = await supabase
      .from('merchants')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!merchant) {
      console.error('Merchant not found for slug:', slug);
      return;
    }

    setMerchantId(merchant.id);

    const { data: devicesData } = await supabase
      .from('devices')
      .select('*')
      .eq('merchant_id', merchant.id);

    if (!devicesData) return;

    const devicesWithConfig = await Promise.all(
      devicesData.map(async (device: any) => {
        const { data: config } = await supabase
          .from('device_config')
          .select('*')
          .eq('device_id', device.id)
          .single();

        const cfg = config || {};

        return {
          ...device,
          configId: cfg.id,
          enable_presets: cfg.enable_presets ?? false,
          enable_increment: cfg.enable_increment ?? false
        };
      })
    );

    setDevices(devicesWithConfig);
    loadTransactions(devicesWithConfig);
  }

  async function loadTransactions(devicesList: any[]) {
    const allIds = devicesList.map(d => d.id);

    if (!allIds.length) return;

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .in('device_id', allIds)
      .order('created_at', { ascending: false });

    const map: any = {};

    (data || []).forEach(t => {
      if (!map[t.device_id]) map[t.device_id] = [];
      map[t.device_id].push(t);
    });

    setTransactionsMap(map);
  }

  async function addDevice() {
    if (!newDeviceName || !serialNumber || !merchantId) {
      alert('Missing data');
      return;
    }

    const { data: newDevice } = await supabase
      .from('devices')
      .insert({
        name: newDeviceName,
        merchant_id: merchantId,
        serial_number: serialNumber
      })
      .select()
      .single();

    await supabase
      .from('device_config')
      .insert({
        device_id: newDevice.id,
        default_amount: 0,
        step_amount: 5,
        max_amount: 100,
        enable_presets: true,
        enable_increment: true
      });

    setNewDeviceName('');
    setSerialNumber('');
    loadDevices();
  }

  async function toggle(configId: string, field: string, value: boolean) {
    await supabase
      .from('device_config')
      .update({ [field]: value })
      .eq('id', configId);

    loadDevices();
  }

  return (
    <div className="p-10 max-w-2xl mx-auto">

      <h1 className="text-3xl font-bold mb-8">
        Device Controls
      </h1>

      {/* SEARCH */}
      <input
        className="border rounded px-4 py-2 w-full mb-6"
        placeholder="Search devices..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* ADD DEVICE */}
      <div className="bg-white rounded-xl shadow p-6 mb-10 border">
        <h2 className="text-lg font-semibold mb-4">
          Add Device
        </h2>

        <div className="flex gap-3">
          <input
            className="border rounded px-4 py-2 flex-1"
            placeholder="Device name"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
          />

          <input
            className="border rounded px-4 py-2 flex-1"
            placeholder="Serial number"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />

          <button
            className="bg-black text-white px-5 py-2 rounded"
            onClick={addDevice}
          >
            Add
          </button>
        </div>
      </div>

      {/* DEVICE LIST */}
      <div className="space-y-4">
        {devices
          .filter((d) =>
            d.name.toLowerCase().includes(search.toLowerCase()) ||
            (d.serial_number || '')
              .toLowerCase()
              .includes(search.toLowerCase())
          )
          .map((d) => (

            <div
              key={d.id}
              className="bg-white p-5 rounded-xl border"
            >

              <div className="font-semibold text-lg">
                {d.name}
              </div>

              <div className="text-sm text-gray-500">
                SN: {d.serial_number}
              </div>

              <div className="flex gap-6 mt-4 text-sm">

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.enable_presets}
                    onChange={(e) =>
                      toggle(d.configId, 'enable_presets', e.target.checked)
                    }
                  />
                  Presets
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.enable_increment}
                    onChange={(e) =>
                      toggle(d.configId, 'enable_increment', e.target.checked)
                    }
                  />
                  Increment
                </label>

              </div>

              {/* TRANSACTIONS */}
              <div className="mt-4">
                <div className="text-sm font-semibold mb-2">
                  Transactions
                </div>

                <div className="space-y-2">

                  {(transactionsMap[d.id] || []).slice(0, 3).map(t => (
                    <div
                      key={t.id}
                      className="flex justify-between text-sm border p-2 rounded"
                    >
                      <div>${t.amount}</div>
                      <div>{t.status}</div>
                    </div>
                  ))}

                  {(transactionsMap[d.id] || []).length === 0 && (
                    <div className="text-xs text-gray-400">
                      No transactions
                    </div>
                  )}

                </div>
              </div>

            </div>

        ))}
      </div>

    </div>
  );
}
``