import { SeekerProfileForm } from '@/components/seeker-profile-form';
import './profile.css';
import './lister-profile.css';

export default async function CreateProfilePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  return <SeekerProfileForm editing={(await searchParams).edit === '1'} />;
}
