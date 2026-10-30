import { useEffect, useState } from "react";
import { api } from "./api/client";

type Status = "checking" | "ok" | "down";

// Placeholder shell: proves the deploy pipeline and the typed API client work.
// The real UI replaces this.
export default function App() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    api
      .GET("/api/health")
      .then(({ data }) => setStatus(data?.status === "ok" ? "ok" : "down"))
      .catch(() => setStatus("down"));
  }, []);

  return (
    <main>
      <h1>Cinema Ticketing System</h1>
      <p>
        API: <strong>{status}</strong>
      </p>
    </main>
  );
}
