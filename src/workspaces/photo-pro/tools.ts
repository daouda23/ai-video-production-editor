/**
 * Tools panel definition: tool ids, German labels, groups (flyouts) and the
 * single-key shortcuts. Shift+key cycles through a group like Photoshop.
 */

export type ToolId =
  | 'move'
  | 'marquee-rect' | 'marquee-ellipse'
  | 'lasso' | 'lasso-poly'
  | 'object-select'
  | 'crop'
  | 'eyedropper'
  | 'spot-heal'
  | 'brush'
  | 'clone-stamp'
  | 'eraser'
  | 'gradient'
  | 'dodge' | 'burn'
  | 'text'
  | 'hand'
  | 'zoom';

export type ToolInfo = { id: ToolId; label: string; hint: string; cursor: string };

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  move: { id: 'move', label: 'Move tool', hint: 'Drag the active layer; arrow keys move by 1 px (Shift: 10 px).', cursor: 'move' },
  'marquee-rect': { id: 'marquee-rect', label: 'Rectangular marquee tool', hint: 'Drag to make a selection. Shift: square or add, Alt: from center or subtract.', cursor: 'crosshair' },
  'marquee-ellipse': { id: 'marquee-ellipse', label: 'Elliptical marquee tool', hint: 'Drag for an elliptical selection. Shift: circle, Alt: from center.', cursor: 'crosshair' },
  lasso: { id: 'lasso', label: 'Lasso tool', hint: 'Drag freehand around an area.', cursor: 'crosshair' },
  'lasso-poly': { id: 'lasso-poly', label: 'Polygonal lasso tool', hint: 'Place points; double-click or Enter closes the selection.', cursor: 'crosshair' },
  'object-select': { id: 'object-select', label: 'Object selection tool (AI)', hint: 'Select the subject with an AI cutout (Replicate).', cursor: 'crosshair' },
  crop: { id: 'crop', label: 'Crop tool', hint: 'Drag the handles, Enter confirms, Esc cancels.', cursor: 'crosshair' },
  eyedropper: { id: 'eyedropper', label: 'Eyedropper tool', hint: 'Click picks the foreground color, Alt+click the background color.', cursor: 'crosshair' },
  'spot-heal': { id: 'spot-heal', label: 'Spot healing brush (AI)', hint: 'Paint over distractions, then “Repair” – the AI reconstructs the area.', cursor: 'none' },
  brush: { id: 'brush', label: 'Brush tool', hint: 'Paints with the foreground color on the active layer. [ and ] change the size.', cursor: 'none' },
  'clone-stamp': { id: 'clone-stamp', label: 'Clone stamp tool', hint: 'Alt+click sets the source, then paint.', cursor: 'none' },
  eraser: { id: 'eraser', label: 'Eraser tool', hint: 'Erases pixels of the active layer (transparency).', cursor: 'none' },
  gradient: { id: 'gradient', label: 'Gradient tool', hint: 'Drag: gradient from foreground to background color (within the selection).', cursor: 'crosshair' },
  dodge: { id: 'dodge', label: 'Dodge tool', hint: 'Lightens areas.', cursor: 'none' },
  burn: { id: 'burn', label: 'Burn tool', hint: 'Darkens areas.', cursor: 'none' },
  text: { id: 'text', label: 'Horizontal type tool', hint: 'Click creates a text layer; click on text edits it. Esc finishes.', cursor: 'text' },
  hand: { id: 'hand', label: 'Hand tool', hint: 'Pan view (also while holding Space).', cursor: 'grab' },
  zoom: { id: 'zoom', label: 'Zoom tool', hint: 'Click zooms in, Alt+click zooms out.', cursor: 'zoom-in' },
};

export type ToolGroup = { id: string; key: string; tools: ToolId[] };

/** Order of the single-column tools panel; `gap` draws a divider before the group. */
export const TOOL_GROUPS: Array<ToolGroup & { gap?: boolean }> = [
  { id: 'move', key: 'V', tools: ['move'] },
  { id: 'marquee', key: 'M', tools: ['marquee-rect', 'marquee-ellipse'] },
  { id: 'lasso', key: 'L', tools: ['lasso', 'lasso-poly'] },
  { id: 'select', key: 'W', tools: ['object-select'] },
  { id: 'crop', key: 'C', tools: ['crop'] },
  { id: 'eyedropper', key: 'I', tools: ['eyedropper'], gap: true },
  { id: 'heal', key: 'J', tools: ['spot-heal'] },
  { id: 'brush', key: 'B', tools: ['brush'] },
  { id: 'stamp', key: 'S', tools: ['clone-stamp'] },
  { id: 'eraser', key: 'E', tools: ['eraser'] },
  { id: 'gradient', key: 'G', tools: ['gradient'] },
  { id: 'dodge', key: 'O', tools: ['dodge', 'burn'] },
  { id: 'type', key: 'T', tools: ['text'], gap: true },
  { id: 'hand', key: 'H', tools: ['hand'], gap: true },
  { id: 'zoom', key: 'Z', tools: ['zoom'] },
];

export const groupOfTool = (tool: ToolId) => TOOL_GROUPS.find((group) => group.tools.includes(tool))!;

/**
 * Resolve a key press to a tool. Same group + Shift cycles; otherwise the
 * last-used tool of that group is selected (like Photoshop's flyouts).
 */
export function toolForShortcut(
  key: string,
  shift: boolean,
  current: ToolId,
  lastUsed: Partial<Record<string, ToolId>> = {},
): ToolId | null {
  const group = TOOL_GROUPS.find((g) => g.key === key.toUpperCase());
  if (!group) return null;
  const inGroup = group.tools.includes(current);
  if (inGroup && shift && group.tools.length > 1) {
    const next = (group.tools.indexOf(current) + 1) % group.tools.length;
    return group.tools[next];
  }
  if (inGroup) return current;
  const remembered = lastUsed[group.id];
  return remembered && group.tools.includes(remembered) ? remembered : group.tools[0];
}

export const PAINT_TOOLS: ToolId[] = ['brush', 'eraser', 'clone-stamp', 'dodge', 'burn', 'spot-heal'];
export const SELECTION_TOOLS: ToolId[] = ['marquee-rect', 'marquee-ellipse', 'lasso', 'lasso-poly', 'object-select'];
export const isPaintTool = (tool: ToolId) => PAINT_TOOLS.includes(tool);
export const isSelectionTool = (tool: ToolId) => SELECTION_TOOLS.includes(tool);
/** Tools that write pixels into the active raster layer. */
export const writesPixels = (tool: ToolId) => ['brush', 'eraser', 'clone-stamp', 'dodge', 'burn', 'gradient'].includes(tool);
