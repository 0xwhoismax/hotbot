"use client";
import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { inviteAtom, inviteCode, onboardingStepAtom } from './state';
import { TeamApp } from './TeamApp';

/** An invite link opens the app in place: it keeps the code (onboarding checks it and shows "You're invited") and the address becomes /app?invite=CODE, with no second page load.
 *  The code stays in the address until its seat is taken (`useInvite`), so opening the page in another browser keeps it. */
export function InviteLink({ code }: { code: string }) {
  const setInvite = useSetAtom(inviteAtom), setStep = useSetAtom(onboardingStepAtom);
  useEffect(() => {
    const clean = inviteCode(decodeURIComponent(code));
    if (clean) setInvite(clean);
    setStep('intro');
    window.history.replaceState(null, '', clean ? `/app?invite=${clean}` : '/app');
  }, [code, setInvite, setStep]);
  return <TeamApp view="home"/>;
}
