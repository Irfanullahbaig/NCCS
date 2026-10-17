import { Badge } from "@/components/ui";
import { FEE_STATUS_LABELS, FEE_STATUS_STYLES, STUDENT_TYPE_LABELS } from "@/lib/constants";

export function FeeBadge({ status }: { status: string }) {
  return <Badge className={FEE_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"}>{FEE_STATUS_LABELS[status as keyof typeof FEE_STATUS_LABELS] ?? status}</Badge>;
}

export function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    SELF: "bg-slate-100 text-slate-700 ring-slate-500/20",
    SCHOLARSHIP: "bg-sky-50 text-sky-700 ring-sky-600/20",
    NEED_BASED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };
  return <Badge className={styles[type] ?? "bg-slate-100 text-slate-700"}>{STUDENT_TYPE_LABELS[type as keyof typeof STUDENT_TYPE_LABELS] ?? type}</Badge>;
}
