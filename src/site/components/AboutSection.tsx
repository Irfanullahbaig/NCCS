import Image from "next/image";
import { Button } from "@/site/components/Button";
import { SectionHeading } from "@/site/components/SectionHeading";
import { aboutImage } from "@/site/data/scenes";
import { site } from "@/site/data/site";

type Props = {
  titleAs?: "h1" | "h2";
};

export function AboutSection({ titleAs = "h2" }: Props) {
  return (
    <section className="section about rise" id="about">
      <div className="container about-grid">
        <div className="about-media media">
          <Image
            src={aboutImage.src}
            alt={aboutImage.alt}
            fill
            sizes="(min-width: 900px) 48vw, 100vw"
            style={{ objectPosition: aboutImage.focal }}
          />
        </div>
        <div className="about-copy">
          <SectionHeading
            stacked
            titleAs={titleAs}
            eyebrow="About NCCS"
            title="A place to learn, discover, and build the future."
          />
          <p>
            NCCS — National College of Commerce and Computer Science — was founded in {site.founded}{" "}
            in Gilgit, Gilgit-Baltistan.
          </p>
          <p>
            It is a community focused on helping students develop knowledge, confidence, practical
            skills, and a strong foundation for their future.
          </p>
          <div className="founded">
            <b>2018</b>
            <span>Founded in Gilgit</span>
          </div>
          <div className="actions">
            {titleAs === "h1" ? (
              <Button href="/contact">Contact NCCS</Button>
            ) : (
              <Button href="/about">Discover NCCS</Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
