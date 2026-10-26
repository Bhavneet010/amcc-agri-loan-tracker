import { AppError } from './validation.ts';
// Renewals above ₹2,00,000 need the branch to say whether it is uploading charge details.
export const CHARGE_THRESHOLD_PAISE = 20000000;
export const CHARGE_IMAGE_MAX_BYTES = 1572864;
export type Charge = { choice: 'yes' | 'no'; imagePath: string | null; uploadedAt: string | null };
export interface ChargeStorage {
  setCharge(loanId: string, choice: 'yes' | 'no', image?: { path: string; bytes: number } | null): Promise<void>;
  clearChargeImage(loanId: string, path: string): Promise<void>;
  uploadChargeImage(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  removeChargeObject(path: string): Promise<void>;
  signChargeImage(path: string): Promise<string>;
}
export const needsCharge = (category: string, amountPaise: number) =>
  category === 'renewal' && amountPaise > CHARGE_THRESHOLD_PAISE;
export function chargeChoice(value: unknown): 'yes' | 'no' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'yes' && value !== 'no') throw new AppError('Choose Yes or No for uploading charge details.');
  return value;
}
export const missingChoice = () =>
  new AppError('Choose Yes or No for uploading charge details. Refresh the app if you don’t see this option.');
// Browsers label files loosely, so the image type is read from the file signature.
export function imageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  throw new AppError('Upload the charge details as a JPEG, PNG or WebP image.');
}
export async function imageBody(request: Request) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > CHARGE_IMAGE_MAX_BYTES) { await reader.cancel(); throw new AppError('The charge details image is too large. Choose a smaller photo.', 413); }
    chunks.push(value);
  }
  if (!size) throw new AppError('Choose the charge details image to upload.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
// Removes the stored image of a sanctioned or deleted loan. Failures keep the path so a later read retries.
export async function dropChargeImage(db: ChargeStorage, loanId: string, path: string | null | undefined, keepRow = true) {
  if (!path) return;
  try {
    await db.removeChargeObject(path);
    if (keepRow) await db.clearChargeImage(loanId, path);
  } catch (error) {
    console.error('AMCC charge image cleanup failed', error instanceof Error ? error.message : 'Unknown error');
  }
}
