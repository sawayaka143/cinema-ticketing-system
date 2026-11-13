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
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Seat } from "../lib/format";

/*
 * A 3D model of one hall, built from the seat map the API returns (grid_row / grid_col).
 * Units are metres. The screen is at z ≈ 0 and faces +z; rows go back (+z) and up (stadium seating).
 * The hall view looks down from above; clicking a seat brings the camera down to its eye level.
 */

const SEAT_PITCH = 0.8; // seat centre to seat centre, across a row
const ROW_PITCH = 1.05; // row to row, front to back
const RISE = 0.3; // how much higher each row sits than the one in front
const FIRST_ROW = 4; // distance from the screen to the first row (about half the screen width)
const EYE = 1.15; // seated eye height above the row's floor
const SCREEN_BOTTOM = 0.9; // lower edge of the screen above the front floor
const SIDE_AISLE = 1.9; // free floor on each side of the seats

const OVERVIEW_FOV = 40;
const OVERVIEW_TILT = MathUtils.degToRad(24); // from straight down, so the screen still shows
const LOOK_YAW = Math.PI / 2; // ±90° from facing the screen = a 180° look-around
const LOOK_PITCH_UP = MathUtils.degToRad(30);
const LOOK_PITCH_DOWN = MathUtils.degToRad(35);
const DRAG_SPEED = 0.0045; // radians per dragged pixel
const CLICK_SLOP = 6; // pixels a pointer may move and still count as a click

export const SEAT_COLORS = {
  standard: "#b3232b",
  vip: "#7c1d4a",
  wheelchair: "#3f82c4",
  taken: "#3a3d44",
  picked: "#f0a53a",
} as const;

const COLORS = {
  standard: new Color(SEAT_COLORS.standard),
  vip: new Color(SEAT_COLORS.vip),
  wheelchair: new Color(SEAT_COLORS.wheelchair),
  taken: new Color(SEAT_COLORS.taken),
  picked: new Color(SEAT_COLORS.picked),
  white: new Color("#ffffff"),
};

export interface HallSceneOptions {
  reducedMotion: boolean;
  /** The pointer is over a seat (client coordinates), or over nothing. */
  onHover: (seat: Seat | null, x: number, y: number) => void;
  /** The camera started going to a seat (seat) or back to the hall view (null). */
  onFocus: (seat: Seat | null) => void;
  /** A camera move started (true) or ended (false). */
  onMoving: (moving: boolean) => void;
}

interface Placed {
  seat: Seat;
  position: Vector3; // floor point under the seat
}

export class HallScene {
  private readonly container: HTMLElement;
  private readonly options: HallSceneOptions;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly probe = new PerspectiveCamera(OVERVIEW_FOV, 1, 0.05, 400); // for fitting the view
  private readonly controls: OrbitControls;
  private readonly seatsMesh: InstancedMesh;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly resize: ResizeObserver;

  private placed: Placed[] = [];
  private indexById = new Map<number, number>();
  private picked = new Set<number>();
  private hovered: number | null = null;

  private mode: "overview" | "seat" = "overview";
  private animating = false;
  private tween: gsap.core.Tween | null = null;
  private readonly screenCenter: Vector3;
  private readonly bounds: { min: Vector3; max: Vector3 };
  private readonly overviewPosition = new Vector3();
  private readonly overviewTarget = new Vector3();
  private overviewDistance = 20;
  private baseYaw = 0;
  private basePitch = 0;
  private yaw = 0; // offset from facing the screen
  private pitch = 0;
  private drag: { id: number; x: number; y: number; startX: number; startY: number } | null = null;

