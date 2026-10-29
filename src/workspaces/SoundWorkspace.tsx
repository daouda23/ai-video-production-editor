import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem, RecentProject, ReferenceItem, ShotPrompt, TimelineTrack } from '../types';
import type { SharedSequenceProps } from '../components/EditorPageShell';
import { MusicNoteIcon, PlayIcon, PauseIcon } from '../components/icons';
import SoundBrowser from './sound-pro/SoundBrowser';
import { normalizeSoundMix, type SoundMix } from './sound-pro/model';
import { useSoundCommands } from './sound-pro/useSoundCommands';
import { useSoundPlayback } from './sound-pro/useSoundPlayback';
import { FairlightView, StudioView, type ViewProps } from './sound-pro/ui/Views';
import { formatTime } from './sound-pro/ui/widgets';
import { registerLiveCommands } from '../mcp/liveCommands';
import { useLibraryAssets } from '../hooks/useLibraryAssets';
import '../mcp/modules/soundMediaTools';
import type { StudioToolContext } from '../mcp/toolModules';
import { SOUND_EXTRA_KEY, SOUND_TOOLS } from '../mcp/modules/soundTools';
import './sound-pro/sound.css';

/**
 * Sound page — one mix document, three views:
 *  - Fairlight: picture, loudness and index on top, timeline, console with EQ/dynamics/bus assign
 *  - Pro Tools: Edit window (tools, edit modes, automation) and Mix window (inserts, sends)
 *  - Studio:    our own condensed layout with AI generation, four stems, mix check and delivery
 *
 * Every action runs a sound command (sound-pro/commands.ts) — the same code
 * the MCP tools `sound_*` run. Audio plays through the sound engine (the same
 * engine renders mixdowns and the export), not through the editor preview.
 */

interface SoundWorkspaceProps extends SharedSequenceProps {
  /** Which side of the page the nav entry opens: AI generation (Studio view) or mixing (Fairlight/Pro Tools). */
  entryView?: 'studio' | 'mix';
  onAddGeneratedMedia: (item: MediaItem) => void;
  /** Places a generated clip on the timeline at the playhead. */
  onAddToTimeline?: (item: MediaItem) => void;
  apiKeyReady?: boolean;
  references?: ReferenceItem[];
  shotPrompts?: ShotPrompt[];
  recentProjects?: RecentProject[];
  currentProjectName?: string | null;
  currentProjectPath?: string | null;
  onSwitchToEdit?: () => void;
  /** Project extension `soundMix` (stored in project.json); local state is used when the host does not pass it. */
  soundMix?: unknown;
  onSoundMixChange?: (mix: SoundMix) => void;
}

const VIEW_INFO: Record<'mix' | 'studio', [string, string]> = {
  mix: ['Mix', 'Edit, console with EQ, dynamics, effects, sends, automation and loudness'],
  studio: ['Voice & Music', 'AI sound, stems, mix check, output'],
};

