'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type ConfigHistoryEntry = {
  id: number;
  changed_at: string;
  changed_by_role: string;
  action: 'baseline' | 'created' | 'updated';
  changes: Record<string, { before: unknown; after: unknown }>;
};

const historyFieldLabels: Record<string, string> = {
  display_text: 'Device message',
  default_amount: 'Default amount',
  max_amount: 'Maximum amount',
  preset_1: 'Preset 1',
  preset_2: 'Preset 2',
  preset_3: 'Preset 3',
  step_amount: 'Increment amount',
  enable_presets: 'Show presets',
  enable_increment: 'Show increment',
  reset_delay: 'Automatic reset countdown',
  plan: 'Plan'
};

const moneyHistoryFields = new Set([
  'default_amount', 'max_amount', 'preset_1', 'preset_2', 'preset_3', 'step_amount'
]);

function formatHistoryValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Shown' : 'Hidden';
  if (moneyHistoryFields.has(field)) return `$${Number(value).toLocaleString()}`;
  if (field === 'reset_delay') return `${value} seconds`;
  return String(value);
}

function formatHistoryActor(role: string) {
  if (role === 'admin' || role === 'super_admin') return 'Administrator';
  if (role === 'sales_rep') return 'Sales representative';
  if (role === 'merchant') return 'Merchant';
  return 'System';
}

function getConfigErrors(device: any, displayText: string) {
  const errors: string[] = [];
  const isPositiveAmount = (value: number) => Number.isFinite(value) && value > 0;
  const hasAtMostTwoDecimals = (value: number) =>
    Math.abs(value * 100 - Math.round(value * 100)) < Number.EPSILON * 100;

  if (!isPositiveAmount(device.default_amount)) {
    errors.push('Default amount must be greater than $0.');
  } else if (!hasAtMostTwoDecimals(device.default_amount)) {
    errors.push('Default amount can have no more than two decimal places.');
  }

  if (!isPositiveAmount(device.max_amount)) {
    errors.push('Maximum amount must be greater than $0.');
  } else if (device.max_amount < device.default_amount) {
    errors.push('Maximum amount cannot be lower than the default amount.');
  } else if (!hasAtMostTwoDecimals(device.max_amount)) {
    errors.push('Maximum amount can have no more than two decimal places.');
  }

  if (device.plan === 'premium' && device.enable_presets) {
    [device.preset_1, device.preset_2, device.preset_3].forEach((preset, index) => {
      if (!isPositiveAmount(preset)) {
        errors.push(`Preset ${index + 1} must be greater than $0.`);
      } else if (preset > device.max_amount) {
        errors.push(`Preset ${index + 1} cannot be higher than the maximum amount.`);
      } else if (!hasAtMostTwoDecimals(preset)) {
        errors.push(`Preset ${index + 1} can have no more than two decimal places.`);
      }
    });
  }

  if ((device.plan === 'pro' || device.plan === 'premium') && device.enable_increment) {
    if (!isPositiveAmount(device.step)) {
      errors.push('Increment amount must be greater than $0.');
    } else if (!hasAtMostTwoDecimals(device.step)) {
      errors.push('Increment amount can have no more than two decimal places.');
    }
  }

  if ((device.plan === 'pro' || device.plan === 'premium') &&
      (!Number.isInteger(device.reset_delay) || device.reset_delay < 1)) {
    errors.push('Auto-reset delay must be at least 1 second and use a whole number.');
  }

  if (displayText.length > 120) {
    errors.push('Device message must be 120 characters or fewer.');
  }

  return errors;
}

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [transactionsMap, setTransactionsMap] = useState<any>({});
  const [editingText, setEditingText] = useState<any>({});
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);
  const [configErrors, setConfigErrors] = useState<Record<string, string[]>>({});
  const [historyOpenDeviceId, setHistoryOpenDeviceId] = useState<string | null>(null);
  const [historyLoadingDeviceId, setHistoryLoadingDeviceId] = useState<string | null>(null);
  const [historyByDevice, setHistoryByDevice] = useState<Record<string, ConfigHistoryEntry[]>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});

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
          reset_delay: cfg?.reset_delay || 5,
          plan: cfg?.plan || 'basic'
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

  async function loadHistory(deviceId: string) {
    setHistoryLoadingDeviceId(deviceId);
    setHistoryErrors(current => ({ ...current, [deviceId]: '' }));

    const { data, error } = await supabase
      .from('device_config_history')
      .select('id, changed_at, changed_by_role, action, changes')
      .eq('device_id', deviceId)
      .order('changed_at', { ascending: false })
      .limit(25);

    if (error) {
      console.error('Settings history lookup failed:', error);
      setHistoryErrors(current => ({
        ...current,
        [deviceId]: 'Settings history could not be loaded.'
      }));
    } else {
      setHistoryByDevice(current => ({
        ...current,
        [deviceId]: (data || []) as ConfigHistoryEntry[]
      }));
    }

    setHistoryLoadingDeviceId(null);
  }

  async function toggleHistory(deviceId: string) {
    if (historyOpenDeviceId === deviceId) {
      setHistoryOpenDeviceId(null);
      return;
    }

    setHistoryOpenDeviceId(deviceId);
    await loadHistory(deviceId);
  }

  const allTransactions = Object.values(transactionsMap).flat() as any[];
  const totalVolume = allTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const totalTransactions = allTransactions.length;
  const avgTransaction = totalTransactions ? Math.round(totalVolume / totalTransactions) : 0;

