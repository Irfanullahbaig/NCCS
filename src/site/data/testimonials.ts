export type Testimonial = {
  id: string;
  quote: string;
  name: string;
  role: string;
};

/** Add a quote only when the person and the words are real. */
export const testimonials: Testimonial[] = [];
