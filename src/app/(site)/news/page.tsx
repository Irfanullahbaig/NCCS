import type { Metadata } from "next";
import { NewsSection } from "@/site/components/NewsSection";

export const metadata: Metadata = {
  title: "News & Events",
  description: "News and events from NCCS — National College of Commerce and Computer Science, Gilgit.",
};

export default function NewsPage() {
  return <NewsSection titleAs="h1" />;
}
