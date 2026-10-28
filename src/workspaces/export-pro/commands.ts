/**
 * Named, pure Export-page commands. Each command maps (state, args, ctx) → state and carries the
 * id used as `data-automation-id` on its control, so the same table can later be registered as
 * MCP tools (not done here — App.tsx owns tool registration).
 */
import {
    applyPreset,
    constrainVideo,
    DESTINATION_KINDS,
    type DeliverySettings,
    type DestinationKind,
    type RangeMode,
    type RenderKind,
    type SourceInfo,
} from './deliveryModel.ts';
import {
    addJobs,
    clearFinished,
    createJobs,
    removeJob,
    requestCancel,
    resetJob,
    startRun,
    type DavinciTab,
    type ExportPageState,
    type ExportViewMode,
    type JobContext,
} from './exportState.ts';

export type ExportCommandContext = Partial<JobContext> & { source?: SourceInfo };

export type SettingsSection = 'video' | 'audio' | 'effects' | 'metadata' | 'interchange' | 'still' | 'sequence' | 'audioOnly' | 'root';

type NoArgs = Record<string, never>;

export type ExportCommandArgs = {
    'export.view.set': { view: ExportViewMode };
    'export.destination.select': { kind: DestinationKind };
    'export.destination.toggle': { kind: DestinationKind; enabled?: boolean };
    'export.preset.apply': { presetId: string };
    'export.settings.patch': { section: SettingsSection; patch: Record<string, unknown> };
    'export.range.set': { mode: RangeMode; inPoint?: number | null; outPoint?: number | null };
    'export.queue.add': { kinds?: DestinationKind[] };
    'export.queue.remove': { jobId: string };
    'export.queue.retry': { jobId: string };
    'export.queue.clearFinished': NoArgs;
    'export.queue.renderAll': NoArgs;
    'export.queue.renderJob': { jobId: string };
    'export.queue.cancel': NoArgs;
    'export.export': NoArgs;
    'export.davinci.kind': { kind: RenderKind };
    'export.davinci.tab': { tab: DavinciTab };
    'export.section.toggle': { section: string };
};

export type ExportCommandId = keyof ExportCommandArgs;

type CommandSpec<K extends ExportCommandId> = {
    title: string;
    description: string;
    run: (state: ExportPageState, args: ExportCommandArgs[K], ctx?: ExportCommandContext) => ExportPageState;
};

const isKind = (value: unknown): value is DestinationKind => DESTINATION_KINDS.includes(value as DestinationKind);

const ROOT_KEYS = ['filename', 'outputDirectory', 'engine'];

const patchSettings = (settings: DeliverySettings, section: SettingsSection, patch: Record<string, unknown>): DeliverySettings => {
    if (section === 'root') {
        const next: Record<string, unknown> = { ...settings };
        for (const key of ROOT_KEYS) if (key in patch) next[key] = patch[key];
        if ('engine' in patch) next.presetId = 'custom';
        return next as DeliverySettings;
    }
    const current = settings[section] as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) {
        const base = current[key];
        const isPlain = (v: unknown) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
        merged[key] = isPlain(base) && isPlain(value) ? { ...(base as object), ...(value as object) } : value;
    }
    const next = { ...settings, [section]: merged } as DeliverySettings;
    if (section === 'video') next.video = constrainVideo(next.video);
    // Editing an encoder field detaches from the preset (Premiere shows "Benutzerdefiniert").
    if (section === 'video' || section === 'audio') next.presetId = 'custom';
    return next;
};

const jobContext = (ctx?: ExportCommandContext): JobContext => ({
    timelineDuration: ctx?.timelineDuration ?? 0,
    stillTime: ctx?.stillTime ?? 0,
    timelineName: ctx?.timelineName ?? 'Sequence',
    now: ctx?.now,
    makeId: ctx?.makeId,
});

