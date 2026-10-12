import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SeekerDashboard } from '../../../../components/seeker-dashboard';
import '../../dashboard.css';
import './notifications.css';

export const metadata = { title: 'Notification Preferences | Roommate Finder', robots: { index: false, follow: false } };

export default async function NotificationPreferencesPage() {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  return <SeekerDashboard initialView="profile" profileSettings="notifications" />;
}
