export interface PosVariant {
  id: string;
  sku: string;
  label: string;
  sellMode: "WEIGHT" | "UNIT";
  unitCode: string;
  allowsDecimal: boolean;
  price: string | null;
  stock: string;
  trackStock: boolean;
  barcodes: string[];
  search: string;
}

export interface PosProduct {
  id: string;
  name: string;
  altName: string;
  categoryId: string;
  imageUrl: string | null;
  taxable: boolean;
  variants: PosVariant[];
  search: string;
}

export interface PosCategory {
  id: string;
  name: string;
  color: string | null;
}

export interface PosSettings {
  rate: string;
  lbpRounding: number;
  lbpMode: "NEAREST" | "UP" | "DOWN";
  taxEnabled: boolean;
  taxRate: string;
  taxInclusive: boolean;
  taxLabel: string;
  cashierMaxDiscount: string;
  requirePinForVoid: boolean;
  allowNegativeStock: boolean;
  autoPrint: boolean;
  printMode: "BROWSER" | "BRIDGE";
  printBridgeUrl: string | null;
  storeName: string;
  logoUrl: string | null;
}

export interface CartLine {
  key: string;
  variantId: string;
  productId: string;
  quantity: string;
  discountType: "PERCENT" | "AMOUNT" | null;
  discountValue: string | null;
  priceOverride: string | null;
}

export interface Cart {
  lines: CartLine[];
  cartDiscount: { type: "PERCENT" | "AMOUNT"; value: string } | null;
  note: string;
}

export const emptyCart = (): Cart => ({ lines: [], cartDiscount: null, note: "" });