export const EXPORT_COMMANDS: { [K in ExportCommandId]: CommandSpec<K> } = {
    'export.view.set': {
        title: 'Switch view',
        description: 'Switches between the Premiere and DaVinci views.',
        run: (state, { view }) => ({ ...state, view: view === 'davinci' ? 'davinci' : 'premiere' }),
    },
    'export.destination.select': {
        title: 'Choose destination',
        description: 'Shows the settings of a destination (media, interchange, still, sequence, audio).',
        run: (state, { kind }) => (isKind(kind) ? { ...state, selectedDestination: kind } : state),
    },
    'export.destination.toggle': {
        title: 'Destination on/off',
        description: 'Turns a destination on or off for “Export”.',
        run: (state, { kind, enabled }) => (isKind(kind)
            ? { ...state, enabledDestinations: { ...state.enabledDestinations, [kind]: enabled ?? !state.enabledDestinations[kind] } }
            : state),
    },
    'export.preset.apply': {
        title: 'Apply preset',
        description: 'Sets video/audio settings from a preset (see DELIVERY_PRESETS).',
        run: (state, { presetId }, ctx) => ({ ...state, settings: applyPreset(state.settings, presetId, ctx?.source ?? null) }),
    },
    'export.settings.patch': {
        title: 'Change setting',
        description: 'Changes fields of a section (video, audio, effects, metadata, interchange, still, sequence, audioOnly, root).',
        run: (state, { section, patch }) => ({ ...state, settings: patchSettings(state.settings, section, patch || {}) }),
    },
    'export.range.set': {
        title: 'Set range',
        description: 'Entire sequence (full), In/Out (inout) or custom (custom), times in seconds.',
        run: (state, { mode, inPoint, outPoint }) => ({
            ...state,
            settings: {
                ...state.settings,
                range: {
                    mode,
                    inPoint: inPoint === undefined ? state.settings.range.inPoint : inPoint,
                    outPoint: outPoint === undefined ? state.settings.range.outPoint : outPoint,
                },
            },
        }),
    },
    'export.queue.add': {
        title: 'Add to queue',
        description: 'Creates render jobs for the given (otherwise the enabled) destinations.',
        run: (state, { kinds }, ctx) => addJobs(state, createJobs(state, jobContext(ctx), kinds)),
    },
    'export.queue.remove': {
        title: 'Delete job',
        description: 'Removes a job that is not running from the queue.',
        run: (state, { jobId }) => removeJob(state, jobId),
    },
    'export.queue.retry': {
        title: 'Reset job',
        description: 'Sets a finished or failed job back to “waiting”.',
        run: (state, { jobId }) => resetJob(state, jobId),
    },
    'export.queue.clearFinished': {
        title: 'Remove completed',
        description: 'Removes finished, failed and cancelled jobs.',
        run: (state) => clearFinished(state),
    },
    'export.queue.renderAll': {
        title: 'Render all',
        description: 'Starts all waiting jobs one after another.',
        run: (state) => startRun(state, null),
    },
    'export.queue.renderJob': {
        title: 'Render job',
        description: 'Starts exactly one job (resets it if needed).',
        run: (state, { jobId }) => startRun(state, [jobId]),
    },
    'export.queue.cancel': {
        title: 'Cancel render',
        description: 'Cancels the running job and pauses the queue.',
        run: (state) => requestCancel(state),
    },
    'export.export': {
        title: 'Export',
        description: 'Creates jobs for all enabled destinations and starts only those right away.',
        run: (state, _args, ctx) => {
            const before = new Set(state.queue.map((job) => job.id));
            const withJobs = addJobs(state, createJobs(state, jobContext(ctx)));
            const added = withJobs.queue.filter((job) => !before.has(job.id)).map((job) => job.id);
            return added.length === 0 ? state : startRun(withJobs, added);
        },
    },
    'export.davinci.kind': {
        title: 'Choose render type',
        description: 'DaVinci view: media, still, sequence or audio.',
        run: (state, { kind }) => (isKind(kind) && (kind as DestinationKind) !== 'interchange' ? { ...state, davinciKind: kind } : state),
    },
    'export.davinci.tab': {
        title: 'Choose render tab',
        description: 'DaVinci view: video, audio or file.',
        run: (state, { tab }) => ({ ...state, davinciTab: tab === 'audio' || tab === 'file' ? tab : 'video' }),
    },
    'export.section.toggle': {
        title: 'Expand/collapse section',
        description: 'Premiere view: collapses a settings section.',
        run: (state, { section }) => ({ ...state, collapsed: { ...state.collapsed, [section]: !state.collapsed[section] } }),
    },
};

export const runExportCommand = <K extends ExportCommandId>(
    state: ExportPageState,
    id: K,
    args: ExportCommandArgs[K],
    ctx?: ExportCommandContext,
): ExportPageState => (EXPORT_COMMANDS[id] as CommandSpec<K>).run(state, args, ctx);

/** Tool descriptors (id, title, description) for a future MCP registration. */
export const listExportCommands = () => (Object.keys(EXPORT_COMMANDS) as ExportCommandId[])
    .map((id) => ({ id, title: EXPORT_COMMANDS[id].title, description: EXPORT_COMMANDS[id].description }));
