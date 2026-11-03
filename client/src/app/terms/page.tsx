import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { TERMS } from '../../../../types/legal';

export const metadata: Metadata = { title: TERMS.title, description: 'HOTBOT’s Terms of Service and the Real SOL risk notice.' };

export default function TermsPage() { return <LegalPage doc={TERMS} kind="terms" other={{ href: '/privacy', label: 'Privacy policy' }} realSol/>; }
