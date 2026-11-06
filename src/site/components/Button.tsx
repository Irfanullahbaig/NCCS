import Link from "next/link";

type Variant = "primary" | "secondary" | "light" | "text";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
};

export function Button({ href, children, variant = "primary", className = "" }: Props) {
  return (
    <Link href={href} className={`btn btn-${variant} ${className}`.trim()}>
      {children}
    </Link>
  );
}
