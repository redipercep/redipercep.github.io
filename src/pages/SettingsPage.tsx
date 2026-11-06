import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiArrowLeft, FiDownload, FiFolderPlus, FiShield, FiUpload} from 'react-icons/fi';
import {useFolderActions} from '../components/FolderActions';
import FolderTree, {useExpanded} from '../components/FolderTree';
import {type FolderMap, getAllImages, getAllMemos, getFolderMap, importData} from '../db/memoDB';
import type {Memo, MemoImage, MemoKind, SortDir, SortKey} from '../types/memo';
import {exportBackup, readBackup} from '../utils/backup';
import {buildTree, collectFolders, countByFolder} from '../utils/folders';
import {clearImageUrlCache} from '../utils/image';
import {
    COMMENT_PAGE_SIZES, IMAGE_PAGE_SIZES, type ListView, PAGE_SIZES, type Settings, SORT_LABELS, useSettings,
} from '../utils/settings';

const KINDS: {kind: MemoKind; label: string}[] = [
    {kind: 'memo', label: '메모'},
    {kind: 'todo', label: '할일'},
];

/** 버튼 여러 개 중 하나 고르기 */
function Segmented<T extends string | number>({value, options, onChange, label}: {
    value: T;
    options: {value: T; label: string}[];
    onChange: (v: T) => void;
    label: string;
}) {
    return (
        <div role="group" aria-label={label} className="flex shrink-0 rounded-lg bg-gray-800 p-0.5 text-sm">
            {options.map(o => (
                <button
                    key={String(o.value)}
                    onClick={() => onChange(o.value)}
                    aria-pressed={value === o.value}
                    className={`rounded-md px-3 py-1.5 ${value === o.value ? 'bg-gray-600 font-medium text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

const Section: React.FC<{title: string; description?: string; children: React.ReactNode}> = ({title, description, children}) => (
    <section className="rounded-xl bg-gray-800/60 p-4 ring-1 ring-gray-700/60 lg:p-5">
        <h2 className="font-semibold text-gray-50">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-400">{description}</p>}
        <div className="mt-4 space-y-4">{children}</div>
    </section>
);

const Row: React.FC<{label: string; hint?: string; children: React.ReactNode}> = ({label, hint, children}) => (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
            <div className="text-sm text-gray-200">{label}</div>
            {hint && <div className="text-xs text-gray-500">{hint}</div>}
        </div>
        {children}
    </div>
);

const formatBytes = (n: number) =>
    n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${(n / 1024 ** 3).toFixed(2)}GB`;

const SettingsPage: React.FC = () => {
    const [settings, update] = useSettings();
    const [memos, setMemos] = useState<Memo[]>([]);
    const [imageCount, setImageCount] = useState(0);
    const [folderMap, setFolderMap] = useState<FolderMap>({memo: [], todo: []});
    const [folderKind, setFolderKind] = useState<MemoKind>('memo');
    const [storage, setStorage] = useState<{usage: number; quota: number; persisted: boolean} | null>(null);
    const [pendingImport, setPendingImport] = useState<{memos: Memo[]; images: MemoImage[]; folders: Partial<FolderMap>} | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
    };

    const loadStorage = async () => {
        if (!navigator.storage?.estimate) return;
        const [est, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? Promise.resolve(false)]);
        setStorage({usage: est.usage ?? 0, quota: est.quota ?? 0, persisted});
    };

    const reload = useCallback(async () => {
        const [list, folders, images] = await Promise.all([getAllMemos(), getFolderMap(), getAllImages()]);
        setMemos(list);
        setFolderMap(folders);
        setImageCount(images.length);
        loadStorage();
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update(s => ({...s, [key]: value}));

    // ─── 폴더 관리 ──────────────────────────────────
    const kindMemos = useMemo(() => memos.filter(m => m.kind === folderKind), [memos, folderKind]);
    const folderPaths = useMemo(() => collectFolders(folderMap[folderKind], kindMemos.map(m => m.category)), [folderMap, folderKind, kindMemos]);
    const tree = useMemo(() => buildTree(folderPaths, countByFolder(kindMemos.map(m => m.category))), [folderPaths, kindMemos]);
    const folderActions = useFolderActions(folderKind, folderPaths, reload, showToast);
    const expanded = useExpanded('memo.folderOpen');

    // ─── 백업 ───────────────────────────────────────
    const handleExport = async () => {
        try {
            const {memoCount, imageCount: n} = await exportBackup();
            showToast(`글 ${memoCount}개, 이미지 ${n}개를 내보냈습니다`);
        } catch {
            showToast('내보내기에 실패했습니다');
        }
    };

    const handleImportFile = async (file: File | undefined) => {
        if (importRef.current) importRef.current.value = '';
        if (!file) return;
        try {
            setPendingImport(await readBackup(file));
        } catch (e) {
            showToast(e instanceof Error ? e.message : '파일을 읽지 못했습니다');
        }
    };

    const runImport = async (mode: 'merge' | 'replace') => {
        if (!pendingImport) return;
        if (mode === 'replace' && !window.confirm('이 기기의 글과 이미지를 모두 지우고 백업으로 교체합니다. 계속할까요?')) return;
        try {
            await importData(pendingImport.memos, pendingImport.images, mode, pendingImport.folders);
            clearImageUrlCache();
            await reload();
            showToast(`글 ${pendingImport.memos.length}개를 가져왔습니다`);
        } catch {
            showToast('가져오기에 실패했습니다. 저장 공간을 확인하세요');
        }
        setPendingImport(null);
    };

    const requestPersist = async () => {
        const ok = await navigator.storage?.persist?.();
        await loadStorage();
        showToast(ok ? '이 기기에서 데이터를 보호하도록 설정했습니다' : '브라우저가 요청을 거절했습니다. 홈 화면에 추가하면 허용되는 경우가 많습니다');
    };

    const memoCount = memos.filter(m => m.kind === 'memo').length;
    const todoCount = memos.length - memoCount;

    return (
        <div className="min-h-[100dvh] bg-gray-900 text-gray-200">
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 lg:px-6">
                    <Link to="/memo" aria-label="메모로 돌아가기" className="-ml-2 rounded-full p-2 hover:bg-gray-800">
                        <FiArrowLeft size={20} />
                    </Link>
                    <h1 className="text-lg font-semibold text-gray-50">설정</h1>
                </div>
            </header>

            <main className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 pt-4 lg:grid-cols-2 lg:items-start lg:px-6">
                <div className="space-y-4">
                    <Section title="목록 보기" description="간략히는 제목만 보이고, 누르면 펼쳐집니다. 목록 위 정렬 옆의 보기 버튼으로도 바로 바꿀 수 있습니다.">
                        {KINDS.map(({kind, label}) => (
                            <Row key={kind} label={label}>
                                <Segmented<ListView>
                                    label={`${label} 목록 보기`}
                                    value={settings.listView[kind]}
                                    options={[{value: 'compact', label: '간략히'}, {value: 'full', label: '기본'}]}
                                    onChange={v => update(s => ({...s, listView: {...s.listView, [kind]: v}}))}
                                />
                            </Row>
                        ))}
                        <Row label="PC 넓은 화면의 카드 배치" hint="기본 보기일 때 적용">
                            <Segmented<1 | 2>
                                label="카드 열 수"
                                value={settings.pcColumns}
                                options={[{value: 1, label: '1열'}, {value: 2, label: '2열'}]}
                                onChange={v => set('pcColumns', v)}
                            />
                        </Row>
                    </Section>

                    <Section title="정렬">
                        {KINDS.map(({kind, label}) => (
                            <Row key={kind} label={label}>
                                <div className="flex gap-2">
                                    <select
                                        value={settings.sort[kind].key}
                                        onChange={e => update(s => ({...s, sort: {...s.sort, [kind]: {...s.sort[kind], key: e.target.value as SortKey}}}))}
                                        aria-label={`${label} 정렬 기준`}
                                        className="rounded-lg bg-gray-800 px-2 py-1.5 text-sm text-gray-200 outline-none"
                                    >
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                                            <option key={k} value={k}>{SORT_LABELS[k]}순</option>
                                        ))}
                                    </select>
                                    <Segmented<SortDir>
                                        label={`${label} 정렬 방향`}
                                        value={settings.sort[kind].dir}
                                        options={[{value: 'desc', label: '최신 순'}, {value: 'asc', label: '오래된 순'}]}
                                        onChange={v => update(s => ({...s, sort: {...s.sort, [kind]: {...s.sort[kind], dir: v}}}))}
                                    />
                                </div>
                            </Row>
                        ))}
                    </Section>

                    <Section title="페이지">
                        <Row label="한 페이지에 보일 글" hint="메모 · 할일">
                            <Segmented<number> label="한 페이지 글 수" value={settings.pageSize} options={PAGE_SIZES.map(n => ({value: n, label: `${n}`}))} onChange={v => set('pageSize', v)} />
                        </Row>
                        <Row label="한 페이지에 보일 이미지">
                            <Segmented<number> label="한 페이지 이미지 수" value={settings.imagePageSize} options={IMAGE_PAGE_SIZES.map(n => ({value: n, label: `${n}`}))} onChange={v => set('imagePageSize', v)} />
                        </Row>
                        <Row label="처음 보일 댓글 수" hint="더보기를 누르면 페이지로 넘겨 봅니다">
                            <Segmented<number> label="댓글 수" value={settings.commentPageSize} options={COMMENT_PAGE_SIZES.map(n => ({value: n, label: `${n}`}))} onChange={v => set('commentPageSize', v)} />
                        </Row>
                    </Section>
                </div>

                <div className="space-y-4">
                    <Section title="폴더 관리" description="⋯ 메뉴로 하위 폴더 만들기, 이름 바꾸기, 이동, 삭제를 할 수 있습니다. 폴더를 지우면 안의 글은 한 단계 위로 옮겨집니다.">
                        <div className="flex items-center justify-between gap-2">
                            <Segmented<MemoKind> label="폴더 종류" value={folderKind} options={KINDS.map(k => ({value: k.kind, label: k.label}))} onChange={setFolderKind} />
                            <button onClick={() => folderActions.createIn('')} className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600">
                                <FiFolderPlus /> 새 폴더
                            </button>
                        </div>
                        {tree.length ? (
                            <div className="max-h-96 overflow-y-auto rounded-lg bg-gray-900/60 p-1.5">
                                <FolderTree nodes={tree} open={expanded.open} onToggle={expanded.toggle} menu={folderActions.menuFor} />
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">아직 폴더가 없습니다.</p>
                        )}
                    </Section>

                    <Section title="백업" description="다른 기기로 옮길 때 사용합니다. 글, 댓글, 이미지, 폴더가 한 파일에 담깁니다.">
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={handleExport} className="flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-3 py-2.5 text-sm hover:bg-gray-600">
                                <FiDownload /> 내보내기
                            </button>
                            <button onClick={() => importRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-3 py-2.5 text-sm hover:bg-gray-600">
                                <FiUpload /> 가져오기
                            </button>
                        </div>
                    </Section>

                    <Section title="저장 공간">
                        <Row label="저장된 데이터" hint={`메모 ${memoCount} · 할일 ${todoCount} · 이미지 ${imageCount}`}>
                            {storage && <span className="text-sm text-gray-400">{formatBytes(storage.usage)} 사용</span>}
                        </Row>
                        {storage && (
                            <Row
                                label="데이터 보호"
                                hint={storage.persisted
                                    ? '브라우저가 공간이 부족해도 이 데이터를 지우지 않습니다'
                                    : '보호하지 않으면 저장 공간이 부족할 때 브라우저가 데이터를 지울 수 있습니다'}
                            >
                                {storage.persisted ? (
                                    <span className="flex items-center gap-1 text-sm text-emerald-400"><FiShield /> 보호 중</span>
                                ) : (
                                    <button onClick={requestPersist} className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600">
                                        <FiShield /> 보호 요청
                                    </button>
                                )}
                            </Row>
                        )}
                    </Section>
                </div>
            </main>

            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => handleImportFile(e.target.files?.[0])} />
            {folderActions.dialogs}

            {pendingImport && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setPendingImport(null)}>
                    <div
                        role="dialog"
                        aria-label="백업 가져오기"
                        onClick={e => e.stopPropagation()}
                        className="w-full rounded-t-2xl bg-gray-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl"
                    >
                        <h2 className="text-lg font-semibold text-gray-50">백업 가져오기</h2>
                        <p className="mt-1 text-sm text-gray-400">
                            글 {pendingImport.memos.length}개, 이미지 {pendingImport.images.length}개가 들어 있습니다.
                        </p>
                        <div className="mt-4 space-y-2">
                            <button onClick={() => runImport('merge')} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-left text-white">
                                <div className="font-semibold">합치기</div>
                                <div className="text-sm text-emerald-100">기존 글은 유지하고, 같은 글은 최근 수정본으로 맞춥니다</div>
                            </button>
                            <button onClick={() => runImport('replace')} className="w-full rounded-xl bg-gray-800 px-4 py-3 text-left">
                                <div className="font-semibold text-red-300">모두 교체</div>
                                <div className="text-sm text-gray-400">이 기기의 데이터를 지우고 백업 내용으로 바꿉니다</div>
                            </button>
                            <button onClick={() => setPendingImport(null)} className="w-full py-2 text-gray-400">취소</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div role="status" className="fixed inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] z-[70] mx-auto w-fit max-w-[90%] rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-900 shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
