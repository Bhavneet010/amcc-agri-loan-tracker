export type LoanNotification = {
  id: string; loanId: string; borrowerName: string; atsId: string | null;
  remarksChanged: boolean; remarks: string; decisionChanged: boolean; statusChanged: boolean;
  fromStatus: string; toStatus: string; returnReason: string;
  returnedDate: string | null; sanctionDate: string | null;
  sourceApp: string; createdAt: string;
};
export type NotificationFeed = { items: LoanNotification[]; hasMore: boolean };
export function groupNotifications(events: LoanNotification[]) {
  const groups = new Map<string, { loanId: string; borrowerName: string; atsId: string | null; events: LoanNotification[] }>();
  for (const event of events) {
    let group = groups.get(event.loanId);
    if (!group) { group = { loanId: event.loanId, borrowerName: event.borrowerName, atsId: event.atsId, events: [] }; groups.set(event.loanId, group); }
    group.events.push(event);
  }
  return [...groups.values()];
}
export function notificationDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const key = 'amcc.notifications.device.v1';
  const saved = storage.getItem(key);
  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
  const id = crypto.randomUUID(); storage.setItem(key, id); return id;
}
