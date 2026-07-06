import { redirect } from 'next/navigation';

export default function AdminDevicesRedirect() {
  redirect('/dashboard/devices');
}
