export const STATUSES = [
  "New – Needs QA", "QA Rejected", "QA Approved – Send to Client", "Sent to Client",
  "Rebook – Needs New Date", "Pass", "Decline", "Future Resale", "Opportunity (can't sell)", "Need to Sell",
] as const;

export const INVOICE_STATUSES = ["Not Invoiced", "Invoiced", "Paid", "Not Billable"] as const;

// order = urgency, same as the sheet's Tasks tab
export const ACTIONS = [
  { key: "Feedback OVERDUE", tone: "red" },
  { key: "Get visit feedback", tone: "amber" },
  { key: "Confirm visit with client", tone: "amber" },
  { key: "Get new date from client", tone: "amber" },
  { key: "QA this lead", tone: "blue" },
  { key: "Send to client", tone: "blue" },
  { key: "Pick the client", tone: "blue" },
  { key: "Add appointment date", tone: "blue" },
  { key: "Invoice client", tone: "green" },
  { key: "Chase payment", tone: "red" },
] as const;

export const TONE: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  slate: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function statusTone(s: string) {
  if (s === "Pass") return TONE.green;
  if (s === "Decline" || s === "QA Rejected") return TONE.red;
  if (s.startsWith("Rebook")) return TONE.amber;
  if (s.startsWith("New") || s.startsWith("QA Approved") || s === "Sent to Client") return TONE.blue;
  return TONE.slate;
}

export function actionTone(a: string) {
  return TONE[ACTIONS.find((x) => x.key === a)?.tone ?? "slate"];
}

export function monthStart(ym?: string) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  if (ym && /^\d{4}-\d{2}$/.test(ym)) return `${ym}-01`;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function lastMonths(n = 12) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
    };
  });
}

export const money = (n: number | string | null | undefined) =>
  "$" + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