function updateLocalConfig(deviceId: string, values: any) {
  setSavedDeviceId(null);
  setConfigErrors(current => ({ ...current, [deviceId]: [] }));
  setDevices(current => current.map(device =>
    device.id === deviceId ? { ...device, ...values } : device
  ));
}

async function saveConfig(device: any) {
  setSavedDeviceId(null);

  const displayText = editingText[device.id] ?? device.display_text;
  const errors = getConfigErrors(device, displayText);
  setConfigErrors(current => ({ ...current, [device.id]: errors }));

  if (errors.length) return;

  setSavingDeviceId(device.id);

  const values = {
    display_text: displayText,
    default_amount: device.default_amount,
    max_amount: device.max_amount,
    preset_1: device.preset_1,
    preset_2: device.preset_2,
    preset_3: device.preset_3,
    step_amount: device.step,
    enable_presets: device.plan === 'premium' && device.enable_presets,
    enable_increment: device.plan !== 'basic' && device.enable_increment,
    reset_delay: device.reset_delay
  };

  const { data: existing, error: lookupError } = await supabase
    .from('device_config')
    .select('id')
    .eq('device_id', device.id)
    .maybeSingle();

  if (lookupError) {
    console.error('Config lookup failed:', lookupError);
    alert(`Config lookup failed: ${lookupError.message}`);
    setSavingDeviceId(null);
    return;
  }

  const { error } = existing
    ? await supabase
        .from('device_config')
        .update(values)
        .eq('id', existing.id)
    : await supabase
        .from('device_config')
        .insert({ device_id: device.id, ...values });
  
  if (error) {
    console.error('Config update failed:', error);
    alert(`Config update failed: ${error.message}`);
    setSavingDeviceId(null);
    return;
  }

  setDevices(current => current.map(item =>
    item.id === device.id
      ? { ...item, display_text: editingText[device.id] ?? item.display_text }
      : item
  ));
  setSavingDeviceId(null);
  setSavedDeviceId(device.id);
  if (historyOpenDeviceId === device.id) await loadHistory(device.id);
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
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-lg">{d.name}</div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-600">
                  {d.plan}
                </span>
              </div>
              {profile?.role !== 'merchant' && (
                <div className="text-sm text-gray-500">{d.merchant_name}</div>
              )}
            </div>

            {/* MESSAGE */}
            <input
              type="text"
              value={editingText[d.id] ?? d.display_text}
              placeholder="Optional message"
              onChange={(e) => {
                setSavedDeviceId(null);
                setConfigErrors(current => ({ ...current, [d.id]: [] }));
                setEditingText({
                  ...editingText,
                  [d.id]: e.target.value
                });
              }}
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
      updateLocalConfig(d.id, {
        default_amount: Number(e.target.value)
      })
    }
    className="border px-2 py-1 rounded w-full"
  />
