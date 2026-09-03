import { redirect } from 'next/navigation';

export default function LegacyAdminDeviceRoute() {
  redirect('/dashboard/devices');
}
