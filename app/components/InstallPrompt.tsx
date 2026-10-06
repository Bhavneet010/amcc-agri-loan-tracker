'use client';
import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Platform = 'ios' | 'android' | 'other';
const installedKey = 'amcc.installed.v1';
export const showInstallEvent = 'amcc:show-install';

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}
function remember(value: boolean) { try { if (value) localStorage.setItem(installedKey, '1'); else localStorage.removeItem(installedKey); } catch {} }
function remembered() { try { return localStorage.getItem(installedKey) === '1'; } catch { return false; } }

// Shown on every visit from a browser until the app is installed. Dismissing only hides it for the current visit.
export default function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [open, setOpen] = useState(false); const [steps, setSteps] = useState(false);
  const [inApp, setInApp] = useState(false); const [iosSafari, setIosSafari] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent; const current = detectPlatform();
    setPlatform(current); setInApp(/FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|; wv\)/i.test(ua)); setIosSafari(!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
    if (standalone()) { remember(true); return; }
    // iOS gives no install signal, so always offer there; Android is offered unless an install was recorded.
    if (current === 'ios' || (current === 'android' && !remembered())) setOpen(true);
    const available = (event: Event) => {
      event.preventDefault(); setInstallEvent(event as InstallEvent);
      // The browser only offers this when the app is not installed, so any earlier record is stale.
      remember(false); setOpen(true);
    };
    const installed = () => { remember(true); setInstallEvent(null); setOpen(false); };
    const show = () => { setSteps(true); setOpen(true); };
    window.addEventListener('beforeinstallprompt', available); window.addEventListener('appinstalled', installed); window.addEventListener(showInstallEvent, show);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); window.removeEventListener(showInstallEvent, show); };
  }, []);

  async function install() {
    if (!installEvent) { setSteps(true); return; }
    await installEvent.prompt(); const result = await installEvent.userChoice;
    setInstallEvent(null);
    if (result.outcome === 'accepted') { remember(true); setOpen(false); }
  }

  if (!open) return null;
  const ios = platform === 'ios';
  return <div className="install-sheet" role="dialog" aria-labelledby="install-title">
    <div className="install-sheet-head">
      <img src="/icon-192.png" alt="" width={44} height={44}/>
      <div><strong id="install-title">Install AMCC Loans</strong><p>Add the app to your home screen for quick, full-screen access.</p></div>
      <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Not now"><X size={18}/></button>
    </div>
    {inApp ? <p className="install-note">You are viewing this inside another app. Open this link in {ios ? 'Safari' : 'Chrome'} to install it.</p> : null}
    {ios ? <ol className="install-steps">
      {!iosSafari ? <li>For best results, open this link in <strong>Safari</strong>.</li> : null}
      <li>Tap the <strong>Share</strong> button <Share size={15} aria-label="Share icon"/> in the browser toolbar.</li>
      <li>Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare size={15} aria-label="Add icon"/>.</li>
      <li>Tap <strong>Add</strong> in the top-right corner.</li>
    </ol> : <>
      {steps && !installEvent ? <ol className="install-steps">
        <li>Open the browser menu <strong>⋮</strong> at the top-right.</li>
        <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        <li>Confirm with <strong>Install</strong>.</li>
      </ol> : null}
      <div className="install-actions">
        <button type="button" className="button secondary" onClick={() => setOpen(false)}>Not now</button>
        <button type="button" className="button primary" onClick={install}><Download size={15}/> Install app</button>
      </div>
    </>}
  </div>;
}
