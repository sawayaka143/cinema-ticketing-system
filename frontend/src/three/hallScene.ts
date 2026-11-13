import gsap from "gsap";
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Seat } from "../lib/format";

/*
 * A 3D model of one hall, built from the seat map the API returns (grid_row / grid_col).
 * Units are metres. The screen is at z ≈ 0 and faces +z; rows go back (+z) and up (stadium seating).
 */

const SEAT_PITCH = 0.62; // seat centre to seat centre, across a row
const ROW_PITCH = 1.0; // row to row, front to back
const RISE = 0.34; // how much higher each row sits than the one in front
const FIRST_ROW = 5.5; // distance from the screen to the first row
const EYE = 1.15; // seated eye height above the row's floor
const SCREEN_BOTTOM = 1.3; // lower edge of the screen above the front floor
const LOOK_YAW = Math.PI / 2; // ±90° from facing the screen = a 180° look-around
const LOOK_PITCH_UP = MathUtils.degToRad(30);
const LOOK_PITCH_DOWN = MathUtils.degToRad(35);
const DRAG_SPEED = 0.0045; // radians per dragged pixel
const CLICK_SLOP = 6; // pixels a pointer may move and still count as a click

const COLORS = {
  standard: new Color("#5b6372"),
  vip: new Color("#c98b2e"),
  wheelchair: new Color("#6fa8dc"),
  taken: new Color("#23262d"),
  picked: new Color("#f0a53a"),
  white: new Color("#ffffff"),
};

export type HallMode = "overview" | "seat";

export interface HallSceneEvents {
  /** The pointer is over a seat (client coordinates), or over nothing. */
  onHover: (seat: Seat | null, x: number, y: number) => void;
  /** The camera started flying to a seat (seat) or back to the hall view (null). */
  onFocus: (seat: Seat | null) => void;
  /** A flight started (true) or ended (false). */
  onMoving: (moving: boolean) => void;
}

export interface HallSceneOptions extends HallSceneEvents {
  title: string;
  subtitle: string;
  reducedMotion: boolean;
}

interface Placed {
  seat: Seat;
  position: Vector3; // floor point under the seat
  rowIndex: number;
}

