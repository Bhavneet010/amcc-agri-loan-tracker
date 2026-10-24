'use client';
import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Platform = 'ios' | 'android' | 'other';
const installedKey = 'amcc.installed.v1';
const seenKey = 'amcc.installPromptSeen.v1';

function standalone() {
  return ['standalone', 'fullscreen', 'minimal-ui'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}
function rememberInstalled() { try { localStorage.setItem(installedKey, '1'); } catch {} }
function seenBefore() { try { return localStorage.getItem(seenKey) === '1' || localStorage.getItem(installedKey) === '1'; } catch { return false; } }
function rememberShown() { try { localStorage.setItem(seenKey, '1'); } catch {} }

// Offer installation on the first phone visit only, even when the user dismisses it.
export default function InstallPrompt({ canShow, onOpenChange }: { canShow: boolean; onOpenChange?: (open: boolean) => void }) {
  const [platform, setPlatform] = useState<Platform>('other');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [open, setOpen] = useState(false); const [steps, setSteps] = useState(false);
  const [inApp, setInApp] = useState(false); const [iosSafari, setIosSafari] = useState(true);
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);

  useEffect(() => {
    const ua = navigator.userAgent; const current = detectPlatform();
    setPlatform(current); setInApp(/FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|; wv\)/i.test(ua)); setIosSafari(!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
    if (standalone()) { rememberInstalled(); return; }
    // iOS gives no install signal, so iPhone users confirm it themselves with "I've installed it".
    const available = (event: Event) => {
      event.preventDefault(); setInstallEvent(event as InstallEvent);
    };
    const installed = () => { rememberInstalled(); setInstallEvent(null); setOpen(false); };
    window.addEventListener('beforeinstallprompt', available); window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); };
  }, []);

  useEffect(() => {
    if (!canShow) { setOpen(false); return; }
    if ((platform === 'ios' || platform === 'android') && !standalone() && !seenBefore()) {
      rememberShown(); setOpen(true);
    }
  }, [canShow, platform]);

  async function install() {
    if (!installEvent) { setSteps(true); return; }
    await installEvent.prompt(); const result = await installEvent.userChoice;
    setInstallEvent(null);
    if (result.outcome === 'accepted') { rememberInstalled(); setOpen(false); }
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
    </ol> : null}
    {ios ? <div className="install-actions">
      <button type="button" className="button secondary" onClick={() => setOpen(false)}>Not now</button>
      <button type="button" className="button primary" onClick={() => { rememberInstalled(); setOpen(false); }}>I've installed it</button>
    </div> : <>
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
