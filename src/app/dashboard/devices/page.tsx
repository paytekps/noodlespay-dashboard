'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type ConfigHistoryEntry = {
  id: number;
  changed_at: string;
  changed_by_role: string;
  action: 'baseline' | 'created' | 'updated';
  changes: Record<string, { before: unknown; after: unknown }>;
};

const historyFieldLabels: Record<string, string> = {
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

const ONLINE_WINDOW_MS = 20_000;

function formatTimeAgo(value: string | null | undefined, nowMs: number) {
  if (!value) return 'Never';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function DeviceHealthPanel({
  device,
  nowMs,
  canControlLocation,
  locationBusy,
  locationError,
  onRequestLocation
}: {
  device: any;
  nowMs: number;
  canControlLocation: boolean;
  locationBusy: boolean;
  locationError?: string;
  onRequestLocation: () => void;
}) {
  const lastSeenMs = device.last_seen_at ? Date.parse(device.last_seen_at) : Number.NaN;
  const isOnline = Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= ONLINE_WINDOW_MS;
  const latitude = Number(device.location_latitude);
  const longitude = Number(device.location_longitude);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
  const [mapImageUrl, setMapImageUrl] = useState('');
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapSecondsRemaining, setMapSecondsRemaining] = useState(60);

  useEffect(() => {
    if (!mapImageUrl) return;
    const interval = window.setInterval(() => {
      setMapSecondsRemaining(current => Math.max(0, current - 1));
    }, 1000);
    const timeout = window.setTimeout(() => {
      setMapImageUrl(current => {
        if (current) URL.revokeObjectURL(current);
        return '';
      });
    }, 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [mapImageUrl]);

  useEffect(() => () => {
    if (mapImageUrl) URL.revokeObjectURL(mapImageUrl);
  }, [mapImageUrl]);

  async function showMap() {
    setMapLoading(true);
    setMapError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again.');
      const response = await fetch(
        `/api/dashboard/devices/location?device_id=${encodeURIComponent(device.id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'The map could not be loaded.');
      }

      const imageUrl = URL.createObjectURL(await response.blob());
      setMapSecondsRemaining(60);
      setMapImageUrl(imageUrl);
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'The map could not be loaded.');
    } finally {
      setMapLoading(false);
    }
  }

  function closeMap() {
    setMapImageUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }

  let locationMessage = 'Location status has not been reported by this app version.';
  if (device.location_permission_granted === false) {
    locationMessage = 'Location permission is not enabled on the device.';
  } else if (device.location_service_enabled === false) {
    locationMessage = 'Location permission is allowed, but the device Location switch is off.';
  } else if (device.location_permission_granted === true && !hasLocation) {
    locationMessage = 'Location is enabled; waiting for the first GPS fix.';
  }

  const refreshStatusMessages: Record<string, string> = {
    pending: 'GPS request sent; waiting for the device.',
    enabled: 'The device confirms that Location is on.',
    permission_required: 'Location permission must be approved on the device.',
    settings_required: 'The device opened Android Location settings because the master switch is off.',
    error: 'The device could not start a location refresh.'
  };
  const refreshStatusMessage = refreshStatusMessages[device.location_refresh_status] ?? '';

  return (
    <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
            aria-hidden="true"
          />
          <span className="font-semibold">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div className="mt-1 text-sm text-gray-600">
          Last seen: {formatTimeAgo(device.last_seen_at, nowMs)}
        </div>
        {device.app_version && (
          <div className="mt-1 text-xs text-gray-500">App version {device.app_version}</div>
        )}
        {refreshStatusMessage && (
          <div className="mt-2 text-xs text-gray-600">{refreshStatusMessage}</div>
        )}
        {canControlLocation && (
          <button
            type="button"
            onClick={onRequestLocation}
            disabled={locationBusy || !isOnline}
            className="mt-3 rounded bg-green-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locationBusy ? 'Sending GPS request…' : hasLocation ? 'Refresh GPS location' : 'Enable GPS on device'}
          </button>
        )}
        {canControlLocation && !isOnline && (
          <div className="mt-1 text-xs text-gray-500">The device must be online to receive this request.</div>
        )}
        {locationError && (
          <div className="mt-2 text-xs text-red-700" role="alert">{locationError}</div>
        )}
      </div>

      <div className="text-sm">
        <div className="font-semibold">Device location</div>
        {hasLocation ? (
          <div className="mt-1 text-gray-600">
            <div>{latitude.toFixed(6)}, {longitude.toFixed(6)}</div>
            <div className="text-xs">
              GPS fix: {formatTimeAgo(device.location_updated_at, nowMs)}
              {Number.isFinite(Number(device.location_accuracy_m))
                ? ` · about ${Math.round(Number(device.location_accuracy_m))} m accuracy`
                : ''}
            </div>
            {mapImageUrl ? (
              <div className="mt-3">
                <Image
                  src={mapImageUrl}
                  alt={`Map showing ${device.name || 'device'} location`}
                  width={800}
                  height={450}
                  unoptimized
                  className="h-auto w-full rounded border border-gray-300"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>Map closes in {mapSecondsRemaining} seconds.</span>
                  <button type="button" onClick={closeMap} className="font-semibold text-blue-700 hover:underline">
                    Close map now
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={showMap}
                disabled={mapLoading}
                className="mt-2 rounded border border-blue-700 bg-white px-3 py-2 font-semibold text-blue-700 disabled:opacity-50"
              >
                {mapLoading ? 'Loading secure map…' : 'Show map for 60 seconds'}
              </button>
            )}
            {mapError && <div className="mt-2 text-xs text-red-700" role="alert">{mapError}</div>}
          </div>
        ) : (
          <div className="mt-1 text-gray-600">{locationMessage}</div>
        )}
      </div>
    </div>
  );
}

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

function getConfigErrors(device: any) {
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

  return errors;
}

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [transactionsMap, setTransactionsMap] = useState<any>({});
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);
  const [configErrors, setConfigErrors] = useState<Record<string, string[]>>({});
  const [historyOpenDeviceId, setHistoryOpenDeviceId] = useState<string | null>(null);
  const [historyLoadingDeviceId, setHistoryLoadingDeviceId] = useState<string | null>(null);
  const [historyByDevice, setHistoryByDevice] = useState<Record<string, ConfigHistoryEntry[]>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [pairedDeviceIds, setPairedDeviceIds] = useState<string[]>([]);
  const [pairingCodes, setPairingCodes] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [pairingBusyDeviceId, setPairingBusyDeviceId] = useState<string | null>(null);
  const [pairingErrors, setPairingErrors] = useState<Record<string, string>>({});
  const [healthClock, setHealthClock] = useState(() => Date.now());
  const [locationBusyDeviceId, setLocationBusyDeviceId] = useState<string | null>(null);
  const [locationErrors, setLocationErrors] = useState<Record<string, string>>({});

  const deviceIdsKey = devices.map(device => device.id).sort().join(',');

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setProfile(data);
  }, []);

  const loadMerchants = useCallback(async () => {
    const { data } = await supabase
      .from('merchants')
      .select('id, name');

    setMerchants(data || []);
  }, []);

  const loadTransactions = useCallback(async (devicesList: any[]) => {
    const ids = devicesList.map(d => d.id);

    if (!ids.length) {
      setTransactionsMap({});
      return;
    }

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
  }, []);

  const loadDevices = useCallback(async () => {
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
    await loadTransactions(formatted);
  }, [loadTransactions, profile, selectedMerchant]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
      void loadMerchants();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMerchants, loadProfile]);

  useEffect(() => {
    if (!devices.length || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      setPairedDeviceIds([]);
      return;
    }

    let active = true;
    const loadPairingStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !active) return;
      const ids = devices.map((device) => device.id).join(',');
      const response = await fetch(
        `/api/admin/devices/pairing-code?device_ids=${encodeURIComponent(ids)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
      );
      if (!response.ok || !active) return;
      const payload = await response.json();
      setPairedDeviceIds(payload.paired_device_ids ?? []);
    };

    loadPairingStatus();
    const interval = window.setInterval(loadPairingStatus, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [devices, profile?.role]);

  async function createPairingCode(deviceId: string) {
    setPairingBusyDeviceId(deviceId);
    setPairingErrors((current) => ({ ...current, [deviceId]: '' }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again.');
      const response = await fetch('/api/admin/devices/pairing-code', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'A pairing code could not be created.');
      setPairingCodes((current) => ({
        ...current,
        [deviceId]: { code: payload.pairing_code, expiresAt: payload.expires_at }
      }));
    } catch (error) {
      setPairingErrors((current) => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : 'A pairing code could not be created.'
      }));
    } finally {
      setPairingBusyDeviceId(null);
    }
  }

  useEffect(() => {
    if (!profile) return;
    const timer = window.setTimeout(() => void loadDevices(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDevices, profile]);

  async function requestDeviceLocation(deviceId: string) {
    setLocationBusyDeviceId(deviceId);
    setLocationErrors(current => ({ ...current, [deviceId]: '' }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again.');

      const response = await fetch('/api/dashboard/devices/location', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The GPS request could not be sent.');

      setDevices(current => current.map(device => device.id === deviceId
        ? {
            ...device,
            location_refresh_requested_at: payload.request?.location_refresh_requested_at,
            location_refresh_status: payload.request?.location_refresh_status ?? 'pending'
          }
        : device));
    } catch (error) {
      setLocationErrors(current => ({
        ...current,
        [deviceId]: error instanceof Error ? error.message : 'The GPS request could not be sent.'
      }));
    } finally {
      setLocationBusyDeviceId(null);
    }
  }

  useEffect(() => {
    if (!deviceIdsKey) return;
    let active = true;
    const deviceIds = deviceIdsKey.split(',');

    const refreshHealth = async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('id, last_seen_at, location_latitude, location_longitude, location_accuracy_m, location_provider, location_updated_at, location_permission_granted, location_service_enabled, location_refresh_requested_at, location_refresh_status, location_refresh_status_updated_at, app_version')
        .in('id', deviceIds);

      if (!active) return;
      setHealthClock(Date.now());
      if (error) {
        console.error('Device health refresh failed:', error);
        return;
      }

      const healthById = new Map((data || []).map(health => [health.id, health]));
      setDevices(current => current.map(device => ({
        ...device,
        ...(healthById.get(device.id) || {})
      })));
    };

    void refreshHealth();
    const refreshInterval = window.setInterval(() => void refreshHealth(), 10_000);
    const clockInterval = window.setInterval(() => setHealthClock(Date.now()), 5_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [deviceIdsKey]);

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

  const errors = getConfigErrors(device);
  setConfigErrors(current => ({ ...current, [device.id]: errors }));

  if (errors.length) return;

  setSavingDeviceId(device.id);

  const values = {
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

  setSavingDeviceId(null);
  setSavedDeviceId(device.id);
  if (historyOpenDeviceId === device.id) await loadHistory(device.id);
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">

      <h1 className="text-3xl font-bold">Devices</h1>
      <p className="mt-2 mb-8 text-gray-600">
        {profile?.role === 'merchant' ? 'Manage the settings available with your purchased plan.' : profile?.role === 'sales_rep' ? 'Manage devices for merchants assigned to you.' : 'Manage devices across all merchants.'}
      </p>

      {profile?.role !== 'merchant' && (
        <label className="mb-8 block max-w-md text-sm font-medium">
          Merchant
          <select value={selectedMerchant} onChange={(event) => setSelectedMerchant(event.target.value)} className="mt-1 w-full rounded border bg-white px-3 py-2">
            <option value="">All authorized merchants</option>
            {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
          </select>
        </label>
      )}

      {/* SUMMARY */}
      <div className="grid gap-4 mb-8 sm:grid-cols-3">
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

        {devices.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-gray-500">
            No devices are available for this merchant selection.
          </div>
        )}

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

            <DeviceHealthPanel
              device={d}
              nowMs={healthClock}
              canControlLocation={profile?.role !== 'sales_rep'}
              locationBusy={locationBusyDeviceId === d.id}
              locationError={locationErrors[d.id]}
              onRequestLocation={() => requestDeviceLocation(d.id)}
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

            {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Dashboard Void &amp; Refund pairing</div>
                    <div className="mt-1 text-sm text-gray-600">
                      {pairedDeviceIds.includes(d.id)
                        ? 'Paired — this device can securely receive approved transaction actions.'
                        : 'Not paired — transaction actions cannot be sent to this device yet.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => createPairingCode(d.id)}
                    disabled={pairingBusyDeviceId === d.id}
                    className="rounded border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {pairingBusyDeviceId === d.id
                      ? 'Creating…'
                      : pairedDeviceIds.includes(d.id) ? 'Create new pairing code' : 'Create pairing code'}
                  </button>
                </div>

                {pairingCodes[d.id] && (
                  <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                    <div>On the physical device, hold the serial number in the bottom-left corner and enter:</div>
                    <div className="my-2 font-mono text-2xl font-bold tracking-widest">
                      {pairingCodes[d.id].code}
                    </div>
                    <div>This one-time code expires at {new Date(pairingCodes[d.id].expiresAt).toLocaleTimeString()}.</div>
                  </div>
                )}

                {pairingErrors[d.id] && (
                  <div className="mt-2 text-sm text-red-700" role="alert">{pairingErrors[d.id]}</div>
                )}

                <div className="mt-4 border-t pt-4">
                  <Link
                    href={`/dashboard/devices/${d.id}/setup`}
                    className="inline-flex rounded bg-black px-4 py-2 text-sm font-semibold text-white"
                  >
                    Open full processor / VAR setup
                  </Link>
                </div>
              </div>
            )}

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
