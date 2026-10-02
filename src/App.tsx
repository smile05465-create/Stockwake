import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Markets from "./pages/Markets";
import NotFound from "./pages/NotFound";
import SymbolPage from "./pages/SymbolPage";
import Watchlist from "./pages/Watchlist";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/symbol/:symbol" element={<SymbolPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
