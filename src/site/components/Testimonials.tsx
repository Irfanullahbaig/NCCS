import { SectionHeading } from "@/site/components/SectionHeading";
import { testimonials } from "@/site/data/testimonials";

export function Testimonials() {
  if (testimonials.length === 0) return null;

  return (
    <section className="section rise" id="testimonials">
      <div className="container">
        <SectionHeading eyebrow="Community" title="What Our Community Says" />
        <div className="quote-list">
          {testimonials.map((item) => (
            <blockquote key={item.id}>
              <p>{item.quote}</p>
              <footer>
                <strong>{item.name}</strong>
                <span>{item.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
