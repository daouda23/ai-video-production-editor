import type { FxDefinition, FxParamDef, FxParamValues, FxTextureRequest } from '../../types.ts';
import { CURVE_LUT_SIZE, CURVE_ROWS, WINDOW_TYPES, buildCurveTexture, curveTextureKey, curvesFromParams, prepareGrade } from './model.ts';
import { PRIMARY_GRADE_FRAGMENTS, blurUniforms, composeUniforms, gradeUniforms, sizingUniforms } from './shader.ts';

export const PRIMARY_GRADE_ID = 'avpe.primary-grade';

const f = (id: string, label: string, def: number, min: number, max: number, group: string, extra: Partial<FxParamDef> = {}): FxParamDef =>
  ({ id, label, type: 'float', default: def, min, max, group, ...extra }) as FxParamDef;
const b = (id: string, label: string, def: boolean, group: string, extra: Partial<FxParamDef> = {}): FxParamDef =>
  ({ id, label, type: 'bool', default: def, group, ...extra }) as FxParamDef;

const channels = (prefix: string, label: string, def: number, min: number, max: number, group: string, withY = true, extra: Partial<FxParamDef> = {}) =>
  (withY ? ['R', 'G', 'B', 'Y'] : ['R', 'G', 'B']).map((c) => f(`${prefix}${c}`, `${label} ${c}`, def, min, max, group, extra));

const params: FxParamDef[] = [
  ...channels('lift', 'Lift', 0, -1, 1, 'primaries'),
  ...channels('gamma', 'Gamma', 0, -1, 1, 'primaries'),
  ...channels('gain', 'Gain', 1, 0, 4, 'primaries', true, { displayMin: 0, displayMax: 2 }),
  ...channels('offset', 'Offset', 0, -1, 1, 'primaries', false),
  f('temperature', 'Temperature', 0, -100, 100, 'primaries'),
  f('tint', 'Tint', 0, -100, 100, 'primaries'),
  f('contrast', 'Contrast', 1, 0, 3, 'primaries', { displayMax: 2 }),
  f('pivot', 'Pivot', 0.435, 0, 1, 'primaries'),
  f('saturation', 'Saturation', 1, 0, 4, 'primaries', { displayMax: 2 }),
  f('hue', 'Hue', 0, -180, 180, 'primaries', { unit: '°' }),
  f('lumMix', 'Lum Mix', 1, 0, 1, 'primaries'),

  ...channels('logShadow', 'Log shadows', 0, -1, 1, 'log', false),
  ...channels('logMid', 'Log Mitten', 0, -1, 1, 'log', false),
  ...channels('logHigh', 'Log highlights', 0, -1, 1, 'log', false),
  f('logLowRange', 'Lower area', 0.333, 0, 1, 'log'),
  f('logHighRange', 'Upper area', 0.55, 0, 1, 'log'),

  b('qualEnabled', 'Qualifier active', false, 'qualifier'),
  b('qualHueOn', 'Use hue', true, 'qualifier'),
  f('qualHue', 'Hue center', 0, 0, 360, 'qualifier', { unit: '°' }),
  f('qualHueWidth', 'Hue width', 30, 0, 180, 'qualifier', { unit: '°' }),
  f('qualHueSoft', 'Hue softness', 10, 0, 90, 'qualifier', { unit: '°' }),
  b('qualSatOn', 'Use saturation', true, 'qualifier'),
  f('qualSatLow', 'Saturation min', 0, 0, 1, 'qualifier'),
  f('qualSatHigh', 'Saturation max', 1, 0, 1, 'qualifier'),
  f('qualSatSoft', 'Saturation softness', 0.05, 0, 0.5, 'qualifier'),
  b('qualLumOn', 'Use luminance', true, 'qualifier'),
  f('qualLumLow', 'Luminance min', 0, 0, 1, 'qualifier'),
  f('qualLumHigh', 'Luminance max', 1, 0, 1, 'qualifier'),
  f('qualLumSoft', 'Luminance softness', 0.05, 0, 0.5, 'qualifier'),
  b('qualInvert', 'Invert qualifier', false, 'qualifier'),

  { id: 'winType', label: 'Window', type: 'choice', default: 0, options: [...WINDOW_TYPES], group: 'window' },
  f('winX', 'Window X', 0.5, -1, 2, 'window', { displayMin: 0, displayMax: 1 }),
  f('winY', 'Window Y', 0.5, -1, 2, 'window', { displayMin: 0, displayMax: 1 }),
  f('winSizeX', 'Window width', 0.3, 0.001, 4, 'window', { displayMax: 1.5 }),
  f('winSizeY', 'Window height', 0.3, 0.001, 4, 'window', { displayMax: 1.5 }),
  f('winRotation', 'Window rotation', 0, -180, 180, 'window', { unit: '°' }),
  f('winSoftness', 'Feather', 0.15, 0, 2, 'window', { displayMax: 1 }),
  b('winInvert', 'Invert window', false, 'window'),

  f('blurRadius', 'Blur', 0, 0, 64, 'blur', { unit: 'px', displayMax: 32 }),
  f('sharpen', 'Sharpen', 0, 0, 4, 'blur', { displayMax: 2 }),

  f('keyGain', 'Key gain', 1, 0, 4, 'key', { displayMax: 2 }),
  f('keyOffset', 'Key-Offset', 0, -1, 1, 'key'),
  b('keyInvert', 'Invert key', false, 'key'),
  b('showMask', 'Show mask', false, 'key', { hidden: true }),

  f('sizePan', 'Pan', 0, -2, 2, 'sizing', { displayMin: -1, displayMax: 1 }),
  f('sizeTilt', 'Tilt', 0, -2, 2, 'sizing', { displayMin: -1, displayMax: 1 }),
  f('sizeZoom', 'Zoom', 1, 0.05, 20, 'sizing', { displayMin: 0.25, displayMax: 4 }),
  f('sizeRotate', 'Rotation', 0, -180, 180, 'sizing', { unit: '°' }),
  b('sizeFlipH', 'Flip horizontal', false, 'sizing'),
  b('sizeFlipV', 'Flip vertical', false, 'sizing'),
];

