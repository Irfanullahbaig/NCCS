type Props = {
  compact?: boolean;
  priority?: boolean;
};

export function Logo({ compact = false, priority = false }: Props) {
  return (
    <span className={`brand${compact ? " is-compact" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="brand-logo"
        src="/site/brand/nccs-logo.png"
        alt="NCCS"
        width={250}
        height={100}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
      {compact ? null : (
        <span className="brand-text">
          <small>National College of Commerce and Computer Science</small>
        </span>
      )}
    </span>
  );
}
