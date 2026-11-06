import type { Metadata } from "next";
import { ContactSection } from "@/site/components/ContactSection";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Visit or contact NCCS — National College of Commerce and Computer Science, Gilgit, Gilgit-Baltistan, Pakistan.",
};

type Props = {
  searchParams: Promise<{ topic?: string }>;
};

export default async function ContactPage({ searchParams }: Props) {
  const params = await searchParams;
  const subject = params.topic === "admissions" ? "Admission enquiry" : "";

  return <ContactSection key={subject || "general"} titleAs="h1" defaultSubject={subject} />;
}
