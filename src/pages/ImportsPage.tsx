import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {
    FiArrowLeft, FiCheck, FiCheckSquare, FiChevronDown, FiDownload, FiEdit2, FiInbox, FiLock, FiSearch, FiTrash2, FiUpload, FiX,
} from 'react-icons/fi';
import {ImageSourceContext, type ImageSource} from '../components/ImageSourceContext';
import MarkdownView from '../components/MarkdownView';
import {type MemoLinkApi, MemoLinkContext} from '../components/MemoLinkContext';
import NameDialog from '../components/NameDialog';
import Pager from '../components/Pager';
import TodoView from '../components/TodoView';
import {
    compareStatus, type ConflictAction, deleteBatch, getBatchMemos, getStagedImage, type ImportBatch, importFromBatch, type ImportResult,
    listBatches, localByUid, removeFromBatch, renameBatch, stageBackup, STATUS_LABEL, type StagedStatus,
} from '../db/importStore';
import {getAllMemos, LOCKED_TITLE} from '../db/memoDB';
import type {Memo} from '../types/memo';
import {readBackup} from '../utils/backup';
import {cleanName, collectFolders, isInside, pathLabel} from '../utils/folders';
import {formatDate} from '../utils/format';
import {imageBlob} from '../utils/image';
import {useSettings} from '../utils/settings';
import {addKeys, openJSON, tryOpen, useVaultState} from '../utils/vault';

type StatusFilter = 'all' | StagedStatus | 'conflict';

const STATUS_STYLE: Record<StagedStatus, string> = {
    new: 'bg-emerald-900/70 text-emerald-200',
    newer: 'bg-sky-900/70 text-sky-200',
    older: 'bg-amber-900/60 text-amber-200',
    differs: 'bg-amber-900/60 text-amber-200',
    same: 'bg-gray-700 text-gray-300',
};

const isConflict = (s: StagedStatus) => s !== 'new';

/** 보관함 글 중 잠근 글은 그 백업의 비밀번호로 열었을 때만 내용을 보여준다 */
async function decodeStaged(m: Memo): Promise<Memo> {
    if (!m.isLocked || !m.sealed) return m;
    const p = await openJSON<Pick<Memo, 'title' | 'content' | 'comments' | 'hashtags'>>(m.sealed);
    return p ? {...m, ...p, isSealed: false} : {...m, title: LOCKED_TITLE, content: '', comments: [], hashtags: [], isSealed: true};
}

const SelectBox: React.FC<{checked: boolean; label: string; onChange: () => void}> = ({checked, label, onChange}) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-500'}`}
    >
        {checked && <FiCheck size={14} strokeWidth={3} />}
    </button>
);

