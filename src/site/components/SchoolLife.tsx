import Image from "next/image";
import { SectionHeading } from "@/site/components/SectionHeading";
import { schoolLife } from "@/site/data/scenes";

type Props = {
  titleAs?: "h1" | "h2";
};

export function SchoolLife({ titleAs = "h2" }: Props) {
  return (
    <section className="section band-white rise" id="life">
      <div className="container-wide">
        <SectionHeading
          titleAs={titleAs}
          eyebrow="Student experience"
          title="Life at NCCS"
          text="Life at NCCS is time in class, working with classmates, and the ordinary rhythm of a college day."
        />
        <div className="life-grid">
          {schoolLife.map((item) => (
            <figure key={item.id}>
              <div className="media">
                <Image
                  src={item.image}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 900px) 32vw, 100vw"
                  style={{ objectPosition: item.focal ?? "center" }}
                />
              </div>
              <figcaption>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
