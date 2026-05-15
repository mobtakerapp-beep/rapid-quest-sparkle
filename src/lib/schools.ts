export const SCHOOLS = ["خلوف", "حج", "مديرة", "فلعة العلم"] as const;
export type SchoolName = typeof SCHOOLS[number];
