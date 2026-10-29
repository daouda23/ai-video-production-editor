import React from 'react';
import type { DirectorFeedback, ShotTask } from '../types';
import type { ApprovalQueue } from '../services/approvalQueue';
import { DEFAULT_FEEDBACK_SCORE } from '../services/reviewLogic';
import { XIcon } from './icons';

/**
 * "To approve" drawer opened from the workflow bar. It lists what the current
 * stage has produced (concept, storyboard frames or clips) with the director's
 * score and note, and the change-request tasks still open. Directors score and
 * annotate here; artists read the notes and tick off their tasks.
 */
const ApprovalPanel: React.FC<{
  stageName: string;
  queue: ApprovalQueue;
  isDirector: boolean;
  onFeedback: (scope: DirectorFeedback['scope'], targetId: string, updates: { score?: number; note?: string }) => void;
  onTaskStatus: (taskId: string, status: ShotTask['status']) => void;
  onOpenFullReview: () => void;
  onClose: () => void;
}> = ({ stageName, queue, isDirector, onFeedback, onTaskStatus, onOpenFullReview, onClose }) => (
  <aside className="approval-panel" aria-label="To approve">
    <header className="approval-panel__head">
      <div>
        <div className="approval-panel__title">To approve</div>
        <div className="approval-panel__sub">{stageName} · {queue.pending} pending</div>
      </div>
      <button type="button" className="toolbar-button toolbar-button--icon" onClick={onClose} aria-label="Close"><XIcon className="w-4 h-4" /></button>
    </header>

    <div className="approval-panel__body">
      <div className="approval-panel__label">{queue.label}</div>
      {queue.items.length === 0 && <p className="approval-panel__empty">Nothing to review at this stage yet.</p>}
      {queue.items.map((item) => {
        const score = item.feedback?.score ?? DEFAULT_FEEDBACK_SCORE;
        return (
          <div key={item.key} className={`approval-item ${item.feedback ? 'approval-item--done' : ''}`}>
            {item.previewUrl && (
              <div className="approval-item__preview">
                {item.previewType === 'video'
                  ? <video src={item.previewUrl} muted playsInline preload="metadata" />
                  : <img src={item.previewUrl} alt="" loading="lazy" />}
              </div>
            )}
            <div className="approval-item__main">
              <div className="approval-item__row">
                <span className="approval-item__name" title={item.title}>{item.title}</span>
                <span className={`approval-item__status ${item.feedback ? 'is-done' : ''}`}>{item.feedback ? `${item.feedback.score}/10` : 'Pending'}</span>
              </div>
              {item.detail && <p className="approval-item__detail">{item.detail}</p>}
              {isDirector ? (
                <>
                  <div className="approval-item__row">
                    <input
                      type="range" min={1} max={10} value={score} aria-label="Score"
                      onChange={(e) => onFeedback(item.scope, item.targetId, { score: Number(e.target.value) })}
                    />
                    {!item.feedback && <button type="button" className="app-button app-secondary text-xs" onClick={() => onFeedback(item.scope, item.targetId, { score })}>Mark reviewed</button>}
                  </div>
                  <textarea
                    className="app-textarea text-xs" rows={2} placeholder="Notes for the artist"
                    value={item.feedback?.note ?? ''}
                    onChange={(e) => onFeedback(item.scope, item.targetId, { note: e.target.value })}
                  />
                </>
              ) : (
                item.feedback?.note && <p className="approval-item__note">{item.feedback.note}</p>
              )}
            </div>
          </div>
        );
      })}

      {queue.tasks.length > 0 && (
        <>
          <div className="approval-panel__label">Requested changes</div>
          {queue.tasks.map((task) => (
            <div key={task.id} className="approval-task">
              <div>
                <div className="approval-item__name">Shot {task.shotNumber} · {task.requestLabel}</div>
                {task.requestNote && <p className="approval-item__detail">{task.requestNote}</p>}
              </div>
              <select className="app-select app-select--compact" value={task.status} onChange={(e) => onTaskStatus(task.id, e.target.value as ShotTask['status'])} aria-label="Task status">
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          ))}
        </>
      )}
    </div>

    <footer className="approval-panel__foot">
      <button type="button" className="app-button app-tertiary text-xs" onClick={onOpenFullReview}>{isDirector ? 'Open full review' : 'Open all requests'} ›</button>
    </footer>
  </aside>
);

export default ApprovalPanel;
