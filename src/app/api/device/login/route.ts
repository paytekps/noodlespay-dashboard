export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  featuresForDevicePlan,
  normalizeDevicePlan
} from '../../../../lib/device-plan';

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error('Device login is missing its server-side Supabase configuration.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
    }

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { serial_number } = await req.json();

    if (!serial_number) {
      return NextResponse.json(
        { error: 'Missing serial number' },
        { status: 400 }
      );
    }

    const { data: bootstrap, error: bootstrapError } = await supabase
      .rpc('get_device_bootstrap', { p_serial_number: serial_number });

    if (bootstrapError || !bootstrap) {
      console.error('Device lookup failed:', bootstrapError);
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    const cfg = bootstrap as Record<string, any>;
    const plan = normalizeDevicePlan(cfg.plan);
    const planFeatures = featuresForDevicePlan(
      plan,
      cfg.enable_presets,
      cfg.enable_increment
    );

    // ✅ RESPONSE
    return NextResponse.json({
      device_id: cfg.device_id,
      merchant_id: cfg.merchant_id,

      merchant_name: cfg.merchant_name || 'Merchant',
      plan,

      enable_presets: planFeatures.enablePresets,
      enable_increment: planFeatures.enableIncrement,
      default_amount: cfg.default_amount ?? 0,
      step_amount: cfg.step_amount ?? 5,
      max_amount: cfg.max_amount ?? 100,

      preset_1: cfg.preset_1 ?? 5,
      preset_2: cfg.preset_2 ?? 10,
      preset_3: cfg.preset_3 ?? 20,

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
