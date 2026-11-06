import Image from "next/image";
import { Button } from "@/site/components/Button";
import { SectionHeading } from "@/site/components/SectionHeading";
import { formatNewsDate, news } from "@/site/data/news";

type Props = {
  titleAs?: "h1" | "h2";
  limit?: number;
};

export function NewsSection({ titleAs = "h2", limit }: Props) {
  const stories = typeof limit === "number" ? news.slice(0, limit) : news;

  return (
    <section className="section rise" id="news">
      <div className="container">
        <SectionHeading
          titleAs={titleAs}
          eyebrow="NCCS updates"
          title="News & Events"
          text="Announcements and events from the college will be published here."
        />

        {stories.length > 0 ? (
          <div className="news-grid">
            {stories.map((story) => (
              <article className="story" key={story.slug}>
                <div className="story-media media">
                  <Image src={story.image} alt={story.alt} fill sizes="(min-width: 900px) 30vw, 100vw" />
                </div>
                <p className="story-meta">
                  <span>{story.category}</span>
                  <time dateTime={story.date}>{formatNewsDate(story.date)}</time>
                </p>
                <h3>{story.title}</h3>
                <p>{story.excerpt}</p>
                <Button href={`/news/${story.slug}`} variant="text">
                  Read More
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>News and events from NCCS will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
