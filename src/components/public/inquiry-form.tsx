'use client';

import { FormEvent, useState } from 'react';

type InquiryFormProps = { kind: 'contact' | 'order_request'; defaultPlan?: string };

export default function InquiryForm({ kind, defaultPlan = 'basic' }: InquiryFormProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch('/api/public/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, inquiryType: kind }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Your request could not be sent.'); setSending(false); return; }

    if (kind === 'order_request' && result.inquiryId && result.checkoutToken) {
      const checkout = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: result.inquiryId, checkoutToken: result.checkoutToken }) });
      const checkoutResult = await checkout.json();
      if (checkoutResult.checkoutReady && checkoutResult.url) { window.location.assign(checkoutResult.url); return; }
    }
    setComplete(true); setSending(false);
  }

  if (complete) return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8"><h2 className="text-2xl font-black text-emerald-900">Thank you. We received your request.</h2><p className="mt-3 text-emerald-800">A Gimml representative can now review it in the administration dashboard and follow up with you.</p></div>;

  return <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-white p-8 shadow-sm">
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Full name<input required name="fullName" maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Organization<input name="organization" maxLength={160} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Email<input required name="email" type="email" maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Phone<input name="phone" type="tel" maxLength={40} autoComplete="tel" className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div>
    {kind === 'order_request' && <><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Plan<select name="plan" defaultValue={['basic','pro','premium'].includes(defaultPlan) ? defaultPlan : 'basic'} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="basic">Basic</option><option value="pro">Pro</option><option value="premium">Premium</option></select></label><label className="text-sm font-medium">Number of devices<input required name="quantity" type="number" min="1" max="100" defaultValue="1" className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-emerald-950">Payment-processing preference<select required name="processorPreference" defaultValue="existing_account" className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-gray-950"><option value="existing_account">Keep my existing merchant account</option><option value="fiserv_rapid_connect">Fiserv Rapid Connect</option><option value="tsys_sierra">TSYS / Global Payments — Sierra</option><option value="stripe_terminal">Stripe Terminal — compatible hardware required</option><option value="help_me_choose">Help me choose</option></select></label><label className="text-sm font-medium text-emerald-950">Current processor or platform (optional)<input name="currentProcessorName" maxLength={120} placeholder="For example, Fiserv or TSYS" className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-gray-950" /></label></div><p className="mt-3 text-xs leading-5 text-emerald-900">The current BlueCash-05 supports Fiserv Rapid Connect and TSYS / Global Payments — Sierra. We confirm compatibility before activation. Stripe requires different compatible hardware.</p></div><label className="block text-sm font-medium">Shipping address<input name="shippingAddress" autoComplete="street-address" maxLength={250} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">City<input name="shippingCity" autoComplete="address-level2" maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">State / region<input name="shippingState" autoComplete="address-level1" maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Postal code<input name="shippingPostalCode" autoComplete="postal-code" maxLength={30} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Country<input name="shippingCountry" autoComplete="country-name" maxLength={80} defaultValue="United States" className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div></>}
    <label className="block text-sm font-medium">{kind === 'contact' ? 'How can we help?' : 'Anything else we should know?'}<textarea required={kind === 'contact'} name="message" rows={5} maxLength={3000} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
    <button disabled={sending} className="w-full rounded-lg bg-gray-950 px-5 py-3 font-bold text-white disabled:opacity-50">{sending ? 'Sending...' : kind === 'contact' ? 'Send message' : 'Submit order request'}</button>
    {kind === 'order_request' && <p className="text-xs leading-5 text-gray-500">No payment is collected unless secure Stripe checkout is configured with approved Gimml prices. Otherwise, this sends an order request for review.</p>}
  </form>;
}
