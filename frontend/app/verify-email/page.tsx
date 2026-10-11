import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { EmailVerificationForm } from '@/components/email-verification-form';

export default async function VerifyEmailPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('rmf_verification_email')?.value.trim();
  if (!email) redirect('/signup');
  return <EmailVerificationForm email={email} />;
}
