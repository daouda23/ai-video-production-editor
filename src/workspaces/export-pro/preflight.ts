/**
 * Mirrors the preflight checks of the FFmpeg renderer (electron/ffmpeg-handler.js buildRenderPlan)
 * so the Export page can warn before a job fails. Pure.
 */
import type { MediaItem, TimelineClip, TimelineTrack } from '../../types';

export type PreflightIssue = { clipId: string; message: string };

export const ffmpegPreflight = (clips: TimelineClip[], media: MediaItem[], tracks: TimelineTrack[]): PreflightIssue[] => {
    const byId = new Map(media.map((item) => [item.id, item]));
    const trackById = new Map(tracks.map((track) => [track.id, track]));
    const issues: PreflightIssue[] = [];
    for (const clip of clips) {
        const track = trackById.get(clip.trackId);
        if (track?.isMuted) continue;
        const item = byId.get(clip.mediaId);
        const name = item?.name || clip.id;
        const add = (message: string) => issues.push({ clipId: clip.id, message: `${name}: ${message}` });
        if (clip.textConfig) { add('The FFmpeg export does not render text clips yet.'); continue; }
        if (!item) { add('Media missing.'); continue; }
        if (item.type === 'audio') continue;
        if (clip.transitionOut?.type && Number(clip.transitionOut.duration) > 0) add('The FFmpeg export does not render transitions yet.');
        if (clip.chromaKey) add('The FFmpeg export does not render chroma key yet.');
        if (clip.blendMode && clip.blendMode !== 'normal') add(`Blend mode “${clip.blendMode}” – the FFmpeg export does not render it yet.`);
        if (clip.filters?.lut === 'custom' && Number(clip.filters?.lutIntensity) > 0) add('The FFmpeg export does not render custom clip LUTs yet (the output LUT under “Effects” works).');
        if ((clip.keyframes || []).some((frame) => frame.property === 'opacity')) add('The FFmpeg export does not render opacity keyframes yet.');
    }
    return issues;
};
