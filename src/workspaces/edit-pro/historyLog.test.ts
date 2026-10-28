import test from 'node:test';
import assert from 'node:assert/strict';

import { describeChange } from './historyLog.ts';
import type { HistorySnapshot } from './historyLog.ts';

const base: HistorySnapshot = {
    clips: [{ id: 'c1', mediaId: 'm1', trackId: 'v1', start: 0, end: 4 }],
    tracks: [{ id: 'v1', isLocked: false, isMuted: false }],
    mediaCount: 1,
};
const name = (id: string) => (id === 'm1' ? 'Shot 1' : id);

test('detects split, add, remove and move', () => {
    const split: HistorySnapshot = { ...base, clips: [{ ...base.clips[0], end: 2 }, { id: 'c2', mediaId: 'm1', trackId: 'v1', start: 2, end: 4 }] };
    assert.deepEqual(describeChange(base, split, name), ['Clip split: Shot 1']);
    assert.deepEqual(describeChange(split, base, name), ['Clip removed: Shot 1'], 'ripple side effects are folded into the removal');
    const moved: HistorySnapshot = { ...base, clips: [{ ...base.clips[0], start: 1, end: 5 }] };
    assert.deepEqual(describeChange(base, moved, name), ['Clip moved: Shot 1']);
    const added: HistorySnapshot = { ...base, clips: [...base.clips, { id: 'c9', mediaId: 'm2', trackId: 'v1', start: 4, end: 6 }], mediaCount: 2 };
    assert.deepEqual(describeChange(base, added, name), ['Clip added: m2', 'Media imported']);
});

test('detects property edits and track changes', () => {
    const fx: HistorySnapshot = { ...base, clips: [{ ...base.clips[0], fxStack: [{ id: 'a' }] }] };
    assert.deepEqual(describeChange(base, fx, name), ['GPU effects changed: Shot 1']);
    const vol: HistorySnapshot = { ...base, clips: [{ ...base.clips[0], volume: 0.5 }] };
    assert.deepEqual(describeChange(base, vol, name), ['Volume changed: Shot 1']);
    const muted: HistorySnapshot = { ...base, tracks: [{ id: 'v1', isLocked: false, isMuted: true }] };
    assert.deepEqual(describeChange(base, muted, name), ['Track setting changed']);
    assert.deepEqual(describeChange(base, base, name), []);
});
