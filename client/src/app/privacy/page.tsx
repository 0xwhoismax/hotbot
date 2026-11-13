import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { PRIVACY } from '../../../../types/legal';

export const metadata: Metadata = { title: PRIVACY.title, description: 'How HOTBOT handles your data.' };

export default function PrivacyPage() { return <LegalPage doc={PRIVACY} kind="terms" other={{ href: '/terms', label: 'Terms' }}/>; }
