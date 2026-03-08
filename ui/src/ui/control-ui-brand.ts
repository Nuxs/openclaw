const DEFAULT_CONTROL_UI_PRODUCT_NAME = "OpenClaw";

export type ControlUiBrand = {
  productName: string;
  productTitle: string;
};

function coerceBrandString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeControlUiBrand(input?: Partial<ControlUiBrand>): ControlUiBrand {
  const productName = coerceBrandString(input?.productName) ?? DEFAULT_CONTROL_UI_PRODUCT_NAME;
  const productTitle = coerceBrandString(input?.productTitle) ?? productName;
  return { productName, productTitle };
}

export function readControlUiBrand(): ControlUiBrand {
  if (typeof document === "undefined") {
    return normalizeControlUiBrand();
  }
  return normalizeControlUiBrand({
    productName: document.documentElement.dataset.openclawProductName,
    productTitle: document.documentElement.dataset.openclawProductTitle,
  });
}

export function applyControlUiBrand(input?: Partial<ControlUiBrand>): ControlUiBrand {
  const brand = normalizeControlUiBrand(input);
  if (typeof document === "undefined") {
    return brand;
  }
  document.documentElement.dataset.openclawProductName = brand.productName;
  document.documentElement.dataset.openclawProductTitle = brand.productTitle;
  document.title = `${brand.productTitle} Control`;
  return brand;
}
