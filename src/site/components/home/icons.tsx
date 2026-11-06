/** Simple line icons drawn for the NCCS home page. They inherit the text colour. */

type IconProps = { className?: string };

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CampusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 18 24 8l18 10" />
      <path d="M9 18h30" />
      <path d="M12 22v14M20 22v14M28 22v14M36 22v14" />
      <path d="M7 40h34" />
    </Svg>
  );
}

export function CapIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m4 18 20-9 20 9-20 9-20-9Z" />
      <path d="M12 22v9c0 3 5.4 6 12 6s12-3 12-6v-9" />
      <path d="M40 20v11" />
    </Svg>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M24 13c-4-3-10-4-17-3v26c7-1 13 0 17 3 4-3 10-4 17-3V10c-7-1-13 0-17 3Z" />
      <path d="M24 13v26" />
    </Svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="17" cy="17" r="6" />
      <circle cx="33" cy="19" r="5" />
      <path d="M6 38c0-6 5-10 11-10s11 4 11 10" />
      <path d="M28 30c1.5-1 3.2-1.5 5-1.5 5 0 9 3.5 9 9" />
    </Svg>
  );
}

export function ChipIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="13" y="13" width="22" height="22" rx="3" />
      <rect x="19" y="19" width="10" height="10" />
      <path d="M19 6v7M29 6v7M19 35v7M29 35v7M6 19h7M6 29h7M35 19h7M35 29h7" />
    </Svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M24 6v8M24 34v8M6 24h8M34 24h8" />
      <path d="m24 16 3 5 5 3-5 3-3 5-3-5-5-3 5-3 3-5Z" />
    </Svg>
  );
}

export function MapPinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M24 42s13-12.5 13-23a13 13 0 0 0-26 0c0 10.5 13 23 13 23Z" />
      <circle cx="24" cy="19" r="5" />
    </Svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 28 28 20" />
      <path d="M22 14l3-3a8 8 0 0 1 12 12l-3 3" />
      <path d="M26 34l-3 3a8 8 0 0 1-12-12l3-3" />
    </Svg>
  );
}

export function ArrowRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 10h13M11 5l5 5-5 5" />
    </svg>
  );
}
