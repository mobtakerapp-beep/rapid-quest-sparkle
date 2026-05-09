// Build the role label using gender + role + admin flag.
export type RoleType = "teacher" | "student" | "parent" | "supervisor" | string | null | undefined;
export type Gender = "male" | "female" | string | null | undefined;

export function roleLabelFor(role: RoleType, gender: Gender): string {
  const f = gender === "female";
  switch (role) {
    case "admin": return f ? "أيتها المشرفة العامة" : "أيها المشرف العام";
    case "supervisor": return f ? "أيتها المشرفة" : "أيها المشرف";
    case "teacher": return f ? "أيتها المعلمة" : "أيها المعلم";
    case "student": return f ? "أيتها الطالبة" : "أيها الطالب";
    case "parent":  return f ? "أيتها وليّة الأمر" : "أيها ولي الأمر";
    default: return "";
  }
}

export function adminBadgeFor(gender: Gender): string {
  return "أدمن";
}
