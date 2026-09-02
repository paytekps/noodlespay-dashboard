import { NextResponse } from 'next/server';
import { dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!hasDashboardPermission(context, 'overview.view')) return NextResponse.json({ error: 'You do not have permission to view the overview.' }, { status: 403 });

  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get('from'));
  const to = parseDate(url.searchParams.get('to'), true);
  if ((url.searchParams.has('from') && !from) || (url.searchParams.has('to') && !to) || (from && to && from > to)) {
    return NextResponse.json({ error: 'Choose a valid date range.' }, { status: 400 });
  }
  if (context.merchantIds?.length === 0) return NextResponse.json({ devices: 0, connectedDevices: 0, transactions: 0, approved: 0, declined: 0, approvedVolumeMinor: 0 });

  const terminal = context.admin.schema('gimml_terminal');
  let deviceQuery = terminal.from('devices').select('id, last_seen_at').like('serial_number', '6459%');
  let transactionQuery = terminal.from('dashboard_transactions').select('status, amount_minor');
  if (context.merchantIds) { deviceQuery = deviceQuery.in('merchant_id', context.merchantIds); transactionQuery = transactionQuery.in('merchant_id', context.merchantIds); }
  if (from) transactionQuery = transactionQuery.gte('occurred_at', from);
  if (to) transactionQuery = transactionQuery.lte('occurred_at', to);
  const [deviceResult, transactionResult] = await Promise.all([deviceQuery, transactionQuery]);
  const error = deviceResult.error || transactionResult.error;
  if (error) { console.error('Combined terminal overview failed:', error.code); return NextResponse.json({ error: 'Overview information could not be loaded.' }, { status: 500 }); }
  const now = Date.now();
  const devices = deviceResult.data ?? [];
  const transactions = transactionResult.data ?? [];
  const approved = transactions.filter(transaction => transaction.status === 'approved');
  return NextResponse.json({ devices: devices.length, connectedDevices: devices.filter(device => device.last_seen_at && now - Date.parse(device.last_seen_at) <= 30_000).length, transactions: transactions.length, approved: approved.length, declined: transactions.filter(transaction => transaction.status === 'declined').length, approvedVolumeMinor: approved.reduce((total, transaction) => total + Number(transaction.amount_minor || 0), 0) });
}
