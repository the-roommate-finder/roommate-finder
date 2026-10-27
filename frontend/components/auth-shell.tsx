import Link from 'next/link';
import Image from 'next/image';

export function LogoSlot() {
  return (
    <Link href="/" aria-label="Roommate Finder home" className="logo-slot" data-asset-slot="brand-logo">
      <Image src="/brand/RMF_logo.svg" alt="Roommate Finder" style={{ height: 60, width: 'auto' }} width={40} height={40} />
    </Link>
  );
}
export function AuthShell({ children, variant, title, subtitle }: {
  children: React.ReactNode; variant: 'role' | 'login' | 'signup' | 'forgot' | 'reset'; title: string; subtitle: string;
}) {
  const card = <section className={`auth-card ${variant}-card`}>
    {variant !== 'login' && <LogoSlot />}<h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}
  </section>;
  if (variant === 'login') {
    return <main className="auth-page login-page login-split-layout">
      <div className="login-image-panel" data-asset-slot="login-background-image">
        <LogoSlot />
        <p className="login-image-welcome">
          <strong>Welcome back.</strong>
          <span>Your next chapter starts with<br />the right roommate.</span>
        </p>
      </div>
      <div className="login-form-panel">{card}</div>
    </main>;
  }
  return <main className={`auth-page ${variant}-page`}>{card}</main>;
}
