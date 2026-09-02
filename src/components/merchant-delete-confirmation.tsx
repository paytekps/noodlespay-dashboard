'use client';

import { useState } from 'react';
import type { MerchantRecord } from '../lib/merchant-management';

export default function MerchantDeleteConfirmation({ merchant, busy, onCancel, onDelete }: { merchant: MerchantRecord; busy: boolean; onCancel: () => void; onDelete: (confirmation: string) => void }) {
  const [confirmation, setConfirmation] = useState('');
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-merchant-title"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="delete-merchant-title" className="text-xl font-bold text-red-700">Permanently delete empty merchant?</h2><p className="mt-3 text-sm text-gray-700">This account is explicitly designated as a test merchant. Permanent deletion removes its devices, settings, plans, entitlements, integrations, credentials, and assigned logins. The system will refuse deletion if any transaction, settlement, or external billing history exists.</p><label className="mt-5 block text-sm font-medium">Type <strong>{merchant.name}</strong> to confirm<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded border px-3 py-2" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={busy} className="rounded border px-4 py-2">Cancel</button><button type="button" onClick={() => onDelete(confirmation)} disabled={busy || confirmation !== merchant.name} className="rounded bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{busy ? 'Deleting…' : 'Permanently delete'}</button></div></div></div>;
}
