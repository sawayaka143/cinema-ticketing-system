import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import "./booking.css";
import "./manager.css";
import { Layout, Status } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { BookingPage } from "./pages/BookingPage";
import { BookingsPage } from "./pages/BookingsPage";
import { FakeKaspiPage } from "./pages/FakeKaspiPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerPage } from "./pages/ManagerPage";
import { MoviePage } from "./pages/MoviePage";
import { MoviesPage } from "./pages/MoviesPage";
import { ScreeningPage } from "./pages/ScreeningPage";

const THEME_PRESETS = new Set(["spruce", "cobalt", "noir", "plum"]);
const themeParam = new URLSearchParams(window.location.search).get("theme");
if (themeParam && THEME_PRESETS.has(themeParam)) {
  document.documentElement.dataset.theme = themeParam;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Demo Kaspi pay page: opened on a phone from the QR code, so no site header. */}
          <Route path="fake-kaspi/:token" element={<FakeKaspiPage />} />
          <Route element={<Layout />}>
            <Route index element={<MoviesPage />} />
            <Route path="movies/:id" element={<MoviePage />} />
            <Route path="screenings/:id" element={<ScreeningPage />} />
            <Route path="bookings/:id" element={<BookingPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="me/bookings" element={<BookingsPage />} />
            <Route path="manager" element={<ManagerPage />} />
            <Route path="*" element={<Status>Page not found.</Status>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
