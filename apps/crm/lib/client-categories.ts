export const CLIENT_CATEGORY_VALUES = ["hamburgueria", "distribuidor", "parceiros", "outros"] as const;

export type ClientCategoryValue = (typeof CLIENT_CATEGORY_VALUES)[number];

export function isClientCategoryValue(v: string): v is ClientCategoryValue {
  return (CLIENT_CATEGORY_VALUES as readonly string[]).includes(v);
}
