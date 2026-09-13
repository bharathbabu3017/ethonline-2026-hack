import path from 'node:path';

/**
 * Invoice storage.
 *
 * Files are held in the database, not on disk: the app runs on ephemeral
 * serverless filesystems where anything written locally disappears on the next
 * cold start. The user's original filename is kept for display only and never
 * used as a path, and files are served through an authenticated route rather
 * than statically.
 */

const MAX_BYTES = 10 * 1024 * 1024;

/** Extension is derived from the sniffed type, not from what the client claimed. */
const ACCEPTED: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

/** Leading bytes that actually identify each accepted format. */
const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] }, // \x89PNG
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export class InvalidUploadError extends Error {}

function sniff(buffer: Buffer): string | null {
  for (const { mime, bytes } of SIGNATURES) {
    if (bytes.every((b, i) => buffer[i] === b)) return mime;
  }
  return null;
}

export interface StoredInvoice {
  filename: string;
  /**
   * Prisma's Bytes is `ReturnType<Uint8Array['slice']>` — a Uint8Array backed by
   * a plain ArrayBuffer. A Buffer's view is wider than that, so slice() here
   * both narrows the type and detaches the bytes from Node's pooled memory.
   */
  data: ReturnType<Uint8Array['slice']>;
  mimeType: string;
  sizeBytes: number;
}

export async function storeInvoice(file: File): Promise<StoredInvoice> {
  if (file.size === 0) throw new InvalidUploadError('The invoice file is empty');
  if (file.size > MAX_BYTES) {
    throw new InvalidUploadError('Invoices must be 10MB or smaller');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Trust the bytes, not the Content-Type header or the extension. A file
  // claiming to be a PDF while containing something else is rejected here.
  const mimeType = sniff(buffer);
  if (!mimeType || !ACCEPTED[mimeType]) {
    throw new InvalidUploadError('Invoices must be a PDF, PNG, or JPEG');
  }

  return {
    // Display only. Stripped of any path components before it is stored, so a
    // name like "../../.env" cannot be used as one.
    filename: path.basename(file.name || 'invoice').slice(0, 200),
    data: new Uint8Array(buffer).slice(),
    mimeType,
    sizeBytes: buffer.byteLength,
  };
}
