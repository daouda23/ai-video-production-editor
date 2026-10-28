/**
 * Side panels of the After Effects view: Project, Effect Controls,
 * Effects & Presets, Info and Preview.
 */
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Film, Image as ImageIcon, Music, Pause, Play, Search, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import type { CompNode, Composition } from '../fusion-shared/compModel.ts';
import { getNode } from '../fusion-shared/compModel.ts';
import type { MediaItem } from '../../types.ts';
import FxStackPanel from '../../fx/ui/FxStackPanel';
import { listFxDefinitions, subscribeFxRegistry } from '../../fx/registry';
import type { FxCategory, FxStack } from '../../fx/types';
import type { AeLayer } from './aeOps.ts';
import { formatTimecode, insertAtLayerTop, layerColor, patchParams, removeBranchNode, replaceNode } from './aeOps.ts';
import { createNode } from '../fusion-shared/compModel.ts';
import type { PixelInfo } from './AeViewer';
import { ScrubNumber } from './aeWidgets';

const fmtDur = (seconds: number | undefined, fps: number) => (seconds && seconds > 0 ? formatTimecode(seconds, fps) : '—');

// ---------------------------------------------------------------- Project

export function ProjectPanel(props: {
  comp: Composition;
  mediaItems: MediaItem[];
  onAddMedia(item: MediaItem): void;
  onAddToTimeline?(item: MediaItem): void;
  onRender?(): void;
}) {
  const { comp, mediaItems } = props;
  const [selected, setSelected] = useState<string>('comp');
  const [query, setQuery] = useState('');
  const items = mediaItems.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
  const sel = mediaItems.find((m) => m.id === selected);
  return (
    <div className="aev-project" data-automation-id="ae.project">
      <div className="aev-project-info">
        <div className="aev-thumb">
          {sel?.type === 'image' && sel.url ? <img src={sel.url} alt="" /> : sel?.type === 'video' ? <Film size={22} /> : sel?.type === 'audio' ? <Music size={22} /> : <span className="aev-comp-glyph" />}
        </div>
        <div className="aev-project-meta">
          <strong className="aev-ellipsis">{sel ? sel.name : comp.name}</strong>
          {sel ? (
            <span className="aev-dim">
              {sel.type === 'video' ? 'Video' : sel.type === 'image' ? 'Image' : 'Audio'} · Δ {fmtDur(sel.duration, comp.fps)}
            </span>
          ) : (
            <span className="aev-dim">
              {comp.width} × {comp.height} (1,00) · Δ {formatTimecode(comp.durationSeconds, comp.fps)}, {comp.fps} fps
            </span>
          )}
        </div>
      </div>
      <label className="aev-search">
        <Search size={12} />
        <input value={query} placeholder="Search" data-automation-id="ae.project.search" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <div className="aev-list-head">
        <span>Name</span>
        <span>Type</span>
        <span>Duration</span>
      </div>
      <div className="aev-list">
        <div className={`aev-list-row${selected === 'comp' ? ' is-sel' : ''}`} data-automation-id="ae.project.comp" onClick={() => setSelected('comp')}>
          <span className="aev-ellipsis">
            <span className="aev-comp-glyph sm" /> {comp.name}
          </span>
          <span>Composition</span>
          <span>{formatTimecode(comp.durationSeconds, comp.fps)}</span>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className={`aev-list-row${selected === item.id ? ' is-sel' : ''}${item.type === 'audio' ? ' is-disabled' : ''}`}
            draggable={item.type !== 'audio'}
            title={item.type === 'audio' ? 'Audio layers are not supported in the composition' : 'Drag into the composition or timeline; double-click adds it as the top layer'}
            data-automation-id={`ae.project.item.${item.id}`}
            onClick={() => setSelected(item.id)}
            onDoubleClick={() => item.type !== 'audio' && props.onAddMedia(item)}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-avpe-media-id', item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="aev-ellipsis">
              {item.type === 'image' ? <ImageIcon size={11} /> : item.type === 'audio' ? <Music size={11} /> : <Film size={11} />} {item.name}
            </span>
            <span>{item.type === 'video' ? 'Video' : item.type === 'image' ? 'Image' : 'Audio'}</span>
            <span>{fmtDur(item.duration, comp.fps)}</span>
          </div>
        ))}
        {!items.length && <div className="aev-empty">No media in the project.</div>}
      </div>
      <div className="aev-project-actions">
        <button type="button" className="aev-chip" disabled={!sel || sel.type === 'audio'} data-automation-id="ae.project.addToComp" onClick={() => sel && props.onAddMedia(sel)}>To composition
        </button>
        {props.onAddToTimeline && (
          <button type="button" className="aev-chip" disabled={!sel} data-automation-id="ae.project.addToTimeline" onClick={() => sel && props.onAddToTimeline?.(sel)}>Into the edit timeline
          </button>
        )}
        {props.onRender && (
          <button type="button" className="aev-chip" data-automation-id="ae.project.render" onClick={props.onRender}>Render → media
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Effect Controls

export function EffectControlsPanel(props: { comp: Composition; layer: AeLayer | null; time: number; commit(next: Composition, label: string): void }) {
  const { comp, layer } = props;
  if (!layer) return <div className="aev-empty" data-automation-id="ae.effectControls">No layer selected. Apply effects by double-clicking or dragging from “Effects and presets”.</div>;
  const src = layer.source;
  const fxNode = layer.fxNodes[layer.fxNodes.length - 1] ?? null;
  const setStack = (stack: FxStack) => {
    if (fxNode) {
      const current = getNode(props.comp, fxNode.id);
      if (current) props.commit(replaceNode(props.comp, { ...current, fxStack: stack }), 'Change effects');
      return;
    }
    if (!stack.length) return;
    const node = createNode('fx', { name: `${src.name} effects`, x: src.x + 320, y: src.y, fxStack: stack });
    props.commit(insertAtLayerTop(props.comp, layer.sourceId, node), 'Add effect');
  };
  const setSource = (params: Record<string, string | number>) => props.commit(patchParams(props.comp, src.id, params), 'Change source');
  return (
    <div className="aev-ec" data-automation-id="ae.effectControls">
      <div className="aev-ec-head">
        <span className="aev-label" style={{ background: layerColor(layer) }} />
        <strong className="aev-ellipsis">
          {comp.name} • {src.name}
        </strong>
      </div>
      {(src.type === 'solid' || src.type === 'text') && (
        <section className="aev-ec-section">
          <div className="aev-ec-title">{src.type === 'solid' ? 'Solid' : 'Text'}</div>
          {src.type === 'text' && (
            <label className="aev-ec-row">
              <span>Source code</span>
              <input className="aev-input" value={String(src.params.text ?? '')} data-automation-id="ae.ec.text" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => props.commit(patchParams({ ...props.comp, nodes: props.comp.nodes.map((n) => (n.id === src.id ? { ...n, name: e.target.value || n.name } : n)) }, src.id, { text: e.target.value }), 'Change text')} />
            </label>
          )}
          {src.type === 'text' && (
            <label className="aev-ec-row">
              <span>Font size</span>
              <ScrubNumber value={Number(src.params.size ?? 96)} min={1} max={2000} digits={0} suffix=" px" automationId="ae.ec.textSize" onChange={(v, ph) => (ph === 'set' || ph === 'end' || ph === 'move') && setSource({ size: Math.round(v) })} />
            </label>
          )}
          {src.type === 'text' && (
            <label className="aev-ec-row">
              <span>Type</span>
              <select className="aev-select" value={String(src.params.font ?? 'Inter')} data-automation-id="ae.ec.font" onChange={(e) => setSource({ font: e.target.value })}>
                {['Inter', 'Helvetica', 'Georgia', 'Courier New', 'system-ui'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          )}
          <label className="aev-ec-row">
            <span>Color</span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(String(src.params.color)) ? String(src.params.color) : '#808080'} data-automation-id="ae.ec.color" onChange={(e) => setSource({ color: e.target.value })} />
          </label>
        </section>
      )}
      {layer.maskNodes.map((mask: CompNode) => (
        <section className="aev-ec-section" key={mask.id}>
          <div className="aev-ec-title">
            {mask.name} <span className="aev-dim">({mask.params.shape === 'rectangle' ? 'Rectangle' : 'Ellipse'})</span>
            <button type="button" className="aev-link" data-automation-id={`ae.ec.mask.${mask.id}.delete`} onClick={() => props.commit(removeBranchNode(props.comp, mask.id), 'Delete mask')}>Delete
            </button>
          </div>
          <label className="aev-ec-row">
            <span>Soft mask edge</span>
            <ScrubNumber value={Number(mask.params.feather ?? 0) * Math.max(comp.width, comp.height)} min={0} digits={1} suffix=" px" automationId={`ae.ec.mask.${mask.id}.feather`} onChange={(v) => props.commit(patchParams(props.comp, mask.id, { feather: v / Math.max(comp.width, comp.height) }), 'Change mask')} />
          </label>
          <label className="aev-ec-row">
            <span>Reversed</span>
            <input type="checkbox" checked={mask.params.invert === true} data-automation-id={`ae.ec.mask.${mask.id}.invert`} onChange={(e) => props.commit(patchParams(props.comp, mask.id, { invert: e.target.checked }), 'Change mask')} />
          </label>
        </section>
      ))}
      <section className="aev-ec-section aev-ec-fx">
        <FxStackPanel stack={fxNode?.fxStack} onChange={setStack} emptyHint="No effects on this layer." />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Effects & Presets

const CATEGORY_LABELS: Record<FxCategory, string> = { lens: 'Lens', film: 'Film', grain: 'Grain', color: 'Color', repair: 'Repair', diagnostic: 'Diagnose', stylize: 'Style' };

export const BUILTINS = [
  { id: 'builtin:solid', name: 'Solid (new layer)' },
  { id: 'builtin:text', name: 'Text (new layer)' },
  { id: 'builtin:mask-ellipse', name: 'Mask: ellipse' },
  { id: 'builtin:mask-rect', name: 'Mask: rectangle' },
];

export function EffectsPresetsPanel(props: { onApply(effectId: string): void; hasSelection: boolean }) {
  const [query, setQuery] = useState('');
  const [, force] = useReducer((v: number) => v + 1, 0);
  const [open, setOpen] = useState<Record<string, boolean>>({ builtin: true, gpu: true });
  useEffect(() => subscribeFxRegistry(force), []);
  const q = query.trim().toLowerCase();
  const defs = listFxDefinitions().filter((d) => !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
  const byCat = useMemo(() => {
    const map = new Map<string, typeof defs>();
    for (const d of defs) {
      const group = d.native === 'ofx' ? 'OFX-Plugins' : CATEGORY_LABELS[d.category] ?? d.category;
      map.set(group, [...(map.get(group) ?? []), d]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [defs]);
  const builtins = BUILTINS.filter((b) => !q || b.name.toLowerCase().includes(q));
  const item = (id: string, name: string, title?: string) => (
    <div
      key={id}
      className="aev-tree-item"
      draggable
      title={title ?? 'Double-click: apply to the selected layer · Drag: onto a layer'}
      data-automation-id={`ae.effects.item.${id}`}
      onDoubleClick={() => props.onApply(id)}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ae-effect', id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <span className="aev-fx-glyph">fx</span>
      <span className="aev-ellipsis">{name}</span>
    </div>
  );
  const group = (key: string, label: string, children: React.ReactNode) => (
    <div key={key} className="aev-tree-group">
      <button type="button" className="aev-tree-head" data-automation-id={`ae.effects.group.${key}`} onClick={() => setOpen((o) => ({ ...o, [key]: !(o[key] ?? Boolean(q)) }))}>
        {(open[key] ?? Boolean(q)) ? '▾' : '▸'} {label}
      </button>
      {(open[key] ?? Boolean(q)) && <div className="aev-tree-body">{children}</div>}
    </div>
  );
  return (
    <div className="aev-effects" data-automation-id="ae.effects">
      <label className="aev-search">
        <Search size={12} />
        <input value={query} placeholder="Search effects" data-automation-id="ae.effects.search" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <div className="aev-tree">
        {builtins.length > 0 && group('builtin', 'Generate & masks', builtins.map((b) => item(b.id, b.name)))}
        {defs.length > 0 &&
          group(
            'gpu',
            'Buckswood Post Plugins',
            byCat.map(([cat, list]) => group(`cat-${cat}`, cat, list.map((d) => item(d.id, d.name, d.description)))),
          )}
        {!builtins.length && !defs.length && <div className="aev-empty">No results.</div>}
      </div>
      {!props.hasSelection && <div className="aev-dim aev-hint">Tip: select a layer first.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Info & Preview

export function InfoPanel({ pixel, layer, comp, time }: { pixel: PixelInfo; layer: AeLayer | null; comp: Composition; time: number }) {
  return (
    <div className="aev-info" data-automation-id="ae.info">
      <div className="aev-info-grid">
        <span className="r">R: {pixel ? pixel.r : '—'}</span>
        <span>X: {pixel ? pixel.x : '—'}</span>
        <span className="g">G: {pixel ? pixel.g : '—'}</span>
        <span>Y: {pixel ? pixel.y : '—'}</span>
        <span className="b">B: {pixel ? pixel.b : '—'}</span>
        <span />
        <span>A: {pixel ? pixel.a : '—'}</span>
        <span />
      </div>
      {layer ? (
        <div className="aev-info-layer">
          <strong className="aev-ellipsis">{layer.source.name}</strong>
          <span>In: {formatTimecode(layer.inPoint, comp.fps)}</span>
          <span>Out: {formatTimecode(layer.outPoint, comp.fps)}</span>
          <span>Duration: {formatTimecode(layer.outPoint - layer.inPoint, comp.fps)}</span>
        </div>
      ) : (
        <div className="aev-info-layer aev-dim">Time: {formatTimecode(time, comp.fps)}</div>
      )}
    </div>
  );
}

export function PreviewPanel({ playing, run, loop, onLoop }: { playing: boolean; run(cmd: string): void; loop: boolean; onLoop(v: boolean): void }) {
  return (
    <div className="aev-preview" data-automation-id="ae.preview">
      <button type="button" className="aev-icon-btn" title="First frame (Home)" data-automation-id="ae.preview.start" onClick={() => run('time.start')}>
        <SkipBack size={13} />
      </button>
      <button type="button" className="aev-icon-btn" title="Previous frame (Page Up)" data-automation-id="ae.preview.prev" onClick={() => run('time.prevFrame')}>
        <StepBack size={13} />
      </button>
      <button type="button" className="aev-icon-btn is-play" title="Play/Stop (Space)" data-automation-id="ae.preview.play" onClick={() => run('transport.playToggle')}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button type="button" className="aev-icon-btn" title="Next frame (Page Down)" data-automation-id="ae.preview.next" onClick={() => run('time.nextFrame')}>
        <StepForward size={13} />
      </button>
      <button type="button" className="aev-icon-btn" title="Last frame (End)" data-automation-id="ae.preview.end" onClick={() => run('time.end')}>
        <SkipForward size={13} />
      </button>
      <label className="aev-check" title="Loop the work area">
        <input type="checkbox" checked={loop} data-automation-id="ae.preview.loop" onChange={(e) => onLoop(e.target.checked)} />Loop
      </label>
    </div>
  );
}
