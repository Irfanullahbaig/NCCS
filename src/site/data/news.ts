export type NewsItem = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  /** ISO date, for example 2026-03-14 */
  date: string;
  image: string;
  alt: string;
  body: string[];
};

/**
 * Add a story only when it is a real NCCS event or announcement.
 * Example:
 * {
 *   slug: "orientation-day",
 *   title: "Orientation day",
 *   excerpt: "Short summary.",
 *   category: "Event",
 *   date: "2026-04-02",
 *   image: "/site/images/news/orientation.jpg",
 *   alt: "Students arriving for orientation at NCCS",
 *   body: ["First paragraph.", "Second paragraph."],
 * }
 */
export const news: NewsItem[] = [];

export function formatNewsDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
