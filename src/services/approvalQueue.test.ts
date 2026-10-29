import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApprovalQueue } from './approvalQueue.ts';
import { normalizeReviewData, upsertFeedback } from './reviewLogic.ts';
import type { MediaItem, ShotPrompt } from '../types';

const shot = (n: number, extra: Partial<ShotPrompt> = {}): ShotPrompt => ({
  shot: n, prompt: '', description: `Shot ${n} desc`, characters: [], environment: null, ...extra,
});

const base = {
  storyBible: { title: 'Night Bus', logline: 'A driver hides a passenger.' },
  shotPrompts: [shot(1, { imageUrl: 'a.png' }), shot(2), shot(3, { sketchUrl: 's.png' })],
  mediaItems: [
    { id: 'v1', name: 'take.mp4', type: 'video', url: 'v1.mp4' },
    { id: 'i1', name: 'still.png', type: 'image', url: 'i1.png' },
  ] as MediaItem[],
  reviewData: normalizeReviewData(),
};

test('each stage reviews its own kind of work', () => {
  assert.deepEqual(buildApprovalQueue('DEVELOPMENT', base).items.map((i) => i.key), ['concept']);
  assert.deepEqual(buildApprovalQueue('PREPRODUCTION', base).items.map((i) => i.key), ['shot-1', 'shot-3']);
  assert.deepEqual(buildApprovalQueue('EDITING', base).items.map((i) => i.key), ['video-v1']);
});

test('reviewed items and finished tasks no longer count as pending', () => {
  let reviewData = upsertFeedback(base.reviewData, 'shot', '1', { score: 9 });
  reviewData = {
    ...reviewData,
    changeRequests: [{ id: 'r1', type: 'character', targetName: 'Mia', action: 'redo', note: '', createdAt: '' }],
    shotTasks: [
      { id: 't1', requestId: 'r1', shotNumber: 3, status: 'open', createdAt: '' },
      { id: 't2', requestId: 'r1', shotNumber: 1, status: 'done', createdAt: '' },
    ],
  };
  const queue = buildApprovalQueue('PREPRODUCTION', { ...base, reviewData });
  assert.equal(queue.items.find((i) => i.key === 'shot-1')?.feedback?.score, 9);
  assert.deepEqual(queue.tasks.map((t) => t.id), ['t1']);
  assert.equal(queue.tasks[0].requestLabel, 'redo character · Mia');
  assert.equal(queue.pending, 2);
  assert.equal(buildApprovalQueue('DEVELOPMENT', { ...base, reviewData }).tasks.length, 0);
});
