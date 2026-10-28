import React from 'react';
import type { Workspace } from '../types';
import { UploadIcon, TrimIcon, EditIcon, LayersIcon, ColorIcon, MusicNoteIcon, ExportIcon, ClapperboardIcon, SettingsIcon } from './icons';

/**
 * DaVinci-style page bar: always docked at the bottom of the window. The post
 * pages share one project, one timeline and one selection, so switching
 * between them is a single click (or ⌘⇧1–7) rather than a trip through the
 * sidebar. Project and Settings sit at the edges like Resolve's home and
 * settings buttons.
 */

export const POST_PAGES: Array<{ id: Workspace; label: string; hint: string; icon: React.FC<{ className?: string }>; shortcut: string }> = [
  { id: 'IMPORT', label: 'Media', hint: 'Import and organise footage', icon: UploadIcon, shortcut: '⌘⇧1' },
  { id: 'TRIM', label: 'Cut', hint: 'Fast trims and rough assembly', icon: TrimIcon, shortcut: '⌘⇧2' },
  { id: 'EDIT', label: 'Edit', hint: 'Timeline, effects, titles, agent', icon: EditIcon, shortcut: '⌘⇧3' },
  { id: 'COMPOSITING', label: 'Fusion', hint: 'Composite, key and relight', icon: LayersIcon, shortcut: '⌘⇧4' },
  { id: 'POST', label: 'Color', hint: 'Wheels, LUTs and film looks', icon: ColorIcon, shortcut: '⌘⇧5' },
  { id: 'SOUND', label: 'Fairlight', hint: 'Voice, music and mix', icon: MusicNoteIcon, shortcut: '⌘⇧6' },
  { id: 'EXPORT', label: 'Deliver', hint: 'Render and hand off', icon: ExportIcon, shortcut: '⌘⇧7' },
];

export const isPostPage = (workspace: Workspace) => POST_PAGES.some((page) => page.id === workspace);

const PostPageBar: React.FC<{
  active: Workspace;
  allowed: Set<Workspace>;
  onSelect: (workspace: Workspace) => void;
  onOpenSettings?: () => void;
  summary?: string;
}> = ({ active, allowed, onSelect, onOpenSettings, summary }) => {
  const pages = POST_PAGES.filter((page) => allowed.has(page.id));
  if (pages.length <= 1) return null;
  const projectActive = active === 'PROJECT';
  return (
    <nav className="post-pagebar" aria-label="Pages">
      <div className="post-pagebar__side">
        {allowed.has('PROJECT') && (
          <button
            type="button"
            className={`post-pagebar__corner ${projectActive ? 'post-pagebar__corner--active' : ''}`}
            onClick={() => onSelect('PROJECT')}
            title="Project hub"
            data-studio-action="workspace:project"
          >
            <ClapperboardIcon className="post-pagebar__corner-icon" />
          </button>
        )}
        <div className="post-pagebar__summary">{summary}</div>
      </div>
      <div className="post-pagebar__pages" role="tablist">
        {pages.map((page) => {
          const Icon = page.icon;
          const isActive = page.id === active;
          return (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`post-pagebar__page ${isActive ? 'post-pagebar__page--active' : ''}`}
              onClick={() => onSelect(page.id)}
              title={`${page.hint} (${page.shortcut})`}
              data-studio-action={`workspace:${String(page.id).toLowerCase()}`}
            >
              <Icon className="post-pagebar__icon" />
              <span>{page.label}</span>
            </button>
          );
        })}
      </div>
      <div className="post-pagebar__side post-pagebar__side--end">
        {onOpenSettings && (
          <button type="button" className="post-pagebar__corner" onClick={onOpenSettings} title="Settings & API keys (⌘,)">
            <SettingsIcon className="post-pagebar__corner-icon" />
          </button>
        )}
      </div>
    </nav>
  );
};

export default PostPageBar;
