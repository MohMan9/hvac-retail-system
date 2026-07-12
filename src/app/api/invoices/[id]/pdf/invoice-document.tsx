import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

Font.register({
  family: "Roboto",
  src: `${process.cwd()}/public/fonts/Roboto-Regular.ttf`,
});

Font.register({
  family: "NotoNaskhArabic",
  src: `${process.cwd()}/public/fonts/NotoNaskhArabic-Regular.ttf`,
});

type InvoiceItem = {
  id: string;
  productNameEn: string;
  productNameAr: string | null;
  quantity: number | string;
  unit_price: number | string;
  line_discount: number | string | null;
  line_total: number | string;
};

type InvoiceService = {
  id: string;
  description: string;
  price: number | string;
};

export type InvoicePdfData = {
  organizationName: string;
  invoice_number: string;
  sale_date: string;
  customerName: string;
  subtotal: number | string;
  discount_total: number | string | null;
  vat_amount: number | string;
  total: number | string;
  items: InvoiceItem[];
  services: InvoiceService[];
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#111111",
  },
  arabic: {
    fontFamily: "NotoNaskhArabic",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
  },
  cell: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  heading: {
    fontSize: 13,
    marginBottom: 8,
    marginTop: 14,
  },
  tableHeader: {
    backgroundColor: "#f1f1f1",
    fontWeight: 700,
  },
  totals: {
    marginTop: 20,
    marginLeft: "auto",
    width: 180,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalFinal: {
    borderTopWidth: 1,
    borderTopColor: "#111111",
    marginTop: 4,
    paddingTop: 6,
    fontSize: 12,
  },
});

function money(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

export function InvoiceDocument({ invoice }: { invoice: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{invoice.organizationName}</Text>
          <Text>Invoice: {invoice.invoice_number}</Text>
          <Text>Date: {invoice.sale_date}</Text>
          <Text>Customer: {invoice.customerName}</Text>
        </View>

        <Text style={styles.heading}>Products</Text>
        <View>
          <View style={[styles.row, styles.tableHeader]}>
            <Text style={[styles.cell, { width: "36%" }]}>Item</Text>
            <Text style={[styles.cell, { width: "12%" }]}>Qty</Text>
            <Text style={[styles.cell, { width: "18%" }]}>Unit</Text>
            <Text style={[styles.cell, { width: "16%" }]}>Discount</Text>
            <Text style={[styles.cell, { width: "18%" }]}>Line Total</Text>
          </View>
          {invoice.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={[styles.cell, { width: "36%" }]}>
                <Text>{item.productNameEn}</Text>
                {item.productNameAr && <Text style={styles.arabic}>{item.productNameAr}</Text>}
              </View>
              <Text style={[styles.cell, { width: "12%" }]}>{item.quantity}</Text>
              <Text style={[styles.cell, { width: "18%" }]}>{money(item.unit_price)}</Text>
              <Text style={[styles.cell, { width: "16%" }]}>{money(item.line_discount)}</Text>
              <Text style={[styles.cell, { width: "18%" }]}>{money(item.line_total)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.heading}>Services</Text>
        <View>
          <View style={[styles.row, styles.tableHeader]}>
            <Text style={[styles.cell, { width: "75%" }]}>Description</Text>
            <Text style={[styles.cell, { width: "25%" }]}>Price</Text>
          </View>
          {invoice.services.map((service) => (
            <View key={service.id} style={styles.row}>
              <Text style={[styles.cell, { width: "75%" }]}>{service.description}</Text>
              <Text style={[styles.cell, { width: "25%" }]}>{money(service.price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{money(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>{money(invoice.discount_total)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT</Text>
            <Text>{money(invoice.vat_amount)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalFinal]}>
            <Text>Total</Text>
            <Text>{money(invoice.total)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
