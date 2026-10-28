/**
 * Inspector schema for the built-in node params (compModel NODE_DEFAULTS).
 * Fusion inspector and Nuke properties bin render the same controls from it.
 * Labels are German UI text; keys are the stored param ids.
 */
import type { CompNodeType } from './compModel.ts';

export type ParamControl =
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number; keyframable: boolean; unit?: string }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text'; multiline?: boolean }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'bool' };

const n = (key: string, label: string, min: number, max: number, step: number, unit?: string): ParamControl => ({ key, label, kind: 'number', min, max, step, keyframable: true, unit });

export const BLEND_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'add', label: 'Add' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'darken', label: 'Darken' },
  { value: 'difference', label: 'Difference' },
];

export const FONT_OPTIONS = ['Inter', 'Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'IBM Plex Mono'].map((font) => ({ value: font, label: font }));

export const PARAM_SCHEMA: Record<CompNodeType, ParamControl[]> = {
  media: [n('opacity', 'Opacity', 0, 1, 0.01)],
  solid: [{ key: 'color', label: 'Color', kind: 'color' }, n('opacity', 'Opacity', 0, 1, 0.01)],
  text: [
    { key: 'text', label: 'Text', kind: 'text', multiline: true },
    { key: 'font', label: 'Type', kind: 'select', options: FONT_OPTIONS },
    n('size', 'Size', 4, 600, 1, 'px'),
    { key: 'color', label: 'Color', kind: 'color' },
    n('opacity', 'Opacity', 0, 1, 0.01),
  ],
  transform: [
    n('x', 'Position X', -4000, 4000, 1, 'px'),
    n('y', 'Position Y', -4000, 4000, 1, 'px'),
    n('scale', 'Size', 0, 10, 0.01),
    n('rotation', 'Rotation', -720, 720, 0.1, '°'),
    n('anchorX', 'Anchor point X', -4000, 4000, 1, 'px'),
    n('anchorY', 'Anchor point Y', -4000, 4000, 1, 'px'),
    n('opacity', 'Opacity', 0, 1, 0.01),
  ],
  merge: [{ key: 'blend', label: 'Blend mode', kind: 'select', options: BLEND_OPTIONS }, n('opacity', 'Opacity (mix)', 0, 1, 0.01)],
  fx: [],
  mask: [
    {
      key: 'shape',
      label: 'Form',
      kind: 'select',
      options: [
        { value: 'ellipse', label: 'Ellipse' },
        { value: 'rectangle', label: 'Rectangle' },
      ],
    },
    n('cx', 'Center X', -1, 2, 0.001),
    n('cy', 'Center Y', -1, 2, 0.001),
    n('w', 'Width', 0, 3, 0.001),
    n('h', 'Height', 0, 3, 0.001),
    n('feather', 'Feather', 0, 0.5, 0.001),
    { key: 'invert', label: 'Reverse', kind: 'bool' },
  ],
  output: [],
};

export const clampNumber = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
