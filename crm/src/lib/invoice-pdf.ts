import "server-only";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type InvoiceData = {
  number: string; date: string; dueDate: string; currency: string;
  billTo: { company: string; contact?: string | null; email?: string | null; phone?: string | null };
  items: { description: string; detail?: string; amount: number }[];
  total: number; payUrl: string; note?: string;
  from: { name: string; email: string; website: string };
};

const BRAND = rgb(0.122, 0.333, 0.878), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.4, 0.45, 0.53), LINE = rgb(0.89, 0.91, 0.94);
const money = (n: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n);
// standard PDF fonts only cover Latin-1: replace anything else (e.g. en dashes) so the PDF never breaks
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK, align: "left" | "right" = "left") {
  const t = safe(s);
  page.drawText(t, { x: align === "right" ? x - font.widthOfTextAtSize(t, size) : x, y, size, font, color });
}

function fit(s: string, font: PDFFont, size: number, max: number) {
  let t = safe(s);
  while (t.length > 3 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2);
  return t === safe(s) ? t : t.trimEnd() + "...";
}

/** A one-page (or multi-page) A4 invoice. The "Pay online" button is a real clickable link. */
export async function invoicePdf(d: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${d.number}`); pdf.setAuthor(d.from.name);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let page = pdf.addPage([W, H]);

  // header band
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: rgb(0.059, 0.106, 0.2) });
  page.drawRectangle({ x: M, y: H - 78, width: 34, height: 34, color: BRAND });
  text(page, "M", M + 10, H - 68, bold, 18, rgb(1, 1, 1));
  text(page, d.from.name, M + 46, H - 58, bold, 18, rgb(1, 1, 1));
  text(page, `${d.from.website}  ·  ${d.from.email}`, M + 46, H - 76, reg, 9, rgb(0.8, 0.84, 0.9));
  text(page, "INVOICE", W - M, H - 58, bold, 22, rgb(1, 1, 1), "right");
  text(page, d.number, W - M, H - 76, reg, 10, rgb(0.8, 0.84, 0.9), "right");

  // meta + bill to
  let y = H - 150;
  text(page, "BILL TO", M, y, bold, 9, MUTED);
  text(page, d.billTo.company, M, y - 16, bold, 13);
  [d.billTo.contact, d.billTo.email, d.billTo.phone].filter(Boolean).forEach((v, i) => text(page, String(v), M, y - 32 - i * 14, reg, 10, MUTED));
  const meta: [string, string][] = [["Invoice no.", d.number], ["Invoice date", d.date], ["Due date", d.dueDate], ["Currency", d.currency.toUpperCase()]];
  meta.forEach(([k, v], i) => { text(page, k, W - M - 150, y - i * 16, reg, 10, MUTED); text(page, v, W - M, y - i * 16, bold, 10, INK, "right"); });

  // items table
  y -= 100;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: rgb(0.96, 0.97, 0.99) });
    text(page, "DESCRIPTION", M + 10, y, bold, 9, MUTED); text(page, "AMOUNT", W - M - 10, y, bold, 9, MUTED, "right");
    y -= 30;
  };
  head();
  for (const it of d.items) {
    if (y < 190) { page = pdf.addPage([W, H]); y = H - M; head(); }
    text(page, fit(it.description, reg, 10.5, W - 2 * M - 140), M + 10, y, reg, 10.5);
    if (it.detail) text(page, fit(it.detail, reg, 9, W - 2 * M - 140), M + 10, y - 13, reg, 9, MUTED);
    text(page, money(it.amount, d.currency), W - M - 10, y, reg, 10.5, INK, "right");
    const rowBottom = y - (it.detail ? 22 : 10);
    page.drawLine({ start: { x: M, y: rowBottom }, end: { x: W - M, y: rowBottom }, thickness: 0.6, color: LINE });
    y = rowBottom - 20;
  }

  // total
  y -= 8;
  text(page, "Total due", W - M - 150, y, bold, 12); text(page, money(d.total, d.currency), W - M - 10, y, bold, 14, INK, "right");

  // pay button (clickable)
  y -= 50;
  const bw = 200, bh = 34, bx = M;
  page.drawRectangle({ x: bx, y, width: bw, height: bh, color: BRAND });
  text(page, "Pay online (card)", bx + 46, y + 12, bold, 12, rgb(1, 1, 1));
  const link = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [bx, y, bx + bw, y + bh], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(d.payUrl) } });
  page.node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(link)]));
  text(page, fit(d.payUrl, reg, 8, W - 2 * M - bw - 16), bx + bw + 14, y + 13, reg, 8, BRAND);

  if (d.note) text(page, fit(d.note, reg, 9.5, W - 2 * M), M, y - 28, reg, 9.5, MUTED);
  text(page, `Thank you for your business. Questions: ${d.from.email}`, M, 48, reg, 9, MUTED);
  return pdf.save();
}
