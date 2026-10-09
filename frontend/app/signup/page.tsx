import { AuthForm } from '@/components/auth-form';
export default async function Signup({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  return <AuthForm mode="signup" role={(await searchParams).role === 'lister' ? 'lister' : 'seeker'} />;
}
