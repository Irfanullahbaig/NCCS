import type { Metadata } from "next";
import { AboutSection } from "@/site/components/AboutSection";
import { FinalCTA } from "@/site/components/FinalCTA";
import { LeadershipMessage } from "@/site/components/LeadershipMessage";
import { WhyNCCS } from "@/site/components/WhyNCCS";

export const metadata: Metadata = {
  title: "About",
  description:
    "NCCS — National College of Commerce and Computer Science was founded in 2018 in Gilgit, Gilgit-Baltistan.",
};

export default function AboutPage() {
  return (
    <>
      <AboutSection titleAs="h1" />
      <WhyNCCS />
      <LeadershipMessage />
      <FinalCTA />
    </>
  );
}
