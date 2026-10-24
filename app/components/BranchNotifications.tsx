'use client';
import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCheck } from 'lucide-react';
import Modal from './Modal';
import { request } from '../../lib/types';
import { groupNotifications, notificationDeviceId, type NotificationFeed } from '../../lib/notifications';

const empty: NotificationFeed = { items: [], hasMore: false };
const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);
const changeTime = (date: string) => new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const decisionDate = (date: string) => new Date(date + 'T00:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

export default function BranchNotifications({ branchId, branchName, blocked, refreshKey }: {
  branchId: string; branchName: string; blocked: boolean; refreshKey: number;
}) {
  const [feed, setFeed] = useState<NotificationFeed>(empty);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState('');
  const readGeneration = useRef(0);
  const ackBusy = useRef(false);
  const [reload, setReload] = useState(0);
  const open = feed.items.length > 0 && !dismissed && !blocked;
  useEffect(() => {
    try { setDevice(notificationDeviceId(localStorage)); }
    catch { setError('Updates need site storage enabled to remember this phone.'); }
  }, []);
  useEffect(() => {
    if (!device) return;
    let alive = true;
    let controller: AbortController | undefined;
    async function load() {
      if (ackBusy.current || document.visibilityState !== 'visible') return;
      controller?.abort(); controller = new AbortController();
      const generation = ++readGeneration.current;
      try {
        const next = await request<NotificationFeed>(`/api/notifications?branchId=${encodeURIComponent(branchId)}&deviceId=${encodeURIComponent(device)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (alive && generation === readGeneration.current && !ackBusy.current) { setFeed(next); }
      } catch { /* A transient feed failure retries on resume; loan use remains available. */ }
    }
    void load();
    const resume = () => { if (document.visibilityState === 'visible') { setDismissed(false); void load(); } };
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume);
    const timer = setInterval(() => void load(), 30000);
    return () => { alive = false; controller?.abort(); ++readGeneration.current; clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [branchId, device, refreshKey, reload]);

  async function markRead() {
    if (ackBusy.current || !device) return;
    const ids = feed.items.map(item => item.id);
    ackBusy.current = true; ++readGeneration.current; setSaving(true); setError('');
    try {
      await request('/api/notifications', { method: 'POST', body: JSON.stringify({ branchId, deviceId: device, eventIds: ids }) });
      setFeed(current => ({ ...current, items: current.items.filter(item => !ids.includes(item.id)) }));
    } catch (e) { setError((e as Error).message); }
    finally { ackBusy.current = false; setSaving(false); setReload(value => value + 1); }
  }
  if (!open) return error && !feed.items.length ? <p className="notification-storage-note" role="status">{error}</p> : null;
  return <Modal title="Updates to your loans" eyebrow="Branch updates" subtitle={branchName} icon={<BellRing size={22}/>} onClose={saving ? undefined : () => setDismissed(true)}>
    <div className="notification-list" aria-label="Unread loan updates">
      {groupNotifications(feed.items).map(group => <section className="notification-loan" key={group.loanId}>
        <h3>{group.borrowerName || 'Loan application'}</h3><p className="notification-ats">{group.atsId ? `ATS ${group.atsId}` : 'ATS pending'}</p>
        {group.events.map(event => <div className="notification-event" key={event.id}>
          <p className="notification-meta">{event.sourceApp === 'nirnay' ? 'Nirnay' : 'Admin'} · <time dateTime={event.createdAt}>{changeTime(event.createdAt)}</time></p>
          {event.decisionChanged ? <div className="notification-decision"><strong>{event.statusChanged ? `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}` : `${statusLabel(event.toStatus)} details updated`}</strong>{event.toStatus === 'returned' ? <>{event.returnReason ? <p>{event.returnReason}</p> : null}{event.returnedDate ? <small>Return date: {decisionDate(event.returnedDate)}</small> : null}</> : null}{event.toStatus === 'sanctioned' && event.sanctionDate ? <small>Sanction date: {decisionDate(event.sanctionDate)}</small> : null}</div> : null}
          {event.remarksChanged ? <div className="notification-remarks"><strong>{event.remarks ? 'Remarks' : 'Remarks cleared'}</strong>{event.remarks ? <p>{event.remarks}</p> : null}</div> : null}
        </div>)}
      </section>)}
    </div>
    <div className="notification-footer">
      <p>{feed.hasMore ? 'More unread updates will appear after this batch.' : 'Marking these read applies only to this phone.'}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setDismissed(true)}>Later</button><button type="button" className="button primary" disabled={saving} onClick={markRead}><CheckCheck size={17}/>{saving ? 'Saving…' : 'Mark as read'}</button></div>
    </div>
  </Modal>;
}
