import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { api } from "../../api/client";
import { type AdminMovie, runtime } from "../../lib/format";
import { uploadPoster } from "../../lib/posterUpload";
import { messageOf, must, useApi } from "../../lib/useApi";
import { Button, ErrorState, Skeleton } from "../ui";

const AGES = [0, 6, 12, 16, 18] as const;

/** Movies: add one, delete one (a movie with showtimes is archived instead), restore archived. */
export function AdminMovies() {
  const movies = useApi(() => api.GET("/api/admin/movies").then(must), "admin-movies");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function remove(m: AdminMovie) {
    if (!window.confirm(`Delete “${m.title}”?\n\nIf it has showtimes it is archived instead, so the history stays.`)) {
      return;
    }
    setBusyId(m.movie_id);
    setNotice(null);
    try {
      const res = await api
        .DELETE("/api/admin/movies/{movie_id}", { params: { path: { movie_id: m.movie_id } } })
        .then(must);
      setNotice({
        tone: "ok",
        text: res.result === "deleted" ? `“${m.title}” deleted.` : `“${m.title}” has showtimes, so it was archived.`,
      });
      movies.reload();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function changePoster(m: AdminMovie, file: File) {
    setBusyId(m.movie_id);
    setNotice(null);
    try {
      const url = await uploadPoster(file);
      await api
        .PATCH("/api/admin/movies/{movie_id}", {
          params: { path: { movie_id: m.movie_id } },
          body: { poster_url: url },
        })
        .then(must);
      setNotice({ tone: "ok", text: `New poster for “${m.title}” saved.` });
      movies.reload();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function restore(m: AdminMovie) {
    setBusyId(m.movie_id);
    setNotice(null);
    try {
      await api
        .PATCH("/api/admin/movies/{movie_id}", {
          params: { path: { movie_id: m.movie_id } },
          body: { is_active: true },
        })
        .then(must);
      setNotice({ tone: "ok", text: `“${m.title}” is back on sale.` });
      movies.reload();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <Button variant={adding ? "ghost" : "solid"} size="sm" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add movie"}
        </Button>
      </div>

      {adding && (
        <MovieForm
          onSaved={(title) => {
            setAdding(false);
            setNotice({ tone: "ok", text: `“${title}” added.` });
            movies.reload();
          }}
        />
      )}

      {notice && (
        <p className={notice.tone === "ok" ? "admin-ok" : "admin-error"} role={notice.tone === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      {movies.state === "error" ? (
        <ErrorState
          title="Couldn't load movies"
          message="The movie list didn't load. Try again."
          details={movies.message}
          onRetry={movies.reload}
        />
      ) : movies.state === "loading" ? (
        <Skeleton width="100%" height="16rem" radius={6} aria-busy="true" />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Poster</th>
              <th>Title</th>
              <th>Genres</th>
              <th className="num">Length</th>
              <th className="num">Age</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {movies.data.map((m) => (
              <tr key={m.movie_id} className={m.is_active ? "" : "archived"}>
                <td>
                  <PosterPicker
                    url={m.poster_url}
                    label={`Change the poster of ${m.title}`}
                    busy={busyId === m.movie_id}
                    onPick={(file) => changePoster(m, file)}
                  />
                </td>
                <td>
                  {m.title}
                  {m.release_year && <small> · {m.release_year}</small>}
                </td>
                <td>{m.genres.join(", ") || "—"}</td>
                <td className="num">{runtime(m.duration_min)}</td>
                <td className="num">{m.min_age}+</td>
                <td>{m.is_active ? "On sale" : "Archived"}</td>
                <td className="actions">
                  {m.is_active ? (
                    <Button variant="ghost" size="sm" onClick={() => remove(m)} loading={busyId === m.movie_id}>
                      Delete
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => restore(m)} loading={busyId === m.movie_id}>
                      Restore
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MovieForm({ onSaved }: { onSaved: (title: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poster, setPoster] = useState("");
  const [uploading, setUploading] = useState(false);

  async function pickPoster(file: File) {
    setUploading(true);
    setError(null);
    try {
      setPoster(await uploadPoster(file));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const text = (name: string) => String(f.get(name) ?? "").trim();
    const year = text("release_year");
    setBusy(true);
    setError(null);
    try {
      const movie = await api
        .POST("/api/admin/movies", {
          body: {
            title: text("title"),
            duration_min: Number(text("duration_min")),
            min_age: Number(text("min_age")) as (typeof AGES)[number],
            release_year: year ? Number(year) : null,
            genres: text("genres")
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean),
            poster_url: poster.trim() || null,
            description: text("description") || null,
          },
        })
        .then(must);
      onSaved(movie.title);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label className="wide">
        Title
        <input name="title" required maxLength={150} autoFocus />
      </label>
      <label>
        Length, min
        <input name="duration_min" type="number" required min={40} max={300} defaultValue={110} />
      </label>
      <label>
        Age
        <select name="min_age" defaultValue="12">
          {AGES.map((a) => (
            <option key={a} value={a}>
              {a}+
            </option>
          ))}
        </select>
      </label>
      <label>
        Year
        <input name="release_year" type="number" min={1900} max={2100} placeholder="2026" />
      </label>
      <label className="wide">
        <span>
          Genres <small>comma separated</small>
        </span>
        <input name="genres" placeholder="Drama, Comedy" />
      </label>
      <div className="wide admin-poster-field">
        <PosterPicker url={poster || null} label="Upload a poster" busy={uploading} onPick={pickPoster} />
        <label>
          <span>
            Poster <small>upload an image, or paste a link</small>
          </span>
          <input
            name="poster_url"
            type="url"
            placeholder="https://…"
            value={poster}
            onChange={(e) => setPoster(e.target.value)}
          />
        </label>
      </div>
      <label className="full">
        <span>
          Description <small>optional</small>
        </span>
        <textarea name="description" rows={3} />
      </label>
      <div className="full admin-form-end">
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" size="sm" loading={busy} disabled={uploading}>
          Save movie
        </Button>
      </div>
    </form>
  );
}

/** A small poster preview; clicking it picks an image file (JPEG, PNG or WebP, up to 4 MB). */
function PosterPicker({
  url,
  label,
  busy,
  onPick,
}: {
  url: string | null;
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again still fires
    if (file) onPick(file);
  }

  return (
    <button
      type="button"
      className="admin-poster"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => input.current?.click()}
    >
      {url ? <img src={url} alt="" loading="lazy" /> : <span>{busy ? "…" : "+ Image"}</span>}
      {busy && url && <span className="admin-poster-busy">…</span>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={picked} />
    </button>
  );
}
