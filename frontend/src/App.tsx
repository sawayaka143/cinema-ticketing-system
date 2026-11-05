import { useEffect, useState } from "react";
import { api } from "./api/client";

type Status = "checking" | "ok" | "down";

const STATUS_LABEL: Record<Status, string> = {
  checking: "Checking…",
  ok: "Online",
  down: "Offline",
};

const STEPS = [
  { title: "Pick a movie", text: "Browse what is on at Alatau Cinema." },
  { title: "Choose a screening", text: "Select a day, time and hall: 2D, 3D or IMAX." },
  { title: "Select your seats", text: "See free seats on the real hall map." },
  { title: "Held for 10 minutes", text: "Your seats are reserved while you pay." },
  { title: "Pay and get tickets", text: "Pay with card, Kaspi or cash. Tickets are issued at once." },
];

// PLACEHOLDER landing page (issue #17). The real app shell (routing, layout,
// login, movie list) is issue #14 and replaces this file.
export default function App() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    api
      .GET("/api/health")
      .then(({ data }) => setStatus(data?.status === "ok" ? "ok" : "down"))
      .catch(() => setStatus("down"));
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">Alatau Cinema</span>
        <span className="badge">Placeholder</span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Almaty · 3 halls · 2D, 3D, IMAX</p>
          <h1>Online booking is coming soon.</h1>
          <p className="lead">
            We are building a simple way to go from the movie list to your tickets: choose a
            screening, pick seats on the hall map and pay online.
          </p>
        </section>

        <section aria-labelledby="how-title">
          <h2 id="how-title">How booking will work</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="footer">
        <p>Alatau Cinema is a fictional cinema. University project, KBTU.</p>
        <p className="status" role="status">
          <span className={`dot dot-${status}`} aria-hidden="true" />
          Service: {STATUS_LABEL[status]}
        </p>
      </footer>
    </div>
  );
}
