import "server-only";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LOGO_PNG_BASE64 } from "@/lib/logo-data";

// Same layout as Morvix's Canva invoice: logo + MORVIX LLC header, purple accents, lavender boxes.
export type InvoiceData = {
  number: string; date: string; terms: string; currency: string;
  billTo: { company: string; contact?: string | null; email?: string | null };
  items: { lead: string; location?: string; frequency?: string; amount: number }[];
  total: number; payUrl: string;
  from: { name: string; email: string; website: string };
};

const PURPLE = rgb(0x74 / 255, 0x30 / 255, 0x89 / 255), LAV = rgb(0xf7 / 255, 0xf1 / 255, 0xf9 / 255), LAV_LINE = rgb(0xe5 / 255, 0xdd / 255, 0xe8 / 255);
const INK = rgb(0.13, 0.13, 0.15), GREY = rgb(0.42, 0.42, 0.46), RULE = rgb(0.8, 0.8, 0.82);
const money = (n: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n);
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function txt(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK, align: "left" | "right" = "left") {
  const t = safe(s);
  page.drawText(t, { x: align === "right" ? x - font.widthOfTextAtSize(t, size) : x, y, size, font, color });
}
function fit(s: string, font: PDFFont, size: number, max: number) {
  let t = safe(s);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 3 && font.widthOfTextAtSize(t + "...", size) > max) t = t.slice(0, -1);
  return t.trimEnd() + "...";
}

