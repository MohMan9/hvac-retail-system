import { pdf } from "@react-pdf/renderer";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDocument } from "./invoice-document";

type RouteProps = {
  params: Promise<{ id: string }>;
};

async function streamToUint8Array(stream: NodeJS.ReadableStream) {
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile) {
      return Response.json({ error: "No profile found for this account" }, { status: 401 });
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, customer_id, sale_date, subtotal, discount_total, vat_amount, total"
      )
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!invoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    const { data: organization } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .single();

    const { data: customer } = invoice.customer_id
      ? await supabase.from("customers").select("name").eq("id", invoice.customer_id).single()
      : { data: null };

    const { data: items } = await supabase
      .from("invoice_items")
      .select("id, product_id, quantity, unit_price, line_discount, line_total")
      .eq("invoice_id", invoice.id)
      .order("id");

    const { data: invoiceServices } = await supabase
      .from("invoice_services")
      .select("id, description, price")
      .eq("invoice_id", invoice.id)
      .order("id");

    const productIds = [...new Set((items ?? []).map((item) => item.product_id))];
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, name_ar, name_en").in("id", productIds)
      : { data: [] };

    const productById = new Map((products ?? []).map((product) => [product.id, product]));

    const document = React.createElement(InvoiceDocument, {
      invoice: {
        organizationName: organization?.name ?? "HVAC Retail",
        invoice_number: invoice.invoice_number,
        sale_date: invoice.sale_date,
        customerName: customer?.name ?? "Walk-in",
        subtotal: invoice.subtotal,
        discount_total: invoice.discount_total,
        vat_amount: invoice.vat_amount,
        total: invoice.total,
        items: (items ?? []).map((item) => {
          const product = productById.get(item.product_id);

          return {
            id: item.id,
            productNameEn: product?.name_en ?? product?.name_ar ?? "Product",
            productNameAr: product?.name_ar ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_discount: item.line_discount,
            line_total: item.line_total,
          };
        }),
        services: invoiceServices ?? [],
      },
    }) as Parameters<typeof pdf>[0];

    const stream = await pdf(document).toBuffer();
    const buffer = await streamToUint8Array(stream);
    const filename = `invoice-${invoice.invoice_number}.pdf`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(
      "[invoice pdf] failed to generate PDF:",
      error instanceof Error ? error.message : error,
      error instanceof Error ? error.stack : undefined
    );

    return Response.json({ error: "Failed to generate invoice PDF" }, { status: 500 });
  }
}
