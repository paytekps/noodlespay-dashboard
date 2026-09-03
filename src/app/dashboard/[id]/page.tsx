import { redirect } from 'next/navigation';

export default function LegacyMerchantDeviceRoute() {
  redirect('/dashboard/devices');
}