</div>

            {/* PREMIUM PRESETS */}
            {d.plan === 'premium' && (
              <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enable_presets}
                  onChange={(e) =>
                    updateLocalConfig(d.id, { enable_presets: e.target.checked })
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
                        updateLocalConfig(d.id, {
                          [`preset_${i}`]: Number(e.target.value)
                        })
                      }
                      className="border px-2 py-1 rounded"
                    />
                  ))}
                </div>
              )}
              </div>
            )}

            {/* PRO AND PREMIUM INCREMENT */}
            {(d.plan === 'pro' || d.plan === 'premium') && (
              <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enable_increment}
                  onChange={(e) =>
                    updateLocalConfig(d.id, { enable_increment: e.target.checked })
                  }
                />
                Show Increment on Device
              </label>

              {d.enable_increment && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Increment Amount
                    <input
                      type="number"
                      value={d.step}
                      onChange={(e) =>
                        updateLocalConfig(d.id, {
                          step: Number(e.target.value)
                        })
                      }
                      className="border px-2 py-1 rounded w-full mt-1"
                    />
                  </label>
                  <label className="text-sm">
                    Maximum Amount
                    <input
                      type="number"
                      value={d.max_amount}
                      onChange={(e) =>
                        updateLocalConfig(d.id, {
                          max_amount: Number(e.target.value)
                        })
                      }
                      className="border px-2 py-1 rounded w-full mt-1"
                    />
                  </label>
                </div>
              )}
              </div>
            )}

            {d.plan === 'basic' && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                Basic devices show only the saved amount.
              </div>
            )}

            {(d.plan === 'pro' || d.plan === 'premium') && (
              <div>
                <label className="block text-sm mt-2">
                  Automatic reset countdown (seconds)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={d.reset_delay}
                    onChange={(e) =>
                      updateLocalConfig(d.id, {
                        reset_delay: Number(e.target.value)
                      })
                    }
                    className="border px-2 py-1 rounded w-full mt-1"
                  />
                  <span className="block mt-1 text-xs text-gray-500">
                    The device counts down through 0, then resets one second later.
                  </span>
                </label>
              </div>
            )}

            {!!configErrors[d.id]?.length && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <div className="font-semibold">Please fix these settings:</div>
                <ul className="mt-1 list-disc pl-5">
                  {configErrors[d.id].map(error => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => saveConfig(d)}
                disabled={savingDeviceId === d.id}
                className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-60"
              >
                {savingDeviceId === d.id ? 'Saving...' : 'Save Changes'}
              </button>
              {savedDeviceId === d.id && (
                <span className="text-sm text-green-600">
                  Saved — device will update automatically
                </span>
              )}
            </div>

            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => toggleHistory(d.id)}
                className="text-sm font-semibold text-blue-700 hover:underline"
              >
                {historyOpenDeviceId === d.id ? 'Hide Change History' : 'View Change History'}
              </button>

              {historyOpenDeviceId === d.id && (
                <div className="mt-3 rounded-lg bg-gray-50 p-4">
                  {historyLoadingDeviceId === d.id && (
                    <div className="text-sm text-gray-500">Loading change history...</div>
                  )}

                  {historyErrors[d.id] && (
                    <div className="text-sm text-red-700" role="alert">{historyErrors[d.id]}</div>
                  )}

                  {historyLoadingDeviceId !== d.id && !historyErrors[d.id] &&
                    (historyByDevice[d.id]?.length || 0) === 0 && (
                    <div className="text-sm text-gray-500">No settings changes have been recorded yet.</div>
                  )}

                  <div className="space-y-3">
                    {(historyByDevice[d.id] || []).map(entry => (
                      <div key={entry.id} className="rounded border bg-white p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {entry.action === 'baseline' ? 'Initial settings recorded' : `Changed by ${formatHistoryActor(entry.changed_by_role)}`}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(entry.changed_at).toLocaleString()}
                          </span>
                        </div>

                        {entry.action !== 'baseline' && (
                          <div className="mt-2 space-y-1 text-gray-700">
                            {Object.entries(entry.changes)
                              .filter(([field]) => historyFieldLabels[field])
                              .map(([field, change]) => (
                                <div key={field}>
                                  <span className="font-medium">{historyFieldLabels[field]}:</span>{' '}
                                  {formatHistoryValue(field, change.before)} → {formatHistoryValue(field, change.after)}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        ))}

      </div>
    </div>
  );
}
