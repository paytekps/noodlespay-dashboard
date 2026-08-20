import InquiryForm from '../../components/public/inquiry-form';

export default function ContactPage() {
  return <main className="mx-auto max-w-3xl px-6 py-20"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Contact Gimml</p><h1 className="mt-3 text-4xl font-black">Let’s talk about your organization.</h1><p className="mt-4 leading-7 text-gray-600">Tell us what you need and your message will appear in the secure Gimml administration dashboard.</p></div><InquiryForm kind="contact" /></main>;
}
