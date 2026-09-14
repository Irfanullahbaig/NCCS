import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={cn("inline-flex shrink-0 items-center", className)} aria-label="NCCS home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nccs-logo-mark.png"
        alt="NCCS"
        width={180}
        height={88}
        className={cn("h-auto w-auto max-w-full object-contain", compact ? "h-8" : "h-10")}
      />
    </Link>
  );
}
