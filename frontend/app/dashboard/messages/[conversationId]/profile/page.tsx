import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DashboardEntry } from '../../../../../components/dashboard-entry';
import '../../../dashboard.css';
import '../../../lister.css';
import '../../messages.css';
import './profile.css';

export const metadata = { title: 'Chat Profile | Roommate Finder', robots: { index: false, follow: false } };

export default async function ChatProfilePage({ params }: { params: Promise<{ conversationId: string }> }) {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  const { conversationId } = await params;
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(conversationId)) notFound();
  return <DashboardEntry initialView="messages" profileConversation={conversationId} />;
}
