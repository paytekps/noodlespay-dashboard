'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function DevicePage() {
  const params = useParams();
  const serial = params?.serial as string;

  const [config, setConfig] = useState<any>(null);
  const [amount, setAmount] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const [timer, setTimer] = useState<any>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
const [intervalTimer, setIntervalTimer] = useState<any>(null);

  const [status, setStatus] = useState<'idle' | 'processing' | 'approved' | 'declined'>('idle');
  const [declineMessage, setDeclineMessage] = useState('');

  useEffect(() => {
    if (!serial) return;

    loadDevice();

    const channel = supabase
      .channel(`device-${serial}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_config' },
        () => loadDevice()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serial]);

  async function loadDevice() {
    const res = await fetch('/api/device/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial_number: serial }),
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error('Device load failed');
      return;
    }

    const data = await res.json();
    setConfig(data);

    if (!initialized) {
      setAmount(data.default_amount || 0);
      setInitialized(true);
    }
  }

function clearExistingTimer() {

  if (timer) {
    clearTimeout(timer);
    setTimer(null);
  }

  if (intervalTimer) {
    clearInterval(intervalTimer);
    setIntervalTimer(null);
  }

  setCountdown(null);
}

  function startAutoReset() {
    if (config.reset_mode !== 'auto') return;

    clearExistingTimer();

    const delay = config.reset_delay || 5;
    setCountdown(delay);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
setIntervalTimer(interval);
    const t = setTimeout(() => {
      setAmount(config.default_amount);
      setCountdown(null);
    }, delay * 1000);

    setTimer(t);
  }

  function manualReset(e: any) {
    e.stopPropagation();
    clearExistingTimer();
    setAmount(config.default_amount);
  }

  async function saveTransaction(statusValue: 'approved' | 'declined') {
    if (!config?.device_id || !config?.merchant_id) return;

    await fetch('/api/transaction/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: config.device_id,
        merchant_id: config.merchant_id,
        amount,
        status: statusValue
      })
    });
  }

  async function handleTap() {
    if (status !== 'idle') return;

    setStatus('processing');

    setTimeout(async () => {
      const success = Math.random() > 0.5;

      if (success) {
        await saveTransaction('approved');
        setStatus('approved');

        setTimeout(() => {
          setStatus('idle');
          setAmount(config.default_amount);
        }, 2000);

      } else {
        await saveTransaction('declined');

        const messages = [
          'Insufficient funds',
          'Do not honor',
          'Card declined',
          'Transaction not allowed'
        ];

        setDeclineMessage(
          messages[Math.floor(Math.random() * messages.length)]
        );

        setStatus('declined');

        setTimeout(() => setStatus('idle'), 3000);
      }
    }, 2000);
  }

  if (!config) {
    return <div className="p-10">Loading device...</div>;
  }

  const optionLine = config.display_text || '';

  return (
    <div
      onClick={handleTap}
      className="min-h-screen flex flex-col justify-between bg-black text-white cursor-pointer"
    >

      <div className="flex justify-center mt-16 text-7xl">
        <span style={{ transform: 'rotate(-90deg)' }}>📡</span>
      </div>

      <div className="flex flex-col items-center text-center">

        {status === 'processing' && <div className="text-3xl">Processing...</div>}
        {status === 'approved' && <div className="text-4xl text-green-400">✅ Approved</div>}
        {status === 'declined' && (
          <div>
            <div className="text-4xl text-red-500">DECLINED</div>
            <div className="text-sm text-gray-400">{declineMessage}</div>
          </div>
        )}

        {status === 'idle' && (
          <>
            <div className="text-gray-400 mb-2">
              {config.merchant_name}
            </div>

            {optionLine && (
              <div className="text-sm text-gray-500 mb-3">
                {optionLine}
              </div>
            )}

            <div className="text-6xl font-bold mb-4">
              ${amount}
            </div>

            {/* AUTO RESET COUNTDOWN */}
            {config.reset_mode === 'auto' && countdown !== null && (
              <div className="text-yellow-400 mb-4">
                Resetting in: {countdown}
              </div>
            )}

            {/* PRESETS */}
            {config.enable_presets && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[config.preset_1, config.preset_2, config.preset_3].map((p: number, i: number) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAmount(p);
                      startAutoReset();
                    }}
                    className="bg-blue-600 px-4 py-2 rounded"
                  >
                    ${p}
                  </button>
                ))}
              </div>
            )}

            {/* INCREMENT */}
            {config.enable_increment && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newAmount = amount + config.step_amount;
                  if (newAmount <= config.max_amount) {
                    setAmount(newAmount);
                    startAutoReset();
                  }
                }}
                className="bg-green-600 px-6 py-3 rounded text-lg mb-4"
              >
                + ${config.step_amount}
              </button>
            )}

            {/* ✅ MANUAL RESET BUTTON */}
            {config.reset_mode === 'button' && (
              <button
                onClick={manualReset}
                className="text-yellow-400 text-lg mt-2"
              >
                ⟲ Reset
              </button>
            )}

          </>
        )}

      </div>

      <div className="text-xs text-gray-600 text-center mb-4">
        {serial}
      </div>

    </div>
  );
}