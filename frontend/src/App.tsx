import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { History } from "./pages/History";
import { LiveMeeting } from "./pages/LiveMeeting";
import { Report } from "./pages/Report";
import { Setup } from "./pages/Setup";
import { Simulator } from "./pages/Simulator";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LiveMeeting />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/report" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/simulator" element={<Simulator />} />
      </Routes>
    </Layout>
  );
}
