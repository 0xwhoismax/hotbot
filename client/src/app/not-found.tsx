import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function NotFound() { return <main className="space-y-4 p-6"><h1>Page not found</h1><Button asChild><Link href="/">Back to HOTBOT</Link></Button></main>; }
