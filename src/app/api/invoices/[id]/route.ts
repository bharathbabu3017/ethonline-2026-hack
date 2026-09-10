import { readFile } from 'node:fs/promises';
import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { resolveInvoicePath } from '@/lib/invoices';

/**
 * Serve an invoice to members of the org that owns it.
 *
 * Invoices are never exposed as static files — guessing a UUID must not be
 * enough to read another company's paperwork, so every fetch re-checks that the
 * caller belongs to the owning org.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { org } = await requireMember(request);
    const { id } = await params;

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { request: { select: { orgId: true } } },
    });

    // Same response whether it is missing or someone else's, so this cannot be
    // used to probe which invoice IDs exist.
    if (!invoice || invoice.request.orgId !== org.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const file = await readFile(resolveInvoicePath(invoice.storagePath));

    return new Response(new Uint8Array(file), {
      headers: {
        'content-type': invoice.mimeType,
        // inline so PDFs preview in the browser; the filename is quoted and
        // stripped of quotes to keep the header well-formed.
        'content-disposition': `inline; filename="${invoice.filename.replace(/"/g, '')}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/invoices GET]') ??
      Response.json({ error: 'Could not read invoice' }, { status: 500 })
    );
  }
}
