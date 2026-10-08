// supabase/functions/send-order-email/index.ts
import { handleCorsPreflight, corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = "anikafashionstorengl@gmail.com";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

    try {
      const body = await req.json();
      const {
        adminEmail = ADMIN_EMAIL,
        orderId = "N/A",
        customerName = "Customer",
        customerEmail = "N/A",
        customerPhone = "N/A",
        paymentMethod = "COD",
        address = "N/A",
        skuId = "N/A",
        category = "N/A",
        itemsListFormatted = "N/A",
        totalPrice = 0,
        subtotal = 0,
        discount = 0,
        shippingFee = 0,
      } = body;

      const safeCustomerName = (typeof customerName === "string" && customerName.trim()) || "Customer";
      const safeCustomerEmail = (typeof customerEmail === "string" && customerEmail.trim()) || "N/A";
      const safeCustomerPhone = (typeof customerPhone === "string" && customerPhone.trim()) || "N/A";

      const payload = {
        _subject: `[Anika Fashion] Order Notification #${orderId || 'N/A'}`,
        _template: "table",
        _captcha: "false",
        "Order Number": orderId ? `#${orderId}` : "N/A",
        "Payment Method": String(paymentMethod || "COD"),
        "Customer Name": safeCustomerName,
        "Customer Email": safeCustomerEmail,
        "Customer Phone": safeCustomerPhone,
        "Shipping Address": String(address || "N/A"),
        "SKU": String(skuId || "N/A"),
        "Category": String(category || "N/A"),
        "Order Breakdown": String(itemsListFormatted || "N/A"),
        "Subtotal": subtotal != null ? `₹${Number(subtotal).toLocaleString('en-IN')}` : '₹0',
        "Discount": discount > 0 ? `-₹${Number(discount).toLocaleString('en-IN')}` : '₹0',
        "Shipping": shippingFee > 0 ? `₹${Number(shippingFee).toLocaleString('en-IN')}` : 'Free',
        "Total Amount": totalPrice != null ? `₹${Number(totalPrice).toLocaleString('en-IN')}` : '₹0',
      };

      const res = await fetch(`https://formsubmit.co/ajax/${adminEmail}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => ({}));

      return new Response(
        JSON.stringify({ success: res.ok, recipient: adminEmail, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
  }
});
