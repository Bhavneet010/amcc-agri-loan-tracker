// Renewals above ₹2,00,000 ask whether the branch is uploading charge details for revenue records.
export const CHARGE_THRESHOLD_PAISE = 20000000;
export const needsCharge = (category: string, amountPaise: number) =>
  category === 'renewal' && amountPaise > CHARGE_THRESHOLD_PAISE;
// Converts the rupee text typed in the form; returns 0 while the entry is incomplete.
export const amountToPaise = (amount: string) =>
  /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Math.round(Number(amount.trim()) * 100) : 0;

// 1600px on the long side keeps printed figures legible; the quality steps keep most photos near 300 KB.
const MAX_SIDE = 1600;
const TARGET_BYTES = 450 * 1024;
const LIMIT_BYTES = 1400 * 1024;

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers reject the options bag or the format; fall back to an image element.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This photo could not be compressed.'))),
      'image/jpeg',
      quality,
    ),
  );

export async function compressChargeImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo or image of the charge details.');
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('This image could not be opened. Take a photo or choose a JPEG or PNG image.');
  }
  let scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d')!;
    // A white base keeps transparent screenshots readable once flattened to JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.7, 0.6]) {
      const blob = await encode(canvas, quality);
      if (blob.size <= TARGET_BYTES || (quality === 0.6 && blob.size <= LIMIT_BYTES)) return blob;
    }
    scale *= 0.8;
  }
  throw new Error('This image is too large even after compression. Take a closer photo of the charge details.');
}
