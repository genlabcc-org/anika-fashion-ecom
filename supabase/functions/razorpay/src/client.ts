import crypto from "node:crypto";

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export class RazorpayClient {
  private keyId: string;
  private keySecret: string;

  constructor() {
    this.keyId = Deno.env.get("RAZORPAY_KEY_ID") || "";
    this.keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
  }

  hasKeysConfigured(): boolean {
    return !!(this.keyId && this.keySecret);
  }

  async createOrder(amountInPaise: number, receiptId: string, notes?: Record<string, string>): Promise<RazorpayOrderResult> {
    if (!this.hasKeysConfigured()) {
      throw new Error("Razorpay credentials are not configured in system environment variables");
    }

    const basicAuth = btoa(`${this.keyId}:${this.keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: receiptId,
        ...(notes ? { notes } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay order creation API failure: ${errorText}`);
    }

    return await response.json();
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!this.hasKeysConfigured()) {
      throw new Error("Razorpay credentials are not configured in system environment variables");
    }

    const hmac = crypto.createHmac("sha256", this.keySecret);
    hmac.update(`${orderId}|${paymentId}`);
    const generatedSignature = hmac.digest("hex");

    return generatedSignature === signature;
  }
}
