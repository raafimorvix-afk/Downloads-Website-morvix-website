// Email-safe HTML (tables + inline styles: Gmail, Outlook and phones render it the same way).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Turns the plain template text into paragraphs; "Label: value" lines get a bold label. */
function bodyHtml(text: string) {
  return text.trim().split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").map((line) => {
      const m = line.match(/^([A-Za-z][A-Za-z .\-/]{1,30}):\s(.*)$/);
      const linked = (v: string) => esc(v).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f55e0">$1</a>');
      if (!m) return linked(line);
      const value = m[2].length > 80 ? linked(m[2]) : `<strong style="color:#0f172a">${linked(m[2])}</strong>`;
      return `<span style="color:#475569">${esc(m[1])}:</span> ${value}`;
    });
    return `<p style="margin:0 0 14px 0;line-height:1.55">${lines.join("<br>")}</p>`;
  }).join("");
}

function button(href: string, label: string, bg: string) {
  return `<td style="padding:4px"><a href="${esc(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px">${label}</a></td>`;
}

function frame(inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a">
<tr><td style="padding:20px 28px;border-bottom:1px solid #eef2f7"><span style="display:inline-block;background:#1f55e0;color:#fff;font-weight:700;border-radius:8px;padding:6px 10px">M</span>
<span style="font-weight:700;font-size:16px;margin-left:8px;vertical-align:middle">Morvix LLC</span></td></tr>
${inner}
</table>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;margin:14px 0 0">Morvix LLC · wearemorvix.com</p>
</td></tr></table></body></html>`;
}

/** Lead email: the team's template text + three one-click feedback buttons. */
export function leadEmailHtml(text: string, feedbackUrl: string) {
  return frame(`<tr><td style="padding:24px 28px 8px">${bodyHtml(text)}</td></tr>
<tr><td style="padding:8px 28px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
    <tr><td style="padding:16px 16px 6px;font-weight:700">After the visit, how did it go?</td></tr>
    <tr><td style="padding:0 16px 4px;color:#475569;font-size:13px">One click is enough, no login needed.</td></tr>
    <tr><td style="padding:8px 12px 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${button(`${feedbackUrl}?r=pass`, "&#10003; Interested", "#15803d")}
      ${button(`${feedbackUrl}?r=decline`, "&#10007; Not a fit", "#b91c1c")}
      ${button(`${feedbackUrl}?r=reschedule`, "&#8635; Reschedule", "#b45309")}
    </tr></table></td></tr>
  </table>
</td></tr>`);
}

/** Payment request: short note, amount, big Pay button (the PDF invoice is attached). */
export function paymentEmailHtml(opts: { greeting: string; intro: string; amount: string; invoiceNo: string; lines: string[]; payUrl: string; sender: string }) {
  const rows = opts.lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eef2f7;color:#334155;font-size:14px">${esc(l)}</td></tr>`).join("");
  return frame(`<tr><td style="padding:24px 28px 8px">
  <p style="margin:0 0 14px">${esc(opts.greeting)}</p>
  <p style="margin:0 0 18px;line-height:1.55">${esc(opts.intro)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
    <tr><td style="padding:16px 18px"><div style="color:#475569;font-size:13px">Invoice ${esc(opts.invoiceNo)}</div>
      <div style="font-size:28px;font-weight:700;margin-top:2px">${esc(opts.amount)}</div></td></tr>
    ${rows ? `<tr><td style="padding:0 18px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ""}
  </table>
  <p style="margin:22px 0;text-align:center"><a href="${esc(opts.payUrl)}" style="display:inline-block;background:#1f55e0;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px">Pay securely online</a></p>
  <p style="margin:0 0 14px;color:#475569;font-size:13px">The invoice is attached as a PDF. Card payments are processed by Stripe.</p>
  <p style="margin:0 0 24px">Thank you,<br>${esc(opts.sender)}<br>Morvix LLC</p>
</td></tr>`);
}
