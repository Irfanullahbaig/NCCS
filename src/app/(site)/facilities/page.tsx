import type { Metadata } from "next";
import { Facilities } from "@/site/components/Facilities";
import { SchoolLife } from "@/site/components/SchoolLife";

export const metadata: Metadata = {
  title: "Facilities",
  description:
    "NCCS is in Gilgit, Gilgit-Baltistan. Campus photographs will be added as the college documents its learning spaces.",
};

export default function FacilitiesPage() {
  return (
    <>
      <Facilities titleAs="h1" />
      <SchoolLife />
    </>
  );
}
