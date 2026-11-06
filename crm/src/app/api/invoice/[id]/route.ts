import { buildInvoice } from "@/lib/invoice";

// Download a payment link's invoice. Only signed-in managers/owners of that shift get a PDF (database rules).
export async function GET(_req: Request, ctx: RouteContext<"/api/invoice/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const inv = await buildInvoice(id);
  if (!inv) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(inv.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
