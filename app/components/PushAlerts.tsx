'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { disablePushAlerts, enablePushAlerts, pushState, type PushState } from '../../lib/push';

const notes: Record<PushState, string> = {
  on: 'This phone gets a notification whenever a branch or Nirnay adds a new loan or renewal.',
  off: 'Get a notification on this phone whenever a branch or Nirnay adds a new loan or renewal. Only phones where you turn this on are alerted.',
  blocked:
    'Notifications are blocked for this app. Long-press the app icon, open App info → Notifications and allow them, then open this again.',
  unsupported: 'This browser cannot show phone alerts. On Android, open the installed app in Chrome.',
};

export default function PushAlerts() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (state === 'on') await disablePushAlerts();
      else await enablePushAlerts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setState(await pushState().catch(() => 'unsupported' as const));
      setBusy(false);
    }
  }
  if (!state) return null;
  return (
    <section className="push-alerts">
      <p className="settings-note">{notes[state]}</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {state === 'on' || state === 'off' ? (
        <button
          type="button"
          className={`button ${state === 'on' ? 'secondary' : 'primary'}`}
          disabled={busy}
          onClick={toggle}
        >
          {state === 'on' ? <BellOff size={17} /> : <Bell size={17} />}
          {busy ? 'Saving…' : state === 'on' ? 'Turn off on this phone' : 'Turn on for this phone'}
        </button>
      ) : null}
    </section>
  );
}
