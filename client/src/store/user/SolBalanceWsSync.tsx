"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { currentWalletAddressAtom } from "./atoms";
import { wsSolAddressAtom, wsSolBalanceAtom, wsSolConnectedAtom, createSolBalanceWs, userSolBalanceAtom } from "./queries";

export function SolBalanceWsSync() {
  const address = useAtomValue(currentWalletAddressAtom);

  const setWsAddress = useSetAtom(wsSolAddressAtom);
  const setWsBalance = useSetAtom(wsSolBalanceAtom);
  const setWsConnected = useSetAtom(wsSolConnectedAtom);
  const refetchBalance = useAtomValue(userSolBalanceAtom).refetch;
  const refetchBalanceRef = useRef(refetchBalance);
  useLayoutEffect(() => { refetchBalanceRef.current = refetchBalance; }, [refetchBalance]);

  useEffect(() => {
    setWsBalance(null);
    setWsAddress(address);
    setWsConnected(false);
    if (!address) return;

    let active = true;
    let subscribed = false;
    let pushedVersion = 0;
    const disconnect = createSolBalanceWs(
      address,
      (sol) => {
        if (active) {
          pushedVersion += 1;
          setWsBalance(sol);
        }
      },
      (connected) => {
        if (!active) return;
        const lostSubscription = subscribed && !connected;
        subscribed = connected;
        setWsConnected(connected);
        if (lostSubscription) {
          const versionAtLoss = pushedVersion;
          void refetchBalanceRef.current().then((result) => {
            if (active && pushedVersion === versionAtLoss && result.isSuccess) setWsBalance(null);
          }).catch(() => {});
        }
      },
    );
    return () => {
      active = false;
      disconnect();
      setWsAddress(null);
      setWsBalance(null);
      setWsConnected(false);
    };
  }, [address, setWsAddress, setWsBalance, setWsConnected]);

  return null;
}
