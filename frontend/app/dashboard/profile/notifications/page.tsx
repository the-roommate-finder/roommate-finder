import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardEntry } from '../../../../components/dashboard-entry';
import '../../dashboard.css';
import '../../lister.css';
import './notifications.css';

export const metadata = { title: 'Notification Preferences | Roommate Finder', robots: { index: false, follow: false } };

export default async function NotificationPreferencesPage() {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  return <DashboardEntry initialView="profile" profileSettings="notifications" />;
}
