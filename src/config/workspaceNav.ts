import type React from 'react';
import type { Workspace } from '../types';
import type { UIMode } from './uiModes';
import {
  ScriptIcon,
  BoxIcon,
  UploadIcon,
  EditIcon,
  TrimIcon,
  ColorIcon,
  ExportIcon,
  ImageIcon,
  VideoIcon,
  SparklesIcon,
  UserCircleIcon,
  BrainCircuitIcon,
  ClipboardCheckIcon,
  ListIcon,
  LayersIcon,
  MusicNoteIcon,
  MapIcon,
  GridIcon,
  ClapperboardIcon,
  BrainIcon,
  WandSparklesIcon,
  LandscapeIcon,
  CameraIcon,
  FilmIcon,
  PaletteIcon,
  ApertureIcon,
} from '../components/icons';

export type WorkspaceNavIcon = React.FC<{ className?: string }>;

export type WorkspaceNavItem = {
  id: Workspace;
  name: string;
  description: string;
  icon: WorkspaceNavIcon;
};

export type WorkspaceNavGroup = {
  id: string;
  name: string;
  description: string;
  icon: WorkspaceNavIcon;
  items: WorkspaceNavItem[];
  /** Studio-wide tools used throughout the film; shown apart from the production stages. */
  utility?: boolean;
};

/**
 * The production stages, in the order a film is made, plus one utility group.
 * The bottom workflow bar shows the stages; the sidebar lists the modules of
 * the active stage, with the utility tools pinned underneath.
 */
export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    id: 'DEVELOPMENT',
    name: 'Development',
    description: 'Write the film: project, story, research, look',
    icon: ScriptIcon,
    items: [
      { id: 'PROJECT', name: 'Project', description: 'Story, shots, production plan', icon: ClapperboardIcon },
      { id: 'MICRODRAMA', name: 'Microdrama', description: 'Mobile-first 9:16 series pipeline', icon: FilmIcon },
      { id: 'NOTEBOOKLM', name: 'Research', description: 'Source notes and context', icon: BrainIcon },
      { id: 'MOODBOARD', name: 'Moodboard', description: 'Visual direction and references', icon: PaletteIcon },
    ],
  },
  {
    id: 'PREPRODUCTION',
    name: 'Pre-production',
    description: 'Cast, sets and camera plan',
    icon: CameraIcon,
    items: [
      { id: 'AVATAR', name: 'Avatar', description: 'Characters and presenters with a voice', icon: UserCircleIcon },
      { id: 'SET_DESIGN', name: 'Set Design', description: 'Build the set in 3D: props, lights, cameras', icon: CameraIcon },
      { id: 'WORLD_GEN', name: '3D World', description: 'Generate explorable 3D worlds', icon: LandscapeIcon },
      { id: 'SCENE_MAP', name: 'Scene Map', description: 'Floor plan, blocking and camera plan', icon: GridIcon },
    ],
  },
  {
    id: 'SHOOT',
    name: 'Shoot',
    description: 'Make every shot: images, video, voice, music',
    icon: VideoIcon,
    items: [
      { id: 'IMAGE_GEN', name: 'Images', description: 'Create stills and frames', icon: WandSparklesIcon },
      { id: 'VIDEO_GEN', name: 'Video', description: 'Generate motion clips', icon: VideoIcon },
      { id: 'SOUND_GEN', name: 'Voice & Music', description: 'Generate voice, music and sound effects', icon: MusicNoteIcon },
      { id: 'NODES', name: 'Nodes', description: 'Build advanced AI chains', icon: LayersIcon },
      { id: 'IMPORT', name: 'Import', description: 'Bring in real footage and audio', icon: UploadIcon },
    ],
  },
  {
    id: 'EDITING',
    name: 'Edit',
    description: 'Assemble the film',
    icon: EditIcon,
    items: [
      { id: 'TRIM', name: 'Trim', description: 'Fast trims and rough assembly', icon: TrimIcon },
      { id: 'EDIT', name: 'Timeline', description: 'Assemble the main timeline', icon: EditIcon },
      { id: 'COMPOSITING', name: 'Composite', description: 'Layer, key, and blend shots', icon: LayersIcon },
    ],
  },
  {
    id: 'FINISHING',
    name: 'Finishing',
    description: 'Final picture and sound',
    icon: ColorIcon,
    items: [
      { id: 'POST', name: 'Color', description: 'Grade and polish the look', icon: ColorIcon },
      { id: 'PHOTO', name: 'Photo', description: 'Retouch and prepare stills', icon: ApertureIcon },
      { id: 'UPSCALE', name: 'Upscale', description: 'Improve resolution and detail', icon: SparklesIcon },
      { id: 'SOUND', name: 'Mix', description: 'Mix, master and deliver the sound', icon: MusicNoteIcon },
    ],
  },
  {
    id: 'DELIVERY',
    name: 'Delivery',
    description: 'Check, render and promote',
    icon: ExportIcon,
    items: [
      { id: 'ANALYSIS', name: 'Analysis', description: 'Find pacing and quality issues', icon: BrainCircuitIcon },
      { id: 'REVIEW', name: 'Approvals', description: 'Approve and annotate work', icon: ClipboardCheckIcon },
      { id: 'REQUESTS', name: 'Requests', description: 'Handle change requests', icon: ListIcon },
      { id: 'EXPORT', name: 'Export', description: 'Choose format and render', icon: ExportIcon },
      { id: 'DESIGN', name: 'Posters & Promo', description: 'Posters, thumbnails and social assets', icon: ImageIcon },
    ],
  },
  {
    id: 'STUDIO',
    name: 'Studio',
    description: 'Tools for the whole production',
    icon: BoxIcon,
    utility: true,
    items: [
      { id: 'ASSET_LIBRARY', name: 'Library', description: 'Every media file and pack', icon: BoxIcon },
      { id: 'TEAM', name: 'Team', description: 'Collaboration, shared spaces, chat', icon: UserCircleIcon },
      { id: 'PLUGINS', name: 'Plugins', description: 'Install packs, LUTs and host plugins', icon: LayersIcon },
      { id: 'LOCAL_AI', name: 'Local AI', description: 'Run open-weights models and LLMs on your computer', icon: BrainCircuitIcon },
    ],
  },
];

