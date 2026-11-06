type Props = {
  eyebrow?: string;
  title: string;
  text?: string;
  titleAs?: "h1" | "h2";
  stacked?: boolean;
  tone?: "light" | "dark";
};

export function SectionHeading({
  eyebrow,
  title,
  text,
  titleAs = "h2",
  stacked = false,
  tone = "dark",
}: Props) {
  const Title = titleAs;

  return (
    <div className={`section-heading${stacked ? " is-stacked" : ""}${tone === "light" ? " is-light" : ""}`}>
      {eyebrow ? (
        <p className="eyebrow">
          <span className="eyebrow-mark" aria-hidden="true" />
          {eyebrow}
        </p>
      ) : null}
      <Title>{title}</Title>
      {text ? <p className="lede">{text}</p> : null}
    </div>
  );
}
