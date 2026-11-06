import type { Metadata } from "next";
import { FacultySection } from "@/site/components/FacultySection";
import { FinalCTA } from "@/site/components/FinalCTA";
import { LeadershipMessage } from "@/site/components/LeadershipMessage";

export const metadata: Metadata = {
  title: "Faculty & Staff",
  description: "Meet the people behind NCCS, National College of Commerce and Computer Science, Gilgit.",
};

export default function FacultyPage() {
  return (
    <>
      <FacultySection titleAs="h1" showCta={false} />
      <LeadershipMessage />
      <FinalCTA />
    </>
  );
}
