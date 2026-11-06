import Image from "next/image";
import { SectionHeading } from "@/site/components/SectionHeading";
import { leadership } from "@/site/data/leadership";

export function LeadershipMessage() {
  const hasPortrait = leadership.portrait.trim().length > 0;
  const hasMessage = leadership.message.trim().length > 0;

  return (
    <section className="section band-white rise" id="leadership">
      <div className="container leadership-grid">
        {hasPortrait ? (
          <div className="portrait media">
            <Image src={leadership.portrait} alt={leadership.alt || "Leadership portrait"} fill sizes="(min-width: 900px) 40vw, 100vw" />
          </div>
        ) : (
          <div className="portrait-mark">
            <p className="eyebrow is-light">
              <span className="eyebrow-mark" aria-hidden="true" />
              Established 2018
            </p>
            <p className="portrait-word">NCCS</p>
            <p>Gilgit, Gilgit-Baltistan</p>
          </div>
        )}

        <div>
          <SectionHeading stacked tone="dark" eyebrow={leadership.eyebrow} title={leadership.heading} />
          {hasMessage ? (
            <blockquote className="quote">
              <p>{leadership.message}</p>
              {leadership.name ? (
                <footer>
                  <strong>{leadership.name}</strong>
                  {leadership.role ? <span>{leadership.role}</span> : null}
                </footer>
              ) : null}
            </blockquote>
          ) : (
            <p className="lede">A message from the leadership of NCCS will be published here.</p>
          )}
        </div>
      </div>
    </section>
  );
}
