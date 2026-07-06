'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [transactionsMap, setTransactionsMap] = useState<any>({});
  const [editingText, setEditingText] = useState<any>({});

  useEffect(() => {
    loadProfile();
    loadMerchants();
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadDevices();
  }, [profile, selectedMerchant]);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setProfile(data);
  }

  async function loadMerchants() {
    const { data } = await supabase
      .from('merchants')
      .select('id, name');

    setMerchants(data || []);
  }

  async function loadDevices() {
    let query = supabase
      .from('devices')
      .select(`*, merchants ( name )`);

    if (selectedMerchant) {
      query = query.eq('merchant_id', selectedMerchant);
    }

    if (profile.role === 'merchant') {
      query = query.eq('merchant_id', profile.merchant_id);
    }

    if (profile.role === 'sales_rep') {
      const { data: rep } = await supabase
        .from('sales_reps')
        .select('id')
        .eq('user_id', profile.id)
        .single();

      const { data: assignments } = await supabase
        .from('sales_rep_merchants')
        .select('merchant_id')
        .eq('sales_rep_id', rep?.id);

      const ids = assignments?.map(a => a.merchant_id) || [];

      if (!ids.length) {
        setDevices([]);
        return;
      }

      query = query.in('merchant_id', ids);
    }

    const { data } = await query;
    if (!data) return;

    const formatted = await Promise.all(
      data.map(async (device: any) => {
        const { data: cfg } = await supabase
          .from('device_config')
          .select('*')
          .eq('device_id', device.id)
          .maybeSingle();

        return {
          ...device,
          merchant_name: device?.merchants?.name || 'Unknown',
          amount: cfg?.default_amount || 0,
default_amount: cfg?.default_amount || 0,
max_amount: cfg?.max_amount || 100,
          display_text: cfg?.display_text || '',
          step: cfg?.step_amount || 5,
          preset_1: cfg?.preset_1 || 5,
          preset_2: cfg?.preset_2 || 10,
          preset_3: cfg?.preset_3 || 20,
          enable_presets: cfg?.enable_presets ?? false,
          enable_increment: cfg?.enable_increment ?? false,
          reset_mode: cfg?.reset_mode || 'button',
          reset_delay: cfg?.reset_delay || 5
        };
      })
    );

    setDevices(formatted);
    loadTransactions(formatted);
  }

  async function loadTransactions(devicesList: any[]) {
    const ids = devicesList.map(d => d.id);

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .in('device_id', ids);

    const map: any = {};
    (data || []).forEach(t => {
      if (!map[t.device_id]) map[t.device_id] = [];
      map[t.device_id].push(t);
    });

    setTransactionsMap(map);
  }

  const allTransactions = Object.values(transactionsMap).flat();
  const totalVolume = allTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const totalTransactions = allTransactions.length;
  const avgTransaction = totalTransactions ? Math.round(totalVolume / totalTransactions) : 0;

  async function updateConfig(deviceId: string, values: any) {
    await supabase
      .from('device_config')
      .update(values)
      .eq('device_id', deviceId);

    loadDevices();
  }

  async function saveDisplayText(deviceId: string) {
    const value = editingText[deviceId];

    await supabase
      .from('device_config')
      .update({ display_text: value })
      .eq('device_id', deviceId);

    loadDevices();
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">

      <h1 className="text-3xl font-bold mb-8">Devices</h1>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow text-center">
          <div className="text-sm text-gray-500">Total Volume</div>
          <div className="text-2xl font-bold text-green-600">
            ${totalVolume.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow text-center">
          <div className="text-sm text-gray-500">Transactions</div>
          <div className="text-2xl font-bold">
            {totalTransactions}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow text-center">
          <div className="text-sm text-gray-500">Avg Transaction</div>
          <div className="text-2xl font-bold">
            ${avgTransaction}
          </div>
        </div>
      </div>

      <div className="grid gap-6">

        {devices.map(d => (

          <div key={d.id} className="bg-white p-6 rounded-xl shadow space-y-4">

            <div>
              <div className="font-semibold text-lg">{d.name}</div>
              {profile?.role !== 'merchant' && (
                <div className="text-sm text-gray-500">{d.merchant_name}</div>
              )}
            </div>

            {/* MESSAGE */}
            <input
              type="text"
              value={editingText[d.id] ?? d.display_text}
              placeholder="Optional message"
              onChange={(e) =>
                setEditingText({
                  ...editingText,
                  [d.id]: e.target.value
                })
              }
              onBlur={() => saveDisplayText(d.id)}
              className="w-full border px-3 py-2 rounded text-sm"
            />

            {/* CONFIG ONLY */}

{/* DEFAULT AMOUNT */}
<div>
  <label className="block mb-1">
    Default Amount
  </label>

  <input
    type="number"
    value={d.default_amount}
    onChange={(e) =>
      updateConfig(d.id, {
        default_amount: Number(e.target.value)
      })
    }
    className="border px-2 py-1 rounded w-full"
  />
</div>

            {/* PRESETS */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enable_presets}
                  onChange={(e) =>
                    updateConfig(d.id, { enable_presets: e.target.checked })
                  }
                />
                Show Presets on Device
              </label>

              {d.enable_presets && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[1,2,3].map(i => (
                    <input
                      key={i}
                      type="number"
                      value={d[`preset_${i}`]}
                      onChange={(e) =>
                        updateConfig(d.id, {
                          [`preset_${i}`]: Number(e.target.value)
                        })
                      }
                      className="border px-2 py-1 rounded"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* INCREMENT */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enable_increment}
                  onChange={(e) =>
                    updateConfig(d.id, { enable_increment: e.target.checked })
                  }
                />
                Show Increment on Device
              </label>

              {d.enable_increment && (
                <input
                  type="number"
                  value={d.step}
                  onChange={(e) =>
                    updateConfig(d.id, {
                      step_amount: Number(e.target.value)
                    })
                  }
                  className="border px-2 py-1 rounded w-full mt-2"
                />
              )}
            </div>
{/* MAX AMOUNT */}
<div>
  <label className="block mb-1">
    Maximum Amount
  </label>

  <input
    type="number"
    value={d.max_amount}
    onChange={(e) =>
      updateConfig(d.id, {
        max_amount: Number(e.target.value)
      })
    }
    className="border px-2 py-1 rounded w-full"
  />
</div>
            {/* RESET MODE */}
            <div>
              <select
                value={d.reset_mode}
                onChange={(e) =>
                  updateConfig(d.id, { reset_mode: e.target.value })
                }
                className="border px-3 py-2 rounded w-full"
              >
                <option value="button">Manual Reset</option>
                <option value="auto">Auto Reset</option>
              </select>

              {d.reset_mode === 'auto' && (
                <input
                  type="number"
                  value={d.reset_delay}
                  onChange={(e) =>
                    updateConfig(d.id, {
                      reset_delay: Number(e.target.value)
                    })
                  }
                  className="border px-2 py-1 rounded w-full mt-2"
                />
              )}
            </div>

          </div>

        ))}

      </div>
    </div>
  );
}