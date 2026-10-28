import React from 'react';
import type { Workspace } from '../types';
import type { ResolvedWorkspaceNav, WorkspaceNavGroup } from '../config/workspaceNav';
import { ChevronRightIcon, SettingsIcon } from './icons';

/**
 * Workflow bar docked at the bottom of the window, in the spirit of DaVinci
 * Resolve's page bar but built on the stages of making a film: Development →
 * Pre-production → Shoot → Edit → Finishing → Delivery. Each stage is a group
 * of modules; picking a stage
 * reopens the module last used in it, and the sidebar then lists only that
 * stage's modules.
 */

/** The module a stage opens: the last one used in it, else its first. */
export const resolveStageTarget = (group: WorkspaceNavGroup, lastByGroup: Record<string, Workspace>): Workspace => {
  const last = lastByGroup[group.id];
  return last && group.items.some((item) => item.id === last) ? last : group.items[0].id;
};

const WorkflowBar: React.FC<{
  nav: ResolvedWorkspaceNav;
  lastByGroup: Record<string, Workspace>;
  onSelect: (workspace: Workspace) => void;
  onOpenSettings?: () => void;
  summary?: string;
}> = ({ nav, lastByGroup, onSelect, onOpenSettings, summary }) => {
  if (nav.stages.length <= 1) return null;
  return (
    <nav className="workflow-bar" aria-label="Workflow stages">
      <div className="workflow-bar__side">
        <div className="workflow-bar__summary">{summary}</div>
      </div>
      <ol className="workflow-bar__stages" role="tablist">
        {nav.stages.map((group, index) => {
          const Icon = group.icon;
          const isActive = group.id === nav.activeGroup?.id;
          return (
            <li key={group.id} className="workflow-bar__step">
              {index > 0 && <ChevronRightIcon className="workflow-bar__arrow" />}
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`workflow-bar__stage ${isActive ? 'workflow-bar__stage--active' : ''}`}
                onClick={() => onSelect(resolveStageTarget(group, lastByGroup))}
                title={`${group.description} (⌘⇧${index + 1})`}
                data-studio-action={`workspace-stage:${group.id.toLowerCase()}`}
              >
                <Icon className="workflow-bar__icon" />
                <span>{group.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="workflow-bar__side workflow-bar__side--end">
        {onOpenSettings && (
          <button type="button" className="workflow-bar__corner" onClick={onOpenSettings} title="Settings & API keys (⌘,)">
            <SettingsIcon className="workflow-bar__corner-icon" />
          </button>
        )}
      </div>
    </nav>
  );
};

export default WorkflowBar;
