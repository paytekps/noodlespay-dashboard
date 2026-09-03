import type { TerminalDashboardData } from '../../lib/gimml-terminal-dashboard/types';

export function PlanOverview({ plans }: { plans: TerminalDashboardData['plans'] }) {
  const visiblePlans = plans.filter(plan => plan.active && plan.key !== 'CUSTOM');
  return <section className="rounded-xl border bg-white p-6 shadow-sm"><div><h2 className="text-xl font-semibold">Available terminal types</h2><p className="mt-1 text-sm text-gray-600">The terminal type is ordered first and then assigned and programmed by an administrator.</p></div><div className="mt-5 grid gap-4 md:grid-cols-2">{visiblePlans.map(plan => <article key={plan.key} className="rounded-xl border p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-semibold">{plan.display_name}</h3><span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">Available</span></div><p className="mt-2 text-sm text-gray-600">{plan.description}</p><p className="mt-4 text-xs text-gray-500">Compatible options are shown only after this terminal type is assigned to a device.</p></article>)}</div></section>;
}

