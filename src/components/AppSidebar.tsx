import React from 'react';
import type { Workspace } from '../types';
import type { UIMode } from '../config/uiModes';
import { navItemKey, type ResolvedWorkspaceNav, type WorkspaceNavItem } from '../config/workspaceNav';
import { FolderIcon, SettingsIcon } from './icons';

export type SidebarProjectStatus = {
  label: string;
  tone: 'ready' | 'busy' | 'attention';
};

interface AppSidebarProps {
  nav: ResolvedWorkspaceNav;
  activeWorkspace: Workspace;
  onSwitch: (item: WorkspaceNavItem) => void;
  uiMode: UIMode;
  collapsed: boolean;
  projectName?: string | null;
  projectStatus: SidebarProjectStatus;
  onOpenProject?: () => void;
  onOpenSettings?: () => void;
}

/**
 * Source list for the active workflow stage: the bottom workflow bar picks the
 * stage, the sidebar lists that stage's modules. Collapses to an icon rail so
 * the canvas gets the room.
 */
const AppSidebar: React.FC<AppSidebarProps> = ({
  nav,
  activeWorkspace,
  onSwitch,
  collapsed,
  projectName,
  projectStatus,
  onOpenProject,
  onOpenSettings,
}) => {
  return (
    <nav
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      aria-label="Workspaces"
    >
      <div className="app-sidebar__scroll">
        {[
          ...(nav.activeGroup ? [nav.activeGroup] : nav.stages),
          ...(nav.utility && nav.activeGroup !== nav.utility ? [nav.utility] : []),
        ].map((group) => {
          const groupActive = group.id === nav.activeGroup?.id;
          return (
            <section
              key={group.id}
              className={`app-sidebar__group ${groupActive ? 'app-sidebar__group--active' : ''} ${group.utility ? 'app-sidebar__group--utility' : ''}`}
              aria-label={group.name}
            >
              <div className="app-sidebar__label" title={group.description}>
                <span>{group.name}</span>
              </div>
              <ul className="app-sidebar__list" role="list">
                {group.items.map((item) => {
                  const isActive = navItemKey(item) === (nav.activeItem && navItemKey(nav.activeItem));
                  const Icon = item.icon;
                  return (
                    <li key={navItemKey(item)}>
                      <button
                        type="button"
                        onClick={() => onSwitch(item)}
                        data-studio-action={`workspace:${navItemKey(item).toLowerCase()}`}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? `${item.name} · ${item.description}` : item.description}
                        className={`app-sidebar__item ${isActive ? 'app-sidebar__item--active' : ''}`}
                      >
                        <Icon className="app-sidebar__icon" />
                        <span className="app-sidebar__text">{item.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Keep a group-level hook for the Studio Agent automation. */}
              <button
                type="button"
                className="app-sidebar__group-hook"
                tabIndex={-1}
                aria-hidden="true"
                data-studio-action={`workspace-group:${group.id.toLowerCase()}`}
                onClick={() => onSwitch(group.items[0])}
              />
            </section>
          );
        })}
      </div>

      <div className="app-sidebar__footer">
        <button
          type="button"
          className="app-sidebar__project"
          onClick={onOpenProject}
          title={projectName ? `${projectName} · ${projectStatus.label}` : 'Choose a project folder'}
        >
          <span className="app-sidebar__project-icon">
            <FolderIcon className="w-4 h-4" />
          </span>
          <span className="app-sidebar__project-text">
            <span className="app-sidebar__project-name">{projectName || 'No project folder'}</span>
            <span className={`app-sidebar__project-status app-sidebar__project-status--${projectStatus.tone}`}>
              <span className="app-sidebar__project-dot" />
              {projectStatus.label}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="app-sidebar__item app-sidebar__item--utility"
          onClick={onOpenSettings}
          title="Settings & API keys"
        >
          <SettingsIcon className="app-sidebar__icon" />
          <span className="app-sidebar__text">Settings</span>
        </button>
      </div>
    </nav>
  );
};

export default AppSidebar;
