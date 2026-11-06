import type { Metadata } from "next";
import { Admissions } from "@/site/components/Admissions";
import { ContactSection } from "@/site/components/ContactSection";

export const metadata: Metadata = {
  title: "Admissions",
  description:
    "Start your journey at NCCS Gilgit. Get in touch, visit the college, and complete admission with the office.",
};

export default function AdmissionsPage() {
  return (
    <>
      <Admissions titleAs="h1" />
      <ContactSection defaultSubject="Admission enquiry" />
    </>
  );
}
