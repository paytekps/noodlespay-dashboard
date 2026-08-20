import Link from 'next/link';

const benefits = [
  ['One tap or insert', 'Accept a donation or payment without making the cardholder navigate a checkout screen.'],
  ['Built for unattended giving', 'Keep the amount ready on screen so a cardholder can pay immediately.'],
  ['Managed from anywhere', 'Control device amounts, plan features, merchant access, and reporting from the Gimml dashboard.']
];

export default function HomePage() {
  return (
    <main>
      <section className="bg-gray-950 px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl"><div className="max-w-3xl">
          <div className="mb-5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">Simple payments. Less friction.</div>
          <h1 className="text-5xl font-black leading-tight tracking-tight sm:text-7xl">Turn a moment of generosity into one simple tap.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">Gimml helps organizations accept donations and payments on a dedicated device using contactless cards, inserted cards, and selected closed-loop cards.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/signup" className="rounded-lg bg-emerald-400 px-6 py-3 font-bold text-gray-950 hover:bg-emerald-300">Get started</Link><Link href="/how-it-works" className="rounded-lg border border-gray-600 px-6 py-3 font-bold hover:bg-gray-900">See how it works</Link></div>
        </div></div>
      </section>
      <section className="px-6 py-20"><div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Made to stay ready</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight">No app download. No amount entry. No complicated checkout.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">{benefits.map(([title, description]) => <div key={title} className="rounded-2xl border bg-white p-7 shadow-sm"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl font-black text-emerald-800">✓</div><h3 className="text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-gray-600">{description}</p></div>)}</div>
      </div></section>
      <section className="bg-emerald-50 px-6 py-20"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row md:items-center"><div><h2 className="text-4xl font-black tracking-tight">Ready when your supporters are.</h2><p className="mt-3 max-w-2xl text-gray-700">Choose the controls your organization needs and manage every Gimml device from one secure dashboard.</p></div><Link href="/pricing" className="shrink-0 rounded-lg bg-gray-950 px-6 py-3 text-center font-bold text-white hover:bg-gray-800">Compare plans</Link></div></section>
    </main>
  );
}
