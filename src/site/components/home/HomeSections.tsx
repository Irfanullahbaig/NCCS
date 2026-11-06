import Image from "next/image";
import Link from "next/link";
import { admissionsIntro, admissionSteps } from "@/site/data/admissions";
import { leadership } from "@/site/data/leadership";
import { formatNewsDate, news } from "@/site/data/news";
import { quickLinks } from "@/site/data/navigation";
import { site } from "@/site/data/site";
import { whyItems } from "@/site/data/why";
import {
  ArrowRight,
  BookIcon,
  CampusIcon,
  CapIcon,
  ChipIcon,
  LinkIcon,
  MapPinIcon,
  PeopleIcon,
  SparkIcon,
} from "@/site/components/home/icons";

// ---------------------------------------------------------------- Hero and highlight tiles

const highlights = [
  { title: "Student Life", text: "Learning together", href: "/facilities", image: "/site/images/students-hall.jpg", Icon: PeopleIcon },
  { title: "Admissions", text: "How to join NCCS", href: "/admissions", image: "/site/images/students-class.jpg", Icon: CapIcon },
  { title: "Facilities", text: "Spaces to learn", href: "/facilities", image: "/site/images/students-reading.jpg", Icon: CampusIcon },
  { title: "Faculty & Staff", text: "The people who teach", href: "/faculty", image: "/site/images/students-group.jpg", Icon: BookIcon },
];

