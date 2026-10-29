import { putItem } from './db';
import { TABLES } from './db';

export interface InvoiceData {
  reference: string;
  userName: string;
  userEmail: string;
  amountZar: number;
  credits?: number;
  description: string;
  paidAt: string;
  userId: string;
}

const VAT_NUMBER = process.env.COMPANY_VAT_NUMBER || 'VAT REGISTRATION PENDING';
const COMPANY_NAME = 'Locus Dynamics (PTY) Ltd K2026515531 t/a Propreel';
const COMPANY_ADDRESS = 'South Africa · propreel.co.za · support@propreel.co.za';

/**
 * Generate a SA tax invoice PDF (pdfkit) and store it in S3. Returns the
 * public URL. Invoice failures must never block crediting — callers should
 * catch and log.
 */
export async function generateInvoicePdf(invoice: InvoiceData): Promise<string> {
  const PDFDocument = (await import('pdfkit')).default;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const zar = (n: number) => `R ${n.toFixed(2)}`;
  const invoiceNumber = `PR-${invoice.paidAt.slice(0, 10).replace(/-/g, '')}-${invoice.reference.slice(-8).toUpperCase()}`;

  // Header
  doc.fontSize(20).fillColor('#6b21a8').text('PropReel', { continued: false });
  doc.fontSize(9).fillColor('#555').text(COMPANY_NAME);
  doc.text(COMPANY_ADDRESS);
  doc.text(`VAT No: ${VAT_NUMBER}`);
  doc.moveDown(1.5);

  doc.fontSize(16).fillColor('#111').text('TAX INVOICE');
  doc.fontSize(9).fillColor('#555');
  doc.text(`Invoice No: ${invoiceNumber}`);
  doc.text(`Date: ${new Date(invoice.paidAt).toLocaleDateString('en-ZA')}`);
  doc.text(`Paystack Reference: ${invoice.reference}`);
  doc.moveDown(1);

  // Customer block
  doc.fontSize(10).fillColor('#111').text('Billed to:');
  doc.fontSize(10).fillColor('#333');
  doc.text(invoice.userName || invoice.userEmail);
  doc.text(invoice.userEmail);
  doc.moveDown(1.2);

  // Line items table
  const tableTop = doc.y;
  doc.rect(50, tableTop, 495, 24).fill('#f3e8ff');
  doc.fillColor('#111').fontSize(10)
    .text('Description', 60, tableTop + 8)
    .text('Qty', 380, tableTop + 8, { width: 40, align: 'right' })
    .text('Amount', 430, tableTop + 8, { width: 105, align: 'right' });
  doc.fillColor('#111').fontSize(10);
  const rowY = tableTop + 30;
  doc.text(invoice.description, 60, rowY, { width: 300 });
  doc.text(invoice.credits ? String(invoice.credits) : '1', 380, rowY, { width: 40, align: 'right' });
  doc.text(zar(invoice.amountZar), 430, rowY, { width: 105, align: 'right' });

  // Totals (amounts are VAT-inclusive per SA B2C convention)
  const vatPortion = invoice.amountZar * 15 / 115;
  const totalsY = rowY + 30;
  doc.fontSize(10).fillColor('#333');
  doc.text('Subtotal (VAT incl.)', 330, totalsY, { width: 130, align: 'right' });
  doc.text(zar(invoice.amountZar), 470, totalsY, { width: 65, align: 'right' });
  doc.text('VAT @ 15%', 330, totalsY + 16, { width: 130, align: 'right' });
  doc.text(zar(vatPortion), 470, totalsY + 16, { width: 65, align: 'right' });
  doc.fontSize(12).fillColor('#111').font('Helvetica-Bold');
  doc.text('Total Paid', 330, totalsY + 40, { width: 130, align: 'right' });
  doc.text(zar(invoice.amountZar), 470, totalsY + 40, { width: 65, align: 'right' });
  doc.font('Helvetica');

  // Footer
  doc.fontSize(8).fillColor('#777')
    .text('This invoice was generated electronically and is valid without signature.', 50, 760, { width: 495, align: 'center' });

  doc.end();
  const pdf = await done;

  const s3 = new S3Client({
    region: process.env.AWS_REGION || 'af-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
  const key = `invoices/${invoice.userId}/${invoiceNumber}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets',
    Key: key,
    Body: pdf,
    ContentType: 'application/pdf',
  }));

  const url = `https://${process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets'}.s3.${process.env.AWS_REGION || 'af-south-1'}.amazonaws.com/${key}`;

  // Record on the user for easy retrieval from Billing
  try {
    const { getUser, updateUser } = await import('./userService');
    const user = await getUser(invoice.userId);
    if (user) {
      const invoices = [...(user.invoices || []), { invoiceNumber, url, amountZar: invoice.amountZar, paidAt: invoice.paidAt, reference: invoice.reference }];
      await updateUser(invoice.userId, { invoices: invoices.slice(-24) });
    }
  } catch (e) {
    console.error('Invoice user-record write failed (non-fatal):', e);
  }

  return url;
}
