import { Workspace } from '../types';

export type UIMode = 'advanced' | 'pro';

export const UI_MODE_STORAGE_KEY = 'ui_mode_v1';
export const DEFAULT_UI_MODE: UIMode = 'advanced';

export const UI_MODE_META: Record<UIMode, { label: string; description: string; emoji: string }> = {
    advanced: {
        label: 'Standard',
        description: 'Balanced tools for most projects.',
        emoji: '🎯',
    },
    pro: {
        label: 'Pro',
        description: 'Full studio workflow with all advanced controls.',
        emoji: '⚡',
    },
};

const MODE_WORKSPACES: Record<UIMode, Workspace[]> = {
    advanced: [
        'PROJECT',
        'MICRODRAMA',
        'ASSET_LIBRARY',
        'MOODBOARD',
        'NOTEBOOKLM',
        'PLUGINS',
        'LOCAL_AI',
        'TEAM',
        'IMPORT',
        'DESIGN',
        'IMAGE_GEN',
        'VIDEO_GEN',
        'NODES',
        'SCENE_MAP',
        'AVATAR',
        'SOUND_GEN',
        'SOUND',
        'EDIT',
        'PHOTO',
        'UPSCALE',
        'COMPOSITING',
        'TRIM',
        'POST',
        'ANALYSIS',
        'REVIEW',
        'REQUESTS',
        'EXPORT',
    ],
    pro: [
        'PROJECT',
        'MICRODRAMA',
        'ASSET_LIBRARY',
        'MOODBOARD',
        'NOTEBOOKLM',
        'PLUGINS',
        'LOCAL_AI',
        'TEAM',
        'IMPORT',
        'DESIGN',
        'IMAGE_GEN',
        'VIDEO_GEN',
        'NODES',
        'SET_DESIGN',
        'SCENE_MAP',
        'WORLD_GEN',
        'AVATAR',
        'SOUND_GEN',
        'SOUND',
        'EDIT',
        'PHOTO',
        'UPSCALE',
        'COMPOSITING',
        'TRIM',
        'POST',
        'ANALYSIS',
        'REVIEW',
        'REQUESTS',
        'EXPORT',
    ],
};

export const normalizeUIMode = (value: unknown): UIMode => {
    if (value === 'advanced' || value === 'pro') {
        return value;
    }
    // The retired Simple mode ('beginner') opens as Standard.
    return DEFAULT_UI_MODE;
};

export const getAllowedWorkspacesForMode = (mode: UIMode): Workspace[] => {
    return MODE_WORKSPACES[mode];
};

export const filterWorkspacesForRole = (workspaces: Workspace[], isDirector: boolean): Workspace[] => {
    return workspaces.filter((workspace) => {
        if (workspace === 'REVIEW') return isDirector;
        if (workspace === 'REQUESTS') return !isDirector;
        return true;
    });
};
