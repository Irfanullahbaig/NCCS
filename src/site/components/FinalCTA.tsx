import Image from "next/image";
import { Button } from "@/site/components/Button";
import { ctaImage } from "@/site/data/scenes";

export function FinalCTA() {
  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      <div className="final-cta-copy">
        <p className="eyebrow is-light">
          <span className="eyebrow-mark" aria-hidden="true" />
          NCCS Gilgit
        </p>
        <h2 id="final-cta-title">Be Part of the NCCS Community</h2>
        <p>
          Discover a learning environment designed to help students grow, explore opportunities, and
          build confidence for the future.
        </p>
        <div className="actions">
          <Button href="/contact">Contact NCCS</Button>
          <Button href="/admissions" variant="light">
            Admissions
          </Button>
        </div>
      </div>
      <div className="final-cta-media media">
        <Image
          src={ctaImage.src}
          alt={ctaImage.alt}
          fill
          sizes="(min-width: 900px) 48vw, 100vw"
          style={{ objectPosition: ctaImage.focal }}
        />
      </div>
    </section>
  );
}
