import Link from "next/link";
import { BRAND_LOGO } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/dashboard",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={cn("inline-flex shrink-0 items-center", className)} aria-label="NCCS home" suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_LOGO.src}
        alt={BRAND_LOGO.alt}
        width={BRAND_LOGO.width}
        height={BRAND_LOGO.height}
        className={cn("h-auto w-auto max-w-full object-contain", compact ? "h-8" : "h-10")}
      />
    </Link>
  );
}
