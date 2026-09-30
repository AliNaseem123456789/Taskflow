import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./layout";

// Public
import LandingPage    from "./pages/LandingPage";
import HowItWorks     from "./pages/HowItWorks";
import Pricing        from "./pages/Pricing";
import SuccessStories from "./pages/SuccessStories";
import ProductivityGuide from "./components/ProductivityGuide";
import PrivacyPolicy  from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/Terms-of-service";

// Auth
import Login  from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
// App
import Dashboard  from "./pages/Dashboard";
import MyDones    from "./pages/MyDones";
import Calender   from "./pages/Calender";
import Reminders  from "./pages/Remainders";
import ReportsPage from "./pages/ReportsPage";
import SearchPage  from "./pages/SearchPage";
import TeamPage    from "./pages/TeamPage";
import TeamManage  from "./pages/TeamManage";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Public */}
          <Route path="/"                  element={<LandingPage />} />
          <Route path="/login"             element={<Login />} />
          <Route path="/signup"            element={<Signup />} />
          <Route path="/how-it-works"      element={<HowItWorks />} />
          <Route path="/pricing"           element={<Pricing />} />
          <Route path="/case-studies"      element={<SuccessStories />} />
          <Route path="/productivity-guide" element={<ProductivityGuide />} />
          <Route path="/privacy-policy"    element={<PrivacyPolicy />} />
          <Route path="/terms-of-service"  element={<TermsOfService />} />

          {/* App */}
          <Route path="/dashboard"         element={<Dashboard />} />
          <Route path="/mydones"           element={<MyDones />} />
          <Route path="/calendar"          element={<Calender />} />
          <Route path="/reminders"         element={<Reminders />} />
          <Route path="/reports"           element={<ReportsPage />} />
          <Route path="/search"            element={<SearchPage />} />
          <Route path="/team"              element={<TeamPage />} />
          <Route path="/team/manage/:id"   element={<TeamManage />} />

          <Route path="/profile" element={<Profile/>}/>
          {/* Legacy redirects */}
          <Route path="/Reminders"         element={<Reminders />} />
          <Route path="/How It works"      element={<HowItWorks />} />
          <Route path="/PrivacyPolicy"     element={<PrivacyPolicy />} />
          <Route path="/Productivity-Guide" element={<ProductivityGuide />} />
          <Route path="/Reports"           element={<ReportsPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}