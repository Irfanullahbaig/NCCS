import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Button } from "@/site/components/Button";
import { formatNewsDate, news } from "@/site/data/news";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return news.map((item) => ({ slug: item.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = news.find((item) => item.slug === slug);
  if (!story) return { title: "News" };
  return { title: story.title, description: story.excerpt };
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const story = news.find((item) => item.slug === slug);
  if (!story) notFound();

  return (
    <article className="section">
      <div className="container article">
        <p className="eyebrow">
          <span className="eyebrow-mark" aria-hidden="true" />
          {story.category}
        </p>
        <h1>{story.title}</h1>
        <p className="story-meta">
          <time dateTime={story.date}>{formatNewsDate(story.date)}</time>
        </p>
        <div className="article-media media">
          <Image src={story.image} alt={story.alt} fill priority sizes="(min-width: 800px) 760px, 100vw" />
        </div>
        {story.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="actions">
          <Button href="/news" variant="secondary">
            All News & Events
          </Button>
        </div>
      </div>
    </article>
  );
}
