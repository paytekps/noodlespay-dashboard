import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('SERVICE KEY EXISTS:', !!serviceKey);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  serviceKey!
);


export async function POST(req: Request) {
  try {
    const body = await req.json();
console.log(
  'transaction_data',
  JSON.stringify(body.transaction_data)
);
    const {
  device_id,
  merchant_id,
  amount,
  status,

  transaction_id,
  authorization_code,
  reference_number,

  batch_id,
  trace_no,

  card_issuer,
  card_bin,
  last4,

  account_type,
  card_entry_method,

  payment_program,

  host_message,

  base_amount,
  tip_amount,
  fee_amount,
  cashback_amount,
  processed_amount,

  transaction_data
} = body;

    // ✅ Validate required fields
    if (!device_id || !merchant_id || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ Validate amount
    const safeAmount = Number(amount);
    if (isNaN(safeAmount)) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // ✅ Validate status
    const allowedStatuses = ['approved', 'declined'];
    const finalStatus = allowedStatuses.includes(status)
      ? status
      : 'approved';

    // ✅ SAFE device validation
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('id', device_id)
      .maybeSingle();

    if (deviceError) {
      console.error('❌ Device lookup error:', deviceError);

      return NextResponse.json(
        { error: 'Device lookup failed', details: deviceError },
        { status: 500 }
      );
    }

    if (!device) {
      return NextResponse.json(
        { error: 'Invalid device' },
        { status: 400 }
      );
    }

    // ✅ INSERT (FIXED — removed breaking field)
    const { data, error } = await supabase
      .from('transactions')

.insert([
  {
    device_id,
    merchant_id,
    amount: safeAmount,
    status: finalStatus,
    payment_method: 'nexgo',
    transaction_id:
  transaction_data?.transactionID || null,

authorization_code:
  transaction_data?.authorizationCode || null,

reference_number:
  transaction_data?.referenceNumber || null,

batch_id:
  transaction_data?.batchID || null,

trace_no:
  transaction_data?.traceNo || null,

card_issuer:
  transaction_data?.cardIssuer || null,

card_bin:
  transaction_data?.cardBIN || null,

account_type:
  transaction_data?.accountType || null,

card_entry_method:
  transaction_data?.cardDataEntry || null,

host_message:
  transaction_data?.hostMessage || null,

base_amount:
  transaction_data?.baseAmount || null,

tip_amount:
  transaction_data?.tipAmount || null,

fee_amount:
  transaction_data?.feeAmount || null,

cashback_amount:
  transaction_data?.cashbackAmount || null,

processed_amount:
  transaction_data?.processedAmount || null,
    transaction_data
  }
])

      .select();


if (error) {
  console.error('❌ INSERT FAILED FULL:', JSON.stringify(error, null, 2));

  return NextResponse.json(
    {
      error: error.message,
      details: error
    },
    { status: 500 }
  );
}


    return NextResponse.json({ success: true, data });

  } catch (err) {
    console.error('❌ Server error:', err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
``
