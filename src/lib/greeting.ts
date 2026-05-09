// Build the role label using gender + role + admin flag.
export type RoleType = "teacher" | "student" | "parent" | "supervisor" | string | null | undefined;
export type Gender = "male" | "female" | string | null | undefined;

export function roleLabelFor(role: RoleType, gender: Gender): string {
  const f = gender === "female";
  switch (role) {
    case "teacher": return f ? "أيتها المعلمة" : "أيها المعلم";
    case "student": return f ? "أيتها الطالبة" : "أيها الطالب";
    case "parent":  return f ? "أيتها وليّة الأمر" : "أيها ولي الأمر";
    case "supervisor": return f ? "أيتها المشرفة" : "أيها المشرف";
    default: return "";
  }
}

export function adminBadgeFor(gender: Gender): string {
  return "أدمن";
}
