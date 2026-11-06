import Image from "next/image";
import { Button } from "@/site/components/Button";
import { HeroInquiry } from "@/site/components/HeroInquiry";
import { heroImage } from "@/site/data/scenes";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-bg">
        <Image
          src={heroImage.src}
          alt={heroImage.alt}
          fill
          priority
          sizes="100vw"
          style={{ objectPosition: heroImage.focal }}
        />
      </div>
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow is-light">
            <span className="eyebrow-mark" aria-hidden="true" />
            NCCS Gilgit
          </p>
          <h1 id="hero-title">Empowering Students to Learn, Grow &amp; Lead</h1>
          <p className="lede">
            NCCS is a growing educational community in Gilgit focused on creating meaningful learning
            experiences, developing confidence, and preparing students for a changing world.
          </p>
          <div className="hero-actions">
            <Button href="/#about">Explore NCCS</Button>
            <Button href="/contact" variant="light">
              Contact NCCS
            </Button>
          </div>
          <p className="hero-est">
            <span className="eyebrow-mark" aria-hidden="true" />
            Established 2018
          </p>
        </div>
        <HeroInquiry />
      </div>
    </section>
  );
}
