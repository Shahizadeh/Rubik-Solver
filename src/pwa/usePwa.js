import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// After "Not now", don't offer installing again for this long.
const DISMISS_KEY = 'rubik.installDismissedAt';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
// How often an open app checks the server for a new version.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Not remembered; the banner may come back next visit.
  }
}

function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

// iPhone/iPad browsers have no install prompt; users add the app via Share.
function isIos() {
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * Install and update state for the PWA.
 *
 * - Chromium browsers fire `beforeinstallprompt`; we hold on to it so the app
 *   can show its own install banner and button, then trigger the real prompt.
 * - iOS gets a one-line "Add to Home Screen" tip instead.
 * - The service worker is registered in "prompt" mode: when a new version has
 *   downloaded, `needRefresh` turns on and `update()` switches to it.
 */
export function usePwa() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
  });

  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [bannerDismissed, setBannerDismissed] = useState(recentlyDismissed);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault(); // keep the browser's mini-infobar from showing; we show our own
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null); // a prompt event can only be used once
    if (outcome !== 'accepted') {
      rememberDismissal();
      setBannerDismissed(true);
    }
  }, [installEvent]);

  const dismissInstall = useCallback(() => {
    rememberDismissal();
    setBannerDismissed(true);
  }, []);

  return {
    canInstall: !installed && installEvent !== null,
    showInstallBanner: !installed && !bannerDismissed && installEvent !== null,
    showIosTip: !installed && !bannerDismissed && installEvent === null && isIos(),
    install,
    dismissInstall,
    needRefresh,
    update: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
  };
}
