import Link from 'next/link';
export function LogoSlot() {
  return <Link href="/" aria-label="Roommate Finder home" className="logo-slot" data-asset-slot="brand-logo" />;
}
export function AuthShell({ children, variant, title, subtitle }: {
  children: React.ReactNode; variant: 'role' | 'login' | 'signup'; title: string; subtitle: string;
}) {
  return <main className={`auth-page ${variant}-page`}><section className={`auth-card ${variant}-card`}>
    <LogoSlot /><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}
  </section></main>;
}
