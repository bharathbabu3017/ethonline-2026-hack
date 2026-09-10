import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Invoice storage.
 *
 * Files land under uploads/<orgId>/, named by a generated UUID. The user's
 * original filename is kept in the database for display but never touches the
 * filesystem — that is what stops a name like "../../.env" escaping the
 * directory. Files are served through an authenticated route, never statically.
 */

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
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
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export async function storeInvoice(file: File, orgId: string): Promise<StoredInvoice> {
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

  const directory = path.join(UPLOAD_ROOT, orgId);
  await mkdir(directory, { recursive: true });

  const storedName = `${randomUUID()}${ACCEPTED[mimeType]}`;
  await writeFile(path.join(directory, storedName), buffer);

  return {
    // Display only. Stripped of any path components before it is stored.
    filename: path.basename(file.name || 'invoice').slice(0, 200),
    storagePath: path.join(orgId, storedName),
    mimeType,
    sizeBytes: buffer.byteLength,
  };
}

/**
 * Absolute path for a stored invoice, refusing anything that escapes the
 * upload root even if a bad value reached the database.
 */
export function resolveInvoicePath(storagePath: string): string {
  const resolved = path.resolve(UPLOAD_ROOT, storagePath);
  if (resolved !== UPLOAD_ROOT && !resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new InvalidUploadError('Invalid invoice path');
  }
  return resolved;
}
