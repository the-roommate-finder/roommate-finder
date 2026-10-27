import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardEntry } from '../../components/dashboard-entry';
import './dashboard.css';
import './lister.css';
import './messages/messages.css';

export const metadata = { title: 'Dashboard | Roommate Finder', robots: { index: false, follow: false } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; search?: string | string[] }> }) {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  const params = await searchParams;
  return <DashboardEntry listerView={typeof params.view === 'string' ? params.view : undefined} initialSearch={typeof params.search === 'string' ? params.search.slice(0, 1000) : ''} />;
}
