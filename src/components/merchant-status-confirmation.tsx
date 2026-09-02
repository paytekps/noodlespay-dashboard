'use client';

import type { MerchantRecord } from '../lib/merchant-management';

export type MerchantStatusAction = 'deactivate' | 'reactivate' | 'archive';

export default function MerchantStatusConfirmation({ merchant, action, busy, onCancel, onConfirm }: { merchant: MerchantRecord; action: MerchantStatusAction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const copy = action === 'deactivate'
    ? { title: `Deactivate ${merchant.name}?`, body: `This immediately disables the merchant and all ${merchant.device_count} attached devices. Payments and device commands will be blocked, while configuration and financial history remain intact.`, button: 'Deactivate merchant', color: 'bg-amber-600' }
    : action === 'reactivate'
      ? { title: `Reactivate ${merchant.name}?`, body: `The merchant account will become active. Its ${merchant.device_count} devices will remain inactive and must be reviewed and activated individually.`, button: 'Reactivate merchant', color: 'bg-green-700' }
      : { title: `Archive ${merchant.name}?`, body: `This permanently closes the merchant for normal operations, disables all ${merchant.device_count} attached devices and integrations, and retains financial history for reporting and audits.`, button: 'Archive merchant', color: 'bg-gray-800' };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="merchant-status-title"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="merchant-status-title" className="text-xl font-bold">{copy.title}</h2><p className="mt-3 text-sm text-gray-700">{copy.body}</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={busy} className="rounded border px-4 py-2">Cancel</button><button type="button" onClick={onConfirm} disabled={busy} className={`rounded px-4 py-2 font-semibold text-white disabled:opacity-40 ${copy.color}`}>{busy ? 'Saving…' : copy.button}</button></div></div></div>;
}
