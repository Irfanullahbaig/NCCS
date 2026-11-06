import { AboutSection } from "@/site/components/AboutSection";
import { Achievements } from "@/site/components/Achievements";
import { Admissions } from "@/site/components/Admissions";
import { ContactSection } from "@/site/components/ContactSection";
import { Facilities } from "@/site/components/Facilities";
import { FacultySection } from "@/site/components/FacultySection";
import { FinalCTA } from "@/site/components/FinalCTA";
import { Hero } from "@/site/components/Hero";
import { LeadershipMessage } from "@/site/components/LeadershipMessage";
import { NewsSection } from "@/site/components/NewsSection";
import { SchoolLife } from "@/site/components/SchoolLife";
import { Statistics } from "@/site/components/Statistics";
import { Testimonials } from "@/site/components/Testimonials";
import { WhyNCCS } from "@/site/components/WhyNCCS";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Statistics />
      <AboutSection />
      <WhyNCCS />
      <Facilities />
      <SchoolLife />
      <FacultySection />
      <LeadershipMessage />
      <Admissions />
      <NewsSection limit={3} />
      <Achievements />
      <Testimonials />
      <FinalCTA />
      <ContactSection />
    </>
  );
}