// ─── 보관함 글 카드 (읽기 전용) ──────────────────────
const StagedCard: React.FC<{
    memo: Memo;
    local?: Memo;
    status: StagedStatus;
    selected: boolean;
    onToggle: () => void;
}> = ({memo, local, status, selected, onToggle}) => {
    const [open, setOpen] = useState(false);
    const [side, setSide] = useState<'staged' | 'local'>('staged');
    const shown = side === 'local' && local ? local : memo;
    const body = shown.isSealed ? (
        <p className="flex items-center gap-2 rounded-lg bg-gray-900/60 px-3 py-3 text-sm text-gray-400">
            <FiLock className="text-violet-300" /> 잠긴 글입니다. 위의 '비밀번호로 미리보기'로 열 수 있습니다.
        </p>
    ) : shown.kind === 'todo' ? (
        <TodoView content={shown.content} />
    ) : (
        <MarkdownView content={shown.content} />
    );

    return (
        <article className={`rounded-xl bg-gray-800 p-4 ${selected ? 'ring-2 ring-emerald-600' : 'ring-1 ring-gray-700/60'}`}>
            <div className="flex items-start gap-3">
                <SelectBox checked={selected} label={`${memo.title} 선택`} onChange={onToggle} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                        <span className="text-gray-500">{memo.kind === 'todo' ? '할일' : '메모'}</span>
                        {memo.category && <span className="max-w-full truncate text-gray-400">📁 {pathLabel(memo.category)}</span>}
                        {memo.isLocked && <span className="flex items-center gap-1 text-violet-300"><FiLock size={11} /> 잠금</span>}
                    </div>
                    <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="mt-1 flex w-full items-start gap-2 text-left">
                        <h3 className="min-w-0 flex-1 font-semibold leading-snug text-gray-50 [overflow-wrap:anywhere]">{memo.title}</h3>
                        <FiChevronDown className={`mt-1 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="mt-1 text-xs leading-relaxed text-gray-500">
                        가져온 글 수정 {formatDate(memo.updatedAt)}
                        {local && <> · 지금 글 수정 {formatDate(local.updatedAt)}</>}
                        {(memo.comments.length > 0 || memo.imageIds.length > 0) && <> · 댓글 {memo.comments.length} · 이미지 {memo.imageIds.length}</>}
                    </div>
                </div>
            </div>

            {open && (
                <div className="mt-3 border-t border-gray-700/60 pt-3">
                    {local && status !== 'same' && (
                        <div role="group" aria-label="비교" className="mb-3 inline-flex rounded-lg bg-gray-900 p-0.5 text-sm">
                            {(['staged', 'local'] as const).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setSide(v)}
                                    aria-pressed={side === v}
                                    className={`rounded-md px-3 py-1 ${side === v ? 'bg-gray-600 font-medium text-white' : 'text-gray-400'}`}
                                >
                                    {v === 'staged' ? '가져온 글' : '지금 글'}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* 지금 글은 지금 저장소의 이미지로 보여준다 */}
                    {side === 'local' ? <ImageSourceContext.Provider value={null}>{body}</ImageSourceContext.Provider> : body}
                    {!shown.isSealed && shown.comments.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            <div className="text-xs text-gray-500">댓글 {shown.comments.length}</div>
                            {[...shown.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(c => (
                                <div key={c.id} className="rounded-lg bg-gray-900/60 px-3 py-2 [&_p:last-child]:mb-0">
                                    <MarkdownView content={c.content} />
                                    <div className="text-xs text-gray-500">{formatDate(c.createdAt)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </article>
    );
};

// ─── 가져오기 확인 ───────────────────────────────────
const ImportDialog: React.FC<{
    batch: ImportBatch;
    items: {memo: Memo; status: StagedStatus}[];
    onClose: () => void;
    onDone: (r: ImportResult) => void;
}> = ({batch, items, onClose, onDone}) => {
    const conflicts = items.filter(i => isConflict(i.status));
    const [actions, setActions] = useState<Record<string, ConflictAction>>(() =>
        Object.fromEntries(conflicts.map(i => [i.memo.uid, i.memo.isLocked ? 'skip' : 'copy'])),
    );
    const [folderMode, setFolderMode] = useState<'keep' | 'prefix' | null>(null); // 가져올 때마다 고른다
    // 기본 폴더 이름: 묶음 이름에서 '(날짜 가져옴)' 부분은 빼고
    const [prefix, setPrefix] = useState(`가져옴/${cleanName(batch.name.replace(/\s*\([^)]*\)\s*$/, '')) || '백업'}`);
    const [busy, setBusy] = useState(false);

    const setAll = (a: ConflictAction) =>
        setActions(Object.fromEntries(conflicts.map(i => [i.memo.uid, a === 'copy' && i.memo.isLocked ? 'skip' : a])));

    const willSkip = conflicts.filter(i => actions[i.memo.uid] === 'skip').length;
    const count = items.length - willSkip;

    const submit = async () => {
        if (!folderMode || busy) return;
        setBusy(true);
        try {
            const r = await importFromBatch(batch.id, items.map(i => i.memo.uid), {
                actions,
                folderPrefix: folderMode === 'prefix' ? prefix.split('/').map(cleanName).filter(Boolean).join('/') || '가져옴' : null,
            });
            onDone(r);
        } catch {
            setBusy(false);
            alert('가져오지 못했습니다. 저장 공간을 확인하세요.');
        }
    };

    const options: {value: ConflictAction; label: string}[] = [
        {value: 'copy', label: '사본으로'},
        {value: 'overwrite', label: '덮어쓰기'},
        {value: 'skip', label: '건너뛰기'},
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-label="선택한 글 가져오기"
                onClick={e => e.stopPropagation()}
                className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-gray-900 text-gray-200 sm:max-w-lg sm:rounded-2xl"
            >
                <div className="flex items-center border-b border-gray-800 px-4 py-3">
                    <h2 className="flex-1 font-semibold text-gray-50">선택한 글 가져오기</h2>
                    <button onClick={onClose} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                        <FiX size={20} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                    <p className="text-sm text-gray-400">
                        새 글 {items.length - conflicts.length}개{conflicts.length > 0 && ` · 이미 있는 글 ${conflicts.length}개`}. 지금 있는 글은 '덮어쓰기'를 고른 글만 바뀝니다.
                    </p>

                    {conflicts.length > 0 && (
                        <section>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-medium text-gray-200">이미 있는 글</h3>
                                <div className="flex gap-1 text-xs">
                                    {options.map(o => (
                                        <button key={o.value} onClick={() => setAll(o.value)} className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-300 hover:bg-gray-700">
                                            모두 {o.label.replace('으로', '')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <ul className="space-y-2">
                                {conflicts.map(({memo, status}) => (
                                    <li key={memo.uid} className="rounded-lg bg-gray-800 p-2.5">
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="min-w-0 flex-1 truncate text-gray-100">{memo.title}</span>
                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                                        </div>
                                        <div role="group" aria-label={`${memo.title} 처리 방법`} className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-gray-900 p-0.5 text-sm">
                                            {options.map(o => {
                                                const disabled = o.value === 'copy' && !!memo.isLocked;
                                                return (
                                                    <button
                                                        key={o.value}
                                                        disabled={disabled}
                                                        title={disabled ? '잠근 글은 암호화되어 있어 사본을 만들 수 없습니다' : undefined}
                                                        onClick={() => setActions(a => ({...a, [memo.uid]: o.value}))}
                                                        aria-pressed={actions[memo.uid] === o.value}
                                                        className={`rounded-md py-1.5 disabled:opacity-30 ${
                                                            actions[memo.uid] === o.value ? 'bg-gray-600 font-medium text-white' : 'text-gray-400'
                                                        }`}
                                                    >
                                                        {o.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs leading-relaxed text-gray-500">
                                사본은 '(가져온 사본)'이 붙은 새 글로 들어가고, 함께 가져오는 글 사이의 링크는 사본을 가리키도록 맞춰집니다. 덮어쓴 글은 지금 있는 폴더에 그대로 둡니다. 건너뛴 글은 보관함에 남습니다.
                            </p>
                        </section>
                    )}

                    <section>
                        <h3 className="mb-2 text-sm font-medium text-gray-200">넣을 폴더</h3>
                        <div className="space-y-2">
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 ${folderMode === 'keep' ? 'bg-gray-700 ring-1 ring-emerald-500' : 'bg-gray-800'}`}>
                                <input type="radio" name="folder" checked={folderMode === 'keep'} onChange={() => setFolderMode('keep')} className="mt-1 accent-emerald-500" />
                                <span>
                                    <span className="block text-sm text-gray-100">원래 폴더 그대로</span>
                                    <span className="block text-xs text-gray-500">백업에 있던 폴더 경로로 들어갑니다</span>
                                </span>
                            </label>
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 ${folderMode === 'prefix' ? 'bg-gray-700 ring-1 ring-emerald-500' : 'bg-gray-800'}`}>
                                <input type="radio" name="folder" checked={folderMode === 'prefix'} onChange={() => setFolderMode('prefix')} className="mt-1 accent-emerald-500" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-gray-100">새 폴더 아래로 모으기</span>
                                    <input
                                        value={prefix}
                                        onChange={e => setPrefix(e.target.value)}
                                        onFocus={() => setFolderMode('prefix')}
                                        aria-label="모을 폴더"
                                        className="mt-1.5 w-full rounded-md bg-gray-900 px-2.5 py-1.5 text-base text-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
                                    />
                                    <span className="mt-1 block text-xs text-gray-500">예: 업무/회의 → {pathLabel(`${prefix}/업무/회의`)}</span>
                                </span>
                            </label>
                        </div>
                    </section>
                </div>

                <div className="flex items-center gap-2 border-t border-gray-800 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <span className="min-w-0 flex-1 text-xs text-gray-500">{!folderMode ? '넣을 폴더를 고르세요' : willSkip ? `${willSkip}개는 건너뜁니다` : ''}</span>
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-gray-400 hover:bg-gray-800">취소</button>
                    <button
                        onClick={submit}
                        disabled={!folderMode || busy || count === 0}
                        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-40"
                    >
                        {busy ? '가져오는 중…' : `${count}개 가져오기`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── 백업의 잠근 글 미리보기 ──────────────────────────
const PasswordPrompt: React.FC<{batch: ImportBatch; onClose: () => void; onOpened: () => void}> = ({batch, onClose, onOpened}) => {
    const [pw, setPw] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        const opened = await tryOpen(pw, batch.vaults);
        setBusy(false);
        if (!opened.length) return setError('비밀번호가 맞지 않습니다');
        addKeys(opened);
        onOpened();
    };
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
            <form role="dialog" aria-label="잠긴 글 미리보기" onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full rounded-t-2xl bg-gray-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl">
                <h2 className="text-lg font-semibold text-gray-50">잠긴 글 미리보기</h2>
                <p className="mt-1 text-sm text-gray-400">이 백업을 만든 기기에서 쓰던 비밀번호를 입력하세요.</p>
                <input autoFocus type="password" value={pw} onChange={e => setPw(e.target.value)} aria-label="비밀번호" className="mt-4 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-violet-500" />
                {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-gray-400 hover:bg-gray-800">취소</button>
                    <button type="submit" disabled={busy || !pw} className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-40">{busy ? '확인 중…' : '열기'}</button>
                </div>
            </form>
        </div>
    );
};

// ─── 화면 ────────────────────────────────────────────
const ImportsPage: React.FC = () => {
    const [settings] = useSettings();
    const [params, setParams] = useSearchParams();
    const [batches, setBatches] = useState<ImportBatch[] | null>(null);
    const [raw, setRaw] = useState<Memo[]>([]);
    const [staged, setStaged] = useState<Memo[]>([]);
    const [localRaw, setLocalRaw] = useState<Map<string, Memo>>(new Map());
    const [localView, setLocalView] = useState<Map<string, Memo>>(new Map());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<'all' | 'memo' | 'todo'>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [folder, setFolder] = useState('');
    const [page, setPage] = useState(0);
    const [dialog, setDialog] = useState<'import' | 'rename' | 'password' | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const unlocked = useVaultState();

    const batchId = params.get('batch') ?? batches?.[0]?.id ?? null;
    const batch = batches?.find(b => b.id === batchId) ?? null;

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(t => (t === msg ? null : t)), 3000);
    };

    const loadBatches = useCallback(async () => setBatches(await listBatches()), []);

    const loadBatch = useCallback(async () => {
        if (!batchId) {
            setRaw([]);
            return;
        }
        const [memos, local, view] = await Promise.all([getBatchMemos(batchId), localByUid(), getAllMemos()]);
        setRaw(memos);
        setLocalRaw(local);
        setLocalView(new Map(view.map(m => [m.uid, m])));
    }, [batchId]);

    useEffect(() => {
        loadBatches();
    }, [loadBatches]);
    useEffect(() => {
        loadBatch();
        setSelected(new Set());
        setFolder('');
        setStatusFilter('all');
        setPage(0);
    }, [loadBatch]);
    // 잠금을 풀면(백업 비밀번호 포함) 잠긴 글을 다시 풀어 본다
    useEffect(() => {
        Promise.all(raw.map(decodeStaged)).then(setStaged);
    }, [raw, unlocked]);

    const status = useMemo(() => new Map(raw.map(m => [m.uid, compareStatus(m, localRaw.get(m.uid))])), [raw, localRaw]);
    const counts = useMemo(() => {
        const c: Record<StagedStatus, number> = {new: 0, newer: 0, older: 0, differs: 0, same: 0};
        status.forEach(s => c[s]++);
        return c;
    }, [status]);

    const folders = useMemo(() => {
        const paths = collectFolders([], staged.map(m => m.category));
        return paths.map(p => ({path: p, n: staged.filter(m => isInside(m.category, p)).length}));
    }, [staged]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return staged
            .filter(m => kind === 'all' || m.kind === kind)
            .filter(m => !folder || isInside(m.category, folder))
            .filter(m => {
                const s = status.get(m.uid) as StagedStatus;
                return statusFilter === 'all' || (statusFilter === 'conflict' ? s === 'newer' || s === 'older' || s === 'differs' : s === statusFilter);
            })
            .filter(m => !q || [m.title, m.content, m.category, ...m.hashtags, ...m.comments.map(c => c.content)].join('\n').toLowerCase().includes(q))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [staged, kind, folder, statusFilter, query, status]);

    useEffect(() => setPage(0), [query, kind, folder, statusFilter]);

    const pageSize = settings.pageSize;
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    const current = Math.min(page, pageCount - 1);
    const pageItems = visible.slice(current * pageSize, (current + 1) * pageSize);
    const allVisibleSelected = visible.length > 0 && visible.every(m => selected.has(m.uid));
    const sealedCount = staged.filter(m => m.isSealed).length;

    // 보관함 미리보기의 이미지·링크는 이 묶음 안에서 찾는다
    const imageSource = useMemo<ImageSource | null>(
        () => (batchId ? {key: batchId, load: async id => {
            const img = await getStagedImage(batchId, id);
            return img ? imageBlob(img) : null;
        }} : null),
        [batchId],
    );
    const linkApi = useMemo<MemoLinkApi>(
        () => ({all: staged, byUid: new Map(staged.map(m => [m.uid, m])), open: () => undefined, showLinkButton: false, interactive: false}),
        [staged],
    );

    const toggle = (uid: string) =>
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });

    const selectBatch = (id: string | null) => setParams(id ? {batch: id} : {});

    const addBackup = async (file: File | undefined) => {
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        try {
            const b = await stageBackup(await readBackup(file), file.name);
            await loadBatches();
            selectBatch(b.id);
            showToast(`글 ${b.memoCount}개를 보관함에 넣었습니다. 지금 있는 글은 그대로입니다`);
        } catch (e) {
            showToast(e instanceof Error ? e.message : '파일을 읽지 못했습니다');
        }
    };

    const afterChange = async (emptied: boolean, msg: string) => {
        setSelected(new Set());
        await loadBatches();
        if (emptied) {
            selectBatch(null);
            showToast(`${msg} 이 묶음의 글을 모두 정리해서 묶음을 지웠습니다`);
        } else {
            await loadBatch();
            showToast(msg);
        }
    };

    const onImported = (r: ImportResult) => {
        setDialog(null);
        const parts = [r.added && `새 글 ${r.added}`, r.copied && `사본 ${r.copied}`, r.overwritten && `덮어쓰기 ${r.overwritten}`].filter(Boolean);
        afterChange(r.batchEmptied, `${parts.join(' · ')}개를 가져왔습니다.${r.skipped ? ` 건너뛴 ${r.skipped}개는 보관함에 남았습니다.` : ''}`);
    };

    const dismissSelected = async () => {
        if (!batch || !selected.size) return;
        if (!window.confirm(`선택한 ${selected.size}개를 가져오지 않고 보관함에서 뺄까요?`)) return;
        afterChange(await removeFromBatch(batch.id, [...selected]), `${selected.size}개를 보관함에서 뺐습니다.`);
    };

    const dismissSame = async () => {
        if (!batch) return;
        const same = raw.filter(m => status.get(m.uid) === 'same').map(m => m.uid);
        if (!window.confirm(`지금 있는 글과 내용이 같은 ${same.length}개를 보관함에서 뺄까요?`)) return;
        afterChange(await removeFromBatch(batch.id, same), `같은 글 ${same.length}개를 정리했습니다.`);
    };

    const removeBatch = async () => {
        if (!batch || !window.confirm(`'${batch.name}' 묶음을 지울까요?\n보관함의 글 ${batch.memoCount}개가 사라집니다. 지금 있는 글에는 영향이 없습니다.`)) return;
        await deleteBatch(batch.id);
        await loadBatches();
        selectBatch(null);
        showToast('묶음을 지웠습니다');
    };

    const statusChips: {value: StatusFilter; label: string; n: number}[] = [
        {value: 'all', label: '전체', n: raw.length},
        {value: 'new', label: '새 글', n: counts.new},
        {value: 'conflict', label: '내용이 다른 같은 글', n: counts.newer + counts.older + counts.differs},
        {value: 'same', label: '이미 있음', n: counts.same},
    ];

    return (
        <div className="min-h-[100dvh] overflow-x-clip bg-gray-900 text-gray-200">
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto max-w-3xl space-y-2 px-4 py-2 lg:max-w-5xl lg:px-6">
                    <div className="flex items-center gap-2">
                        <Link to="/memo" aria-label="메모로 돌아가기" className="-ml-2 rounded-full p-2 hover:bg-gray-800">
                            <FiArrowLeft size={20} />
                        </Link>
                        <h1 className="flex-1 text-lg font-semibold text-gray-50">가져온 글 보관함</h1>
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700">
                            <FiUpload /> 백업 추가
                        </button>
                    </div>
                    {batches && batches.length > 0 && (
                        <div role="tablist" aria-label="가져온 묶음" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:-mx-6 lg:px-6 [&::-webkit-scrollbar]:hidden">
                            {batches.map(b => (
                                <button
                                    key={b.id}
                                    role="tab"
                                    aria-selected={b.id === batchId}
                                    onClick={() => selectBatch(b.id)}
                                    className={`flex max-w-[70vw] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                                        b.id === batchId ? 'bg-gray-100 font-medium text-gray-900' : 'bg-gray-800 text-gray-300'
                                    }`}
                                >
                                    <span className="truncate">{b.name}</span>
                                    <span className={b.id === batchId ? 'text-gray-500' : 'text-gray-500'}>{b.memoCount}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4 pb-32 pt-4 lg:max-w-5xl lg:px-6">
                {batches === null ? (
                    <p className="py-10 text-center text-gray-500">불러오는 중…</p>
                ) : !batch ? (
                    <div className="mx-auto max-w-md py-12 text-center">
                        <FiInbox size={36} className="mx-auto text-gray-600" />
                        <p className="mt-4 text-gray-300">보관함이 비어 있습니다.</p>
                        <p className="mt-2 text-sm leading-relaxed text-gray-500">
                            백업 파일을 보관함에 넣으면 지금 있는 글과 섞이지 않게 따로 보관됩니다. 내용을 확인한 뒤 필요한 글만 골라서 가져오세요.
                        </p>
                        <button onClick={() => fileRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white">
                            <FiUpload /> 백업 파일 선택
                        </button>
                    </div>
                ) : (
                    <MemoLinkContext.Provider value={linkApi}>
                    <ImageSourceContext.Provider value={imageSource}>
                        {/* 묶음 정보 */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h2 className="min-w-0 truncate font-semibold text-gray-50">{batch.name}</h2>
                            <button onClick={() => setDialog('rename')} aria-label="묶음 이름 바꾸기" className="rounded p-1 text-gray-500 hover:text-gray-200">
                                <FiEdit2 size={15} />
                            </button>
                            <span className="text-xs text-gray-500">{formatDate(batch.importedAt)}에 넣음 · {batch.fileName}</span>
                            <span className="flex-1" />
                            <button onClick={removeBatch} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-800 hover:text-red-300">
                                <FiTrash2 size={14} /> 묶음 지우기
                            </button>
                        </div>

                        {/* 상태 필터 */}
                        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                            {statusChips.map(c => (
                                <button
                                    key={c.value}
                                    onClick={() => setStatusFilter(c.value)}
                                    aria-pressed={statusFilter === c.value}
                                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${statusFilter === c.value ? 'bg-gray-100 font-medium text-gray-900' : 'bg-gray-800 text-gray-300'}`}
                                >
                                    {c.label} {c.n}
                                </button>
                            ))}
                        </div>

                        {/* 검색 · 종류 · 폴더 */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg bg-gray-800 px-3">
                                <FiSearch className="shrink-0 text-gray-500" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="보관함에서 검색"
                                    className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-500"
                                />
                            </label>
                            <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="종류" className="rounded-lg bg-gray-800 px-2 py-2 text-sm outline-none">
                                <option value="all">메모 + 할일</option>
                                <option value="memo">메모</option>
                                <option value="todo">할일</option>
                            </select>
                            <select value={folder} onChange={e => setFolder(e.target.value)} aria-label="폴더" className="max-w-[50vw] rounded-lg bg-gray-800 px-2 py-2 text-sm outline-none lg:max-w-xs">
                                <option value="">모든 폴더</option>
                                {folders.map(f => (
                                    <option key={f.path} value={f.path}>
                                        {'  '.repeat(f.path.split('/').length - 1)}
                                        {f.path.split('/').pop()} ({f.n})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 도움 동작 */}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                            <button
                                onClick={() => setSelected(prev => {
                                    const next = new Set(prev);
                                    visible.forEach(m => (allVisibleSelected ? next.delete(m.uid) : next.add(m.uid)));
                                    return next;
                                })}
                                disabled={!visible.length}
                                className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-gray-200 disabled:opacity-40"
                            >
                                <FiCheckSquare /> {allVisibleSelected ? '선택 해제' : `보이는 ${visible.length}개 모두 선택`}
                            </button>
                            {counts.same > 0 && (
                                <button onClick={dismissSame} className="rounded-lg px-3 py-1.5 text-gray-400 hover:bg-gray-800">
                                    이미 있는 같은 글 {counts.same}개 정리
                                </button>
                            )}
                            {sealedCount > 0 && batch.vaults.length > 0 && (
                                <button onClick={() => setDialog('password')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-violet-300 hover:bg-gray-800">
                                    <FiLock /> 잠긴 글 {sealedCount}개 비밀번호로 미리보기
                                </button>
                            )}
                        </div>

                        {/* 목록 */}
                        <div className="mt-4 grid grid-cols-1 gap-3">
                            {pageItems.map(m => (
                                <StagedCard
                                    key={m.uid}
                                    memo={m}
                                    local={localView.get(m.uid)}
                                    status={status.get(m.uid) as StagedStatus}
                                    selected={selected.has(m.uid)}
                                    onToggle={() => toggle(m.uid)}
                                />
                            ))}
                            {!visible.length && <p className="py-12 text-center text-sm text-gray-500">조건에 맞는 글이 없습니다.</p>}
                        </div>
                        {pageCount > 1 && (
                            <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                                <span className="text-xs text-gray-500">{current * pageSize + 1}–{Math.min(visible.length, (current + 1) * pageSize)} / {visible.length}</span>
                                <Pager label="보관함 페이지" page={current} count={pageCount} edges onPage={p => { setPage(p); window.scrollTo({top: 0}); }} />
                            </div>
                        )}
                    </ImageSourceContext.Provider>
                    </MemoLinkContext.Provider>
                )}
            </main>

            {/* 선택 막대 */}
            {batch && selected.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-700 bg-gray-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
                    <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 text-sm lg:max-w-5xl lg:px-6">
                        <span className="shrink-0 font-medium text-gray-100">{selected.size}개 선택</span>
                        <span className="flex-1" />
                        <button onClick={dismissSelected} className="shrink-0 rounded-lg bg-gray-800 px-3 py-1.5 text-gray-300">보관함에서 빼기</button>
                        <button onClick={() => setDialog('import')} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white">
                            <FiDownload /> 가져오기
                        </button>
                    </div>
                </div>
            )}

            {dialog === 'import' && batch && (
                <ImportDialog
                    batch={batch}
                    items={raw.filter(m => selected.has(m.uid)).map(m => ({memo: staged.find(s => s.uid === m.uid) ?? m, status: status.get(m.uid) as StagedStatus}))}
                    onClose={() => setDialog(null)}
                    onDone={onImported}
                />
            )}
            {dialog === 'rename' && batch && (
                <NameDialog
                    title="묶음 이름 바꾸기"
                    initial={batch.name}
                    confirmLabel="바꾸기"
                    onClose={() => setDialog(null)}
                    onConfirm={async name => {
                        setDialog(null);
                        await renameBatch(batch.id, name);
                        loadBatches();
                    }}
                />
            )}
            {dialog === 'password' && batch && (
                <PasswordPrompt batch={batch} onClose={() => setDialog(null)} onOpened={() => setDialog(null)} />
            )}

            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => addBackup(e.target.files?.[0])} />

            {toast && (
                <div role="status" className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] mx-auto w-fit max-w-[90%] rounded-2xl bg-gray-100 px-4 py-2 text-center text-sm text-gray-900 shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    );
};

export default ImportsPage;
