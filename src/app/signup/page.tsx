import InquiryForm from '../../components/public/inquiry-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <main className="mx-auto max-w-3xl px-6 py-20"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Get started</p><h1 className="mt-3 text-4xl font-black">Request Gimml devices</h1><p className="mt-4 leading-7 text-gray-600">Choose your plan, payment-processing preference, and where the devices will be used. You can request to keep an existing merchant account, and the Gimml team will confirm processor and hardware compatibility before activation.</p></div><InquiryForm kind="order_request" defaultPlan={plan} /></main>;
}
