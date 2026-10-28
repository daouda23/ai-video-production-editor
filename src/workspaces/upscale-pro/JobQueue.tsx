import React from 'react';
import { Ban, Eye, FolderOpen, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { formatUsd } from '../../utils/generationPricing';
import type { UpscaleJob } from './upscaleOps.ts';

type Props = {
  jobs: UpscaleJob[];
  inBin: Set<string>;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onAddToBin: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onClearFinished: () => void;
};

const STATUS: Record<UpscaleJob['status'], string> = {
  queued: 'Waiting', running: 'Running', done: 'Done', failed: 'Error', cancelled: 'Cancelled',
};

const JobQueue: React.FC<Props> = ({ jobs, inBin, onCancel, onOpen, onRemove, onAddToBin, onOpenFolder, onClearFinished }) => (
  <section className="ups-jobs" data-automation-id="upscale-job-queue">
    <div className="ups-section-head">
      <span>Jobs ({jobs.length})</span>
      <button type="button" className="ups-icon-btn" disabled={!jobs.some((job) => job.status !== 'queued' && job.status !== 'running')} onClick={onClearFinished} data-automation-id="upscale-jobs-clear">Clear completed
      </button>
    </div>
    <div className="ups-jobs-list">
      {jobs.length === 0 && <div className="ups-hint" style={{ padding: '8px 10px' }}>No jobs yet. “Render preview” or “Export” adds them here.</div>}
      {[...jobs].reverse().map((job) => {
        const active = job.status === 'queued' || job.status === 'running';
        return (
          <div key={job.id} className="ups-job" data-automation-id={`upscale-job-${job.id}`}>
            <div style={{ minWidth: 0 }}>
              <div className="ups-job-name" title={job.name}>
                {job.status === 'running' && <LoaderCircle size={11} className="ups-spin" />} {job.name}
              </div>
              <div className="ups-hint">
                <span className={`ups-badge${job.purpose === 'preview' ? '' : ' is-accent'}`}>{job.purpose === 'preview' ? 'Preview' : 'Export'}</span>{' '}
                {job.mock && <span className="ups-badge is-warn">Test mode</span>}{' '}
                {job.estimatedUsd !== undefined && !job.mock && <span>ca. {formatUsd(job.estimatedUsd)}</span>}
              </div>
            </div>
            <div className="ups-hint" style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.error || job.stepLabel}>
              <span style={{ color: job.status === 'failed' ? 'var(--ups-err)' : undefined }}>{STATUS[job.status]}</span>
              {job.status === 'running' && ` · ${job.stepLabel}`}
              {job.status === 'failed' && job.error && ` · ${job.error}`}
              {job.savedPath && ` · ${job.savedPath}`}
            </div>
            <div className={`ups-progress${job.status === 'done' ? ' is-done' : job.status === 'failed' ? ' is-failed' : ''}`} title={`${Math.round(job.progress * 100)} %`}>
              <div style={{ width: `${Math.round((job.status === 'failed' ? 1 : job.progress) * 100)}%` }} />
            </div>
            <div className="ups-job-actions">
              {active && <button type="button" className="ups-icon-btn" title="Cancel" onClick={() => onCancel(job.id)} data-automation-id={`upscale-job-cancel-${job.id}`}><Ban /></button>}
              {job.status === 'done' && <button type="button" className="ups-icon-btn" title="Open in comparison" onClick={() => onOpen(job.id)} data-automation-id={`upscale-job-open-${job.id}`}><Eye /></button>}
              {job.status === 'done' && job.purpose === 'preview' && !inBin.has(job.id) && (
                <button type="button" className="ups-icon-btn" title="Add to the Media Bin" onClick={() => onAddToBin(job.id)} data-automation-id={`upscale-job-to-bin-${job.id}`}><Plus /></button>
              )}
              {job.savedPath && <button type="button" className="ups-icon-btn" title="Open folder" onClick={() => onOpenFolder(job.id)} data-automation-id={`upscale-job-folder-${job.id}`}><FolderOpen /></button>}
              {!active && <button type="button" className="ups-icon-btn" title="Remove" onClick={() => onRemove(job.id)} data-automation-id={`upscale-job-remove-${job.id}`}><Trash2 /></button>}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

export default JobQueue;