export async function invoicePdf(d: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${d.number}`); pdf.setAuthor(d.from.name); pdf.setCreator("Morvix CRM");
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));
  const W = 595.28, H = 841.89, M = 42, R = W - M;
  let page = pdf.addPage([W, H]);

  // header
  page.drawImage(logo, { x: M - 4, y: H - 112, width: 66, height: 66 });
  txt(page, d.from.name.toUpperCase(), R, H - 82, bold, 22, INK, "right");
  page.drawLine({ start: { x: M, y: H - 128 }, end: { x: R, y: H - 128 }, thickness: 0.8, color: INK });

  // title + total due
  txt(page, "INVOICE", M, H - 172, bold, 24);
  txt(page, "TOTAL DUE", 380, H - 160, bold, 7.5, GREY);
  txt(page, `${money(d.total, d.currency)} ${d.currency.toUpperCase()}`, R, H - 178, bold, 16, PURPLE, "right");

  // info boxes
  let y = H - 260;
  const bw = (R - M) / 3;
  page.drawRectangle({ x: M, y, width: R - M, height: 52, color: LAV, borderColor: LAV_LINE, borderWidth: 0.8 });
  for (let i = 1; i < 3; i++) page.drawLine({ start: { x: M + bw * i, y }, end: { x: M + bw * i, y: y + 52 }, thickness: 0.8, color: LAV_LINE });
  ([["INVOICE NUMBER", d.number], ["INVOICE DATE", d.date], ["PAYMENT TERMS", d.terms]] as const).forEach(([k, v], i) => {
    txt(page, k, M + bw * i + 6, y + 34, bold, 7, GREY);
    txt(page, v, M + bw * i + 6, y + 18, i === 2 ? reg : bold, i === 0 ? 8 : 9);
  });

  // from / bill to
  y -= 30;
  txt(page, "FROM", M, y, bold, 8, PURPLE); txt(page, "BILL TO", 285, y, bold, 8, PURPLE);
  txt(page, d.from.name, M, y - 15, bold, 9.5); txt(page, fit(d.billTo.company, bold, 9.5, R - 285), 285, y - 15, bold, 9.5);
  txt(page, `${d.from.email} · ${d.from.website}`, M, y - 28, reg, 8, GREY);
  [d.billTo.contact, d.billTo.email].filter(Boolean).forEach((v, i) => txt(page, fit(String(v), reg, 8, R - 285), 285, y - 28 - i * 12, reg, 8, GREY));

  // lead details box
  y -= 80;
  txt(page, "LEAD DETAILS", M, y, bold, 8, PURPLE);
  y -= 12;
  const ldH = 10 + d.items.length * 20;
  const ensure = (need: number) => { if (y - need < 120) { page = pdf.addPage([W, H]); y = H - M; } };
  ensure(ldH);
  page.drawRectangle({ x: M + 2, y: y - ldH, width: R - M - 2, height: ldH, color: LAV, borderColor: LAV_LINE, borderWidth: 0.8 });
  page.drawLine({ start: { x: 300, y: y - ldH }, end: { x: 300, y }, thickness: 0.8, color: LAV_LINE });
  page.drawLine({ start: { x: 460, y: y - ldH }, end: { x: 460, y }, thickness: 0.8, color: LAV_LINE });
  d.items.forEach((it, i) => {
    const ry = y - 18 - i * 20;
    txt(page, fit(it.lead, bold, 8.5, 240), M + 14, ry, bold, 8.5, GREY);
    if (it.location) txt(page, fit(it.location, reg, 8, 150), 308, ry, reg, 8, GREY);
    txt(page, "1", 470, ry, reg, 8, GREY);
  });
  y -= ldH + 24;

  // description table
  ensure(60);
  page.drawRectangle({ x: M + 2, y: y - 22, width: R - M - 2, height: 30, color: LAV });
  txt(page, "DESCRIPTION", M + 12, y - 10, bold, 7.5, GREY); txt(page, "FREQUENCY", 330, y - 10, bold, 7.5, GREY);
  txt(page, "QTY", 438, y - 10, bold, 7.5, GREY); txt(page, "AMOUNT", R - 12, y - 10, bold, 7.5, GREY, "right");
  y -= 42;
  for (const it of d.items) {
    ensure(24);
    txt(page, fit(`Qualified lead - ${it.lead}`, reg, 8.5, 270), M + 12, y, reg, 8.5);
    if (it.frequency) txt(page, fit(it.frequency, reg, 8, 95), 330, y, reg, 8, GREY);
    txt(page, "1", 442, y, reg, 8.5);
    txt(page, money(it.amount, d.currency), R - 12, y, reg, 8.5, INK, "right");
    y -= 16;
  }
  page.drawLine({ start: { x: M + 2, y: y + 6 }, end: { x: R - 70, y: y + 6 }, thickness: 0.5, color: RULE });

  // totals
  ensure(90);
  y -= 22;
  txt(page, "Subtotal", 300, y, reg, 9); txt(page, money(d.total, d.currency), R - 12, y, reg, 9, INK, "right");
  y -= 14;
  page.drawLine({ start: { x: 292, y }, end: { x: R, y }, thickness: 1.2, color: PURPLE });
  y -= 22;
  txt(page, "TOTAL DUE", 300, y, bold, 10);
  txt(page, `${money(d.total, d.currency)} ${d.currency.toUpperCase()}`, R - 6, y - 2, bold, 15, PURPLE, "right");

  // pay online button (clickable)
  if (d.payUrl) {
    const bx = 292, by = y - 52, bwid = R - 292, bh = 30;
    page.drawRectangle({ x: bx, y: by, width: bwid, height: bh, color: PURPLE });
    const label = "Pay online by card";
    txt(page, label, bx + (bwid - bold.widthOfTextAtSize(label, 11)) / 2, by + 10, bold, 11, rgb(1, 1, 1));
    const link = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [bx, by, bx + bwid, by + bh], Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(d.payUrl) } });
    page.node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(link)]));
    y = by;
  }

  // footer
  y -= 40;
  page.drawLine({ start: { x: M - 6, y: y + 14 }, end: { x: 455, y: y + 14 }, thickness: 0.5, color: RULE });
  txt(page, "Thank you for your business.", M - 6, y, bold, 9);
  txt(page, `Payment is due upon receipt. Please contact ${d.from.name} if you have any questions about this invoice.`, M - 6, y - 16, reg, 8, GREY);
  return pdf.save();
}
