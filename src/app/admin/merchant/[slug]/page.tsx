'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useParams } from 'next/navigation';

type ClosedLoopCard = {
  slot: number;
  name: string;
  bin_prefix: string;
  enabled: boolean;
};

const emptyClosedLoopCards = (): ClosedLoopCard[] =>
  [1, 2, 3, 4].map(slot => ({ slot, name: '', bin_prefix: '', enabled: false }));

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
  const [closedLoopCards, setClosedLoopCards] = useState<ClosedLoopCard[]>(emptyClosedLoopCards);
  const [savingCards, setSavingCards] = useState(false);
  const [cardsSaved, setCardsSaved] = useState(false);

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

    const { data: configuredCards } = await supabase
      .from('closed_loop_cards')
      .select('slot, name, bin_prefix, enabled')
      .eq('merchant_id', merchantData.id)
      .order('slot');

    setClosedLoopCards(emptyClosedLoopCards().map(empty => {
      const configured = (configuredCards || []).find(card => card.slot === empty.slot);
      return configured
        ? { ...empty, ...configured, bin_prefix: configured.bin_prefix || '' }
        : empty;
    }));

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

  function updateClosedLoopCard(slot: number, values: Partial<ClosedLoopCard>) {
    setCardsSaved(false);
    setClosedLoopCards(cards => cards.map(card =>
      card.slot === slot ? { ...card, ...values } : card
    ));
  }

  async function saveClosedLoopCards() {
    if (!merchant || !canChangePlan) return;

    const configuredCards = closedLoopCards.filter(card =>
      card.name.trim() || card.bin_prefix.trim() || card.enabled
    );
    const invalid = configuredCards.find(card =>
      !card.name.trim()
      || !/^\d{6,8}$/.test(card.bin_prefix)
    );
    if (invalid) {
      alert(`Card ${invalid.slot} needs a name and a 6–8 digit BIN before it can be saved.`);
      return;
    }
    if (configuredCards.length === 0) {
      setCardsSaved(true);
      return;
    }

    setSavingCards(true);
    setCardsSaved(false);
    const { error } = await supabase
      .from('closed_loop_cards')
      .upsert(
        configuredCards.map(card => ({
          merchant_id: merchant.id,
          slot: card.slot,
          name: card.name.trim(),
          bin_prefix: card.bin_prefix,
          enabled: card.enabled
        })),
        { onConflict: 'merchant_id,slot' }
      );
    setSavingCards(false);

    if (error) {
      alert(`Closed-loop cards could not be saved: ${error.message}`);
      return;
    }
    setCardsSaved(true);
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

      {canChangePlan && (
        <div className="bg-white p-5 rounded-xl border mb-6">
          <h2 className="font-semibold text-lg">Closed-loop cards</h2>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            Four card programs can be prepared here. Leave them disabled until Datecs confirms the BIN values.
          </p>
          <div className="space-y-3">
            {closedLoopCards.map(card => (
              <div key={card.slot} className="grid grid-cols-[4rem_1fr_10rem_auto] gap-3 items-center">
                <span className="text-sm">Card {card.slot}</span>
                <input
                  aria-label={`Card ${card.slot} name`}
                  placeholder="Program name"
                  value={card.name}
                  onChange={event => updateClosedLoopCard(card.slot, { name: event.target.value })}
                  className="border px-3 py-2 rounded"
                />
                <input
                  aria-label={`Card ${card.slot} BIN`}
                  inputMode="numeric"
                  placeholder="6–8 digit BIN"
                  value={card.bin_prefix}
                  onChange={event => updateClosedLoopCard(card.slot, {
                    bin_prefix: event.target.value.replace(/\D/g, '').slice(0, 8)
                  })}
                  className="border px-3 py-2 rounded"
                />
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={card.enabled}
                    onChange={event => updateClosedLoopCard(card.slot, { enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={saveClosedLoopCards}
              disabled={savingCards}
              className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-60"
            >
              {savingCards ? 'Saving...' : 'Save Card Programs'}
            </button>
            {cardsSaved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </div>
      )}

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
                  <div>• Fixed amount</div>
                </div>
              )}

              {d.plan === 'pro' && (
                <div className="space-y-1">
                  <div>✔ Set Amount</div>
                  <div>✖ Presets</div>
                  <div>✔ Increment</div>
                  <div>✔ Automatic reset</div>
                </div>
              )}

              {d.plan === 'premium' && (
                <div className="space-y-1">
                  <div>✔ Set Amount</div>
                  <div>✔ Presets</div>
                  <div>✔ Increment</div>
                  <div>✔ Automatic reset</div>
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
