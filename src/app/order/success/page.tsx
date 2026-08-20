import Link from 'next/link';

export default function OrderSuccessPage() {
  return <main className="mx-auto max-w-2xl px-6 py-24 text-center"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10"><div className="text-5xl">✓</div><h1 className="mt-5 text-4xl font-black text-emerald-950">Your order was received.</h1><p className="mt-4 text-emerald-900">Payment confirmation is being recorded. The Gimml team will follow up with fulfillment details.</p><Link href="/" className="mt-7 inline-block rounded-lg bg-gray-950 px-5 py-3 font-bold text-white">Return home</Link></div></main>;
}
