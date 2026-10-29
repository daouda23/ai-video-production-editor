import React from 'react';
import { navItemKey, type ResolvedWorkspaceNav, type WorkspaceNavGroup, type WorkspaceNavItem } from '../config/workspaceNav';
import { ChevronRightIcon, ClipboardCheckIcon, SettingsIcon } from './icons';

/**
 * Workflow bar docked at the bottom of the window, in the spirit of DaVinci
 * Resolve's page bar but built on the stages of making a film: Development →
 * Pre-production → Shoot → Edit → Finishing → Delivery. Each stage is a group
 * of modules; picking a stage
 * reopens the module last used in it, and the sidebar then lists only that
 * stage's modules.
 */

/** The entry a stage opens: the last one used in it, else its first. */
export const resolveStageTarget = (group: WorkspaceNavGroup, lastByGroup: Record<string, string>): WorkspaceNavItem =>
  group.items.find((item) => navItemKey(item) === lastByGroup[group.id]) || group.items[0];

const WorkflowBar: React.FC<{
  nav: ResolvedWorkspaceNav;
  lastByGroup: Record<string, string>;
  onSelect: (item: WorkspaceNavItem) => void;
  onOpenSettings?: () => void;
  summary?: string;
  /** Items waiting for approval at the active stage; shows the "To approve" toggle. */
  approvalCount?: number;
  approvalOpen?: boolean;
  onToggleApprovals?: () => void;
}> = ({ nav, lastByGroup, onSelect, onOpenSettings, summary, approvalCount, approvalOpen, onToggleApprovals }) => {
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
        {onToggleApprovals && (
          <button type="button" className={`workflow-bar__approve ${approvalOpen ? 'workflow-bar__approve--open' : ''}`} onClick={onToggleApprovals} aria-pressed={approvalOpen} title="What waits for approval at this stage">
            <ClipboardCheckIcon className="workflow-bar__corner-icon" />
            <span>To approve</span>
            {Boolean(approvalCount) && <span className="workflow-bar__badge">{approvalCount}</span>}
          </button>
        )}
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
