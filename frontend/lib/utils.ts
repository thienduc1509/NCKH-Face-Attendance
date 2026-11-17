import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateVN(dateStr?: string | null): string {
  if (!dateStr) return "";
  const raw = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  const parts = raw.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}
