import gsap from "gsap";
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
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
const SCREEN_BOTTOM = 1.6; // lower edge of the screen above the front floor
const STAGE_HEIGHT = 0.55; // the low stage in front of the screen
const WALL_BAY = 4.4; // side walls: one sconce per bay
const SLATS_PER_BAY = 22; // acoustic slats, 20 cm apart
const SCONCE_HEIGHT = 2.4; // above the step next to it
const WASH_BELOW = 3; // the wall texture runs from 3 m under a sconce…
const WASH_SPAN = 12; // …to 9 m above it
const SIDE_AISLE = 1.9; // free floor on each side of the seats

const OVERVIEW_FOV = 40;
const OVERVIEW_TILT = MathUtils.degToRad(24); // from straight down, so the screen still shows
const LOOK_YAW = Math.PI / 2; // ±90° from facing the screen = a 180° look-around
const LOOK_PITCH_UP = MathUtils.degToRad(30);
const LOOK_PITCH_DOWN = MathUtils.degToRad(35);
const DRAG_SPEED = 0.0045; // radians per dragged pixel
const CLICK_SLOP = 6; // pixels a pointer may move and still count as a click

export const SEAT_COLORS = {
  standard: "#6f7b8a",
  vip: "#8b4d8b",
  wheelchair: "#2d82a3",
  taken: "#3b3733",
  picked: "#2eb882",
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
  /** "IMAX" gets a wall-to-wall, taller, more curved screen and steeper rows. */
  hallType: string;
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
  private readonly screenTop: Vector3[]; // the screen's upper corners, kept in the hall view
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
    this.scene.background = new Color("#12100e");

    // --- layout from the seat grid ---------------------------------------------------------------
    const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => a - b);
    const rowIndex = new Map(rows.map((r, i) => [r, i]));
    const maxCol = Math.max(1, ...seats.map((s) => s.grid_col));
    const lastRow = Math.max(0, rows.length - 1);
    const seatsWidth = maxCol * SEAT_PITCH;
    const hallWidth = seatsWidth + 2 * SIDE_AISLE;

    // IMAX: the screen fills the front wall, is taller and more curved, and the rows climb steeper.
    const imax = options.hallType === "IMAX";
    const rise = imax ? 0.42 : RISE;
    const screenWidth = imax ? hallWidth - 0.6 : seatsWidth * 0.95 + 0.4;
    const screenHeight = screenWidth / (imax ? 1.9 : 2.3);
    const screenBottom = imax ? 1.3 : SCREEN_BOTTOM;
    const firstRow = imax ? Math.max(FIRST_ROW, screenWidth * 0.4) : FIRST_ROW;

    const xOf = (col: number) => (col - (maxCol + 1) / 2) * SEAT_PITCH;
    const zOf = (i: number) => firstRow + i * ROW_PITCH;
    const floorOf = (i: number) => i * rise;

    this.placed = seats.map((seat) => {
      const i = rowIndex.get(seat.grid_row) ?? 0;
      return { seat, position: new Vector3(xOf(seat.grid_col), floorOf(i), zOf(i)) };
    });
    this.indexById = new Map(this.placed.map((p, i) => [p.seat.seat_id, i]));

    const backZ = zOf(lastRow) + 1.2;
    const wallTop = Math.max(floorOf(lastRow) + 3.2, screenBottom + screenHeight + 0.4);

    // --- curved screen, plain gradient ---------------------------------------------------------------
    // A gentle curve centred behind the rows; IMAX wraps around the audience more.
    const radius = firstRow + rows.length * ROW_PITCH * (imax ? 0.6 : 1);
    const arc = screenWidth / radius;
    const screenY = screenBottom + screenHeight / 2;
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
    const frontEnd = firstRow - ROW_PITCH / 2;
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
    this.scene.add(new Mesh(mergeGeometries(steps), new MeshStandardMaterial({ color: "#24211e", roughness: 0.95 })));

    // --- walls: red acoustic slats; on the side walls a warm sconce every few metres washes the
    // slats with light, like Codrops' "Cinema Seat Preview" (MIT). Each sconce sits the same height
    // above the step next to it, so the row of lights climbs with the seats.
    const floorAt = (z: number) => {
      const i = Math.floor((z - (firstRow - ROW_PITCH / 2)) / ROW_PITCH);
      return i < 0 ? 0 : floorOf(Math.min(i, lastRow));
    };
    const sideLength = backZ + 1.2;
    const bays = Math.max(1, Math.round(sideLength / WALL_BAY));
    const bay = sideLength / bays;
    const sideMaterial = makeSideWallMaterial();
    for (const side of [-1, 1]) {
      const parts: BufferGeometry[] = [];
      for (let b = 0; b < bays; b++) {
        const zc = -1.2 + (b + 0.5) * bay;
        const sconce = Math.min(floorAt(zc) + SCONCE_HEIGHT, wallTop - 0.8);
        const part = new PlaneGeometry(bay, wallTop + 1);
        // The texture's height is measured from the sconce: map this wall's bottom and top onto it.
        const uv = part.getAttribute("uv");
        for (let k = 0; k < uv.count; k++) {
          const y = uv.getY(k) > 0.5 ? wallTop : -1;
          uv.setY(k, (y - sconce + WASH_BELOW) / WASH_SPAN);
        }
        part.rotateY((-side * Math.PI) / 2);
        part.translate((side * hallWidth) / 2, wallTop / 2 - 0.5, zc);
        parts.push(part);
      }
      this.scene.add(new Mesh(mergeGeometries(parts), sideMaterial));
    }
    const back = new Mesh(new PlaneGeometry(hallWidth, wallTop + 1), makeBackWallMaterial(hallWidth / WALL_BAY));
    back.rotation.y = Math.PI;
    back.position.set(0, wallTop / 2 - 0.5, backZ);
    this.scene.add(back);
    // The wall around the screen stays near black, so the screen stands out.
    const wall = new MeshStandardMaterial({ color: "#141110", roughness: 0.9 });
    const frontWall = new Mesh(new PlaneGeometry(hallWidth, screenY + screenHeight), wall);
    frontWall.position.set(0, (screenY + screenHeight) / 2, -1.2);
    this.scene.add(frontWall);

    // A low stage under the screen, with a pale line along its front edge.
    const stageWidth = Math.min(screenWidth * 0.85, hallWidth - 1);
    const stageFront = Math.min(1.4, frontEnd - 1.2);
    const stage = new BoxGeometry(stageWidth, STAGE_HEIGHT, stageFront + 1.2);
    stage.translate(0, STAGE_HEIGHT / 2, (stageFront - 1.2) / 2);
    this.scene.add(new Mesh(stage, new MeshStandardMaterial({ color: "#2a231f", roughness: 0.9 })));

    // A dim floor strip on every step edge in the side aisles, like a real hall's floor lights.
    const strips: BufferGeometry[] = [];
    const edge = new BoxGeometry(stageWidth, 0.02, 0.03);
    edge.translate(0, STAGE_HEIGHT, stageFront);
    strips.push(edge);
    for (let i = 1; i <= lastRow; i++) {
      for (const side of [-1, 1]) {
        const strip = new BoxGeometry(SIDE_AISLE - 0.4, 0.03, 0.04);
        strip.translate(side * (seatsWidth / 2 + SIDE_AISLE / 2), floorOf(i) + 0.02, zOf(i) - ROW_PITCH / 2);
        strips.push(strip);
      }
    }
    this.scene.add(new Mesh(mergeGeometries(strips), new MeshBasicMaterial({ color: "#8c877c" })));

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

    // --- seats: fabric back and cushion coloured per seat, dark armrests between the seats ----------
    // The seat's shape and its matte fabric with baked shading follow Codrops' "Cinema Seat Preview"
    // (github.com/codrops/CinemaSeatPreview, MIT licence).
    this.seatsMesh = new InstancedMesh(makeSeatGeometry(), makeFabric(), Math.max(1, this.placed.length));
    this.seatsMesh.count = this.placed.length;
    const occupied = new Set(seats.map((s) => `${s.grid_row}:${s.grid_col}`));
    const arms: Matrix4[] = [];
    const dummy = new Object3D();
    this.placed.forEach((p, i) => {
      dummy.position.copy(p.position);
      // Turn each seat slightly towards the middle of the screen.
      dummy.rotation.set(0, Math.atan2(p.position.x, p.position.z + 6) * 0.5, 0);
      dummy.updateMatrix();
      this.seatsMesh.setMatrixAt(i, dummy.matrix);
      // An armrest on the left of every seat, and one more on the right where a block ends.
      arms.push(dummy.matrix.clone().multiply(new Matrix4().makeTranslation(-SEAT_PITCH / 2, 0, 0)));
      if (!occupied.has(`${p.seat.grid_row}:${p.seat.grid_col + 1}`)) {
        arms.push(dummy.matrix.clone().multiply(new Matrix4().makeTranslation(SEAT_PITCH / 2, 0, 0)));
      }
    });
    const armsMesh = new InstancedMesh(
      makeArmGeometry(),
      new MeshStandardMaterial({ color: "#2b2725", roughness: 0.6, vertexColors: true }),
      Math.max(1, arms.length),
    );
    arms.forEach((matrix, i) => armsMesh.setMatrixAt(i, matrix));
    armsMesh.count = arms.length;
    this.scene.add(this.seatsMesh, armsMesh);

    // --- light: from above for the hall view, plus the screen's warm projector glow ---------------
    this.scene.add(new AmbientLight("#ffffff", 0.5));
    this.scene.add(new HemisphereLight("#f2ede3", "#12100e", 1.1));
    const top = new DirectionalLight("#ffffff", 1.25);
    top.position.set(2, 20, zOf(lastRow));
    top.target.position.set(0, 0, zOf(lastRow / 2));
    const glow = new DirectionalLight("#f5e6d8", 0.8);
    glow.position.set(0, screenY + 1, -2);
    glow.target.position.set(0, 0, zOf(lastRow));
    this.scene.add(top, top.target, glow, glow.target);

    // The box the hall view has to fit: floor, seats and screen.
    this.screenTop = [-1, 1].map((side) => new Vector3((side * screenWidth) / 2, screenBottom + screenHeight, 0));
    this.bounds = {
      min: new Vector3(-hallWidth / 2, 0, -0.6),
      max: new Vector3(hallWidth / 2, Math.max(floorOf(lastRow) + 1.2, screenBottom + 0.6), backZ),
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
  flyToSeat(seatId: number, { immediate = false }: { immediate?: boolean } = {}) {
    const i = this.indexById.get(seatId);
    if (i === undefined) return;
    const { seat, position } = this.placed[i];
    // Eyes sit a little behind the seat centre, above the cushion.
    const eye = position.clone().add(new Vector3(0, EYE, 0.06));
    this.setHover(null);
    this.options.onFocus(seat);
    if (immediate) {
      this.tween?.kill();
      this.tween = null;
      this.animating = false;
      this.controls.enabled = false;
      this.camera.position.copy(eye);
      this.camera.fov = this.seatFov();
      this.camera.lookAt(this.screenCenter);
      this.camera.updateProjectionMatrix();
      this.mode = "seat";
      this.faceScreen();
      this.options.onMoving(false);
      return;
    }
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
        // Maps, the walls' glow maps; a shared texture is fine to dispose twice.
        for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
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
      const inside = (points: Vector3[], x: number, y: number) =>
        points.every((c) => {
          const p = c.clone().project(this.probe);
          return Math.abs(p.x) <= x && Math.abs(p.y) <= y;
        });
      // The seats keep a margin; the screen may reach the very edge, so the seats stay big.
      return inside(corners, 0.94, 0.9) && inside(this.screenTop, 1, 1);
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

const SEAT_WIDTH = SEAT_PITCH - 0.14; // what's left between two armrests

/** The upholstered part of a seat: a cushion and a back leaning away from the screen (+z). */
function makeSeatGeometry() {
  const cushion = new RoundedBoxGeometry(SEAT_WIDTH - 0.02, 0.12, 0.5, 3, 0.045);
  cushion.translate(0, 0.41, -0.02);
  const back = new RoundedBoxGeometry(SEAT_WIDTH, 0.66, 0.13, 3, 0.05);
  back.translate(0, 0.33, 0);
  back.rotateX(0.2);
  back.translate(0, 0.44, 0.3);
  return mergeGeometries([shaded(cushion, 0.35, 0.47, 0.55), shaded(back, 0.44, 1.08, 0.35)]);
}

/** An armrest: a side panel and the rest on top. One sits between every two seats. */
function makeArmGeometry() {
  const panel = new RoundedBoxGeometry(0.05, 0.63, 0.5, 2, 0.02);
  panel.translate(0, 0.315, 0.12);
  const rest = new RoundedBoxGeometry(0.11, 0.06, 0.56, 2, 0.022);
  rest.translate(0, 0.65, 0.09);
  return mergeGeometries([shaded(panel, 0, 0.68, 0.4), shaded(rest, 0, 0.68, 0.4)]);
}

/**
 * Soft shading baked into the vertex colours: the lower part of a piece gets less light
 * (`min` at height `from`, full light from `to` up). The seat's own colour multiplies it.
 */
function shaded(geometry: BufferGeometry, from: number, to: number, min: number) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = MathUtils.clamp((position.getY(i) - from) / (to - from), 0, 1);
    colors.fill(min + (1 - min) * t * t * (3 - 2 * t), i * 3, i * 3 + 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/** Matte seat fabric: no shine, a faint uneven weave, the colour from the seat (instance colour). */
function makeFabric() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 255 * (0.86 + Math.random() * 0.14);
      image.data.set([v, v, v, 255], i * 4);
    }
    ctx.putImageData(image, 0, 0);
  }
  const weave = new CanvasTexture(canvas); // linear values: it only darkens the colour a little
  weave.wrapS = RepeatWrapping;
  weave.wrapT = RepeatWrapping;
  return new MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0, vertexColors: true, map: weave });
}

