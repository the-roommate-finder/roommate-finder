import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/manrope';
import '@fontsource-variable/inter';
import '@fontsource/dm-serif-text/400.css';
import './globals.css';
export const metadata: Metadata = { title: 'Roommate Finder', description: 'Find a room or roommate. Make shared living work for you.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
