import Image from "next/image";
import { Button } from "@/site/components/Button";
import { SectionHeading } from "@/site/components/SectionHeading";
import { faculty } from "@/site/data/faculty";

type Props = {
  titleAs?: "h1" | "h2";
  showCta?: boolean;
};

export function FacultySection({ titleAs = "h2", showCta = true }: Props) {
  return (
    <section className="section rise" id="faculty">
      <div className="container">
        <SectionHeading
          titleAs={titleAs}
          eyebrow="Our people"
          title="Meet the people behind NCCS."
          text="Teachers and staff will be introduced here with a photograph, name, role, and responsibility."
        />

        {faculty.length > 0 ? (
          <div className="faculty-grid">
            {faculty.map((person) => (
              <article className="person" key={person.id}>
                <div className="person-photo media">
                  <Image src={person.image} alt={person.alt} fill sizes="(min-width: 800px) 22vw, 50vw" />
                </div>
                <h3>{person.name}</h3>
                <p className="person-role">{person.role}</p>
                <p className="person-dept">{person.department}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>Faculty and staff profiles will be published here once NCCS confirms them.</p>
          </div>
        )}

        {showCta ? (
          <div className="actions">
            <Button href="/faculty">View Faculty &amp; Staff</Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
