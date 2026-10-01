import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout";
import RequireAuth from "./components/RequireAuth";
import { isLoggedIn } from "./api/api";

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
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
// App
import Dashboard  from "./pages/Dashboard";
import MyDones    from "./pages/MyDones";
import Calender   from "./pages/Calender";
import Reminders  from "./pages/Remainders";
import ReportsPage from "./pages/ReportsPage";
import SearchPage  from "./pages/SearchPage";
import TeamPage    from "./pages/TeamPage";
import TeamManage  from "./pages/TeamManage";
import BoardPage   from "./pages/BoardPage";
import GoalsPage   from "./pages/GoalsPage";
import TaskDetail  from "./pages/TaskDetail";
import JoinTeam    from "./pages/JoinTeam";
import IntegrationsPage from "./pages/IntegrationsPage";
import CompanyPage from "./pages/CompanyPage";
import Meetings from "./pages/Meetings";
import MeetingPage from "./pages/MeetingPage";
import Announcements from "./pages/Announcements";
import Inbox from "./pages/Inbox";
import JoinCompany from "./pages/JoinCompany";
import CreateCompany from "./pages/CreateCompany";

// Logged-in pages
const appRoutes = [
  ["/dashboard",       <Dashboard />],
  ["/mydones",         <MyDones />],
  ["/calendar",        <Calender />],
  ["/reminders",       <Reminders />],
  ["/reports",         <ReportsPage />],
  ["/search",          <SearchPage />],
  ["/team",            <TeamPage />],
  ["/team/manage/:id", <TeamManage />],
  ["/profile",         <Profile />],
  ["/board",           <BoardPage />],
  ["/goals",           <GoalsPage />],
  ["/tasks/:id",       <TaskDetail />],
  ["/join",            <JoinTeam />],
  ["/integrations",    <IntegrationsPage />],
  ["/company",         <CompanyPage />],
  ["/companies/new",   <CreateCompany />],
  ["/join-company",    <JoinCompany />],
  ["/inbox",           <Inbox />],
  ["/announcements",   <Announcements />],
  ["/meetings",        <Meetings />],
  ["/meetings/:id",    <MeetingPage />],
];

// Send logged-in users away from login/signup
const GuestOnly = ({ children }) =>
  isLoggedIn() ? <Navigate to="/dashboard" replace /> : children;

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Public */}
          <Route path="/"                  element={<LandingPage />} />
          <Route path="/login"             element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/signup"            element={<GuestOnly><Signup /></GuestOnly>} />
          <Route path="/forgot-password"   element={<GuestOnly><ForgotPassword /></GuestOnly>} />
          <Route path="/reset-password"    element={<ResetPassword />} />
          <Route path="/verify-email"      element={<VerifyEmail />} />
          <Route path="/how-it-works"      element={<HowItWorks />} />
          <Route path="/pricing"           element={<Pricing />} />
          <Route path="/case-studies"      element={<SuccessStories />} />
          <Route path="/productivity-guide" element={<ProductivityGuide />} />
          <Route path="/privacy-policy"    element={<PrivacyPolicy />} />
          <Route path="/terms-of-service"  element={<TermsOfService />} />

          {/* App (login required) */}
          {appRoutes.map(([path, element]) => (
            <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
          ))}

          {/* Legacy URLs */}
          <Route path="/Reminders"          element={<Navigate to="/reminders" replace />} />
          <Route path="/How It works"       element={<Navigate to="/how-it-works" replace />} />
          <Route path="/PrivacyPolicy"      element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/Productivity-Guide" element={<Navigate to="/productivity-guide" replace />} />
          <Route path="/Reports"            element={<Navigate to="/reports" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}
