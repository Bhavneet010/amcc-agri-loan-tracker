import { AppError } from './validation.ts';
export interface NotificationStorage {
  listNotifications(branchId: string, deviceId: string): Promise<unknown>;
  readNotifications(branchId: string, deviceId: string, eventIds: string[]): Promise<unknown>;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function handleNotifications(request: Request, db: NotificationStorage, input?: any) {
  const params = new URL(request.url).searchParams;
  const branchId = request.method === 'GET' ? params.get('branchId') : input?.branchId;
  const deviceId = request.method === 'GET' ? params.get('deviceId') : input?.deviceId;
  if (typeof branchId !== 'string' || !/^branch-(0[1-9]|1[0-3])$/.test(branchId) || !uuid(deviceId)) throw new AppError('Choose a valid branch and notification device.');
  if (request.method === 'GET') return db.listNotifications(branchId, deviceId);
  if (Object.keys(input || {}).some(key => !['branchId','deviceId','eventIds'].includes(key)) || !Array.isArray(input.eventIds) || input.eventIds.length < 1 || input.eventIds.length > 50 || !input.eventIds.every(uuid)) throw new AppError('Choose 1–50 valid updates to mark as read.');
  return db.readNotifications(branchId, deviceId, [...new Set<string>(input.eventIds)]);
}
