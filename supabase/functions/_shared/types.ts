export interface Product {
  product_id: string;
  name: string;
  price: number;
  image_url?: string | null;
  images?: string[] | null;
}

export interface Address {
  address_id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  address_line1: string;
  address_line2?: string | null;
  postal_code: string;
  city: string;
  state: string;
  is_default: boolean;
}

export interface Order {
  id: string;
  user_id: string;
  address_id?: number | null;
  item_name: string;
  quantity: number;
  total_price: number;
  payment: "COD" | "Razorpay" | "Regular";
  type: string;
  status: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  delivery_provider?: string | null;
  waybill?: string | null;
  shipment_id?: string | null;
  delivery_status?: string | null;
  estimated_delivery_date?: string | null;
  courier_name?: string | null;
  tracking_url?: string | null;
  shipment_error?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
}

export interface OrderItem {
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  size?: string | null;
  color?: string | null;
  image_url?: string | null;
}

export interface ShipmentDetails {
  orderId: string;
  customerName: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2?: string;
  pincode: string;
  city: string;
  state: string;
  paymentMethod: "COD" | "Razorpay" | "Regular";
  amount: number;
  quantity: number;
}
