import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


function safeText(value: unknown, maxLength = 120) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeDigits(value: unknown, maxLength: number) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? digits.slice(0, maxLength) : null;
}

function safeAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function safeDiagnosticData(packet: Record<string, unknown>) {
  return {
    applicationVersion: safeText(packet.applicationVersion, 40),
    fwVersion: safeText(packet.fwVersion, 40),
    resultCode: safeText(packet.resultCode, 40),
    transactionType: safeText(packet.transactionType, 40),
    taxAmount: safeAmount(packet.taxAmount),
    customTaxOneAmount: safeAmount(packet.customTaxOneAmount),
    customTaxTwoAmount: safeAmount(packet.customTaxTwoAmount),
    totalAmount: safeAmount(packet.totalAmount)
  };
}


export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error('❌ Transaction service is missing required configuration');
      return NextResponse.json({ error: 'Transaction service unavailable' }, { status: 503 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { device_id, amount, status, transaction_data } = body;
    const packet = transaction_data && typeof transaction_data === 'object'
      ? transaction_data as Record<string, unknown>
      : {};
    const field = (bodyName: string, packetName: string) =>
      body[bodyName] ?? packet[packetName];

    // ✅ Validate required fields
    if (!device_id || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ Validate amount
    const validatedAmount = Number(amount);
    if (!Number.isFinite(validatedAmount) || validatedAmount <= 0 ||
        Math.abs(validatedAmount * 100 - Math.round(validatedAmount * 100)) > Number.EPSILON * 100) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // ✅ Validate status
    const allowedStatuses = ['approved', 'declined'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid transaction status' },
        { status: 400 }
      );
    }

    // ✅ SAFE device validation
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, merchant_id')
      .eq('id', device_id)
      .maybeSingle();

    if (deviceError) {
      console.error('❌ Device lookup error:', deviceError);

      return NextResponse.json(
        { error: 'Device lookup failed' },
        { status: 500 }
      );
    }

    if (!device) {
      return NextResponse.json(
        { error: 'Invalid device' },
        { status: 400 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('device_config')
      .select('max_amount')
      .eq('device_id', device.id)
      .maybeSingle();

    if (configError) {
      console.error('❌ Device config lookup error:', configError);
      return NextResponse.json({ error: 'Device config lookup failed' }, { status: 500 });
    }

    const maximumAmount = Number(config?.max_amount ?? 100);
    if (Number.isFinite(maximumAmount) && validatedAmount > maximumAmount) {
      return NextResponse.json({ error: 'Amount exceeds device maximum' }, { status: 400 });
    }

    const transactionId = safeText(field('transaction_id', 'transactionID'), 100);
    if (transactionId) {
      const { data: existing, error: duplicateError } = await supabase
        .from('transactions')
        .select('id')
        .eq('device_id', device.id)
        .eq('transaction_id', transactionId)
        .maybeSingle();

      if (duplicateError) {
        console.error('❌ Duplicate transaction lookup error:', duplicateError);
        return NextResponse.json({ error: 'Transaction lookup failed' }, { status: 500 });
      }

      if (existing) {
        return NextResponse.json({ success: true, duplicate: true, id: existing.id });
      }
    }

    const receivedCardDigits = safeDigits(field('last4', 'cardNumber'), 32);
    const receivedBin = safeDigits(field('card_bin', 'cardBIN'), 8);
    const paymentMethod = body.payment_method === 'simulator' ? 'simulator' : 'datecs';

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        device_id: device.id,
        merchant_id: device.merchant_id,
        amount: validatedAmount,
        status,
        payment_method: paymentMethod,
        transaction_id: transactionId,
        authorization_code: safeText(field('authorization_code', 'authorizationCode'), 100),
        reference_number: safeText(field('reference_number', 'referenceNumber'), 100),
        batch_id: safeText(field('batch_id', 'batchID'), 100),
        trace_no: safeText(field('trace_no', 'traceNo'), 100),
        card_issuer: safeText(field('card_issuer', 'cardIssuer'), 80),
        card_bin: receivedBin && receivedBin.length >= 6 ? receivedBin : null,
        last4: receivedCardDigits ? receivedCardDigits.slice(-4) : null,
        account_type: safeText(field('account_type', 'accountType'), 40),
        card_entry_method: safeText(field('card_entry_method', 'cardDataEntry'), 40),
        payment_program: safeText(field('payment_program', 'paymentProgram'), 80),
        host_message: safeText(field('host_message', 'hostMessage'), 200),
        base_amount: safeAmount(field('base_amount', 'baseAmount')),
        tip_amount: safeAmount(field('tip_amount', 'tipAmount')),
        fee_amount: safeAmount(field('fee_amount', 'feeAmount')),
        cashback_amount: safeAmount(field('cashback_amount', 'cashbackAmount')),
        processed_amount: safeAmount(field('processed_amount', 'processedAmount')),
        transaction_data: safeDiagnosticData(packet)
      })
      .select('id')
      .single();


if (error) {
  console.error('❌ INSERT FAILED FULL:', JSON.stringify(error, null, 2));

  return NextResponse.json(
    { error: 'Transaction could not be saved' },
    { status: 500 }
  );
}


    return NextResponse.json({ success: true, id: data.id });

  } catch (err) {
    console.error('❌ Server error:', err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
