import { SectionHeading } from "@/site/components/SectionHeading";
import { whyIntro, whyItems } from "@/site/data/why";

export function WhyNCCS() {
  return (
    <section className="section band-white rise" id="why">
      <div className="container">
        <SectionHeading eyebrow="The college" title="Why NCCS" text={whyIntro} />
        <div className="why-grid">
          {whyItems.map((item, index) => (
            <article className="why-item" key={item.title}>
              <span className="why-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
