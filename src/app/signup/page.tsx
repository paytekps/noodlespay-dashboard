import Link from 'next/link';

export default function SignupPage() {
  return <main className="mx-auto max-w-3xl px-6 py-20"><div className="rounded-2xl border bg-white p-8 shadow-sm"><p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Get started</p><h1 className="mt-3 text-4xl font-black">Set up your Gimml organization</h1><p className="mt-4 leading-7 text-gray-600">Online account creation and device checkout are being connected to secure payment and fulfillment. Until final pricing and shipping rules are entered, we will not collect payment or create an incomplete merchant account.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/contact" className="rounded-lg bg-gray-950 px-5 py-3 font-bold text-white">Contact us to get started</Link><Link href="/pricing" className="rounded-lg border px-5 py-3 font-bold">Review plans</Link></div></div></main>;
}
