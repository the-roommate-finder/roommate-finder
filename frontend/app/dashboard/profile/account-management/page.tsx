import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SeekerDashboard } from '../../../../components/seeker-dashboard';
import '../../dashboard.css';
import '../notifications/notifications.css';
import './account-management.css';

export const metadata = { title: 'Account Management | Roommate Finder', robots: { index: false, follow: false } };
export default async function AccountManagementPage() {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  return <SeekerDashboard initialView="profile" profileSettings="account-management" />;
}