const curveTexture = (values: FxParamValues): FxTextureRequest[] => [
  {
    uniform: 't_curves',
    key: curveTextureKey(values),
    width: CURVE_LUT_SIZE,
    height: CURVE_ROWS,
    build: () => buildCurveTexture(curvesFromParams(values)),
  },
];

export const PRIMARY_GRADE: FxDefinition = {
  id: PRIMARY_GRADE_ID,
  name: 'Farbkorrektur-Node',
  vendor: 'AI Video Production Editor',
  version: '1.0.0',
  category: 'color',
  description:
    'Primary color correction like a Color page node: lift/gamma/gain/offset, log wheels, curves, HSL qualifier, power window, blur/sharpen, key and sizing.',
  groups: [
    { id: 'primaries', label: 'Primaries' },
    { id: 'log', label: 'Log wheels', collapsed: true },
    { id: 'qualifier', label: 'Qualifier', collapsed: true },
    { id: 'window', label: 'Power Window', collapsed: true },
    { id: 'blur', label: 'Blur / Sharpen', collapsed: true },
    { id: 'key', label: 'Key', collapsed: true },
    { id: 'sizing', label: 'Sizing', collapsed: true },
  ],
  params,
  passes: [
    {
      id: 'grade',
      fragment: PRIMARY_GRADE_FRAGMENTS.grade,
      uniforms: (values, frame) => gradeUniforms(prepareGrade(values, frame)),
      textures: (values) => curveTexture(values),
    },
    { id: 'blurH', fragment: PRIMARY_GRADE_FRAGMENTS.blurH, uniforms: (values, frame) => blurUniforms(prepareGrade(values, frame)) },
    { id: 'blurV', fragment: PRIMARY_GRADE_FRAGMENTS.blurV, uniforms: (values, frame) => blurUniforms(prepareGrade(values, frame)) },
    {
      id: 'compose',
      fragment: PRIMARY_GRADE_FRAGMENTS.compose,
      inputs: ['grade'],
      uniforms: (values, frame) => composeUniforms(prepareGrade(values, frame)),
    },
    { id: 'sizing', fragment: PRIMARY_GRADE_FRAGMENTS.sizing, uniforms: (values, frame) => sizingUniforms(prepareGrade(values, frame)) },
  ],
};
