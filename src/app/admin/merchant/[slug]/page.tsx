'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useParams } from 'next/navigation';

export default function MerchantPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [merchant, setMerchant] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [role, setRole] = useState<string>('admin');
  const [newDeviceName, setNewDeviceName] = useState('');
const [serialNumber, setSerialNumber] = useState('');
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    loadData();
  }, [slug]);

  // ✅ PLAN ONLY
  function applyPlan(plan: string) {
    return { plan };
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) setRole(profile.role);

    const { data: merchantData } = await supabase
      .from('merchants')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!merchantData) return;
    setMerchant(merchantData);

    const { data: devicesData } = await supabase
      .from('devices')
      .select('*')
      .eq('merchant_id', merchantData.id);

    const devicesWithConfig = await Promise.all(
      (devicesData || []).map(async (device: any) => {
        const { data: config } = await supabase
          .from('device_config')
          .select('*')
          .eq('device_id', device.id)
          .single();

        const cfg = config || {};

        return {
          ...device,
          configId: cfg.id,
          plan: cfg.plan || 'basic'
        };
      })
    );

    setDevices(devicesWithConfig);
  }

  async function createDevice() {
    if (!newDeviceName || !serialNumber || !merchant) return;

    const { data: device } = await supabase
      .from('devices')
      .insert({
        name: newDeviceName,
        merchant_id: merchant.id,
        serial_number: serialNumber
      })
      .select()
      .single();

    if (device) {
      await supabase.from('device_config').insert({
        device_id: device.id,
        default_amount: 0
      });
    }

    setNewDeviceName('');
setSerialNumber('');
    loadData();
  }

async function updateConfig(deviceId: string, values: any) {
  setSavingDeviceId(deviceId);
  setSavedDeviceId(null);
  const { data: existing, error: lookupError } = await supabase
    .from('device_config')
    .select('id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (lookupError) {
    alert(`Plan lookup failed: ${lookupError.message}`);
    setSavingDeviceId(null);
    return;
  }

  const result = existing
    ? await supabase
        .from('device_config')
        .update(values)
        .eq('id', existing.id)
    : await supabase
        .from('device_config')
        .insert({
          device_id: deviceId,
          ...values
        });

  if (result.error) {
    alert(`Plan update failed: ${result.error.message}`);
    setSavingDeviceId(null);
    return;
  }

  setSavingDeviceId(null);
  setSavedDeviceId(deviceId);
}

  function updateLocalPlan(deviceId: string, plan: string) {
    setSavedDeviceId(null);
    setDevices(current => current.map(device =>
      device.id === deviceId ? { ...device, plan } : device
    ));
  }
  const canChangePlan = role === 'admin';

  if (!merchant) {
    return <div className="p-10">Loading...</div>;
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">

      <h1 className="text-3xl font-bold mb-2">
        {merchant.name} Device Settings
      </h1>

      <div className="mb-4">
        <a href="/admin" className="text-blue-600 text-sm">
          ← Back to Settings
        </a>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          placeholder="Device name"
          value={newDeviceName}
          onChange={(e) => setNewDeviceName(e.target.value)}
          className="border px-3 py-2 rounded flex-1"
        />
<input
  placeholder="Serial number"
  value={serialNumber}
  onChange={(e) => setSerialNumber(e.target.value)}
  className="border px-3 py-2 rounded flex-1"
/>
        <button
          onClick={createDevice}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Add Device
        </button>
      </div>

      <div className="space-y-6">
        {devices.map((d) => (

          <div key={d.id} className="bg-white p-5 rounded-xl border">

            <div className="font-semibold text-lg">
              {d.name}
            </div>

            <div className="text-sm text-gray-500 mb-2">
              SN: {d.serial_number}
            </div>

            {/* ✅ PLAN SELECT */}
            <select
              disabled={!canChangePlan}
              value={d.plan}
              onChange={(e) => updateLocalPlan(d.id, e.target.value)}
              className="border px-3 py-2 rounded mt-2"
            >
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>

            {/* ✅ PLAN FEATURES (FIXED) */}
            <div className="mt-4 text-sm text-gray-600">
              <div className="font-medium mb-2">
                Included in this plan:
              </div>

              {d.plan === 'basic' && (
                <div className="space-y-1">
                  <div>✔ Set Amount</div>
                  <div>✖ Presets</div>
                  <div>✖ Increment</div>
                  <div>✖ Reset</div>
                </div>
              )}

              {d.plan === 'pro' && (
                <div className="space-y-1">
                  <div>✔ Set Amount</div>
                  <div>✖ Presets</div>
                  <div>✔ Increment</div>
                  <div>✔ Reset (Manual)</div>
                </div>
              )}

              {d.plan === 'premium' && (
                <div className="space-y-1">
                  <div>✔ Set Amount</div>
                  <div>✔ Presets</div>
                  <div>✔ Increment</div>
                  <div>✔ Reset (Auto + Manual)</div>
                </div>
              )}
            </div>

            {canChangePlan && (
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => updateConfig(d.id, applyPlan(d.plan))}
                  disabled={savingDeviceId === d.id}
                  className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-60"
                >
                  {savingDeviceId === d.id ? 'Saving...' : 'Save Plan'}
                </button>
                {savedDeviceId === d.id && (
                  <span className="text-sm text-green-600">
                    Saved — device will update automatically
                  </span>
                )}
              </div>
            )}

          </div>

        ))}
      </div>

    </div>
  );
}
