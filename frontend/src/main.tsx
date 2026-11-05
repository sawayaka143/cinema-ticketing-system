import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { Layout, Status } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { BookingsPage } from "./pages/BookingsPage";
import { LoginPage } from "./pages/LoginPage";
import { MoviePage } from "./pages/MoviePage";
import { MoviesPage } from "./pages/MoviesPage";
import { ScreeningPage } from "./pages/ScreeningPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<MoviesPage />} />
            <Route path="movies/:id" element={<MoviePage />} />
            <Route path="screenings/:id" element={<ScreeningPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="me/bookings" element={<BookingsPage />} />
            <Route path="*" element={<Status>Page not found.</Status>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
