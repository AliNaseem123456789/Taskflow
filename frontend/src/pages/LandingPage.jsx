import Hero from "../components/Hero";
import HeroPricing from "../components/HeroPricing";
import Reviews from "../components/Reviews";
import Chatbot from "../components/ChatBot";

export default function LandingPage() {
  return (
    <div>
      <Hero />
      <HeroPricing />
      <Reviews />
      <Chatbot />
    </div>
  );
}