const SoundWorkspace: React.FC<SoundWorkspaceProps> = (props) => {
  const {
    mediaItems, timelineClips, timelineTracks, selectedClipId, playheadPosition, isPlaying, waveformCache,
    onBatchUpdateClips, onUpdateTrack, onAddTrack, onPlayheadUpdate, onTogglePlayback, onSelectClip,
    onUpdateClip, onAddGeneratedMedia, currentProjectPath,
  } = props;

  const [localMix, setLocalMix] = useState<SoundMix>(() => normalizeSoundMix(props.soundMix));
  const external = typeof props.onSoundMixChange === 'function';
  const mix = useMemo(() => (external ? normalizeSoundMix(props.soundMix) : localMix), [external, props.soundMix, localMix]);
  const setMix = useCallback((next: SoundMix) => {
    if (props.onSoundMixChange) props.onSoundMixChange(next);
    else setLocalMix(next);
  }, [props.onSoundMixChange]);

  const { run, lastError, clearError } = useSoundCommands({
    mix, clips: timelineClips, tracks: timelineTracks, media: mediaItems, playhead: playheadPosition, isPlaying,
    setMix, setClips: onBatchUpdateClips, updateTrack: onUpdateTrack, addTrack: onAddTrack,
    setPlayhead: onPlayheadUpdate, togglePlayback: onTogglePlayback,
  });

  /* Voice & Music opens the Studio view; Mix opens the last mixing view (Fairlight by default). */
  useEffect(() => {
    const current = mix.ui.view;
    if (props.entryView === 'studio' && current !== 'studio') run('view.set', { view: 'studio' });
    if (props.entryView === 'mix' && current !== 'fairlight') run('view.set', { view: 'fairlight' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.entryView]);

  const engineDoc = useMemo(() => ({ tracks: timelineTracks, clips: timelineClips, media: mediaItems, mix }), [timelineTracks, timelineClips, mediaItems, mix]);
  const { meters, loading, audioError } = useSoundPlayback({ doc: engineDoc, media: mediaItems, isPlaying, playhead: playheadPosition });
  const [sourcesVersion, setSourcesVersion] = useState(0);
  useEffect(() => { if (!loading.pending) setSourcesVersion((v) => v + 1); }, [loading.pending]);

  /* MCP tool context built from the page props, so the page and agents share one code path */
  const latest = useRef({ props, mix, setMix });
  latest.current = { props, mix, setMix };
  const toolContext = useMemo<StudioToolContext>(() => ({
    getState: () => {
      const p = latest.current.props;
      return {
        activeWorkspace: 'SOUND', timelineClips: p.timelineClips, timelineTracks: p.timelineTracks, mediaItems: p.mediaItems,
        playheadPosition: p.playheadPosition, selectedClipId: p.selectedClipId, projectPath: p.currentProjectPath ?? null,
        extras: { [SOUND_EXTRA_KEY]: latest.current.mix },
      };
    },
    actions: {
      setActiveWorkspace: () => undefined,
      updateClip: (clip) => latest.current.props.onUpdateClip(clip),
      setTimelineClips: (clips) => latest.current.props.onBatchUpdateClips(clips),
      setTimelineTracks: (tracks: TimelineTrack[]) => {
        const p = latest.current.props;
        for (const t of tracks) {
          const old = p.timelineTracks.find((x) => x.id === t.id);
          if (!old) p.onAddTrack(t.type);
          else if (old.isMuted !== t.isMuted || old.isSolo !== t.isSolo || old.isLocked !== t.isLocked || old.name !== t.name) {
            p.onUpdateTrack(t.id, { isMuted: t.isMuted, isSolo: t.isSolo, isLocked: t.isLocked, name: t.name });
          }
        }
      },
      addMediaItem: (item) => latest.current.props.onAddGeneratedMedia(item),
      setPlayhead: (s) => latest.current.props.onPlayheadUpdate(s),
      selectClip: (id) => latest.current.props.onSelectClip(id),
      setExtra: (key, value) => { if (key === SOUND_EXTRA_KEY) latest.current.setMix(normalizeSoundMix(value)); },
    },
  }), []);
  const callTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    const tool = SOUND_TOOLS.find((t) => t.name === name);
    if (!tool) return { ok: false, message: `Tool ${name} is missing.` };
    try {
      return { ok: true, ...(await tool.handler(args, toolContext)) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }, [toolContext]);

  /* project + library audio (shared by the browser and the MCP tool sound_library_list) */
  const library = useLibraryAssets({
    currentProjectName: props.currentProjectName,
    currentProjectPath,
    mediaItems,
    references: props.references,
    shotPrompts: props.shotPrompts,
    recentProjects: props.recentProjects,
  });
  const libraryRef = useRef(library);
  libraryRef.current = library;
  useEffect(() => registerLiveCommands({
    'sound.library.list': async () => {
      // wait briefly for the first load of recent projects
      for (let i = 0; i < 40 && libraryRef.current.isLoading; i++) await new Promise((r) => setTimeout(r, 100));
      return { assets: libraryRef.current.assets.filter((a) => a.kind === 'audio' && a.url), loading: libraryRef.current.isLoading, error: libraryRef.current.error };
    },
  }), []);

  /* transport for MCP (sound_transport_toggle) */
  const transportRef = useRef({ isPlaying, onTogglePlayback });
  transportRef.current = { isPlaying, onTogglePlayback };
  useEffect(() => registerLiveCommands({
    'sound.transport': (args) => {
      const { isPlaying: playing, onTogglePlayback: toggle } = transportRef.current;
      const action = args.action;
      if (action === 'toggle' || (action === 'play' && !playing) || (action === 'stop' && playing)) toggle();
      return { playing: action === 'toggle' ? !playing : action === 'play' };
    },
  }), []);

  /* keyboard (Pro Tools / Fairlight conventions; space and J/K/L stay with the app) */
  const keyRef = useRef({ mix, run, playheadPosition });
  keyRef.current = { mix, run, playheadPosition };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      const { mix: m, run: r, playheadPosition: ph } = keyRef.current;
      const modes: Record<string, string> = { F1: 'shuffle', F2: 'slip', F3: 'spot', F4: 'grid' };
      const tools: Record<string, string> = { F6: 'trimmer', F7: 'selector', F8: 'grabber', F10: 'smart' };
      if (modes[event.key]) { event.preventDefault(); r('edit.setMode', { mode: modes[event.key] }); return; }
      if (tools[event.key]) { event.preventDefault(); r('edit.setTool', { tool: tools[event.key] }); return; }
      if ((event.metaKey || event.ctrlKey) && event.key === '=') { event.preventDefault(); r('view.toggleMixWindow'); return; }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (m.ui.selection) { event.preventDefault(); r('edit.deleteSelection'); }
        else if (m.ui.selectedClipIds.length) { event.preventDefault(); r('clip.delete', { clipIds: m.ui.selectedClipIds }); }
      } else if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        r('clip.split', m.ui.selectedClipIds.length ? { clipIds: m.ui.selectedClipIds, time: ph } : { time: ph });
      } else if ((event.key === '+' || event.key === '-') && m.ui.selectedClipIds.length) {
        event.preventDefault();
        r('clip.nudge', { clipIds: m.ui.selectedClipIds, direction: event.key === '+' ? 1 : -1 });
      } else if (event.key === 'a' || event.key === 'A') {
        r('view.toggleAutomation');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const selectedClip = useMemo(() => timelineClips.find((c) => c.id === (mix.ui.selectedClipIds[0] ?? selectedClipId)) ?? null, [timelineClips, mix.ui.selectedClipIds, selectedClipId]);
  const browser = (
    <SoundBrowser
      mediaItems={mediaItems}
      selectedClip={selectedClip}
      onAddGeneratedMedia={onAddGeneratedMedia}
      onAddToTimeline={props.onAddToTimeline}
      apiKeyReady={props.apiKeyReady}
      references={props.references}
      shotPrompts={props.shotPrompts}
      recentProjects={props.recentProjects}
      currentProjectName={props.currentProjectName}
      currentProjectPath={currentProjectPath}
      library={{ assets: library.assets, isLoading: library.isLoading, error: library.error ?? null }}
    />
  );

  const viewProps: ViewProps = {
    mix, tracks: timelineTracks, clips: timelineClips, media: mediaItems, playhead: playheadPosition, isPlaying,
    waveformCache, meters, run, sourcesVersion, callTool, browser,
  };
  // Old projects may still store the retired 'protools' layout: it opens as Mix.
  const view = mix.ui.view === 'studio' ? 'studio' : 'mix';

  return (
    <div className={`snd snd--${view} studio-workspace`} data-automation-id="sound-workspace" data-sound-view={view}>
      <div className="snd-bar">
        <span className="snd-bar__title"><MusicNoteIcon className="w-4 h-4" />{VIEW_INFO[view][0]}</span>
        <button type="button" className={`snd-btn ${isPlaying ? 'snd-btn--on' : ''}`} data-automation-id="sound-transport-toggle" title="Play / Stop (Space)" onClick={() => run('transport.toggle')}>
          {isPlaying ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
        </button>
        <span className="snd-bar__tc" data-automation-id="sound-timecode">{formatTime(playheadPosition)}</span>
        <button type="button" className="snd-btn" data-automation-id="sound-track-add" onClick={() => run('track.add')}>+ Track</button>
        {loading.pending && <span className="snd-hint">Loading audio…</span>}
        {loading.missing.length > 0 && <span className="snd-error" title={loading.missing.join(', ')}>{loading.missing.length} audio file(s) could not be loaded</span>}
        {audioError && <span className="snd-error">{audioError}</span>}
        {lastError && <span className="snd-error" role="alert" onClick={clearError} title={lastError}>{lastError}</span>}
        <span className="snd-bar__spacer" />
        <span className="snd-hint">{VIEW_INFO[view][1]}</span>
        {props.onSwitchToEdit && <button type="button" className="snd-btn" onClick={props.onSwitchToEdit}>Open Timeline</button>}
      </div>
      {view === 'studio' ? <StudioView {...viewProps} /> : <FairlightView {...viewProps} />}
    </div>
  );
};

export default SoundWorkspace;