const SLAT_FACE: [number, number, number] = [104, 22, 30]; // red felt on the slats
const SLAT_GAP: [number, number, number] = [26, 6, 9]; // the dark gaps between them

/** How much of a slat's face a point across the bay (0..1) is on: 1 on the face, 0 in a gap. */
function slatAt(u: number) {
  const t = (u * SLATS_PER_BAY) % 1;
  return MathUtils.smoothstep(t, 0, 0.12) * (1 - MathUtils.smoothstep(t, 0.88, 1));
}

/** One column per pixel across a bay: the slats in colour. */
function paintSlats(ctx: CanvasRenderingContext2D, width: number, height: number) {
  for (let x = 0; x < width; x++) {
    const s = slatAt((x + 0.5) / width);
    const [r, g, b] = SLAT_FACE.map((face, i) => Math.round(SLAT_GAP[i] + (face - SLAT_GAP[i]) * s));
    ctx.fillStyle = `rgb(${r} ${g} ${b})`;
    ctx.fillRect(x, 0, 1, height);
  }
}

/**
 * The side walls: one bay of red slats as the colour map, and as the glow (emissive) map the
 * sconce in the middle of the bay with the warm light it throws up the slats.
 */
function makeSideWallMaterial() {
  const width = 512;
  const height = 1024;
  const colors = document.createElement("canvas");
  colors.width = width;
  colors.height = height;
  const colorCtx = colors.getContext("2d");
  if (colorCtx) paintSlats(colorCtx, width, height);

  const glow = document.createElement("canvas");
  glow.width = width;
  glow.height = height;
  const glowCtx = glow.getContext("2d");
  if (glowCtx) {
    const image = glowCtx.createImageData(width, height);
    for (let py = 0; py < height; py++) {
      const above = (1 - (py + 0.5) / height) * WASH_SPAN - WASH_BELOW; // metres above the sconce
      for (let px = 0; px < width; px++) {
        const u = (px + 0.5) / width;
        const dz = (u - 0.5) * WALL_BAY; // metres from the sconce, along the wall
        const wash =
          Math.exp(-2.2 * dz * dz) * MathUtils.smoothstep(above, -0.2, 0.3) * Math.exp(-0.38 * Math.max(above, 0));
        const sconce = Math.exp(-160 * dz * dz) * Math.exp(-260 * above * above);
        const light = Math.min(1, wash * (0.5 + 0.5 * slatAt(u)) * 0.9 + sconce * 1.6);
        const o = (py * width + px) * 4;
        image.data[o] = 255 * light;
        image.data[o + 1] = 170 * light;
        image.data[o + 2] = 100 * light;
        image.data[o + 3] = 255;
      }
    }
    glowCtx.putImageData(image, 0, 0);
  }
  const map = new CanvasTexture(colors);
  const emissiveMap = new CanvasTexture(glow);
  map.colorSpace = SRGBColorSpace;
  emissiveMap.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map, emissiveMap, emissive: "#ffffff", roughness: 0.92 });
}

/** The back wall: the same red slats, repeated across, with no sconces. */
function makeBackWallMaterial(bays: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (ctx) paintSlats(ctx, canvas.width, canvas.height);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.repeat.set(bays, 1);
  return new MeshStandardMaterial({ map, roughness: 0.92 });
}

/** The screen before the film starts: a soft, dimly lit gradient. */
function makeScreenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 448;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#262320");
    gradient.addColorStop(0.5, "#382f2b");
    gradient.addColorStop(1, "#4a2d28");
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
    ctx.fillStyle = "rgba(244,239,230,0.92)";
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
