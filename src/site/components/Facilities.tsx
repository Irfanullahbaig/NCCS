import { PhotoMosaic } from "@/site/components/PhotoMosaic";
import { SectionHeading } from "@/site/components/SectionHeading";
import { facilities } from "@/site/data/scenes";

type Props = {
  titleAs?: "h1" | "h2";
};

export function Facilities({ titleAs = "h2" }: Props) {
  return (
    <section className="section rise" id="facilities">
      <div className="container-wide">
        <SectionHeading
          titleAs={titleAs}
          eyebrow="Our campus"
          title="Spaces designed for learning and growth."
          text="Classrooms, shared study, and time with teachers are at the center of the college day in Gilgit."
        />
        <PhotoMosaic items={facilities} />
      </div>
    </section>
  );
}
