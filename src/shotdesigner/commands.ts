/**
 * Every blocking action is a command (id, label, group, shortcut, parameters). The UI, keyboard
 * shortcuts and the MCP tools all call `runBlockingCommand`, so an agent can do exactly what a user
 * can do. Commands are pure: (host, params, time) → new host.
 */
import {
  aimAngles,
  cameraFovDeg,
  camerasAt,
  charactersAt,
  createCamera,
  createCharacter,
  eyeHeightM,
  finite,
  focalForHorizontalFov,
  makeStageId,
  normalizeKeyframe,
  normalizeStage,
  sampleTrack,
  sortKeys,
  wrapDeg,
  CAMERA_MOVES,
  SENSOR_PRESETS,
  SHOT_SIZES,
  MAX_DURATION_S,
  type StageCamera,
  type StageCharacter,
  type StageKeyframe,
  type StagePose,
  type StageState,
} from '../scene/stageModel.ts';
import {
  createPlanAsset,
  createWall,
  ensureHost,
  planElementOf,
  updatePlanAsset,
  PLAN_CATEGORIES,
  type PlanAsset,
  type StageHost,
} from './planModel.ts';
import { addShotVersion, moveShotInOrder, syncShots } from './shotList.ts';

export type ParamType = 'number' | 'string' | 'boolean' | 'array' | 'object';
export type ParamSpec = { type: ParamType; description: string; required?: boolean; enum?: readonly string[] };

export type CommandContext = { host: StageHost & { stage: StageState }; timeS: number };
export type CommandOutput = { host: StageHost; result?: Record<string, unknown>; select?: string[] };

export type BlockingCommand = {
  id: string;
  label: string;
  group: 'Floor plan' | 'Character' | 'Camera' | 'Object' | 'Time' | 'Shots' | 'Scene';
  shortcut?: string;
  description: string;
  params: Record<string, ParamSpec>;
  run: (ctx: CommandContext, p: Record<string, unknown>) => CommandOutput;
};

/** ok=true carries host and result; ok=false carries error. (Flat shape: the build runs without strict narrowing.) */
export type CommandResult = { ok: boolean; host?: StageHost; result?: Record<string, unknown>; select?: string[]; error?: string };

const num = (description: string, required = false): ParamSpec => ({ type: 'number', description, required });
const text = (description: string, required = false, values?: readonly string[]): ParamSpec => ({ type: 'string', description, required, enum: values });
const bool = (description: string): ParamSpec => ({ type: 'boolean', description });

const fail = (message: string): never => { throw new Error(message); };

// ── helpers ─────────────────────────────────────────────────────────────────

type Kind = 'camera' | 'character' | 'element';
const findObject = (host: StageHost & { stage: StageState }, id: unknown, prefer?: Kind): { kind: Kind; id: string } => {
  const key = typeof id === 'string' ? id : '';
  if (!key) fail('Object ID missing.');
  if (host.stage.cameras.some((c) => c.id === key)) return { kind: 'camera', id: key };
  if (host.stage.characters.some((c) => c.id === key)) return { kind: 'character', id: key };
  if (host.assets.some((a) => a.id === key)) return { kind: 'element', id: key };
  // Friendly lookup by name for agents ("A", "Anna").
  const byName = (list: Array<{ id: string; name: string }>) => list.find((o) => o.name.toLowerCase() === key.toLowerCase());
  if (prefer === 'character') { const c = byName(host.stage.characters); if (c) return { kind: 'character', id: c.id }; }
  if (prefer === 'camera') { const c = byName(host.stage.cameras); if (c) return { kind: 'camera', id: c.id }; }
  const cam = byName(host.stage.cameras);
  const chr = byName(host.stage.characters);
  const asset = host.assets.find((a) => (a.name || '').toLowerCase() === key.toLowerCase());
  const hits = [cam && `Camera ${cam.id}`, chr && `Character ${chr.id}`, asset && `Element ${asset.id}`].filter(Boolean);
  if (hits.length > 1) fail(`”${key}” is ambiguous (${hits.join(', ')}) – please give the ID.`);
  if (cam) return { kind: 'camera', id: cam.id };
  if (chr) return { kind: 'character', id: chr.id };
  if (asset) return { kind: 'element', id: asset.id };
  return fail(`No object with ID or name “${key}”.`);
};

/** Current pose of any object at time t (animated if it has a track). */
export const poseAt = (host: StageHost & { stage: StageState }, id: string, t: number): StagePose | null => {
  const chr = charactersAt(host.stage, t).find((c) => c.id === id);
  if (chr) return { position: chr.position, yawDeg: chr.yawDeg };
  const cam = camerasAt(host.stage, t).find((c) => c.id === id);
  if (cam) return { position: cam.position, yawDeg: cam.yawDeg, pitchDeg: cam.pitchDeg, focalLengthMm: cam.focalLengthMm };
  const asset = host.assets.find((a) => a.id === id);
  if (!asset) return null;
  const keys = host.stage.animation.tracks[id];
  if (keys?.length) {
    const sampled = sampleTrack(keys, t);
    if (sampled) return { position: sampled.position, yawDeg: sampled.yawDeg };
  }
  return { position: { ...asset.position }, yawDeg: wrapDeg(asset.rotation?.y ?? 0) };
};

const withStage = (host: StageHost & { stage: StageState }, stage: StageState): StageHost & { stage: StageState } => ({ ...host, stage });

const setTrack = (stage: StageState, id: string, keys: StageKeyframe[]): StageState => {
  const tracks = { ...stage.animation.tracks };
  if (keys.length) tracks[id] = sortKeys(keys);
  else delete tracks[id];
  return { ...stage, animation: { ...stage.animation, tracks } };
};

const keyTolerance = (stage: StageState) => 0.5 / Math.max(1, stage.animation.fps);

/** Write a pose change: into the key at time t if the object is animated, else into its base pose. */
const applyPose = (
  host: StageHost & { stage: StageState },
  target: { kind: Kind; id: string },
  t: number,
  patch: Partial<{ x: number; y: number; z: number; yawDeg: number; pitchDeg: number; focalLengthMm: number }>,
): StageHost & { stage: StageState } => {
  const keys = host.stage.animation.tracks[target.id];
  if (keys && keys.length) {
    const current = poseAt(host, target.id, t);
    if (!current) return host;
    const tol = keyTolerance(host.stage);
    const existing = keys.find((k) => Math.abs(k.timeS - t) <= tol);
    const base: StageKeyframe = existing ?? { id: makeStageId('key'), timeS: t, position: current.position, yawDeg: current.yawDeg, pitchDeg: current.pitchDeg, focalLengthMm: current.focalLengthMm, easing: 'smooth' };
    const next: StageKeyframe = {
      ...base,
      position: { x: patch.x ?? base.position.x, y: patch.y ?? base.position.y, z: patch.z ?? base.position.z },
      yawDeg: patch.yawDeg !== undefined ? wrapDeg(patch.yawDeg) : base.yawDeg,
      pitchDeg: patch.pitchDeg ?? base.pitchDeg,
      focalLengthMm: patch.focalLengthMm ?? base.focalLengthMm,
    };
    const list = existing ? keys.map((k) => (k.id === existing.id ? next : k)) : [...keys, next];
    return withStage(host, setTrack(host.stage, target.id, list));
  }
  if (target.kind === 'camera') {
    return withStage(host, {
      ...host.stage,
      cameras: host.stage.cameras.map((c) => (c.id === target.id ? {
        ...c,
        position: { x: patch.x ?? c.position.x, y: patch.y ?? c.position.y, z: patch.z ?? c.position.z },
        yawDeg: patch.yawDeg !== undefined ? wrapDeg(patch.yawDeg) : c.yawDeg,
        pitchDeg: patch.pitchDeg !== undefined ? Math.max(-90, Math.min(90, patch.pitchDeg)) : c.pitchDeg,
        focalLengthMm: patch.focalLengthMm !== undefined ? Math.max(1, Math.min(2000, patch.focalLengthMm)) : c.focalLengthMm,
      } : c)),
    });
  }
  if (target.kind === 'character') {
    return withStage(host, {
      ...host.stage,
      characters: host.stage.characters.map((c) => (c.id === target.id ? {
        ...c,
        position: { x: patch.x ?? c.position.x, y: patch.y ?? c.position.y, z: patch.z ?? c.position.z },
        yawDeg: patch.yawDeg !== undefined ? wrapDeg(patch.yawDeg) : c.yawDeg,
      } : c)),
    });
  }
  return {
    ...host,
    assets: host.assets.map((a) => (a.id === target.id ? updatePlanAsset(a, { x: patch.x, z: patch.z, yawDeg: patch.yawDeg }) : a)),
  };
};