  constructor(container: HTMLElement, seats: Seat[], options: HallSceneOptions) {
    this.container = container;
    this.options = options;
    // Throws when WebGL isn't available; the React side shows the 2D seat map then.
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.className = "hall3d-canvas";
    container.appendChild(this.renderer.domElement);
    this.scene.background = new Color("#07080a");

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
      return { seat, position: new Vector3(xOf(seat.grid_col), floorOf(i), zOf(i)) };
    });
    this.indexById = new Map(this.placed.map((p, i) => [p.seat.seat_id, i]));

    const seatsWidth = maxCol * SEAT_PITCH;
    const hallWidth = seatsWidth + 2 * SIDE_AISLE;
    const backZ = zOf(lastRow) + 1.2;
    const wallTop = floorOf(lastRow) + 3.2;

    // --- curved screen, plain gradient ---------------------------------------------------------------
    const screenWidth = seatsWidth * 0.95 + 0.4;
    const screenHeight = screenWidth / 2.3;
    const radius = FIRST_ROW + rows.length * ROW_PITCH; // gentle curve, centred behind the rows
    const arc = screenWidth / radius;
    const screenY = SCREEN_BOTTOM + screenHeight / 2;
    this.screenCenter = new Vector3(0, screenY, 0);

    const screen = new Mesh(
      new CylinderGeometry(radius, radius, screenHeight, 96, 1, true, Math.PI - arc / 2, arc),
      new MeshBasicMaterial({ map: makeScreenTexture(), side: BackSide, toneMapped: false }),
    );
    screen.position.set(0, screenY, radius); // the arc's middle lands on z = 0
    this.scene.add(screen);
    const frame = new Mesh(
      new CylinderGeometry(radius + 0.06, radius + 0.06, screenHeight + 0.4, 96, 1, true, Math.PI - arc / 2 - 0.02, arc + 0.04),
      new MeshStandardMaterial({ color: "#040405", roughness: 1, side: BackSide }),
    );
    frame.position.copy(screen.position);
    this.scene.add(frame);

    // --- room: stepped floor, walls, aisle lights -----------------------------------------------------
    const steps: BufferGeometry[] = [];
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
    this.scene.add(new Mesh(mergeGeometries(steps), new MeshStandardMaterial({ color: "#1c1e25", roughness: 0.95 })));

    const wall = new MeshStandardMaterial({ color: "#121419", roughness: 0.9 });
    const sideWall = new PlaneGeometry(backZ + 1.2, wallTop + 1);
    for (const side of [-1, 1]) {
      const w = new Mesh(sideWall, wall);
      w.rotation.y = (-side * Math.PI) / 2;
      w.position.set((side * hallWidth) / 2, wallTop / 2 - 0.5, (backZ - 1.2) / 2);
      this.scene.add(w);
    }
    const back = new Mesh(new PlaneGeometry(hallWidth, wallTop + 1), wall);
    back.rotation.y = Math.PI;
    back.position.set(0, wallTop / 2 - 0.5, backZ);
    this.scene.add(back);
    const frontWall = new Mesh(new PlaneGeometry(hallWidth, screenY + screenHeight), wall);
    frontWall.position.set(0, (screenY + screenHeight) / 2, -1.2);
    this.scene.add(frontWall);

    // A dim amber strip on every step edge in the side aisles, like a real hall's floor lights.
    const strips: BufferGeometry[] = [];
    for (let i = 1; i <= lastRow; i++) {
      for (const side of [-1, 1]) {
        const strip = new BoxGeometry(SIDE_AISLE - 0.4, 0.03, 0.04);
        strip.translate(side * (seatsWidth / 2 + SIDE_AISLE / 2), floorOf(i) + 0.02, zOf(i) - ROW_PITCH / 2);
        strips.push(strip);
      }
    }
    if (strips.length) this.scene.add(new Mesh(mergeGeometries(strips), new MeshBasicMaterial({ color: "#b5782a" })));

    // Row letters at both ends of each row.
    for (const r of rows) {
      const i = rowIndex.get(r) ?? 0;
      const label = seats.find((s) => s.grid_row === r)?.row_label ?? "";
      for (const side of [-1, 1]) {
        const sprite = makeLabel(label);
        sprite.position.set(side * (seatsWidth / 2 + 0.6), floorOf(i) + 0.9, zOf(i));
        this.scene.add(sprite);
      }
    }

    // --- seats: one instanced mesh, coloured per seat ------------------------------------------------
    this.seatsMesh = new InstancedMesh(
      makeChairGeometry(),
      new MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0 }),
      Math.max(1, this.placed.length),
    );
    this.seatsMesh.count = this.placed.length;
    const dummy = new Object3D();
    this.placed.forEach((p, i) => {
      dummy.position.copy(p.position);
      // Turn each seat slightly towards the middle of the screen.
      dummy.rotation.set(0, Math.atan2(p.position.x, p.position.z + 6) * 0.5, 0);
      dummy.updateMatrix();
      this.seatsMesh.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(this.seatsMesh);

    // --- light: from above for the hall view, plus the screen's cool glow ---------------------------
    this.scene.add(new AmbientLight("#ffffff", 0.45));
    this.scene.add(new HemisphereLight("#c9d4f0", "#0d0e12", 1.1));
    const top = new DirectionalLight("#ffffff", 1.3);
    top.position.set(2, 20, zOf(lastRow));
    top.target.position.set(0, 0, zOf(lastRow / 2));
    const glow = new DirectionalLight("#9fb6ff", 0.9);
    glow.position.set(0, screenY + 1, -2);
    glow.target.position.set(0, 0, zOf(lastRow));
    this.scene.add(top, top.target, glow, glow.target);

    // The box the hall view has to fit: floor, seats and screen.
    this.bounds = {
      min: new Vector3(-hallWidth / 2, 0, -0.6),
      max: new Vector3(hallWidth / 2, Math.max(floorOf(lastRow) + 1.2, SCREEN_BOTTOM + 0.6), backZ),
    };

    // --- camera and the hall view ---------------------------------------------------------------------
    this.camera = new PerspectiveCamera(OVERVIEW_FOV, 1, 0.05, 400);
    this.camera.rotation.order = "YXZ";
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // From above: drag moves the hall, wheel / pinch zooms. No orbiting, so "up" stays the screen.
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = true;
    this.controls.enableDamping = true;
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
    this.controls.addEventListener("change", this.keepInHall);

    // --- input ----------------------------------------------------------------------------------------
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

  /** Recolours the seats: taken ones grey, picked ones amber, the hovered one lighter. */
  update(seats: Seat[], picked: Set<number>) {
    this.picked = picked;
    for (const seat of seats) {
      const i = this.indexById.get(seat.seat_id);
      if (i !== undefined) this.placed[i].seat = seat;
    }
    this.recolor();
  }

  /** Brings the camera down to a seat's eye position, looking at the screen. */
  flyToSeat(seatId: number) {
    const i = this.indexById.get(seatId);
    if (i === undefined) return;
    const { seat, position } = this.placed[i];
    // Eyes sit a little behind the seat centre, above the cushion.
    const eye = position.clone().add(new Vector3(0, EYE, 0.06));
    this.setHover(null);
    this.options.onFocus(seat);
    this.fly(eye, this.screenCenter, this.seatFov(), () => {
      this.mode = "seat";
      this.faceScreen();
    });
  }

  /** Back up to the view of the whole hall from above. */
  backToOverview() {
    if (this.mode === "overview" && !this.animating) return;
    this.options.onFocus(null);
    this.fly(this.overviewPosition, this.overviewTarget, OVERVIEW_FOV, () => {
      this.mode = "overview";
      this.resetControls();
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
    this.controls.removeEventListener("change", this.keepInHall);
    this.controls.dispose();
    this.scene.traverse((object) => {
      const mesh = object as Mesh | Sprite;
      if ("geometry" in mesh && mesh.geometry) mesh.geometry.dispose();
      const materials = "material" in mesh ? [mesh.material].flat() : [];
      for (const material of materials) {
        (material as MeshBasicMaterial).map?.dispose();
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

  private seatFov() {
    // Close to how much a seated person takes in; a tall phone screen gets a little more.
    return this.camera.aspect < 1 ? 78 : 68;
  }

  private fit() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.fitOverview();
    if (this.animating) {
      this.camera.updateProjectionMatrix();
    } else if (this.mode === "overview") {
      this.camera.fov = OVERVIEW_FOV;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.overviewPosition);
      this.camera.lookAt(this.overviewTarget);
      this.resetControls();
    } else {
      this.camera.fov = this.seatFov();
      this.camera.updateProjectionMatrix();
    }
  }

  /** The closest view from above (tilted a little) that still shows the whole hall. */
  private fitOverview() {
    const { min, max } = this.bounds;
    const target = new Vector3(0, 0, (min.z + max.z) / 2);
    const up = new Vector3(0, Math.cos(OVERVIEW_TILT), Math.sin(OVERVIEW_TILT));
    const corners: Vector3[] = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners.push(new Vector3(x, y, z));
    this.probe.fov = OVERVIEW_FOV;
    this.probe.aspect = this.camera.aspect;
    this.probe.updateProjectionMatrix();
    const fits = (distance: number) => {
      this.probe.position.copy(target).addScaledVector(up, distance);
      this.probe.lookAt(target);
      this.probe.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(this.probe);
        return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.9;
      });
    };
    let lo = 1;
    let hi = 200;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.overviewDistance = hi;
    this.overviewTarget.copy(target);
    this.overviewPosition.copy(target).addScaledVector(up, hi);
  }

  private resetControls() {
    this.controls.target.copy(this.overviewTarget);
    this.controls.minDistance = this.overviewDistance * 0.35;
    this.controls.maxDistance = this.overviewDistance * 1.1;
    this.controls.enabled = true;
    this.controls.update();
  }

  /** Panning may not drag the hall out of the frame. */
  private readonly keepInHall = () => {
    const { min, max } = this.bounds;
    const t = this.controls.target;
    const clamped = new Vector3(MathUtils.clamp(t.x, min.x, max.x), t.y, MathUtils.clamp(t.z, min.z, max.z));
    if (!clamped.equals(t)) {
      const shift = clamped.clone().sub(t);
      t.add(shift);
      this.camera.position.add(shift);
    }
  };

  /** One smooth camera move: position, gaze and lens change together. */
  private fly(toPosition: Vector3, toTarget: Vector3, toFov: number, done: () => void) {
    this.tween?.kill();
    this.controls.enabled = false;
    this.animating = true;
    this.options.onMoving(true);

    const fromPosition = this.camera.position.clone();
    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    // Where the camera looks now, at roughly the distance of what it will look at next.
    const fromTarget =
      this.mode === "overview"
        ? this.controls.target.clone()
        : fromPosition.clone().addScaledVector(forward, fromPosition.distanceTo(toTarget));
    const fromFov = this.camera.fov;
    // Seat to seat: a small hop over the rows. From above, the camera simply comes down.
    const hop = this.mode === "seat" ? MathUtils.clamp(fromPosition.distanceTo(toPosition) * 0.12, 0.2, 1.2) : 0;
    const position = new Vector3();
    const target = new Vector3();
    const state = { t: 0 };

    this.tween = gsap.to(state, {
      t: 1,
      duration: this.options.reducedMotion ? 0 : MathUtils.clamp(0.9 + fromPosition.distanceTo(toPosition) * 0.05, 1.1, 1.9),
      ease: "power2.inOut",
      onUpdate: () => {
        position.lerpVectors(fromPosition, toPosition, state.t);
        position.y += Math.sin(Math.PI * state.t) * hop;
        target.lerpVectors(fromTarget, toTarget, state.t);
        this.camera.position.copy(position);
        this.camera.lookAt(target);
        this.camera.fov = MathUtils.lerp(fromFov, toFov, state.t);
        this.camera.updateProjectionMatrix();
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
      if (i === this.hovered) color.lerp(COLORS.white, 0.35);
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

/** A soft cinema chair: rounded cushion and back, padded armrests and a stand, as one geometry. */
function makeChairGeometry() {
  const rounded = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, tilt = 0) => {
    const box = new RoundedBoxGeometry(w, h, d, 4, r);
    if (tilt) box.rotateX(tilt);
    box.translate(x, y, z);
    return box;
  };
  const stand = new CylinderGeometry(0.05, 0.08, 0.36, 12);
  stand.translate(0, 0.18, 0.06);
  // mergeGeometries needs the same layout everywhere: drop the indices of the mixed parts.
  const parts = [
    rounded(0.58, 0.16, 0.52, 0.07, 0, 0.44, 0), // cushion
    rounded(0.58, 0.7, 0.16, 0.075, 0, 0.82, 0.25, 0.12), // back, leaning away from the screen (-z)
    rounded(0.09, 0.09, 0.48, 0.04, -0.33, 0.66, 0.02), // armrests
    rounded(0.09, 0.09, 0.48, 0.04, 0.33, 0.66, 0.02),
    stand,
  ].map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(parts);
}

/** The screen before the film starts: a soft, dimly lit gradient. */
function makeScreenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 448;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#1f2f57");
    gradient.addColorStop(0.5, "#33285a");
    gradient.addColorStop(1, "#5a2f24");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(512, 224, 20, 512, 224, 560);
    glow.addColorStop(0, "rgba(255,255,255,0.22)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A row letter that always faces the camera. */
function makeLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(190,196,208,0.95)";
    ctx.font = `700 84px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 70);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, depthWrite: false, transparent: true }));
  sprite.scale.set(0.5, 0.5, 1);
  return sprite;
}
