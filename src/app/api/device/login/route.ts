export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export async function POST(req: Request) {
  try {
    const { serial_number } = await req.json();

    if (!serial_number) {
      return NextResponse.json(
        { error: 'Missing serial number' },
        { status: 400 }
      );
    }

    // ✅ find device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('serial_number', serial_number)
      .single();

    if (deviceError || !device) {
      console.error('Device lookup failed:', deviceError);
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    // ✅ fetch merchant
    const { data: merchant } = await supabase
      .from('merchants')
      .select('name')
      .eq('id', device.merchant_id)
      .single();

    // ✅ get config (SAFE VERSION)
    const { data: config } = await supabase
      .from('device_config')
      .select('*')
      .eq('device_id', device.id)
      .maybeSingle(); // ✅ IMPORTANT FIX

    const cfg = config || {};

    // ✅ RESPONSE
    return NextResponse.json({
      device_id: device.id,
      merchant_id: device.merchant_id,

      merchant_name: merchant?.name || 'Merchant',

      display_text: cfg.display_text ?? '',

      enable_presets: cfg.enable_presets ?? false,
      enable_increment: cfg.enable_increment ?? false,

      default_amount: cfg.default_amount ?? 0,
      step_amount: cfg.step_amount ?? 5,
      max_amount: cfg.max_amount ?? 100,

      preset_1: cfg.preset_1 ?? 5,
      preset_2: cfg.preset_2 ?? 10,
      preset_3: cfg.preset_3 ?? 20,

      reset_mode: cfg.reset_mode ?? 'button',
      reset_delay: cfg.reset_delay ?? 5
    });

  } catch (err) {
    console.error('Device login error:', err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}