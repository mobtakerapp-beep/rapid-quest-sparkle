import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AR = "٠١٢٣٤٥٦٧٨٩";

/** Convert any number or string containing Western digits to Eastern-Arabic digits */
export const toAr = (n: number | string): string =>
  String(n).replace(/[0-9]/g, (d) => AR[Number(d)]);
