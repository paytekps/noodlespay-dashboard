import DashboardOverview from './dashboard-overview';

export default function OverviewPage() {
  return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-bold">Overview</h1><p className="mt-2 text-gray-600">A summary of the combined Gimml Terminal information available to your account.</p><DashboardOverview /></main>;
}