export class HallScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly seatsMesh: InstancedMesh;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly resize: ResizeObserver;

  private placed: Placed[] = [];
  private indexById = new Map<number, number>();
  private picked = new Set<number>();
  private hovered: number | null = null;

  private mode: HallMode = "overview";
  private animating = false;
  private tween: gsap.core.Tween | null = null;
  private readonly lookTarget = new Vector3();
  private readonly screenCenter: Vector3;
  private readonly overviewBase: Vector3; // hall view for a wide screen
  private readonly overviewPosition = new Vector3(); // ...pulled back on narrow screens
  private readonly overviewTarget: Vector3;
  private baseYaw = 0;
  private basePitch = 0;
  private yaw = 0; // offset from facing the screen
  private pitch = 0;
  private drag: { id: number; x: number; y: number; startX: number; startY: number } | null = null;

  private readonly container: HTMLElement;
  private readonly options: HallSceneOptions;

  constructor(container: HTMLElement, seats: Seat[], options: HallSceneOptions) {
    this.container = container;
    this.options = options;
    // Throws when WebGL isn't available; the React side shows a fallback then.
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.className = "hall3d-canvas";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new Color("#07080a");
    this.scene.fog = new Fog("#07080a", 18, 60);

    // --- layout from the seat grid ---------------------------------------------------------------
    const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => a - b);
    const rowIndex = new Map(rows.map((r, i) => [r, i]));
    const maxCol = Math.max(1, ...seats.map((s) => s.grid_col));
    const lastRow = Math.max(0, rows.length - 1);
    const xOf = (col: number) => (col - (maxCol + 1) / 2) * SEAT_PITCH;
    const zOf = (i: number) => FIRST_ROW + i * ROW_PITCH;
    const floorOf = (i: number) => i * RISE;

    this.placed = seats.map((seat) => {
      const i = rowIndex.get(seat.grid_row) ?? 0;
      return { seat, rowIndex: i, position: new Vector3(xOf(seat.grid_col), floorOf(i), zOf(i)) };
    });
    this.indexById = new Map(this.placed.map((p, i) => [p.seat.seat_id, i]));

    const seatsWidth = maxCol * SEAT_PITCH;
    const hallWidth = seatsWidth + 3.2; // side aisles
    const backZ = zOf(lastRow) + 1.4;
    const wallTop = Math.max(floorOf(lastRow) + 4.2, SCREEN_BOTTOM + 7);

    // --- curved screen ---------------------------------------------------------------------------
    const screenWidth = Math.max(6, seatsWidth + 0.6);
    const screenHeight = screenWidth / 2.1;
    const radius = FIRST_ROW + rows.length * ROW_PITCH * 0.9; // gentle curve, centred behind the rows
    const arc = screenWidth / radius;
    const screenY = SCREEN_BOTTOM + screenHeight / 2;
    this.screenCenter = new Vector3(0, screenY, 0);

    const screenGeometry = new CylinderGeometry(radius, radius, screenHeight, 96, 1, true, Math.PI - arc / 2, arc);
    const screenTexture = makeScreenTexture(options.title, options.subtitle);
    const screen = new Mesh(
      screenGeometry,
      new MeshBasicMaterial({ map: screenTexture, side: BackSide, toneMapped: false }),
    );
    screen.position.set(0, screenY, radius); // the arc's middle lands on z = 0
    this.scene.add(screen);

    // The masking around the screen, a little wider and taller, just behind it.
    const frame = new Mesh(
      new CylinderGeometry(radius + 0.08, radius + 0.08, screenHeight + 0.5, 96, 1, true, Math.PI - arc / 2 - 0.02, arc + 0.04),
      new MeshStandardMaterial({ color: "#050506", roughness: 1, side: BackSide }),
    );
    frame.position.copy(screen.position);
    this.scene.add(frame);

    // --- room: stepped floor, walls, aisle lights -----------------------------------------------
    const carpet = new MeshStandardMaterial({ color: "#1b1d24", roughness: 0.95 });
    const wall = new MeshStandardMaterial({ color: "#14161c", roughness: 0.9 });
    const steps: BufferGeometry[] = [];
    // Flat floor from the front wall (z = -1.2) to the first row.
    const frontEnd = FIRST_ROW - ROW_PITCH / 2;
    const front = new BoxGeometry(hallWidth, 0.2, frontEnd + 1.2);
    front.translate(0, -0.1, (frontEnd - 1.2) / 2);
    steps.push(front);
    for (let i = 0; i <= lastRow; i++) {
      const top = floorOf(i);
      const height = top + 0.2;
      const box = new BoxGeometry(hallWidth, height, ROW_PITCH);
      box.translate(0, top - height / 2, zOf(i));
      steps.push(box);
    }
    this.addMesh(mergeGeometries(steps), carpet);

    const sideWall = new PlaneGeometry(backZ + 2, wallTop + 1);
    for (const side of [-1, 1]) {
      const w = new Mesh(sideWall, wall);
      w.rotation.y = (-side * Math.PI) / 2;
      w.position.set((side * hallWidth) / 2, wallTop / 2 - 0.5, backZ / 2 - 1);
      this.scene.add(w);
    }
    const back = new Mesh(new PlaneGeometry(hallWidth, wallTop + 1), wall);
    back.rotation.y = Math.PI;
    back.position.set(0, wallTop / 2 - 0.5, backZ);
    this.scene.add(back);
    const frontWall = new Mesh(new PlaneGeometry(hallWidth + 2, wallTop + 2), wall);
    frontWall.position.set(0, wallTop / 2, -1.2);
    this.scene.add(frontWall);

    // A dim amber strip on every step edge, like the aisle lights in a real hall.
    const strips: BufferGeometry[] = [];
    for (let i = 1; i <= lastRow; i++) {
      for (const side of [-1, 1]) {
        const strip = new BoxGeometry(1.2, 0.03, 0.03);
        strip.translate((side * (seatsWidth + 1.6)) / 2, floorOf(i) + 0.02, zOf(i) - ROW_PITCH / 2);
        strips.push(strip);
      }
    }
    if (strips.length) this.addMesh(mergeGeometries(strips), new MeshBasicMaterial({ color: "#b5782a" }));

    // Row letters at both ends of each row.
    for (const r of rows) {
      const i = rowIndex.get(r) ?? 0;
      const label = seats.find((s) => s.grid_row === r)?.row_label ?? "";
      for (const side of [-1, 1]) {
        const sprite = makeLabel(label);
        sprite.position.set(side * (seatsWidth / 2 + 0.55), floorOf(i) + 0.95, zOf(i));
        this.scene.add(sprite);
      }
    }

    // --- seats: one instanced mesh, coloured per seat ---------------------------------------------
    this.seatsMesh = new InstancedMesh(
      makeChairGeometry(),
      new MeshStandardMaterial({ color: "#ffffff", roughness: 0.65, metalness: 0.05 }),
      Math.max(1, this.placed.length),
    );
    this.seatsMesh.count = this.placed.length;
    const dummy = new Object3D();
    this.placed.forEach((p, i) => {
      dummy.position.copy(p.position);
      // Turn each seat slightly towards the middle of the screen.
      dummy.rotation.set(0, Math.atan2(p.position.x, p.position.z + 6) * 0.6, 0);
      dummy.updateMatrix();
      this.seatsMesh.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(this.seatsMesh);

    // --- light: the screen glow plus a soft fill ----------------------------------------------------
    this.scene.add(new AmbientLight("#ffffff", 0.35));
    this.scene.add(new HemisphereLight("#8ea2c8", "#0d0e12", 0.9));
    const glow = new DirectionalLight("#9fb6ff", 1.4);
    glow.position.set(0, screenY + 1, -2);
    glow.target.position.set(0, 0, zOf(lastRow));
    this.scene.add(glow, glow.target);
    const warm = new PointLight("#f0a53a", 18, 30, 2);
    warm.position.set(0, wallTop - 0.5, zOf(lastRow) - 1);
    this.scene.add(warm);

    // --- camera and the hall view ------------------------------------------------------------------
    this.camera = new PerspectiveCamera(58, 1, 0.05, 200);
    this.camera.rotation.order = "YXZ";
    const middleZ = (FIRST_ROW + zOf(lastRow)) / 2;
    this.overviewTarget = new Vector3(0, 1.2, middleZ - 1.5);
    this.overviewBase = new Vector3(hallWidth * 0.32, floorOf(lastRow) + 6.5, backZ + 4.5);
    this.overviewPosition.copy(this.overviewBase);
    this.camera.position.copy(this.overviewPosition);
    this.lookTarget.copy(this.overviewTarget);
    this.camera.lookAt(this.lookTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.overviewTarget);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 40;
    this.controls.minPolarAngle = MathUtils.degToRad(25);
    this.controls.maxPolarAngle = MathUtils.degToRad(82);
    this.controls.minAzimuthAngle = -MathUtils.degToRad(70);
    this.controls.maxAzimuthAngle = MathUtils.degToRad(70);
    this.controls.update();

    // --- input --------------------------------------------------------------------------------------
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();

    this.update(seats, new Set());
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Recolours the seats: taken ones dark, picked ones amber, the hovered one lighter. */
  update(seats: Seat[], picked: Set<number>) {
    this.picked = picked;
    for (const seat of seats) {
      const i = this.indexById.get(seat.seat_id);
      if (i !== undefined) this.placed[i].seat = seat;
    }
    this.recolor();
  }

  /** Flies the camera to a seat's eye position, looking at the screen. */
  flyToSeat(seatId: number) {
    const i = this.indexById.get(seatId);
    if (i === undefined) return;
    const { seat, position } = this.placed[i];
    // Eyes sit a little behind the seat centre, above the cushion.
    const eye = position.clone().add(new Vector3(0, EYE, 0.06));
    this.setHover(null);
    this.options.onFocus(seat);
    this.fly(eye, this.screenCenter, () => {
      this.mode = "seat";
      this.faceScreen();
    });
  }

  /** Back to the view of the whole hall. */
  backToOverview() {
    if (this.mode === "overview" && !this.animating) return;
    this.options.onFocus(null);
    this.fly(this.overviewPosition, this.overviewTarget, () => {
      this.mode = "overview";
      this.controls.target.copy(this.overviewTarget);
      this.controls.enabled = true;
      this.controls.update();
    });
  }

  /** Arrow keys look around in the seat view (keyboard access). */
  nudge(dx: number, dy: number) {
    if (this.mode !== "seat" || this.animating) return;
    this.look(dx, dy);
  }

  dispose() {
    this.tween?.kill();
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.controls.dispose();
    this.scene.traverse((object) => {
      const mesh = object as Mesh | Sprite;
      if ("geometry" in mesh && mesh.geometry) mesh.geometry.dispose();
      const materials = "material" in mesh ? [mesh.material].flat() : [];
      for (const material of materials) {
        const map = (material as MeshBasicMaterial).map;
        map?.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // browsers allow only a few live WebGL contexts
    canvas.remove();
  }

  // --- internals ----------------------------------------------------------------------------------

  private readonly frame = () => {
    if (this.mode === "overview" && !this.animating) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private fit() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    const aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    // A tall phone screen sees little sideways: widen the view, and step back in the hall view.
    this.camera.fov = aspect < 1 ? 72 : 58;
    this.camera.updateProjectionMatrix();
    const back = MathUtils.clamp(0.9 / aspect, 1, 1.6);
    this.overviewPosition.copy(this.overviewTarget).lerp(this.overviewBase, back);
    if (this.mode === "overview" && !this.animating) {
      this.camera.position.copy(this.overviewPosition);
      this.controls.update();
    }
  }

  private addMesh(geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial) {
    this.scene.add(new Mesh(geometry, material));
  }

  /** One smooth flight: position and gaze move together, with a small hop over the rows. */
  private fly(toPosition: Vector3, toTarget: Vector3, done: () => void) {
    this.tween?.kill();
    this.controls.enabled = false;
    this.animating = true;
    this.options.onMoving(true);

    const fromPosition = this.camera.position.clone();
    // Where the camera looks now, at roughly the distance of what it will look at next.
    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    const fromTarget = fromPosition.clone().addScaledVector(forward, fromPosition.distanceTo(toTarget));
    const hop = MathUtils.clamp(fromPosition.distanceTo(toPosition) * 0.12, 0.2, 1.6);
    const position = new Vector3();
    const target = new Vector3();
    const state = { t: 0 };

    this.tween = gsap.to(state, {
      t: 1,
      duration: this.options.reducedMotion ? 0 : MathUtils.clamp(0.9 + fromPosition.distanceTo(toPosition) * 0.06, 1, 2),
      ease: "power2.inOut",
      onUpdate: () => {
        position.lerpVectors(fromPosition, toPosition, state.t);
        position.y += Math.sin(Math.PI * state.t) * hop;
        target.lerpVectors(fromTarget, toTarget, state.t);
        this.camera.position.copy(position);
        this.camera.lookAt(target);
        this.lookTarget.copy(target);
      },
      onComplete: () => {
        this.animating = false;
        this.tween = null;
        done();
        this.options.onMoving(false);
      },
    });
  }

  /** Seat view: remember the angles that face the screen, then look from there. */
  private faceScreen() {
    const direction = this.screenCenter.clone().sub(this.camera.position);
    this.baseYaw = Math.atan2(-direction.x, -direction.z);
    this.basePitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
    this.yaw = 0;
    this.pitch = 0;
    this.applyLook();
  }

  private look(dx: number, dy: number) {
    // Dragging moves the picture with the finger, like a panorama.
    this.yaw = MathUtils.clamp(this.yaw + dx * DRAG_SPEED, -LOOK_YAW, LOOK_YAW);
    this.pitch = MathUtils.clamp(this.pitch + dy * DRAG_SPEED, -LOOK_PITCH_DOWN, LOOK_PITCH_UP);
    this.applyLook();
  }

  private applyLook() {
    this.camera.rotation.set(this.basePitch + this.pitch, this.baseYaw + this.yaw, 0, "YXZ");
  }

  private seatAt(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.seatsMesh, false)[0];
    return hit?.instanceId ?? null;
  }

  private setHover(index: number | null, x = 0, y = 0) {
    if (index !== this.hovered) {
      this.hovered = index;
      this.recolor();
      this.renderer.domElement.style.cursor = index === null ? "" : "pointer";
    }
    this.options.onHover(index === null ? null : this.placed[index].seat, x, y);
  }

  private recolor() {
    const color = new Color();
    this.placed.forEach(({ seat }, i) => {
      if (this.picked.has(seat.seat_id)) color.copy(COLORS.picked);
      else if (seat.is_taken) color.copy(COLORS.taken);
      else color.copy(COLORS[seat.seat_type as "standard" | "vip" | "wheelchair"] ?? COLORS.standard);
      if (i === this.hovered) color.lerp(COLORS.white, 0.4);
      this.seatsMesh.setColorAt(i, color);
    });
    if (this.seatsMesh.instanceColor) this.seatsMesh.instanceColor.needsUpdate = true;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
    if (this.mode === "seat") this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.drag && this.drag.id === event.pointerId) {
      if (this.mode === "seat" && !this.animating) {
        this.look(event.clientX - this.drag.x, event.clientY - this.drag.y);
      }
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      return;
    }
    if (this.animating || event.pointerType === "touch") return;
    this.setHover(this.seatAt(event.clientX, event.clientY), event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== event.pointerId || this.animating) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (moved > CLICK_SLOP) return;
    const index = this.seatAt(event.clientX, event.clientY);
    if (index !== null) this.flyToSeat(this.placed[index].seat.seat_id);
  };

  private readonly onPointerCancel = () => {
    this.drag = null;
  };

  private readonly onPointerLeave = () => {
    if (!this.drag) this.setHover(null);
  };
}

/** A cinema chair: cushion, back, two armrests and a stand, merged into one geometry. */
function makeChairGeometry() {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const box = new BoxGeometry(w, h, d);
    box.translate(x, y, z);
    return box;
  };
  return mergeGeometries([
    part(0.5, 0.12, 0.48, 0, 0.44, 0), // cushion
    part(0.5, 0.64, 0.1, 0, 0.8, 0.25), // back (the screen is at -z)
    part(0.06, 0.24, 0.46, -0.28, 0.6, 0.02), // armrests
    part(0.06, 0.24, 0.46, 0.28, 0.6, 0.02),
    part(0.12, 0.38, 0.12, 0, 0.19, 0.05), // stand
  ]);
}

/** What the screen shows: the movie title on a dark gradient, like the moment before the film. */
function makeScreenTexture(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 975;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#1d2a4a");
    gradient.addColorStop(0.55, "#2c2248");
    gradient.addColorStop(1, "#4a2a1e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(1024, 480, 50, 1024, 480, 900);
    glow.addColorStop(0, "rgba(255,255,255,0.18)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    let size = 170;
    do {
      ctx.font = `700 ${size}px ${font}`;
      size -= 10;
    } while (ctx.measureText(title).width > 1800 && size > 50);
    ctx.fillText(title, 1024, 440);
    ctx.font = `500 56px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(subtitle, 1024, 600);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // The screen is seen from inside the cylinder, so flip the picture horizontally.
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  return texture;
}

/** A row letter that always faces the camera. */
function makeLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(155,161,173,0.95)";
    ctx.font = `700 84px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 70);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, depthWrite: false, transparent: true }));
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}
