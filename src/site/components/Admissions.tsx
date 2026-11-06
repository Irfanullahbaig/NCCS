import { Button } from "@/site/components/Button";
import { SectionHeading } from "@/site/components/SectionHeading";
import { admissionSteps, admissionsIntro } from "@/site/data/admissions";

type Props = {
  titleAs?: "h1" | "h2";
};

export function Admissions({ titleAs = "h2" }: Props) {
  return (
    <section className="section admissions rise" id="admissions">
      <div className="container">
        <SectionHeading
          tone="light"
          titleAs={titleAs}
          title="Start Your Journey at NCCS"
          text={admissionsIntro}
        />
        <ol className="steps">
          {admissionSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="actions">
          <Button href="/contact?topic=admissions">Contact Admissions</Button>
        </div>
      </div>
    </section>
  );
}