const ensureCameraName = (stage: StageState): string => {
  const used = new Set(stage.cameras.map((c) => c.name));
  for (let i = 0; i < 26 * 4; i += 1) {
    const name = i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`;
    if (!used.has(name)) return name;
  }
  return `Cam ${stage.cameras.length + 1}`;
};

const addCameraTo = (stage: StageState, input: Partial<StageCamera>): { stage: StageState; camera: StageCamera } => {
  const camera = createCamera({ name: ensureCameraName(stage), ...input }, stage.cameras.length);
  const next = syncShots({ ...stage, cameras: [...stage.cameras, camera], activeCameraId: stage.activeCameraId ?? camera.id });
  return { stage: next, camera };
};

/** Camera that looks at `target` from `distance` metres, `bearingDeg` around it (0 = in front of the subject). */
export const cameraAround = (target: StageCharacter, bearingDeg: number, distance: number, focalLengthMm: number, heightM?: number): Partial<StageCamera> => {
  const facing = (target.yawDeg + bearingDeg) * (Math.PI / 180);
  const fx = -Math.sin(facing);
  const fz = -Math.cos(facing);
  const position = { x: target.position.x + fx * distance, y: heightM ?? Math.max(0.3, eyeHeightM(target) - 0.05), z: target.position.z + fz * distance };
  const aim = aimAngles(position, { x: target.position.x, y: eyeHeightM(target), z: target.position.z });
  return { position, yawDeg: aim.yawDeg, pitchDeg: Math.round(aim.pitchDeg * 10) / 10, focalLengthMm };
};

/**
 * Over-the-shoulder camera: behind `other`'s shoulder looking at `subject`, on the same side of the
 * subject–other line as `sideRef` (e.g. the master camera) so cutting stays on one side of the 180° line.
 */
export const otsCamera = (subject: StageCharacter, other: StageCharacter, focalLengthMm = 50, sideRef?: { x: number; z: number }): Partial<StageCamera> => {
  const dx = other.position.x - subject.position.x;
  const dz = other.position.z - subject.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  let px = -uz;
  let pz = ux;
  if (sideRef) {
    const cross = dx * (sideRef.z - subject.position.z) - dz * (sideRef.x - subject.position.x);
    const mine = dx * pz - dz * px;
    if (Math.sign(cross) !== 0 && Math.sign(cross) !== Math.sign(mine)) { px = -px; pz = -pz; }
  }
  // Back far enough that the foreground shoulder sits at the frame edge for this lens.
  const back = 1.2;
  const halfFov = (cameraFovDeg({ focalLengthMm, sensorWidthMm: 24.89, sensorHeightMm: 18.66, sensorFit: 'auto' }).horizontal / 2) * (Math.PI / 180);
  const lateral = Math.max(0.2, back * Math.tan(halfFov) * 0.9);
  const position = { x: other.position.x + ux * back + px * lateral, y: eyeHeightM(other) + 0.05, z: other.position.z + uz * back + pz * lateral };
  const aim = aimAngles(position, { x: subject.position.x, y: eyeHeightM(subject), z: subject.position.z });
  return { position, yawDeg: aim.yawDeg, pitchDeg: Math.round(aim.pitchDeg * 10) / 10, focalLengthMm };
};

// ── templates ───────────────────────────────────────────────────────────────

export const TEMPLATES: Array<{ id: string; label: string; description: string }> = [
  { id: 'dialog-two', label: 'Two-person dialogue', description: 'Two characters facing each other, master plus two over-the-shoulders, 180° line.' },
  { id: 'walk-talk', label: 'Walk & Talk', description: 'Two characters walk side by side, the camera tracks backward in front of them.' },
  { id: 'table-three', label: 'Three at a table', description: 'Three characters around a table, master and three singles.' },
  { id: 'interview', label: 'Interview', description: 'One person, A camera medium shot, B camera side long shot.' },
];

const applyTemplate = (host: StageHost & { stage: StageState }, id: string, origin: { x: number; z: number }): StageHost & { stage: StageState } => {
  let stage = host.stage;
  let assets = host.assets;
  const addChr = (name: string, x: number, z: number, yawDeg: number, extra: Partial<StageCharacter> = {}) => {
    const chr = createCharacter({ name, position: { x: origin.x + x, y: 0, z: origin.z + z }, yawDeg, ...extra }, stage.characters.length);
    stage = { ...stage, characters: [...stage.characters, chr] };
    return chr;
  };
  const addCam = (input: Partial<StageCamera>) => {
    const out = addCameraTo(stage, input);
    stage = out.stage;
    return out.camera;
  };
  if (id === 'dialog-two') {
    const a = addChr('Anna', -0.9, 0, -90);
    const b = addChr('Ben', 0.9, 0, 90);
    const master = addCam({ ...cameraAround({ ...a, position: { x: origin.x, y: 0, z: origin.z }, yawDeg: 0 }, 180, 4.2, 28), name: 'A' });
    // Over-shoulder pair on the master's side of the line.
    addCam({ ...otsCamera(a, b, 50, master.position), name: 'B' });
    addCam({ ...otsCamera(b, a, 50, master.position), name: 'C' });
    stage = { ...stage, lineOfAction: { aId: a.id, bId: b.id } };
    assets = [...assets, createPlanAsset({ category: 'table', x: origin.x, z: origin.z - 0.9, w: 1.2, d: 0.6 })];
  } else if (id === 'walk-talk') {
    const a = addChr('Anna', -0.45, 3, 0);
    const b = addChr('Ben', 0.45, 3, 0);
    const d = Math.min(stage.animation.durationS, 8);
    for (const chr of [a, b]) {
      stage = setTrack(stage, chr.id, [
        normalizeKeyframe({ timeS: 0, position: chr.position, yawDeg: 0, easing: 'linear' }),
        normalizeKeyframe({ timeS: d, position: { ...chr.position, z: chr.position.z - 6 }, yawDeg: 0, easing: 'linear' }),
      ]);
    }
    const cam = addCam({ position: { x: origin.x, y: 1.55, z: origin.z + 0.6 }, yawDeg: 180, focalLengthMm: 35, name: 'A' });
    stage = setTrack(stage, cam.id, [
      normalizeKeyframe({ timeS: 0, position: cam.position, yawDeg: 180, easing: 'linear' }),
      normalizeKeyframe({ timeS: d, position: { ...cam.position, z: cam.position.z - 6 }, yawDeg: 180, easing: 'linear' }),
    ]);
    stage = { ...stage, lineOfAction: { aId: a.id, bId: b.id } };
    assets = [
      ...assets,
      createWall(origin.x - 1.6, origin.z + 4, origin.x - 1.6, origin.z - 4),
      createWall(origin.x + 1.6, origin.z + 4, origin.x + 1.6, origin.z - 4),
    ];
  } else if (id === 'table-three') {
    assets = [...assets, createPlanAsset({ category: 'table', x: origin.x, z: origin.z, w: 1.4, d: 1.4 })];
    const people = [
      addChr('Anna', 0, -1.05, 180, { posture: 'sitting' }),
      addChr('Ben', 1.0, 0.45, 60, { posture: 'sitting' }),
      addChr('Clara', -1.0, 0.45, -60, { posture: 'sitting' }),
    ];
    addCam({ position: { x: origin.x, y: 1.7, z: origin.z + 4.5 }, yawDeg: 0, pitchDeg: -12, focalLengthMm: 24, name: 'A' });
    people.forEach((p, i) => addCam({ ...cameraAround(p, 0, 1.9, 65), name: String.fromCharCode(66 + i) }));
  } else if (id === 'interview') {
    const p = addChr('Gast', 0, 0, 30, { posture: 'sitting' });
    addCam({ ...cameraAround(p, -30, 2.2, 50), name: 'A' });
    addCam({ ...cameraAround(p, 55, 3.2, 85), name: 'B' });
    assets = [...assets, createPlanAsset({ category: 'chair', x: origin.x, z: origin.z, yawDeg: 30 })];
  } else {
    fail(`Unknown template “${id}”.`);
  }
  return { ...host, assets, stage: syncShots(stage) };
};

// ── registry ────────────────────────────────────────────────────────────────

const pickNumber = (p: Record<string, unknown>, key: string, fallback?: number, min?: number, max?: number) =>
  p[key] === undefined || p[key] === null || p[key] === '' ? fallback : finite(p[key], fallback ?? 0, min, max);

export const BLOCKING_COMMANDS: BlockingCommand[] = [
  // Grundriss
  {
    id: 'plan.addElement', label: 'Add element', group: 'Floor plan',
    description: 'Place a set element (furniture, door, window, prop) in the floor plan. Also appears in 3D Set Design as a box.',
    params: { category: text('Element type', true, PLAN_CATEGORIES), x: num('Center x in m', true), z: num('Center z in m', true), w: num('Width in m'), d: num('Depth in m'), h: num('Height in m'), yawDeg: num('Rotation in degrees'), label: text('Name') },
    run: ({ host }, p) => {
      const asset = createPlanAsset({ category: String(p.category), x: finite(p.x, 0), z: finite(p.z, 0), w: pickNumber(p, 'w'), d: pickNumber(p, 'd'), h: pickNumber(p, 'h'), yawDeg: pickNumber(p, 'yawDeg'), label: typeof p.label === 'string' ? p.label : undefined });
      return { host: { ...host, assets: [...host.assets, asset] }, result: { id: asset.id }, select: [asset.id] };
    },
  },
  {
    id: 'plan.addWall', label: 'Draw wall', group: 'Floor plan', shortcut: 'W',
    description: 'Wall from point 1 to point 2 (meters). Several segments = several calls.',
    params: { x1: num('Start x', true), z1: num('Start z', true), x2: num('End x', true), z2: num('End z', true), thickness: num('Wall thickness in m (0.15)'), height: num('Wall height in m (2.6)') },
    run: ({ host }, p) => {
      const wall = createWall(finite(p.x1, 0), finite(p.z1, 0), finite(p.x2, 1), finite(p.z2, 0), finite(p.thickness, 0.15, 0.02, 2), finite(p.height, 2.6, 0.1, 20));
      return { host: { ...host, assets: [...host.assets, wall] }, result: { id: wall.id }, select: [wall.id] };
    },
  },
  {
    id: 'plan.addRoom', label: 'Create room', group: 'Floor plan',
    description: 'Rectangular room of four walls around a center point.',
    params: { x: num('Center x'), z: num('Center z'), width: num('Width in m', true), depth: num('Depth in m', true), height: num('Wall height'), openSide: text('Open side for the camera', false, ['none', 'south', 'north', 'east', 'west']) },
    run: ({ host }, p) => {
      const cx = finite(p.x, 0);
      const cz = finite(p.z, 0);
      const w = finite(p.width, 6, 0.5, 200) / 2;
      const d = finite(p.depth, 5, 0.5, 200) / 2;
      const h = finite(p.height, 2.6, 0.1, 20);
      const open = typeof p.openSide === 'string' ? p.openSide : 'south';
      const walls = [
        open !== 'north' ? createWall(cx - w, cz - d, cx + w, cz - d, 0.15, h) : null,
        open !== 'east' ? createWall(cx + w, cz - d, cx + w, cz + d, 0.15, h) : null,
        open !== 'south' ? createWall(cx + w, cz + d, cx - w, cz + d, 0.15, h) : null,
        open !== 'west' ? createWall(cx - w, cz + d, cx - w, cz - d, 0.15, h) : null,
      ].filter((x): x is PlanAsset => !!x);
      return { host: { ...host, assets: [...host.assets, ...walls] }, result: { ids: walls.map((w2) => w2.id) } };
    },
  },
  {
    id: 'plan.updateElement', label: 'Change element', group: 'Floor plan',
    description: 'Change the size, position, rotation or label of a set element.',
    params: { id: text('Element-ID', true), x: num('x'), z: num('z'), w: num('Width'), d: num('Depth'), h: num('Height'), yawDeg: num('Rotation'), label: text('Name'), color: text('Color (#rrggbb)') },
    run: ({ host }, p) => {
      const id = String(p.id || '');
      if (!host.assets.some((a) => a.id === id)) fail(`No element “${id}”.`);
      return {
        host: { ...host, assets: host.assets.map((a) => (a.id === id ? updatePlanAsset(a, { x: pickNumber(p, 'x'), z: pickNumber(p, 'z'), w: pickNumber(p, 'w', undefined, 0.01, 500), d: pickNumber(p, 'd', undefined, 0.01, 500), h: pickNumber(p, 'h', undefined, 0.005, 100), yawDeg: pickNumber(p, 'yawDeg'), label: typeof p.label === 'string' ? p.label : undefined, color: typeof p.color === 'string' ? p.color : undefined }) : a)) },
        result: { id },
      };
    },
  },
  {
    id: 'plan.setBackground', label: 'Background plan', group: 'Floor plan',
    description: 'Floor plan drawing as background (image URL or data URL) with a scale in meters per pixel. An empty URL removes it.',
    params: { url: text('Image URL'), mPerPx: num('Meter pro Bildpixel (z. B. 0,01)'), opacity: num('Opacity 0–1'), x: num('Offset x'), z: num('Offset z') },
    run: ({ host }, p) => {
      const plan = { ...(host.stage.plan || {}) };
      if (typeof p.url === 'string') plan.backgroundUrl = p.url || null;
      if (p.mPerPx !== undefined) plan.backgroundMPerPx = finite(p.mPerPx, 0.01, 1e-5, 100);
      if (p.opacity !== undefined) plan.backgroundOpacity = finite(p.opacity, 0.5, 0, 1);
      if (p.x !== undefined || p.z !== undefined) plan.backgroundOffset = { x: finite(p.x, plan.backgroundOffset?.x ?? 0), z: finite(p.z, plan.backgroundOffset?.z ?? 0) };
      return { host: withStage(host, { ...host.stage, plan }) };
    },
  },
  // Figur
  {
    id: 'character.add', label: 'Add character', group: 'Character', shortcut: 'F',
    description: 'Place a character in the plan. referenceId links a cast reference of the project.',
    params: { name: text('Name'), x: num('x', true), z: num('z', true), yawDeg: num('Facing direction in degrees (0 = up/north)'), heightM: num('Body height in m'), posture: text('Pose', false, ['standing', 'sitting', 'lying']), referenceId: text('Cast-Referenz-ID'), color: text('Color') },
    run: ({ host }, p) => {
      const chr = createCharacter({
        name: typeof p.name === 'string' && p.name ? p.name : undefined,
        position: { x: finite(p.x, 0), y: 0, z: finite(p.z, 0) },
        yawDeg: finite(p.yawDeg, 0),
        heightM: pickNumber(p, 'heightM', undefined, 0.3, 3),
        posture: p.posture as StageCharacter['posture'],
        referenceId: typeof p.referenceId === 'string' ? p.referenceId : undefined,
        color: typeof p.color === 'string' ? p.color : undefined,
      }, host.stage.characters.length);
      return { host: withStage(host, { ...host.stage, characters: [...host.stage.characters, chr] }), result: { id: chr.id, name: chr.name }, select: [chr.id] };
    },
  },
  {
    id: 'character.update', label: 'Change character', group: 'Character',
    description: 'Change the name, height, pose, color or cast link of a character.',
    params: { id: text('Character ID or name', true), name: text('Name'), heightM: num('Body height'), posture: text('Pose', false, ['standing', 'sitting', 'lying']), referenceId: text('Cast-Referenz-ID'), color: text('Color') },
    run: ({ host }, p) => {
      const target = findObject(host, p.id, 'character');
      if (target.kind !== 'character') fail('The object is not a character.');
      const characters = host.stage.characters.map((c) => (c.id === target.id ? {
        ...c,
        ...(typeof p.name === 'string' && p.name ? { name: p.name.slice(0, 120) } : {}),
        ...(p.heightM !== undefined ? { heightM: finite(p.heightM, c.heightM, 0.3, 3) } : {}),
        ...(typeof p.posture === 'string' && ['standing', 'sitting', 'lying'].includes(p.posture) ? { posture: p.posture as StageCharacter['posture'] } : {}),
        ...(typeof p.referenceId === 'string' ? { referenceId: p.referenceId || undefined } : {}),
        ...(typeof p.color === 'string' && p.color ? { color: p.color } : {}),
      } : c));
      return { host: withStage(host, { ...host.stage, characters }), result: { id: target.id } };
    },
  },
  // Kamera
  {
    id: 'camera.add', label: 'Add camera', group: 'Camera', shortcut: 'C',
    description: 'Place a camera. With aimAt (character ID/name) it aims at the character. Also appears in 3D Set Design.',
    params: { x: num('x', true), z: num('z', true), yawDeg: num('Facing direction'), heightM: num('Lens height in m (1.6)'), pitchDeg: num('Neigung in Grad (+ = hoch)'), focalLengthMm: num('Focal length in mm (35)'), name: text('Name, z. B. A'), aimAt: text('Aim at character (ID or name)'), follow: bool('Camera pans with the character') },
    run: ({ host, timeS }, p) => {
      const position = { x: finite(p.x, 0), y: finite(p.heightM, 1.6, 0, 100), z: finite(p.z, 4) };
      let yawDeg = finite(p.yawDeg, 0);
      let pitchDeg = finite(p.pitchDeg, 0, -90, 90);
      let followId: string | null = null;
      if (typeof p.aimAt === 'string' && p.aimAt) {
        const target = findObject(host, p.aimAt, 'character');
        const chr = charactersAt(host.stage, timeS).find((c) => c.id === target.id);
        if (chr) {
          const aim = aimAngles(position, { x: chr.position.x, y: eyeHeightM(chr), z: chr.position.z });
          yawDeg = aim.yawDeg;
          if (p.pitchDeg === undefined) pitchDeg = Math.round(aim.pitchDeg * 10) / 10;
          if (p.follow === true) followId = chr.id;
        }
      }
      const out = addCameraTo(host.stage, {
        position, yawDeg, pitchDeg, followId,
        focalLengthMm: finite(p.focalLengthMm, 35, 1, 2000),
        ...(typeof p.name === 'string' && p.name ? { name: p.name.slice(0, 60) } : {}),
      });
      return { host: withStage(host, out.stage), result: { id: out.camera.id, name: out.camera.name }, select: [out.camera.id] };
    },
  },
  {
    id: 'camera.update', label: 'Set camera', group: 'Camera',
    description: 'Focal length, height, tilt, sensor or name of a camera. On an animated camera, focal length/tilt are keyed at the current time (zoom).',
    params: { id: text('Camera ID or name', true), focalLengthMm: num('Focal length mm'), horizontalFovDeg: num('Alternative: horizontal field of view in degrees'), heightM: num('Lens height m'), pitchDeg: num('Tilt'), rollDeg: num('Roles'), sensor: text('Sensor-Preset', false, SENSOR_PRESETS.map((s) => s.id)), name: text('Name'), color: text('Color') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id, 'camera');
      if (target.kind !== 'camera') fail('The object is not a camera.');
      const cam = host.stage.cameras.find((c) => c.id === target.id) as StageCamera;
      const preset = SENSOR_PRESETS.find((s) => s.id === p.sensor);
      let focal = pickNumber(p, 'focalLengthMm', undefined, 1, 2000);
      if (focal === undefined && p.horizontalFovDeg !== undefined) focal = focalForHorizontalFov(finite(p.horizontalFovDeg, 40, 1, 179), preset?.widthMm ?? cam.sensorWidthMm);
      let next = withStage(host, {
        ...host.stage,
        cameras: host.stage.cameras.map((c) => (c.id === target.id ? {
          ...c,
          ...(preset ? { sensorWidthMm: preset.widthMm, sensorHeightMm: preset.heightMm } : {}),
          ...(typeof p.name === 'string' && p.name ? { name: p.name.slice(0, 60) } : {}),
          ...(typeof p.color === 'string' && p.color ? { color: p.color } : {}),
          ...(p.rollDeg !== undefined ? { rollDeg: wrapDeg(finite(p.rollDeg, 0)) } : {}),
        } : c)),
      });
      const posePatch: Record<string, number> = {};
      if (focal !== undefined) posePatch.focalLengthMm = focal;
      if (p.pitchDeg !== undefined) posePatch.pitchDeg = finite(p.pitchDeg, 0, -90, 90);
      if (p.heightM !== undefined) posePatch.y = finite(p.heightM, 1.6, 0, 100);
      if (Object.keys(posePatch).length) next = applyPose(next, target, timeS, posePatch);
      return { host: next, result: { id: target.id, focalLengthMm: focal ?? cam.focalLengthMm } };
    },
  },
  {
    id: 'camera.aimAt', label: 'Aim camera', group: 'Camera', shortcut: 'L',
    description: 'Aim a camera at a character or a point. follow=true: it pans with the character over time.',
    params: { id: text('Camera ID or name', true), targetId: text('Character ID or name'), x: num('or target point x'), z: num('Target point z'), follow: bool('Track') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id, 'camera');
      if (target.kind !== 'camera') fail('The object is not a camera.');
      const cam = camerasAt(host.stage, timeS).find((c) => c.id === target.id) as StageCamera;
      let aimPoint: { x: number; y: number; z: number } | null = null;
      let followId: string | null | undefined;
      if (typeof p.targetId === 'string' && p.targetId) {
        const t2 = findObject(host, p.targetId, 'character');
        const chr = charactersAt(host.stage, timeS).find((c) => c.id === t2.id);
        if (chr) aimPoint = { x: chr.position.x, y: eyeHeightM(chr), z: chr.position.z };
        else {
          const pose = poseAt(host, t2.id, timeS);
          if (pose) aimPoint = { ...pose.position, y: 1 };
        }
        followId = p.follow === true && chr ? chr.id : p.follow === false ? null : undefined;
      } else if (p.x !== undefined && p.z !== undefined) {
        aimPoint = { x: finite(p.x, 0), y: 1.5, z: finite(p.z, 0) };
        followId = null;
      }
      if (!aimPoint) fail('Target missing (targetId or x/z).');
      const aim = aimAngles(cam.position, aimPoint as { x: number; y: number; z: number });
      let next = applyPose(host, target, timeS, { yawDeg: aim.yawDeg, pitchDeg: Math.round(aim.pitchDeg * 10) / 10 });
      if (followId !== undefined) next = withStage(next, { ...next.stage, cameras: next.stage.cameras.map((c) => (c.id === target.id ? { ...c, followId } : c)) });
      return { host: next, result: { id: target.id, yawDeg: aim.yawDeg } };
    },
  },
  {
    id: 'camera.setActive', label: 'Active camera', group: 'Camera',
    description: 'Choose the camera for the viewfinder, storyboard and 3D camera view.',
    params: { id: text('Camera ID or name', true) },
    run: ({ host }, p) => {
      const target = findObject(host, p.id, 'camera');
      if (target.kind !== 'camera') fail('The object is not a camera.');
      return { host: withStage(host, { ...host.stage, activeCameraId: target.id }), result: { id: target.id }, select: [target.id] };
    },
  },
  {
    id: 'camera.cover', label: 'Create coverage', group: 'Camera',
    description: 'Create cameras for a character: single (frontal medium shot), ots (over the shoulder of a second character), profile (side).',
    params: { targetId: text('Character ID or name', true), pattern: text('Muster', true, ['single', 'ots', 'profile', 'closeup']), otherId: text('Second character for OTS'), focalLengthMm: num('Focal length') },
    run: ({ host, timeS }, p) => {
      const chars = charactersAt(host.stage, timeS);
      const t = findObject(host, p.targetId, 'character');
      const chr = chars.find((c) => c.id === t.id);
      if (!chr) fail('The target is not a character.');
      const subject = chr as StageCharacter;
      const pattern = String(p.pattern);
      let input: Partial<StageCamera>;
      if (pattern === 'ots') {
        const otherKey = p.otherId ? findObject(host, p.otherId, 'character').id : null;
        const other = chars.find((c) => c.id === otherKey) ?? chars.find((c) => c.id !== subject.id);
        if (!other) fail('An OTS needs a second character.');
        const ref = camerasAt(host.stage, timeS).find((c) => c.id === host.stage.activeCameraId) ?? camerasAt(host.stage, timeS)[0];
        input = otsCamera(subject, other as StageCharacter, finite(p.focalLengthMm, 50, 1, 2000), ref?.position);
      } else if (pattern === 'profile') {
        input = cameraAround(subject, 90, 2.6, finite(p.focalLengthMm, 50, 1, 2000));
      } else if (pattern === 'closeup') {
        input = cameraAround(subject, -15, 1.4, finite(p.focalLengthMm, 85, 1, 2000));
      } else {
        input = cameraAround(subject, -10, 2.2, finite(p.focalLengthMm, 50, 1, 2000));
      }
      const out = addCameraTo(host.stage, input);
      return { host: withStage(host, out.stage), result: { id: out.camera.id, name: out.camera.name }, select: [out.camera.id] };
    },
  },
  // Objekt (alle Arten)
  {
    id: 'object.move', label: 'Move', group: 'Object', shortcut: 'G',
    description: 'Move a character, camera or element. If the object is animated, the position is keyed at the current time.',
    params: { id: text('Object ID or name', true), x: num('x'), z: num('z'), dx: num('or relative dx'), dz: num('relative dz'), timeS: num('Zeitpunkt (Standard: Playhead)') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id);
      const t = pickNumber(p, 'timeS', timeS, 0, host.stage.animation.durationS) as number;
      const pose = poseAt(host, target.id, t);
      if (!pose) fail('Object not found.');
      const x = p.x !== undefined ? finite(p.x, 0) : (pose as StagePose).position.x + finite(p.dx, 0);
      const z = p.z !== undefined ? finite(p.z, 0) : (pose as StagePose).position.z + finite(p.dz, 0);
      return { host: applyPose(host, target, t, { x, z }), result: { id: target.id, x, z } };
    },
  },
  {
    id: 'object.rotate', label: 'Rotate', group: 'Object', shortcut: 'R',
    description: 'Set facing/rotation (degrees, 0 = north/up, positive = counterclockwise) or rotate relatively by delta.',
    params: { id: text('Object ID or name', true), yawDeg: num('Absolute direction'), delta: num('Relative rotation'), timeS: num('Point in time') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id);
      const t = pickNumber(p, 'timeS', timeS, 0, host.stage.animation.durationS) as number;
      const pose = poseAt(host, target.id, t);
      if (!pose) fail('Object not found.');
      const yaw = p.yawDeg !== undefined ? finite(p.yawDeg, 0) : (pose as StagePose).yawDeg + finite(p.delta, 0);
      let next = applyPose(host, target, t, { yawDeg: yaw });
      // Turning a following camera by hand releases the follow.
      if (target.kind === 'camera') next = withStage(next, { ...next.stage, cameras: next.stage.cameras.map((c) => (c.id === target.id ? { ...c, followId: null } : c)) });
      return { host: next, result: { id: target.id, yawDeg: wrapDeg(yaw) } };
    },
  },
  {
    id: 'object.delete', label: 'Delete', group: 'Object', shortcut: 'Del',
    description: 'Delete an object with its motion path. The camera shots disappear unless they are detached.',
    params: { id: text('Object ID or name', true) },
    run: ({ host }, p) => {
      const target = findObject(host, p.id);
      let stage = setTrack(host.stage, target.id, []);
      stage = {
        ...stage,
        cameras: stage.cameras.filter((c) => c.id !== target.id).map((c) => (c.followId === target.id ? { ...c, followId: null } : c)),
        characters: stage.characters.filter((c) => c.id !== target.id),
        lineOfAction: stage.lineOfAction && (stage.lineOfAction.aId === target.id || stage.lineOfAction.bId === target.id) ? null : stage.lineOfAction,
      };
      if (stage.activeCameraId === target.id) stage.activeCameraId = stage.cameras[0]?.id ?? null;
      return { host: { ...host, assets: host.assets.filter((a) => a.id !== target.id), stage: syncShots(stage) }, result: { deleted: target.id }, select: [] };
    },
  },
  {
    id: 'object.duplicate', label: 'Duplicate', group: 'Object', shortcut: 'Ctrl+D',
    description: 'Copy the object offset by 1 m (without motion path).',
    params: { id: text('Object ID or name', true) },
    run: ({ host }, p) => {
      const target = findObject(host, p.id);
      if (target.kind === 'element') {
        const src = host.assets.find((a) => a.id === target.id) as PlanAsset;
        const copy: PlanAsset = { ...src, id: makeStageId(src.plan?.category || 'asset'), position: { ...src.position, x: src.position.x + 1, z: src.position.z + 1 } };
        return { host: { ...host, assets: [...host.assets, copy] }, result: { id: copy.id }, select: [copy.id] };
      }
      if (target.kind === 'character') {
        const src = host.stage.characters.find((c) => c.id === target.id) as StageCharacter;
        const copy = createCharacter({ ...src, id: undefined, name: `${src.name} 2`, position: { ...src.position, x: src.position.x + 1 } }, host.stage.characters.length);
        return { host: withStage(host, { ...host.stage, characters: [...host.stage.characters, copy] }), result: { id: copy.id }, select: [copy.id] };
      }
      const src = host.stage.cameras.find((c) => c.id === target.id) as StageCamera;
      const out = addCameraTo(host.stage, { ...src, id: undefined, name: undefined, followId: src.followId, position: { ...src.position, x: src.position.x + 1 } });
      return { host: withStage(host, out.stage), result: { id: out.camera.id }, select: [out.camera.id] };
    },
  },
  {
    id: 'object.setFlags', label: 'Lock/Hide', group: 'Object',
    description: 'Lock (not movable) or hide a character or camera.',
    params: { id: text('Object ID or name', true), locked: bool('Locked'), hidden: bool('Hidden') },
    run: ({ host }, p) => {
      const target = findObject(host, p.id);
      const patch = (o: { locked?: boolean; hidden?: boolean }) => ({ ...o, ...(typeof p.locked === 'boolean' ? { locked: p.locked } : {}), ...(typeof p.hidden === 'boolean' ? { hidden: p.hidden } : {}) });
      return {
        host: withStage(host, {
          ...host.stage,
          cameras: host.stage.cameras.map((c) => (c.id === target.id ? patch(c) as StageCamera : c)),
          characters: host.stage.characters.map((c) => (c.id === target.id ? patch(c) as StageCharacter : c)),
        }),
      };
    },
  },
  // Zeit
  {
    id: 'key.add', label: 'Remember position', group: 'Time', shortcut: 'K',
    description: 'New motion key (keyframe) for an object at time timeS. Without x/z the current position is used. If the path is empty, a start key at 0 s is also created.',
    params: { id: text('Object ID or name', true), timeS: num('Zeit in s (Standard: Playhead)'), x: num('x'), z: num('z'), yawDeg: num('Direction'), pitchDeg: num('Camera: tilt'), focalLengthMm: num('Camera: focal length (zoom)'), easing: text('Transition to the next key', false, ['linear', 'smooth', 'hold']), label: text('Label') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id);
      const t = pickNumber(p, 'timeS', timeS, 0, host.stage.animation.durationS) as number;
      const current = poseAt(host, target.id, t) as StagePose;
      let keys = [...(host.stage.animation.tracks[target.id] || [])];
      if (keys.length === 0 && t > keyTolerance(host.stage)) {
        const start = poseAt(host, target.id, 0) as StagePose;
        keys.push(normalizeKeyframe({ timeS: 0, position: start.position, yawDeg: start.yawDeg, pitchDeg: start.pitchDeg, focalLengthMm: start.focalLengthMm, easing: 'smooth' }));
      }
      const key = normalizeKeyframe({
        timeS: t,
        position: { x: finite(p.x, current.position.x), y: current.position.y, z: finite(p.z, current.position.z) },
        yawDeg: finite(p.yawDeg, current.yawDeg),
        pitchDeg: p.pitchDeg !== undefined ? finite(p.pitchDeg, 0) : current.pitchDeg,
        focalLengthMm: p.focalLengthMm !== undefined ? finite(p.focalLengthMm, 35) : current.focalLengthMm,
        easing: p.easing,
        label: p.label,
      }, host.stage.animation.durationS);
      const tol = keyTolerance(host.stage);
      keys = keys.filter((k) => Math.abs(k.timeS - t) > tol);
      keys.push(key);
      return { host: withStage(host, setTrack(host.stage, target.id, keys)), result: { id: target.id, keyId: key.id, timeS: key.timeS } };
    },
  },
  {
    id: 'key.update', label: 'Change marker', group: 'Time',
    description: 'Change the time, position or transition of a motion key.',
    params: { id: text('Object ID or name', true), keyId: text('Marken-ID', true), timeS: num('New time'), x: num('x'), z: num('z'), yawDeg: num('Direction'), pitchDeg: num('Tilt'), focalLengthMm: num('Focal length'), easing: text('Transition', false, ['linear', 'smooth', 'hold']) },
    run: ({ host }, p) => {
      const target = findObject(host, p.id);
      const keys = host.stage.animation.tracks[target.id] || [];
      const key = keys.find((k) => k.id === p.keyId);
      if (!key) fail('Marker not found.');
      const k0 = key as StageKeyframe;
      const next = normalizeKeyframe({
        ...k0,
        timeS: p.timeS !== undefined ? finite(p.timeS, k0.timeS) : k0.timeS,
        position: { x: finite(p.x, k0.position.x), y: k0.position.y, z: finite(p.z, k0.position.z) },
        yawDeg: finite(p.yawDeg, k0.yawDeg),
        pitchDeg: p.pitchDeg !== undefined ? finite(p.pitchDeg, 0) : k0.pitchDeg,
        focalLengthMm: p.focalLengthMm !== undefined ? finite(p.focalLengthMm, 35) : k0.focalLengthMm,
        easing: p.easing ?? k0.easing,
      }, host.stage.animation.durationS);
      return { host: withStage(host, setTrack(host.stage, target.id, keys.map((k) => (k.id === k0.id ? next : k)))), result: { keyId: next.id, timeS: next.timeS } };
    },
  },
  {
    id: 'key.delete', label: 'Delete marker', group: 'Time',
    description: 'Delete a motion key. If only one is left, the path is removed and the position becomes the base position.',
    params: { id: text('Object ID or name', true), keyId: text('Marken-ID', true) },
    run: ({ host }, p) => {
      const target = findObject(host, p.id);
      const keys = (host.stage.animation.tracks[target.id] || []).filter((k) => k.id !== p.keyId);
      let next = withStage(host, setTrack(host.stage, target.id, keys.length > 1 ? keys : []));
      if (keys.length === 1) next = applyPose(next, target, 0, { x: keys[0].position.x, z: keys[0].position.z, yawDeg: keys[0].yawDeg, ...(keys[0].focalLengthMm ? { focalLengthMm: keys[0].focalLengthMm } : {}) });
      return { host: next };
    },
  },
  {
    id: 'track.clear', label: 'Remove motion', group: 'Time',
    description: 'Delete all motion keys of an object; it stays where it is at the current time.',
    params: { id: text('Object ID or name', true) },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.id);
      const pose = poseAt(host, target.id, timeS) as StagePose;
      let next = withStage(host, setTrack(host.stage, target.id, []));
      next = applyPose(next, target, timeS, { x: pose.position.x, z: pose.position.z, yawDeg: pose.yawDeg, ...(pose.focalLengthMm ? { focalLengthMm: pose.focalLengthMm } : {}) });
      return { host: next };
    },
  },
  {
    id: 'track.retime', label: 'Change speed', group: 'Time',
    description: 'Faster/slower motion: stretch all keys of an object (or of all objects, without id) from the first key by factor (0.5 = twice as fast).',
    params: { id: text('Object ID or name (empty = all)'), factor: num('Time factor', true) },
    run: ({ host }, p) => {
      const factor = finite(p.factor, 1, 0.05, 20);
      const ids = p.id ? [findObject(host, p.id).id] : Object.keys(host.stage.animation.tracks);
      let stage = host.stage;
      let maxT = stage.animation.durationS;
      for (const id of ids) {
        const keys = stage.animation.tracks[id];
        if (!keys?.length) continue;
        const t0 = keys[0].timeS;
        const scaled = keys.map((k) => ({ ...k, timeS: Math.min(MAX_DURATION_S, t0 + (k.timeS - t0) * factor) }));
        maxT = Math.max(maxT, scaled[scaled.length - 1].timeS);
        stage = setTrack(stage, id, scaled);
      }
      stage = { ...stage, animation: { ...stage.animation, durationS: Math.min(MAX_DURATION_S, maxT) } };
      return { host: withStage(host, syncShots(stage)) };
    },
  },
  {
    id: 'anim.setDuration', label: 'Scene length', group: 'Time',
    description: 'Scene length in seconds (and optionally fps).',
    params: { durationS: num('Length in s', true), fps: num('Frames per second') },
    run: ({ host }, p) => {
      const durationS = finite(p.durationS, 10, 0.5, MAX_DURATION_S);
      const fps = Math.round(finite(p.fps, host.stage.animation.fps, 1, 240));
      return { host: withStage(host, syncShots({ ...host.stage, animation: { ...host.stage.animation, durationS, fps } })) };
    },
  },
  // Shots
  {
    id: 'shot.add', label: 'Shot-Version anlegen', group: 'Shots', shortcut: 'S',
    description: 'Another version (1B, 1C …) of a camera for a time range of the scene.',
    params: { cameraId: text('Camera ID or name', true), startS: num('Start in s'), endS: num('End in s'), description: text('Description') },
    run: ({ host, timeS }, p) => {
      const target = findObject(host, p.cameraId, 'camera');
      if (target.kind !== 'camera') fail('The object is not a camera.');
      const out = addShotVersion(host.stage, target.id, finite(p.startS, timeS, 0), pickNumber(p, 'endS'));
      if (!out.shot) fail('Shot could not be created.');
      let stage = out.stage;
      if (typeof p.description === 'string') stage = { ...stage, shots: stage.shots.map((s) => (s.id === out.shot?.id ? { ...s, description: String(p.description) } : s)) };
      return { host: withStage(host, stage), result: { id: out.shot?.id, code: `${out.shot?.number}${out.shot?.version}` } };
    },
  },
  {
    id: 'shot.update', label: 'Edit shot', group: 'Shots',
    description: 'Description, time range, shot size, movement, lens, props, technique, crew or notes of a shot. null/empty resets overrides.',
    params: {
      id: text('Shot ID or code such as 2B', true), description: text('Description'), startS: num('Start'), endS: num('End'),
      size: text('Shot size', false, [...SHOT_SIZES, 'auto']), move: text('Motion', false, [...CAMERA_MOVES, 'auto']), lensMm: num('Lens mm (0 = from camera)'),
      props: text('Props'), gear: text('Technique/gear'), crew: text('Crew'), notes: text('Notes'),
    },
    run: ({ host }, p) => {
      const shot = findShot(host.stage, p.id);
      const patch: Record<string, unknown> = {};
      for (const key of ['description', 'props', 'gear', 'crew', 'notes'] as const) if (typeof p[key] === 'string') patch[key] = (p[key] as string).slice(0, 4000);
      if (p.startS !== undefined) patch.startS = finite(p.startS, shot.startS, 0, host.stage.animation.durationS);
      if (p.endS !== undefined) patch.endS = finite(p.endS, shot.endS, 0, host.stage.animation.durationS);
      if (typeof p.size === 'string') patch.sizeOverride = p.size === 'auto' ? null : (SHOT_SIZES as readonly string[]).includes(p.size) ? p.size : shot.sizeOverride;
      if (typeof p.move === 'string') patch.moveOverride = p.move === 'auto' ? null : (CAMERA_MOVES as readonly string[]).includes(p.move) ? p.move : shot.moveOverride;
      if (p.lensMm !== undefined) patch.lensOverrideMm = finite(p.lensMm, 0) > 0 ? finite(p.lensMm, 35, 1, 2000) : null;
      const shots = host.stage.shots.map((s) => (s.id === shot.id ? { ...s, ...patch } : s));
      return { host: withStage(host, syncShots({ ...host.stage, shots })), result: { id: shot.id } };
    },
  },
  {
    id: 'shot.delete', label: 'Delete shot', group: 'Shots',
    description: 'Remove a shot. If the camera then has no shot left, a default shot is created again – detach it or delete the camera to avoid that.',
    params: { id: text('Shot ID or code', true) },
    run: ({ host }, p) => {
      const shot = findShot(host.stage, p.id);
      return { host: withStage(host, syncShots({ ...host.stage, shots: host.stage.shots.filter((s) => s.id !== shot.id) })) };
    },
  },
  {
    id: 'shot.reorder', label: 'Shooting order', group: 'Shots',
    description: 'Move a shot in the shooting order to position toIndex (0-based).',
    params: { id: text('Shot ID or code', true), toIndex: num('New position (0 = first)', true) },
    run: ({ host }, p) => {
      const shot = findShot(host.stage, p.id);
      return { host: withStage(host, moveShotInOrder(host.stage, shot.id, finite(p.toIndex, 0, 0, 9999))) };
    },
  },
  {
    id: 'shot.detach', label: 'Detach shot', group: 'Shots',
    description: 'Detached shots remain when their camera is deleted (like a finished storyboard panel).',
    params: { id: text('Shot ID or code', true), detached: bool('Detached') },
    run: ({ host }, p) => {
      const shot = findShot(host.stage, p.id);
      const detached = p.detached === undefined ? !shot.detached : p.detached === true;
      return { host: withStage(host, { ...host.stage, shots: host.stage.shots.map((s) => (s.id === shot.id ? { ...s, detached } : s)) }) };
    },
  },
  {
    id: 'shot.link', label: 'Link to storyboard', group: 'Shots',
    description: 'Link a shot to a storyboard shot (number) or set an image frame. storyboardShot 0 removes the link.',
    params: { id: text('Shot ID or code', true), storyboardShot: num('Storyboard-Shot-Nummer'), frameUrl: text('Frame image URL') },
    run: ({ host }, p) => {
      const shot = findShot(host.stage, p.id);
      const patch: Record<string, unknown> = {};
      if (p.storyboardShot !== undefined) patch.storyboardShot = finite(p.storyboardShot, 0) > 0 ? Math.round(finite(p.storyboardShot, 1, 1, 99999)) : null;
      if (typeof p.frameUrl === 'string') patch.frameUrl = p.frameUrl || null;
      return { host: withStage(host, { ...host.stage, shots: host.stage.shots.map((s) => (s.id === shot.id ? { ...s, ...patch } : s)) }), result: { id: shot.id } };
    },
  },
  // Szene
  {
    id: 'scene.setLineOfAction', label: '180°-Linie', group: 'Scene',
    description: 'Set the line of action between two characters (or remove it without parameters). Shots that cross it are flagged.',
    params: { aId: text('Character 1'), bId: text('Character 2') },
    run: ({ host }, p) => {
      if (!p.aId || !p.bId) return { host: withStage(host, { ...host.stage, lineOfAction: null }) };
      const a = findObject(host, p.aId, 'character');
      const b = findObject(host, p.bId, 'character');
      if (a.kind !== 'character' || b.kind !== 'character' || a.id === b.id) fail('The 180° line needs two different characters.');
      return { host: withStage(host, { ...host.stage, lineOfAction: { aId: a.id, bId: b.id } }) };
    },
  },
  {
    id: 'scene.applyTemplate', label: 'Insert template', group: 'Scene',
    description: 'Insert a ready-made coverage: dialog-two, walk-talk, table-three, interview.',
    params: { templateId: text('Template', true, TEMPLATES.map((t) => t.id)), x: num('Center x'), z: num('Center z') },
    run: ({ host }, p) => ({ host: applyTemplate(host, String(p.templateId), { x: finite(p.x, 0), z: finite(p.z, 0) }) }),
  },
  {
    id: 'scene.freeze', label: 'Freeze snapshot', group: 'Scene',
    description: 'Save a snapshot of the whole scene to come back to later.',
    params: { name: text('Snapshot name') },
    run: ({ host }, p) => {
      const { stage, ...rest } = host;
      const data = JSON.stringify({ assets: rest.assets, stage: { ...stage, snapshots: [] } });
      const snap = { id: makeStageId('snap'), name: typeof p.name === 'string' && p.name ? p.name.slice(0, 120) : `Stand ${(stage.snapshots?.length || 0) + 1}`, createdAt: new Date().toISOString(), data };
      return { host: withStage(host, { ...stage, snapshots: [...(stage.snapshots || []), snap].slice(-50) }), result: { id: snap.id, name: snap.name } };
    },
  },
  {
    id: 'scene.restore', label: 'Restore snapshot', group: 'Scene',
    description: 'Restore snapshot (undo stays possible).',
    params: { id: text('Snapshot ID or name', true) },
    run: ({ host }, p) => {
      const snap = (host.stage.snapshots || []).find((s) => s.id === p.id || s.name === p.id);
      if (!snap) fail('Snapshot not found.');
      let parsed: { assets?: PlanAsset[]; stage?: unknown } = {};
      try { parsed = JSON.parse((snap as { data: string }).data); } catch { fail('Snapshot is damaged.'); }
      const restored = normalizeStage(parsed.stage);
      return { host: { ...host, assets: Array.isArray(parsed.assets) ? parsed.assets : host.assets, stage: { ...restored, snapshots: host.stage.snapshots } } };
    },
  },
  {
    id: 'scene.setAspect', label: 'Image format', group: 'Scene',
    description: 'Aspect ratio of the output image (e.g. 1.7778, 2.39, 0.5625) for view cones, viewfinder and shot sizes.',
    params: { aspectRatio: num('Width/Height', true) },
    run: ({ host }, p) => ({ host: withStage(host, { ...host.stage, aspectRatio: finite(p.aspectRatio, 16 / 9, 0.2, 5) }) }),
  },
];

const findShot = (stage: StageState, key: unknown) => {
  const k = typeof key === 'string' ? key.trim() : '';
  const shot = stage.shots.find((s) => s.id === k) ?? stage.shots.find((s) => `${s.number}${s.version}`.toUpperCase() === k.toUpperCase());
  if (!shot) fail(`No shot “${k}”.`);
  return shot as NonNullable<typeof shot>;
};

export const commandById = (id: string) => BLOCKING_COMMANDS.find((c) => c.id === id);

const coerce = (spec: ParamSpec, value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  if (spec.type === 'number') return typeof value === 'number' || typeof value === 'string' ? value : undefined;
  if (spec.type === 'boolean') return value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;
  if (spec.type === 'string') return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
  return value;
};

/** Run one command. Never throws: errors come back as { ok: false }. */
export const runBlockingCommand = (
  raw: StageHost | null | undefined,
  id: string,
  params: Record<string, unknown> = {},
  timeS = 0,
): CommandResult => {
  const command = commandById(id);
  if (!command) return { ok: false, error: `Unknown command “${id}”. blocking_list_commands shows all.` };
  try {
    const host = ensureHost(raw);
    const p: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(command.params)) {
      const value = coerce(spec, params?.[key]);
      if (spec.required && (value === undefined || value === null || value === '')) return { ok: false, error: `${command.label}: Parameter “${key}” is missing.` };
      if (value !== undefined) p[key] = value;
    }
    const t = finite(timeS, 0, 0, host.stage.animation.durationS);
    const out = command.run({ host, timeS: t }, p);
    return { ok: true, host: out.host, result: out.result || {}, select: out.select };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/** Several commands as one step (one undo entry); stops at the first error. */
export const runBlockingBatch = (
  raw: StageHost | null | undefined,
  commands: Array<{ command: string; params?: Record<string, unknown> }>,
  timeS = 0,
): CommandResult & { results?: Array<Record<string, unknown>> } => {
  let host: StageHost = ensureHost(raw);
  const results: Array<Record<string, unknown>> = [];
  let select: string[] | undefined;
  for (const [i, step] of (Array.isArray(commands) ? commands : []).slice(0, 200).entries()) {
    const out = runBlockingCommand(host, String(step?.command || ''), step?.params || {}, timeS);
    if (!out.ok) return { ok: false, error: `Step ${i + 1} (${step?.command}): ${out.error}` };
    host = out.host as StageHost;
    results.push(out.result || {});
    select = out.select ?? select;
  }
  return { ok: true, host, result: { steps: results.length }, results, select };
};

/** JSON schema for one command's parameters (MCP). */
export const commandJsonSchema = (command: BlockingCommand) => ({
  type: 'object',
  properties: Object.fromEntries(Object.entries(command.params).map(([key, spec]) => [key, { type: spec.type, description: spec.description, ...(spec.enum ? { enum: spec.enum } : {}) }])),
  required: Object.entries(command.params).filter(([, spec]) => spec.required).map(([key]) => key),
});

export const describeCommands = () => BLOCKING_COMMANDS.map((c) => ({
  id: c.id, label: c.label, group: c.group, shortcut: c.shortcut, description: c.description, params: commandJsonSchema(c),
}));
