import Link from 'next/link';

export default function MerchantHome() {
  return (
    <main className="mx-auto max-w-5xl p-10">
      <h1 className="text-3xl font-bold">Merchant Home</h1>
      <p className="mt-2 text-gray-600">Manage your Gimml devices and review your payment activity.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link href="/dashboard/devices" className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">My devices</h2><p className="mt-2 text-sm text-gray-600">Change the settings allowed by your purchased plan.</p></Link>
        <Link href="/transactions" className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">My transactions</h2><p className="mt-2 text-sm text-gray-600">Review and export your organization’s transactions.</p></Link>
      </div>
    </main>
  );
}
