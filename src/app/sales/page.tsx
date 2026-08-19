import Link from 'next/link';

export default function SalesHome() {
  return (
    <main className="mx-auto max-w-5xl p-10">
      <h1 className="text-3xl font-bold">Sales Home</h1>
      <p className="mt-2 text-gray-600">View the merchants and devices assigned to your sales account.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link href="/dashboard/devices" className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Assigned devices</h2><p className="mt-2 text-sm text-gray-600">Open devices belonging to your assigned merchants.</p></Link>
        <Link href="/transactions" className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Transactions</h2><p className="mt-2 text-sm text-gray-600">Review transaction activity for assigned merchants.</p></Link>
      </div>
    </main>
  );
}
