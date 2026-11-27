import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { api } from "../../api/client";
import type { AdminHall, AdminMovie } from "../../lib/format";
import { uploadPoster } from "../../lib/posterUpload";
import { messageOf, must, useApi } from "../../lib/useApi";
import { Status } from "../Layout";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Squircle } from "../ui";

const AGE_RATINGS = [0, 6, 12, 16, 18] as const;
const HALL_TYPES = ["2D", "3D", "IMAX"] as const;

type AgeRating = (typeof AGE_RATINGS)[number];
type HallType = (typeof HALL_TYPES)[number];

/** Movies CRUD: add, edit metadata, archive/restore, or delete unscheduled films. */
export function ManagerMoviesTab({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AdminMovie | "new" | null>(null);
  const [posterUrl, setPosterUrl] = useState("");
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const posterFileRef = useRef<HTMLInputElement>(null);
  const movies = useApi(() => api.GET("/api/admin/movies").then(must), refreshKey);

  function openEditor(target: AdminMovie | "new" | null) {
    setEditing(target);
    setPosterUrl(target && target !== "new" ? (target.poster_url ?? "") : "");
  }

  async function onPickPoster(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingPoster(true);
    setNotice(null);
    try {
      const url = await uploadPoster(file);
      setPosterUrl(url);
      setNotice({ tone: "info", text: "Poster uploaded. Save the movie to keep it." });
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    } finally {
      setUploadingPoster(false);
    }
  }

  if (movies.state === "loading") return <Skeleton width="100%" height="14rem" radius={12} aria-busy="true" />;
  if (movies.state === "error") {
    return (
      <ErrorState
        title="Couldn't load movies"
        message="Unable to fetch the movie catalog."
        details={movies.message}
        onRetry={movies.reload}
      />
    );
  }

  async function saveMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const genres = String(form.get("genres") ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const yearRaw = String(form.get("release_year") ?? "").trim();
    const posterRaw = posterUrl.trim();
    const descRaw = String(form.get("description") ?? "").trim();
    const payload = {
      title: String(form.get("title") ?? "").trim(),
      duration_min: Number(form.get("duration_min")),
      min_age: Number(form.get("min_age")) as AgeRating,
      release_year: yearRaw ? Number(yearRaw) : null,
      poster_url: posterRaw || null,
      description: descRaw || null,
      genres,
    };
    setBusy(true);
    setNotice(null);
    try {
      if (editing === "new") {
        await api.POST("/api/admin/movies", { body: payload }).then(must);
        setNotice({ tone: "info", text: `Added "${payload.title}".` });
      } else {
        await api
          .PATCH("/api/admin/movies/{movie_id}", {
            params: { path: { movie_id: editing.movie_id } },
            body: payload,
          })
          .then(must);
        setNotice({ tone: "info", text: `Saved "${payload.title}".` });
      }
      openEditor(null);
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  async function toggleArchive(movie: AdminMovie) {
    setBusy(true);
    setNotice(null);
    try {
      await api
        .PATCH("/api/admin/movies/{movie_id}", {
          params: { path: { movie_id: movie.movie_id } },
          body: { is_active: !movie.is_active },
        })
        .then(must);
      setNotice({
        tone: "info",
        text: `${movie.is_active ? "Archived" : "Restored"} "${movie.title}".`,
      });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  async function removeMovie(movie: AdminMovie) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api
        .DELETE("/api/admin/movies/{movie_id}", {
          params: { path: { movie_id: movie.movie_id } },
        })
        .then(must);
      setNotice({
        tone: "info",
        text: `"${movie.title}" ${res.result === "archived" ? "archived (has screenings)" : "deleted"}.`,
      });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  const draft = editing && editing !== "new" ? editing : null;

  return (
    <section aria-label="Movies catalog management">
      <div className="mgr-toolbar">
        <h2>Movies ({movies.data.length})</h2>
        <Button size="sm" variant="solid" onClick={() => openEditor(editing ? null : "new")}>
          {editing ? "Close form" : "Add movie"}
        </Button>
      </div>

      {notice && <Status tone={notice.tone}>{notice.text}</Status>}

      {editing && (
        <form className="mgr-form" key={draft?.movie_id ?? "new"} onSubmit={saveMovie}>
          <label>
            Title
            <input name="title" required maxLength={150} defaultValue={draft?.title ?? ""} />
          </label>
          <label>
            Duration (min)
            <input
              name="duration_min"
              type="number"
              required
              min={40}
              max={300}
              defaultValue={draft?.duration_min ?? 110}
            />
          </label>
          <label>
            Age rating
            <select name="min_age" defaultValue={draft?.min_age ?? 12}>
              {AGE_RATINGS.map((age) => (
                <option key={age} value={age}>
                  {age}+
                </option>
              ))}
            </select>
          </label>
          <label>
            Release year
            <input
              name="release_year"
              type="number"
              min={1900}
              max={2100}
              defaultValue={draft?.release_year ?? 2026}
            />
          </label>
          <label>
            Genres (comma separated)
            <input
              name="genres"
              placeholder="Drama, Mystery"
              defaultValue={draft?.genres.join(", ") ?? ""}
            />
          </label>
          <div className="mgr-poster-field">
            <div className="mgr-poster-row">
              <Squircle
                radius={4}
                smoothing={0.5}
                stroke="var(--border)"
                strokeWidth={1}
                clipContent
                shadow="none"
                className="mgr-poster-preview"
              >
                {posterUrl.trim() ? <img src={posterUrl.trim()} alt="Poster preview" /> : null}
              </Squircle>
              <div className="mgr-poster-controls">
                <label>
                  Poster image or URL
                  <input
                    name="poster_url"
                    placeholder="/posters/film.svg or upload an image"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                  />
                </label>
                <div className="mgr-poster-actions">
                  <input
                    ref={posterFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={onPickPoster}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={uploadingPoster}
                    disabled={uploadingPoster || busy}
                    onClick={() => posterFileRef.current?.click()}
                  >
                    Upload poster
                  </Button>
                  {posterUrl.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploadingPoster || busy}
                      onClick={() => setPosterUrl("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <label className="mgr-span-all">
            Description
            <textarea name="description" defaultValue={draft?.description ?? ""} />
          </label>
          <div className="mgr-form-actions">
            <Button type="submit" variant="solid" loading={busy} disabled={busy || uploadingPoster}>
              {draft ? "Save changes" : "Create movie"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || uploadingPoster}
              onClick={() => openEditor(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {movies.data.length === 0 ? (
        <EmptyState title="No movies yet" description="Add your first film above." />
      ) : (
        <div className="mgr-table-wrap">
          <table className="mgr-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Genres</th>
                <th scope="col" className="num">
                  Runtime
                </th>
                <th scope="col">Rating</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {movies.data.map((m) => (
                <tr key={m.movie_id} className={m.is_active ? undefined : "is-dim"}>
                  <td>
                    <b>{m.title}</b>
                  </td>
                  <td className="muted">{m.genres.join(", ") || "—"}</td>
                  <td className="num">{m.duration_min} min</td>
                  <td>{m.min_age}+</td>
                  <td>
                    <Badge tone={m.is_active ? "success" : "neutral"} variant="subtle">
                      {m.is_active ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  <td className="num">
                    <span className="mgr-row-actions">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => openEditor(m)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void toggleArchive(m)}
                      >
                        {m.is_active ? "Archive" : "Restore"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void removeMovie(m)}
                      >
                        Remove
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function parseIntList(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Halls CRUD: inspect capacity and screening count, create halls, rename/retype, rebuild layout. */
export function ManagerHallsTab({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<{ kind: "create" } | { kind: "edit"; hall: AdminHall } | { kind: "layout"; hall: AdminHall } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const halls = useApi(() => api.GET("/api/admin/halls").then(must), refreshKey);

  if (halls.state === "loading") return <Skeleton width="100%" height="12rem" radius={12} aria-busy="true" />;
  if (halls.state === "error") {
    return (
      <ErrorState
        title="Couldn't load halls"
        message="Unable to fetch cinema halls."
        details={halls.message}
        onRetry={halls.reload}
      />
    );
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      if (mode.kind === "edit") {
        await api
          .PATCH("/api/admin/halls/{hall_id}", {
            params: { path: { hall_id: mode.hall.hall_id } },
            body: {
              name: String(form.get("name") ?? "").trim(),
              hall_type: String(form.get("hall_type")) as HallType,
            },
          })
          .then(must);
        setNotice({ tone: "info", text: "Hall updated." });
      } else {
        const layout = {
          rows: Number(form.get("rows")),
          seats_per_row: Number(form.get("seats_per_row")),
          aisles_after: parseIntList(String(form.get("aisles_after") ?? "")),
          vip_rows: parseIntList(String(form.get("vip_rows") ?? "")),
          wheelchair_seats: String(form.get("wheelchair_seats") ?? "")
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
        };
        if (mode.kind === "create") {
          await api
            .POST("/api/admin/halls", {
              body: {
                name: String(form.get("name") ?? "").trim(),
                hall_type: String(form.get("hall_type")) as HallType,
                ...layout,
              },
            })
            .then(must);
          setNotice({ tone: "info", text: "Hall created with seat grid." });
        } else {
          await api
            .PUT("/api/admin/halls/{hall_id}/layout", {
              params: { path: { hall_id: mode.hall.hall_id } },
              body: layout,
            })
            .then(must);
          setNotice({ tone: "info", text: `Rebuilt layout for ${mode.hall.name}.` });
        }
      }
      setMode(null);
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  async function deleteHall(hall: AdminHall) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.DELETE("/api/admin/halls/{hall_id}", {
        params: { path: { hall_id: hall.hall_id } },
      });
      if (!res.response.ok) {
        const detail = (res.error as { detail?: unknown } | undefined)?.detail;
        throw new Error(typeof detail === "string" ? detail : `Delete failed (${res.response.status})`);
      }
      setNotice({ tone: "info", text: `Deleted ${hall.name}.` });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  return (
    <section aria-label="Halls and seat layouts">
      <div className="mgr-toolbar">
        <h2>Halls ({halls.data.length})</h2>
        <Button
          size="sm"
          variant="solid"
          onClick={() => setMode(mode?.kind === "create" ? null : { kind: "create" })}
        >
          {mode?.kind === "create" ? "Close form" : "Add hall"}
        </Button>
      </div>

      {notice && <Status tone={notice.tone}>{notice.text}</Status>}

      {mode && (
        <form
          className="mgr-form"
          key={`${mode.kind}:${"hall" in mode ? mode.hall.hall_id : "new"}`}
          onSubmit={submitForm}
        >
          {(mode.kind === "create" || mode.kind === "edit") && (
            <>
              <label>
                Hall name
                <input
                  name="name"
                  required
                  maxLength={30}
                  defaultValue={mode.kind === "edit" ? mode.hall.name : "Hall 4"}
                />
              </label>
              <label>
                Format
                <select
                  name="hall_type"
                  defaultValue={mode.kind === "edit" ? mode.hall.hall_type : "IMAX"}
                >
                  {HALL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(mode.kind === "create" || mode.kind === "layout") && (
            <>
              <label>
                Rows (A–Z)
                <input name="rows" type="number" required min={1} max={26} defaultValue={9} />
              </label>
              <label>
                Seats per row
                <input name="seats_per_row" type="number" required min={1} max={40} defaultValue={14} />
              </label>
              <label>
                Aisles after seat #
                <input name="aisles_after" placeholder="3, 11" defaultValue="3, 11" />
              </label>
              <label>
                VIP rows (1-based)
                <input name="vip_rows" placeholder="5, 6" defaultValue="5, 6" />
              </label>
              <label>
                Wheelchair seats
                <input name="wheelchair_seats" placeholder="A1, A14" defaultValue="A1, A14" />
              </label>
            </>
          )}
          <div className="mgr-form-actions">
            <Button type="submit" variant="solid" loading={busy} disabled={busy}>
              {mode.kind === "create"
                ? "Create hall"
                : mode.kind === "edit"
                  ? "Save hall"
                  : "Rebuild seat grid"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {halls.data.length === 0 ? (
        <EmptyState title="No halls configured" description="Create your first hall above." />
      ) : (
        <div className="mgr-table-wrap">
          <table className="mgr-table">
            <thead>
              <tr>
                <th scope="col">Hall</th>
                <th scope="col">Format</th>
                <th scope="col" className="num">
                  Capacity
                </th>
                <th scope="col" className="num">
                  Screenings
                </th>
                <th scope="col" className="num">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {halls.data.map((h) => (
                <tr key={h.hall_id}>
                  <td>
                    <b>{h.name}</b>
                  </td>
                  <td>
                    <Badge tone="accent">{h.hall_type}</Badge>
                  </td>
                  <td className="num">{h.capacity} seats</td>
                  <td className="num">{h.screenings}</td>
                  <td className="num">
                    <span className="mgr-row-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setMode({ kind: "edit", hall: h })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setMode({ kind: "layout", hall: h })}
                      >
                        Layout
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || h.screenings > 0}
                        title={
                          h.screenings > 0
                            ? "Cannot delete a hall with screenings"
                            : "Delete hall"
                        }
                        onClick={() => void deleteHall(h)}
                      >
                        Delete
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
