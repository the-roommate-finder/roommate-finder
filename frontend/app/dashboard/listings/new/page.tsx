import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ListingCreateForm } from '@/components/listing-create-form';
import './listing-create.css';

export const metadata = { title: 'Create Listing | Roommate Finder' };
export default async function CreateListingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  if (!(await cookies()).get('rmf_access')?.value) redirect('/login');
  const params = await searchParams;
  return <ListingCreateForm step={params.step === 'amenities' ? 'amenities' : params.step === 'pricing' ? 'pricing' : params.step === 'location' ? 'location' : 'details'} />;
}
