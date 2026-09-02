'use client';

import { useState } from 'react';
import { emptyMerchantForm, type MerchantFormValues, type SalesRepresentative } from '../lib/merchant-management';

type Props = { salesRepresentatives: SalesRepresentative[]; saving: boolean; onSubmit: (values: MerchantFormValues) => Promise<boolean> };
const inputClass = 'mt-1 w-full rounded border px-3 py-2';
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export default function MerchantForm({ salesRepresentatives, saving, onSubmit }: Props) {
  const [values, setValues] = useState(emptyMerchantForm);
  const [open, setOpen] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  function set<K extends keyof MerchantFormValues>(key: K, value: MerchantFormValues[K]) { setValues(current => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) { event.preventDefault(); if (await onSubmit(values)) { setValues(emptyMerchantForm); setSlugEdited(false); setOpen(false); } }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-8 rounded bg-gray-950 px-5 py-3 font-semibold text-white">Add merchant</button>;
  return <form onSubmit={submit} className="mt-8 space-y-7 rounded-xl border bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Add merchant</h2><p className="mt-1 text-sm text-gray-600">Complete the merchant profile. Processor credentials are configured separately.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-2 text-sm">Cancel</button></div>
    <fieldset><legend className="font-semibold">Business</legend><div className="mt-3 grid gap-4 md:grid-cols-2">
      <label className="text-sm">Display name *<input required maxLength={160} value={values.name} onChange={event => { const name=event.target.value; set('name',name); if(!slugEdited)set('slug',slugify(name)); }} className={inputClass} /></label>
      <label className="text-sm">Dashboard address *<div className="mt-1 flex items-center rounded border"><span className="pl-3 text-gray-500">/</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={values.slug} onChange={event => { setSlugEdited(true); set('slug',slugify(event.target.value)); }} className="min-w-0 flex-1 px-2 py-2 outline-none" /></div></label>
      <label className="text-sm">Legal business name<input value={values.legalBusinessName} onChange={event => set('legalBusinessName',event.target.value)} className={inputClass} /></label>
      <label className="text-sm">DBA / organization name<input value={values.dbaName} onChange={event => set('dbaName',event.target.value)} className={inputClass} /></label>
      <label className="text-sm">Business type<select value={values.businessType} onChange={event => set('businessType',event.target.value)} className={inputClass}><option value="">Select</option><option>Nonprofit</option><option>Sole proprietorship</option><option>Partnership</option><option>LLC</option><option>Corporation</option><option>Other</option></select></label>
      <label className="text-sm">Website<input type="url" value={values.website} onChange={event => set('website',event.target.value)} placeholder="https://" className={inputClass} /></label>
    </div></fieldset>
    <fieldset><legend className="font-semibold">Primary contact</legend><div className="mt-3 grid gap-4 md:grid-cols-3">
      <label className="text-sm">Name<input value={values.primaryContactName} onChange={event => set('primaryContactName',event.target.value)} className={inputClass} /></label><label className="text-sm">Email<input type="email" value={values.primaryContactEmail} onChange={event => set('primaryContactEmail',event.target.value)} className={inputClass} /></label><label className="text-sm">Phone<input type="tel" value={values.primaryContactPhone} onChange={event => set('primaryContactPhone',event.target.value)} className={inputClass} /></label>
    </div></fieldset>
    <fieldset><legend className="font-semibold">Business address</legend><div className="mt-3 grid gap-4 md:grid-cols-2">
      <label className="text-sm md:col-span-2">Address line 1<input value={values.addressLine1} onChange={event => set('addressLine1',event.target.value)} className={inputClass} /></label><label className="text-sm md:col-span-2">Address line 2<input value={values.addressLine2} onChange={event => set('addressLine2',event.target.value)} className={inputClass} /></label><label className="text-sm">City<input value={values.city} onChange={event => set('city',event.target.value)} className={inputClass} /></label><label className="text-sm">State / region<input value={values.stateRegion} onChange={event => set('stateRegion',event.target.value)} className={inputClass} /></label><label className="text-sm">Postal code<input value={values.postalCode} onChange={event => set('postalCode',event.target.value)} className={inputClass} /></label><label className="text-sm">Country code<input required maxLength={2} pattern="[A-Za-z]{2}" value={values.countryCode} onChange={event => set('countryCode',event.target.value.toUpperCase())} className={inputClass} /></label>
    </div></fieldset>
    <fieldset><legend className="font-semibold">Account defaults</legend><div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Sales representative<select value={values.salesRepId} onChange={event => set('salesRepId',event.target.value)} className={inputClass}><option value="">Unassigned</option>{salesRepresentatives.map(rep => <option key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unnamed representative'}</option>)}</select></label><label className="text-sm">Currency<input required maxLength={3} pattern="[A-Za-z]{3}" value={values.currency} onChange={event => set('currency',event.target.value.toUpperCase())} className={inputClass} /></label><label className="text-sm">Time zone<select value={values.timezone} onChange={event => set('timezone',event.target.value)} className={inputClass}><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>America/Phoenix</option></select></label><label className="text-sm">Billing status<select value={values.billingStatus} onChange={event => set('billingStatus',event.target.value)} className={inputClass}><option value="trialing">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></label>
    </div></fieldset>
    <button disabled={saving} className="rounded bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Creating merchant…' : 'Create merchant'}</button>
  </form>;
}

