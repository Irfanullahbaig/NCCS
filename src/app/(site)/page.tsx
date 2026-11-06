import {
  HomeAbout,
  HomeAdmission,
  HomeApplyStrip,
  HomeHero,
  HomeInfo,
  HomeNews,
  HomeWhy,
} from "@/site/components/home/HomeSections";
import "./home.css";

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeAbout />
      <HomeAdmission />
      <HomeWhy />
      <HomeNews />
      <HomeApplyStrip />
      <HomeInfo />
    </>
  );
}
