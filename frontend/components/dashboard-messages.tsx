'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Check, CheckCheck, MessageSquare, MoreVertical, Paperclip, Search, SendHorizontal, Smile, X } from 'lucide-react';
import { decryptMessage, encryptMessage, prepareIdentity, type ChatIdentity } from './chat-crypto';

type Person = { id: string; display_name: string | null; avatar_url: string | null; location?: string | null; role: string; is_phone_verified: boolean };
type Participant = { user: Person; unread_count: number; is_muted: boolean; is_pinned: boolean };
type Message = { id: string; conversation_id: string; sender_id: string; encrypted_content: string | null; encryption_nonce: string | null; created_at: string; seen_at: string | null; delivered_at: string | null; message_type: string };
type Conversation = { id: string; participants: Participant[]; last_message_at: string | null; last_message: Message | null; preview?: string };
type Feed = { items: Conversation[]; total: number; pages: number; page: number };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
class ChatError extends Error { constructor(message: string, public status: number) { super(message); } }
const name = (person?: Person) => person?.display_name || 'Roommate Finder member';
const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function day(date: string) { const value = new Date(date); return value.toDateString() === new Date().toDateString() ? 'Today' : value.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); }
function Avatar({ person }: { person?: Person }) {
  const src = person?.avatar_url;
  return <span className="chat-avatar" data-asset-slot="profile-image">{src && (/^https?:\/\//i.test(src) || /^\/(?!\/)/.test(src)) &&
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}</span>;
}
function Verified({ person }: { person?: Person }) { return person?.is_phone_verified ? <BadgeCheck className="chat-verified" size={18} aria-label="Phone verified" /> : null; }
async function textOf(message: Message, user: string, identity: ChatIdentity | null) {
  if (message.message_type !== 'text') return 'Attachment';
  if (!identity) return 'Encrypted message — open in your original browser.';
  try { return await decryptMessage(message, user, identity); } catch { return 'This message cannot be opened in this browser.'; }
}

export function DashboardMessages({ userId, initialParticipant, initialConversation, initialDraft }: { userId: string; initialParticipant?: string; initialConversation?: string; initialDraft?: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<ChatIdentity | null>(null);
  const [keyError, setKeyError] = useState('');
  const [keysReady, setKeysReady] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [opened, setOpened] = useState<Conversation | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadedPage, setLoadedPage] = useState(0);
  const request = useCallback<Request>(async (path, options) => {
    const response = await fetch(`/api/member/${path}`, { ...options, cache: 'no-store' });
    if (response.status === 401) router.replace('/login');
    const result = await response.json();
    if (!response.ok) throw new ChatError(result.message || 'Unable to load messages. Please try again.', response.status);
    return result;
  }, [router]);
  useEffect(() => {
    let cancelled = false;
    prepareIdentity(userId, async () => {
      try { return (await request<{ public_key: string }>(`chat/keys/${userId}`)).public_key; }
      catch (reason) { if (reason instanceof ChatError && reason.status === 404) return null; throw reason; }
    }, async public_key => { await request('chat/keys/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_key }) }); })
      .then(value => { if (!cancelled) setIdentity(value); })
      .catch(reason => { if (!cancelled) setKeyError(reason.message); })
      .finally(() => { if (!cancelled) setKeysReady(true); });
    return () => { cancelled = true; };
  }, [request, userId]);
  useEffect(() => {
    if (!keysReady) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await request<Feed>(`chat/conversations?page=${page}&page_size=20`, { signal: controller.signal });
        const items = await Promise.all(result.items.map(async item => ({ ...item, preview: item.last_message ? await textOf(item.last_message, userId, identity) : 'Start a conversation' })));
        if (!controller.signal.aborted) { setFeed({ ...result, items }); setLoadedPage(page); setError(''); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load conversations.'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { if (document.visibilityState === 'visible') void load(); else timer = setTimeout(load, 5000); }, 5000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [keysReady, identity, page, request, retry, userId]);
  useEffect(() => {
    if (!initialParticipant && !initialConversation) return;
    let cancelled = false;
    const opening = initialConversation ? request<Conversation>(`chat/conversations/${initialConversation}`) : request<Conversation>('chat/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participant_id: initialParticipant }) });
    opening
      .then(item => { if (!cancelled) { setOpened(item); setActive(item.id); setRetry(value => value + 1); } })
      .catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [initialParticipant, initialConversation, request]);
  const selected = feed?.items.find(item => item.id === active) || (opened?.id === active ? opened : null);
  const items = (loadedPage === page ? feed?.items : [])?.filter(item => {
    const person = item.participants.find(p => p.user.id !== userId)?.user;
    return (category === 'all' || person?.role === category) && `${name(person)} ${item.preview}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  return <div className={`dashboard-messages ${selected ? 'chat-is-open' : ''}`}>
    <section className="chat-inbox" aria-label="Conversations">
      <h1>Messages</h1><p className="chat-description">Keep your conversations with roommates and listers in one place.</p>
      <label className="chat-search"><input aria-label="Search conversations on this page" placeholder="Search messages…" value={search} onChange={event => setSearch(event.target.value)} /><Search size={20} /></label>
      <div className="chat-tabs" role="group" aria-label="Conversation category">{[['all', 'All'], ['seeker', 'Roommates'], ['lister', 'Listers']].map(([value, label]) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div>
      {error && <p className="chat-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Try again</button></p>}
      {(!keysReady || !feed || loadedPage !== page) && !error ? <p className="chat-empty" role="status">Loading conversations…</p> : <div className="chat-conversations">{items?.length ? items.map(item => {
        const person = item.participants.find(p => p.user.id !== userId)?.user;
        const unread = item.participants.find(p => p.user.id === userId)?.unread_count || 0;
        return <button className={`chat-conversation ${item.id === active ? 'is-selected' : ''}`} key={item.id} aria-pressed={item.id === active} onClick={() => setActive(item.id)}>
          <span className="chat-conversation-top"><Avatar person={person} /><strong>{name(person)}</strong><Verified person={person} /><time>{item.last_message_at ? time(item.last_message_at) : ''}</time>{unread > 0 && <span className="chat-unread" aria-label={`${unread} unread messages`} />}</span>
          <span className="chat-preview">{item.preview}</span>
        </button>;
      }) : <p className="chat-empty">{search || category !== 'all' ? 'No conversations match your search.' : 'No conversations yet. Messages from roommates and listers will appear here.'}</p>}</div>}
      {feed && feed.pages > 1 && <nav className="chat-pagination" aria-label="Conversation pages"><button disabled={page <= 1} onClick={() => { setPage(value => value - 1); setActive(null); }}>Previous</button><span>{page} / {feed.pages}</span><button disabled={page >= feed.pages} onClick={() => { setPage(value => value + 1); setActive(null); }}>Next</button></nav>}
    </section>
    {selected ? <ChatThread key={`${selected.id}:${initialDraft || ""}`} initialDraft={selected.id === initialConversation ? initialDraft : undefined} conversation={selected} userId={userId} identity={identity} keyError={keyError} request={request} onBack={() => setActive(null)} onUpdate={() => setRetry(value => value + 1)} /> : <section className="chat-no-selection"><MessageSquare size={34} /><h2>Your messages</h2><p>Select a conversation to start chatting.</p>{keyError && <p className="chat-error" role="alert">{keyError}</p>}</section>}
  </div>;
}

function ChatThread({ conversation, initialDraft, userId, identity, keyError, request, onBack, onUpdate }: { conversation: Conversation; initialDraft?: string; userId: string; identity: ChatIdentity | null; keyError: string; request: Request; onBack: () => void; onUpdate: () => void }) {
  const person = conversation.participants.find(p => p.user.id !== userId)?.user;
  const mine = conversation.participants.find(p => p.user.id === userId);
  const [messages, setMessages] = useState<(Message & { text: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(initialDraft || '');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const generation = useRef(0);
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [menu, setMenu] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [retry, setRetry] = useState(0);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const sendLock = useRef(false);
  const nearBottom = useRef(true);
  const refresh = useRef(onUpdate);
  useEffect(() => { refresh.current = onUpdate; }, [onUpdate]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    async function load() {
      if (document.visibilityState !== 'visible') { timer = setTimeout(load, 5000); return; }
      const version = generation.current;
      try {
        const result = await request<Message[]>(`chat/conversations/${conversation.id}/messages?limit=50`, { signal: controller.signal });
        const decoded = await Promise.all(result.map(async message => ({ ...message, text: await textOf(message, userId, identity) })));
        if (!controller.signal.aborted && version === generation.current) {
          setMessages(previous => {
            const first = decoded[0];
            const history = first ? previous.filter(message => message.created_at < first.created_at || (message.created_at === first.created_at && message.id < first.id)) : [];
            return [...history, ...decoded];
          });
          if (initial) { setHasOlder(result.length === 50); refresh.current(); }
          initial = false; setLoaded(true); setLoadError('');
        }
      } catch (reason) { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : 'Unable to load messages.'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(load, 5000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [conversation.id, identity, request, userId, retry]);
  const last = messages.at(-1)?.id;
  useEffect(() => { if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [last, loaded]);
  async function loadOlder() {
    if (!messages.length || older) return;
    setOlder(true);
    const height = scroll.current?.scrollHeight || 0;
    try {
      const result = await request<Message[]>(`chat/conversations/${conversation.id}/messages?limit=50&before_id=${messages[0].id}`);
      const decoded = await Promise.all(result.map(async message => ({ ...message, text: await textOf(message, userId, identity) })));
      if (!mounted.current) return;
      setMessages(current => [...decoded.filter(item => !current.some(existing => existing.id === item.id)), ...current]); setHasOlder(result.length === 50);
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop += scroll.current.scrollHeight - height; });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to load older messages.'); }
    finally { if (mounted.current) setOlder(false); }
  }
  async function send() {
    if (!draft.trim() || !identity || !person || sendLock.current) return;
    sendLock.current = true; setSending(true); setError('');
    const text = draft.trim();
    try {
      let recipient: { public_key: string };
      try { recipient = await request(`chat/keys/${person.id}`); }
      catch (reason) { if (reason instanceof ChatError && reason.status === 404) throw new Error('This person needs to open Messages once before you can send them an encrypted message.'); throw reason; }
      const payload = await encryptMessage(text, conversation.id, userId, { [userId]: identity.publicKey, [person.id]: recipient.public_key });
      const message = await request<Message>(`chat/conversations/${conversation.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!mounted.current) return;
      generation.current += 1; nearBottom.current = true; setMessages(current => [...current.filter(item => item.id !== message.id), { ...message, text }]); setDraft(''); refresh.current(); input.current?.focus();
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Message could not be sent. Your draft has been kept.'); }
    finally { sendLock.current = false; if (mounted.current) setSending(false); }
  }
  async function setting(field: 'is_muted' | 'is_pinned', value: boolean) {
    setSettingsBusy(true);
    try { await request(`chat/conversations/${conversation.id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) }); if (mounted.current) { setMenu(false); refresh.current(); } }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to update conversation.'); }
    finally { if (mounted.current) setSettingsBusy(false); }
  }
  return <section className="chat-thread" aria-label={`Conversation with ${name(person)}`}>
    <header className="chat-thread-header"><button className="chat-back" aria-label="Back to conversations" onClick={onBack}><ArrowLeft /></button><Link className="chat-profile-link" aria-label={`View ${name(person)}’s profile`} href={`/dashboard/messages/${conversation.id}/profile`}><Avatar person={person} /><div><strong>{name(person)}</strong><span>{person?.location || (person?.role === 'lister' ? 'Property Lister' : 'Roommate')}</span></div><Verified person={person} /></Link>
      <div className="chat-options"><button aria-label="Conversation options" aria-expanded={menu} onClick={() => setMenu(value => !value)}><MoreVertical size={21} /></button>{menu && <div className="chat-options-menu"><button disabled={settingsBusy} onClick={() => setting('is_muted', !mine?.is_muted)}>{mine?.is_muted ? 'Unmute' : 'Mute'} conversation</button><button disabled={settingsBusy} onClick={() => setting('is_pinned', !mine?.is_pinned)}>{mine?.is_pinned ? 'Unpin' : 'Pin'} conversation</button><button onClick={() => setMenu(false)}>Close menu</button></div>}</div>
    </header>
    <div className="chat-history" ref={scroll} onScroll={() => { const el = scroll.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} aria-label="Message history">
      {hasOlder && <button className="chat-load-older" disabled={older} onClick={loadOlder}>{older ? 'Loading…' : 'Load earlier messages'}</button>}
      {!loaded && !loadError && <p className="chat-empty" role="status">Loading messages…</p>}
      {loaded && !messages.length && <p className="chat-empty">Start your conversation with {name(person)}.</p>}
      {messages.map((message, index) => <div key={message.id}>
        {(!index || day(messages[index - 1].created_at) !== day(message.created_at)) && <p className="chat-day">{day(message.created_at)}</p>}
        <div className={`chat-message ${message.sender_id === userId ? 'is-outgoing' : ''}`}><p>{message.text}</p><span className="chat-message-meta"><time dateTime={message.created_at}>{time(message.created_at)}</time>{message.sender_id === userId && (message.seen_at ? <CheckCheck size={18} aria-label="Read" /> : message.delivered_at ? <CheckCheck size={18} aria-label="Delivered" /> : <Check size={18} aria-label="Sent" />)}</span></div>
      </div>)}
    </div>
    <footer className="chat-composer">
      {(error || loadError || keyError) && <p className="chat-error" role="alert">{error || loadError || keyError}{loadError && <button onClick={() => setRetry(value => value + 1)}>Retry loading</button>}</p>}
      {emoji && <div className="chat-emoji" aria-label="Choose an emoji">{['😊', '👋', '👍', '🏠', '🙏', '❤️'].map(value => <button key={value} aria-label={`Insert ${value}`} disabled={sending} onClick={() => { setDraft(text => `${text}${value}`.slice(0, 4000)); setEmoji(false); input.current?.focus(); }}>{value}</button>)}<button aria-label="Close emoji picker" onClick={() => setEmoji(false)}><X size={16} /></button></div>}
      <form onSubmit={event => { event.preventDefault(); void send(); }}><div className="chat-compose-input"><button type="button" aria-label="Choose emoji" aria-expanded={emoji} disabled={!identity} onClick={() => setEmoji(value => !value)}><Smile size={22} /></button><textarea ref={input} rows={1} aria-label="Message" placeholder="Type in your message…" value={draft} maxLength={4000} disabled={!identity || sending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><button type="button" disabled aria-label="Attachments unavailable" title="Attachments are not available yet"><Paperclip size={22} /></button></div><button className="chat-send" aria-label={sending ? 'Sending message' : 'Send message'} disabled={!identity || sending || !draft.trim()}><SendHorizontal size={23} fill="currentColor" /></button></form>
      <p className="chat-safety">Never send money or share sensitive information before verifying the person/listing.</p>
    </footer>
  </section>;
}
