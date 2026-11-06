import { SectionHeading } from "@/site/components/SectionHeading";
import { achievements } from "@/site/data/achievements";

export function Achievements() {
  if (achievements.length === 0) return null;

  return (
    <section className="section band-white rise" id="achievements">
      <div className="container">
        <SectionHeading eyebrow="Community" title="NCCS in Action" />
        <div className="record-list">
          {achievements.map((item) => (
            <article key={item.id}>
              {item.year ? <span>{item.year}</span> : null}
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
