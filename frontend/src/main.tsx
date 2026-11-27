import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import "./booking.css";
import "./manager.css";
import "./admin.css";
import { Layout, Status } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";
import { applyColorMode, readColorMode, ThemeProvider } from "./lib/theme";
import { AdminPage } from "./pages/AdminPage";
import { BookingPage } from "./pages/BookingPage";
import { BookingsPage } from "./pages/BookingsPage";
import { FakeKaspiPage } from "./pages/FakeKaspiPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerPage } from "./pages/ManagerPage";
import { MoviePage } from "./pages/MoviePage";
import { MoviesPage } from "./pages/MoviesPage";
import { ScreeningPage } from "./pages/ScreeningPage";
import { SettingsPage } from "./pages/SettingsPage";

const THEME_PRESETS = new Set(["spruce", "cobalt", "noir", "plum"]);
const themeParam = new URLSearchParams(window.location.search).get("theme");
if (themeParam && THEME_PRESETS.has(themeParam)) {
  document.documentElement.dataset.theme = themeParam;
}
applyColorMode(readColorMode());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
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
                <Route path="settings" element={<SettingsPage />} />
                <Route path="manager" element={<ManagerPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="*" element={<Status>Page not found.</Status>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