export type ResolveWorkspaceNavParams = {
  activeWorkspace: Workspace;
  uiMode: UIMode;
  allowedWorkspaces?: Workspace[];
  showReview?: boolean;
  showRequests?: boolean;
};

export type ResolvedWorkspaceNav = {
  groups: WorkspaceNavGroup[];
  /** Production stages only (the workflow bar). */
  stages: WorkspaceNavGroup[];
  /** The utility group, if any of its tools is allowed. */
  utility: WorkspaceNavGroup | undefined;
  items: WorkspaceNavItem[];
  activeGroup: WorkspaceNavGroup | undefined;
  activeItem: WorkspaceNavItem | undefined;
  activeIndex: number;
  nextItem: WorkspaceNavItem | undefined;
  previousItem: WorkspaceNavItem | undefined;
};

/**
 * Filters the static nav tree to what the current mode/role can see and
 * resolves the active + neighbouring entries. Shared by the sidebar and the
 * toolbar breadcrumb so both always agree.
 */
export const resolveWorkspaceNav = ({
  activeWorkspace,
  uiMode,
  allowedWorkspaces,
  showReview = true,
  showRequests = true,
}: ResolveWorkspaceNavParams): ResolvedWorkspaceNav => {
  const allowed = allowedWorkspaces ? new Set(allowedWorkspaces) : null;

  const groups = WORKSPACE_NAV_GROUPS
    .map((group) => {
      const items = group.items
        .filter((item) => {
          if (allowed && !allowed.has(item.id)) return false;
          if (!showReview && item.id === 'REVIEW') return false;
          if (!showRequests && item.id === 'REQUESTS') return false;
          return true;
        });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  const items = groups.flatMap((group) => group.items);
  const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeWorkspace));
  const activeItem = activeGroup?.items.find((item) => item.id === activeWorkspace);
  const activeIndex = items.findIndex((item) => item.id === activeWorkspace);

  return {
    groups,
    stages: groups.filter((group) => !group.utility),
    utility: groups.find((group) => group.utility),
    items,
    activeGroup,
    activeItem,
    activeIndex,
    nextItem: activeIndex >= 0 ? items[activeIndex + 1] : undefined,
    previousItem: activeIndex > 0 ? items[activeIndex - 1] : undefined,
  };
};
