import './dashboard-skeleton.css';

export function Skeleton({ variant = 'line' }: { variant?: 'line' | 'short' | 'number' | 'photo' | 'avatar' | 'heading' }) {
  return <span aria-hidden="true" className={`dashboard-skeleton dashboard-skeleton--${variant}`} />;
}

export function ListingSkeletonRows() {
  return <>{Array.from({ length: 6 }, (_, index) => <tr key={index} aria-hidden="true" className="listing-skeleton-row">
    <td><Skeleton variant="short" /></td>
    <td><div className="lister-property"><Skeleton variant="photo" /><div className="dashboard-skeleton-copy"><Skeleton /><Skeleton variant="short" /></div></div></td>
    {Array.from({ length: 5 }, (_, column) => <td key={column}><Skeleton variant="short" /></td>)}
  </tr>)}</>;
}

export function ConversationSkeleton({ label = 'Loading conversations…' }: { label?: string }) {
  return <div role="status" aria-label={label}>
    <span className="dashboard-skeleton-sr">{label}</span>
    {Array.from({ length: 3 }, (_, index) => <div className="conversation-skeleton-row" key={index} aria-hidden="true"><Skeleton variant="avatar" /><div className="dashboard-skeleton-copy"><Skeleton variant="short" /><Skeleton /></div></div>)}
  </div>;
}

export function DashboardSkeleton() {
  return <main className="workspace-skeleton" role="status" aria-label="Loading your workspace…" aria-busy="true">
    <span className="dashboard-skeleton-sr">Loading your workspace…</span>
    <div className="workspace-skeleton-sidebar" aria-hidden="true"><Skeleton variant="heading" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} />)}</div>
    <div className="workspace-skeleton-main" aria-hidden="true">
      <div className="workspace-skeleton-header"><Skeleton /><Skeleton variant="avatar" /></div>
      <div className="workspace-skeleton-content"><Skeleton variant="heading" /><Skeleton />
        <div className="workspace-skeleton-stats">{Array.from({ length: 4 }, (_, index) => <div key={index}><Skeleton /><Skeleton variant="number" /><Skeleton variant="short" /></div>)}</div>
        <div className="workspace-skeleton-panel"><Skeleton variant="heading" />{Array.from({ length: 6 }, (_, index) => <div className="workspace-skeleton-row" key={index}><Skeleton variant="photo" /><div className="dashboard-skeleton-copy"><Skeleton /><Skeleton variant="short" /></div><Skeleton variant="short" /></div>)}</div>
      </div>
    </div>
  </main>;
}
