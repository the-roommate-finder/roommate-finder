import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { conversationStarters } from '../../../components/conversation-starters';
import { DashboardEntry } from '../../../components/dashboard-entry';
import '../dashboard.css';
import '../lister.css';
import './messages.css';

export const metadata = { title: 'Messages | Roommate Finder', robots: { index: false, follow: false } };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ participant?: string; conversation?: string; starter?: string }> }) {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  const { participant, conversation, starter } = await searchParams;
  return <DashboardEntry initialView="messages" initialParticipant={typeof participant === 'string' && /^RMF-[0-9]{6}$/.test(participant) ? participant : undefined} initialConversation={typeof conversation === 'string' && /^[0-9a-fA-F-]{36}$/.test(conversation) ? conversation : undefined} initialDraft={starter && /^[0-2]$/.test(starter) ? conversationStarters[Number(starter)] : undefined} />;
}
