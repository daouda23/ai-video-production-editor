/**
 * What waits for approval at each production stage. The "To approve" panel in
 * the workflow bar reads this, so review happens where the work is made
 * instead of on a separate page at the end:
 * - Development: the concept (logline, poster);
 * - Pre-production: storyboard frames, one entry per shot;
 * - Shoot, Edit, Finishing, Delivery: the video clips in the project.
 * Open change-request tasks follow the shots they touch at every stage.
 */
import type { DirectorFeedback, MediaItem, ReviewData, ShotPrompt, ShotTask, StoryBible } from '../types';
import { findFeedback } from './reviewLogic.ts';

export type ApprovalItem = {
  /** Unique within the queue. */
  key: string;
  scope: DirectorFeedback['scope'];
  targetId: string;
  title: string;
  detail?: string;
  previewUrl?: string;
  previewType?: 'image' | 'video';
  feedback?: DirectorFeedback;
};

export type ApprovalTask = ShotTask & { requestLabel: string; requestNote?: string };

export type ApprovalQueue = {
  /** Heading for the stage's section, e.g. "Storyboard frames". */
  label: string;
  items: ApprovalItem[];
  tasks: ApprovalTask[];
  /** Items without feedback plus tasks not done. */
  pending: number;
};

type QueueInput = {
  storyBible: Pick<StoryBible, 'title' | 'logline' | 'posterUrl'>;
  shotPrompts: ShotPrompt[];
  mediaItems: MediaItem[];
  reviewData: ReviewData;
};

const shotFrame = (shot: ShotPrompt) => shot.imageUrl || shot.startFrameUrl || shot.sketchUrl;

const STAGE_LABELS: Record<string, string> = {
  DEVELOPMENT: 'Concept',
  PREPRODUCTION: 'Storyboard frames',
};

export function buildApprovalQueue(stageId: string | null | undefined, input: QueueInput): ApprovalQueue {
  const { storyBible, shotPrompts, mediaItems, reviewData } = input;
  let items: ApprovalItem[] = [];

  if (stageId === 'DEVELOPMENT') {
    if (storyBible.logline || storyBible.posterUrl) {
      items = [{
        key: 'concept',
        scope: 'concept',
        targetId: 'concept',
        title: storyBible.title || 'Concept',
        detail: storyBible.logline || undefined,
        previewUrl: storyBible.posterUrl,
        previewType: storyBible.posterUrl ? 'image' : undefined,
      }];
    }
  } else if (stageId === 'PREPRODUCTION') {
    items = shotPrompts.filter((shot) => shotFrame(shot)).map((shot) => ({
      key: `shot-${shot.shot}`,
      scope: 'shot',
      targetId: String(shot.shot),
      title: `Shot ${shot.shotLabel || shot.shot}`,
      detail: shot.description || undefined,
      previewUrl: shotFrame(shot),
      previewType: 'image',
    }));
  } else if (stageId) {
    items = mediaItems.filter((item) => item.type === 'video').map((item) => ({
      key: `video-${item.id}`,
      scope: 'video',
      targetId: item.id,
      title: item.name || 'Video',
      detail: item.prompt || undefined,
      previewUrl: item.url,
      previewType: 'video',
    }));
  }
  items = items.map((item) => ({ ...item, feedback: findFeedback(reviewData, item.scope, item.targetId) }));

  const requests = new Map((reviewData.changeRequests ?? []).map((request) => [request.id, request]));
  const tasks: ApprovalTask[] = stageId === 'DEVELOPMENT' ? [] : (reviewData.shotTasks ?? [])
    .filter((task) => task.status !== 'done' && requests.has(task.requestId))
    .map((task) => {
      const request = requests.get(task.requestId)!;
      return { ...task, requestLabel: `${request.action} ${request.type} · ${request.targetName}`, requestNote: request.note || undefined };
    })
    .sort((a, b) => a.shotNumber - b.shotNumber);

  return {
    label: STAGE_LABELS[stageId || ''] || 'Video clips',
    items,
    tasks,
    pending: items.filter((item) => !item.feedback).length + tasks.length,
  };
}
