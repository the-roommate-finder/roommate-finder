import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardEntry } from '../../../../components/dashboard-entry';
import '../../dashboard.css';
import '../../lister.css';
import '../notifications/notifications.css';
import './help-support.css';

export const metadata = { title: 'Help & Support | Roommate Finder', robots: { index: false, follow: false } };
export default async function HelpSupportPage() {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  return <DashboardEntry initialView="profile" profileSettings="help-support" />;
}
