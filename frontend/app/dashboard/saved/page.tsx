import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SeekerDashboard } from '../../../components/seeker-dashboard';
import '../dashboard.css';

export const metadata = { title: 'Saved | Roommate Finder', robots: { index: false, follow: false } };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  return <SeekerDashboard initialView="saved" initialSavedKind={(await searchParams).kind === 'roommate' ? 'roommate' : 'room'} />;
}
