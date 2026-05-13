export const CERT_THEMES = [
  {
    id: "gold",
    label: "ذهبي كلاسيك",
    bg1: "#fffbeb", bg2: "#fef3c7",
    border1: "#d97706", border2: "#f59e0b",
    title: "#92400e", body: "#78350f", name: "#451a03",
    accent: "#fbbf24",
  },
  {
    id: "violet",
    label: "بنفسجي فاخر",
    bg1: "#fdf4ff", bg2: "#eef2ff",
    border1: "#8b5cf6", border2: "#ec4899",
    title: "#7c3aed", body: "#374151", name: "#111827",
    accent: "#a78bfa",
  },
  {
    id: "emerald",
    label: "أخضر زمردي",
    bg1: "#ecfdf5", bg2: "#d1fae5",
    border1: "#059669", border2: "#10b981",
    title: "#065f46", body: "#047857", name: "#064e3b",
    accent: "#34d399",
  },
  {
    id: "rose",
    label: "وردي راقي",
    bg1: "#fff1f2", bg2: "#ffe4e6",
    border1: "#e11d48", border2: "#fb7185",
    title: "#9f1239", body: "#be123c", name: "#881337",
    accent: "#f43f5e",
  },
  {
    id: "ocean",
    label: "أزرق المحيط",
    bg1: "#eff6ff", bg2: "#dbeafe",
    border1: "#1d4ed8", border2: "#3b82f6",
    title: "#1e3a8a", body: "#1e40af", name: "#1e3a8a",
    accent: "#60a5fa",
  },
  {
    id: "teal",
    label: "فيروزي نقي",
    bg1: "#f0fdfa", bg2: "#ccfbf1",
    border1: "#0f766e", border2: "#14b8a6",
    title: "#134e4a", body: "#0f766e", name: "#042f2e",
    accent: "#2dd4bf",
  },
];

export const CERT_FONTS = [
  { label: "طجوال (عصري)", family: "Tajawal" },
  { label: "القاهرة (أنيق)", family: "Cairo" },
  { label: "أميري (كلاسيكي)", family: "Amiri" },
  { label: "ريدكس برو", family: "Readex Pro" },
  { label: "ليمونادا", family: "Lemonada" },
  { label: "خط كوفي", family: "Reem Kufi" },
];

export type CertTheme = (typeof CERT_THEMES)[number];
export type CertFont = (typeof CERT_FONTS)[number];

export function themeById(id: string): CertTheme {
  return CERT_THEMES.find((t) => t.id === id) ?? CERT_THEMES[0];
}

export function loadGoogleFont(family: string): Promise<void> {
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = href;
    document.head.appendChild(link);
  }
  return (document as any).fonts.load(`72px "${family}"`).catch(() => {});
}