export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-bg">
        <Image src="/site/images/classroom.jpg" alt="" fill priority sizes="100vw" />
      </div>
      <div className="home-hero-scrim" aria-hidden="true" />
      <div className="container home-hero-copy">
        <p className="home-kicker">
          {site.fullName} · Gilgit
        </p>
        <h1 id="home-hero-title">Empowering Students to Learn, Grow &amp; Lead</h1>
        <p className="home-hero-lede">
          A growing college community in Gilgit-Baltistan, focused on meaningful learning, confidence and
          practical skills for a changing world.
        </p>
        <div className="home-actions">
          <Link className="home-btn home-btn-red" href="/admissions">
            Apply for Admission
          </Link>
          <Link className="home-btn home-btn-ghost" href="/about">
            Discover NCCS
          </Link>
        </div>
      </div>

      <nav className="home-tiles" aria-label="Explore NCCS">
        {highlights.map(({ title, text, href, image, Icon }) => (
          <Link className="home-tile" href={href} key={title}>
            <Image src={image} alt="" fill sizes="(min-width: 900px) 25vw, 50vw" />
            <span className="home-tile-body">
              <Icon className="home-tile-icon" />
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}

// ---------------------------------------------------------------- About

export function HomeAbout() {
  return (
    <section className="home-about" id="about" aria-labelledby="home-about-title">
      <div className="container home-about-grid">
        <div>
          <h2 id="home-about-title">About Our College</h2>
          <p className="home-about-intro">
            NCCS — the {site.fullName} — was founded in {site.founded} in Gilgit, Gilgit-Baltistan.
          </p>
        </div>
        <div className="home-about-text">
          <p>
            It is a community focused on helping students develop knowledge, confidence, practical skills and a
            strong foundation for their future.
          </p>
          <p>
            Teachers and staff are committed to supporting students throughout their educational journey, in an
            environment that encourages confidence, leadership, creativity and personal growth.
          </p>
          <Link className="home-more" href="/about">
            Read More <ArrowRight />
          </Link>
        </div>
      </div>

      <div className="container">
        <div className="home-visit">
          <Image src="/site/images/peaks.jpg" alt="Mountain peaks of Gilgit-Baltistan" fill sizes="(min-width: 1200px) 1120px, 100vw" />
          <div className="home-visit-copy">
            <MapPinIcon className="home-visit-icon" />
            <h3>Visit NCCS in Gilgit</h3>
            <p>Come and see the college, meet the people who teach, and ask about the programme that suits you.</p>
            <Link className="home-btn home-btn-red" href="/contact">
              Plan a Visit
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Admission

export function HomeAdmission() {
  return (
    <section className="home-admission" aria-labelledby="home-admission-title">
      <div className="home-admission-media">
        <Image src="/site/images/students-group.jpg" alt="Students working together at a desk" fill sizes="(min-width: 900px) 50vw, 100vw" />
      </div>
      <div className="home-admission-panel">
        <h2 id="home-admission-title">Apply for Admission</h2>
        <p className="home-admission-note">Admission enquiries are welcome</p>
        <p>{admissionsIntro}</p>
        <ol className="home-steps">
          {admissionSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link className="home-btn home-btn-red" href="/admissions">
          Apply Now
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Why NCCS

const whyIcons = [PeopleIcon, BookIcon, ChipIcon, SparkIcon];

export function HomeWhy() {
  return (
    <section className="home-why" aria-labelledby="home-why-title">
      <div className="container">
        <h2 id="home-why-title" className="home-visually-hidden">
          Why NCCS
        </h2>
        <div className="home-why-grid">
          {whyItems.slice(0, 4).map((item, index) => {
            const Icon = whyIcons[index];
            return (
              <article key={item.title}>
                <Icon className="home-why-icon" />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <Link className="home-more is-small" href="/about">
                  Learn More <ArrowRight />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- News

export function HomeNews() {
  const stories = news.slice(0, 3);
  return (
    <section className="home-news" aria-labelledby="home-news-title">
      <div className="container">
        <div className="home-title-row">
          <h2 id="home-news-title">News &amp; Events</h2>
          <span className="home-title-line" aria-hidden="true" />
          <Link className="home-more is-small" href="/news">
            View All News <ArrowRight />
          </Link>
        </div>

        {stories.length > 0 ? (
          <div className="home-news-grid">
            {stories.map((story) => {
              const date = new Date(`${story.date}T00:00:00`);
              return (
                <article className="home-story" key={story.slug}>
                  <Link className="home-story-media" href={`/news/${story.slug}`} tabIndex={-1} aria-hidden="true">
                    <Image src={story.image} alt="" fill sizes="(min-width: 900px) 33vw, 100vw" />
                  </Link>
                  <div className="home-story-body">
                    <p className="home-date">
                      <strong>{String(date.getDate()).padStart(2, "0")}</strong>
                      <span>{date.toLocaleString("en-GB", { month: "short" })}</span>
                    </p>
                    <div>
                      <p className="home-story-meta">
                        {story.category} · <time dateTime={story.date}>{formatNewsDate(story.date)}</time>
                      </p>
                      <h3>
                        <Link href={`/news/${story.slug}`}>{story.title}</Link>
                      </h3>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="home-news-empty">
            <BookIcon className="home-news-empty-icon" />
            <p>Announcements and events from NCCS will be published here soon.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Apply strip

export function HomeApplyStrip() {
  return (
    <section className="home-strip" aria-label="Join NCCS">
      <div className="home-strip-message">
        <p className="home-strip-quote">“{leadership.heading}”</p>
        <p className="home-strip-meta">
          Founded {site.founded} · {site.locality}, {site.region}
        </p>
      </div>
      <Link className="home-strip-apply" href="/admissions">
        <CapIcon className="home-strip-icon" />
        <span>Apply to NCCS</span>
        <ArrowRight />
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------- Leadership, contact and quick links

export function HomeInfo() {
  const hasMessage = leadership.message.trim().length > 0;
  return (
    <section className="home-info" aria-label="More about NCCS">
      <div className="home-info-grid">
        <article className="home-info-card">
          <div className="home-info-photo">
            <Image src="/site/images/about-class.jpg" alt="Students studying together around a laptop" fill sizes="(min-width: 900px) 30vw, 100vw" />
          </div>
          <h2>{leadership.eyebrow}</h2>
          <p>{hasMessage ? leadership.message : "A message from the leadership of NCCS will be published here."}</p>
          {hasMessage && leadership.name ? (
            <p className="home-info-sign">
              <strong>{leadership.name}</strong>
              {leadership.role ? `, ${leadership.role}` : null}
            </p>
          ) : null}
          <Link className="home-btn home-btn-red" href="/about">
            About NCCS
          </Link>
        </article>

        <article className="home-info-card is-centered">
          <MapPinIcon className="home-info-icon" />
          <h2>Get in Touch</h2>
          <p className="home-info-sub">Questions about admission or study?</p>
          <p>
            Contact the NCCS office in {site.locality} and we will help students and families with the next step.
          </p>
          <Link className="home-btn home-btn-navy" href="/contact">
            Contact NCCS
          </Link>
        </article>

        <aside className="home-links" aria-labelledby="home-links-title">
          <Image src="/site/images/books.jpg" alt="" fill sizes="(min-width: 900px) 34vw, 100vw" />
          <div className="home-links-body">
            <h2 id="home-links-title">
              <LinkIcon className="home-links-icon" /> Quick Links
            </h2>
            <ul>
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
