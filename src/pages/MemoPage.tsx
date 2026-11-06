import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {
    FiArrowDown, FiArrowUp, FiCheckSquare, FiChevronDown, FiCornerLeftUp, FiFolder, FiFolderPlus, FiGrid, FiInbox,
    FiList, FiPlus, FiSearch, FiSettings, FiStar, FiTrash2, FiX,
} from 'react-icons/fi';
import {useFolderActions} from '../components/FolderActions';
import FolderPicker from '../components/FolderPicker';
import FolderTree, {dropHandlers, type FolderDnd, MIME_MEMOS, useExpanded} from '../components/FolderTree';
import ImageGallery from '../components/ImageGallery';
import MemoCard from '../components/MemoCard';
import MemoEditor from '../components/MemoEditor';
import MemoPicker from '../components/MemoPicker';
import Pager from '../components/Pager';
import {type LinkTarget, type TaskLinkApi, TaskLinkContext} from '../components/TaskLinkContext';
import {
    deleteImages, deleteMemoWithImages, type FolderMap, getAllMemos, getFolderMap, moveMemosTo, saveMemo,
} from '../db/memoDB';
import type {Memo, MemoKind, SortKey} from '../types/memo';
import {
    buildTree, collectFolders, countByFolder, folderName, type FolderNode, isInside, joinPath, movePath, parentPath, pathLabel,
} from '../utils/folders';
import {copyText, newId} from '../utils/format';
import {releaseImageUrls} from '../utils/image';
import {DAILY, isDaily, presetsFor} from '../utils/presets';
import {SORT_LABELS, useSettings} from '../utils/settings';
import {addTaskLink, localDate, parseTodo, todayStr, toReportText} from '../utils/todo';

type Tab = 'memos' | 'todos' | 'images';
type EditorState = {memo: Memo | null; kind: MemoKind; preset?: string; folder?: string; linkTo?: LinkTarget} | null;

const TABS: {id: Tab; label: string}[] = [
    {id: 'memos', label: '메모'},
    {id: 'todos', label: '할일'},
    {id: 'images', label: '이미지'},
];
const tabKind = (tab: Tab): MemoKind => (tab === 'todos' ? 'todo' : 'memo');
const TAB_KEY = 'memo.tab';

/** 공백으로 나눈 모든 단어가 포함되어야 일치. #으로 시작하면 해시태그만 검색 */
function matches(memo: Memo, query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [memo.title, memo.content, memo.category, ...memo.comments.map(c => c.content)].join('\n').toLowerCase();
    const tags = memo.hashtags.map(t => t.toLowerCase());
    return terms.every(term =>
        term.startsWith('#')
            ? tags.some(t => t.startsWith(term.slice(1)))
            : haystack.includes(term) || tags.some(t => t.includes(term)),
    );
}

/** 폴더 필터: null = 전체, '' = 폴더 없음, 그 외 = 해당 폴더와 하위 폴더 */
const inFolder = (memo: Memo, folder: string | null) =>
    folder === null || (folder === '' ? !memo.category : isInside(memo.category, folder));

const findNode = (nodes: FolderNode[], path: string): FolderNode | undefined => {
    for (const n of nodes) {
        if (n.path === path) return n;
        if (isInside(path, n.path)) return findNode(n.children, path);
    }
    return undefined;
};

const MemoPage: React.FC = () => {
    const [settings, updateSettings] = useSettings();
    const [memos, setMemos] = useState<Memo[]>([]);
    const [folderMap, setFolderMap] = useState<FolderMap>({memo: [], todo: []});
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>(() => {
        try {
            return (sessionStorage.getItem(TAB_KEY) as Tab) || 'memos';
        } catch {
            return 'memos';
        }
    });
    const [editor, setEditor] = useState<EditorState>(null);
    const [fabOpen, setFabOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const [query, setQuery] = useState('');
    const [folder, setFolder] = useState<string | null>(null);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [page, setPage] = useState(0);

    const [selecting, setSelecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [moveTarget, setMoveTarget] = useState<{ids: number[]; current: string} | null>(null);

    const [focusId, setFocusId] = useState<number | null>(null);
    const [galleryKey, setGalleryKey] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [popupUids, setPopupUids] = useState<string[] | null>(null); // 할일에서 연 메모 팝업
    const [picker, setPicker] = useState<LinkTarget | null>(null);

    const headerRef = useRef<HTMLElement>(null);
    const [headerH, setHeaderH] = useState(0);

    const kind = tabKind(tab);
    const {key: sortKey, dir: sortDir} = settings.sort[kind];
    const listView = settings.listView[kind];
    const compact = listView === 'compact';
    const pageSize = settings.pageSize;

    const reload = useCallback(async () => {
        const [list, folders] = await Promise.all([getAllMemos(), getFolderMap()]);
        setMemos(list);
        setFolderMap(folders);
        setGalleryKey(k => k + 1);
        setLoading(false);
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    // PC 사이드바가 헤더 아래에 붙도록 헤더 높이를 잰다
    useLayoutEffect(() => {
        const el = headerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
    };

    // ─── 파생 데이터 ────────────────────────────────
    // 메모/할일 탭은 해당 종류만, 이미지 탭은 전체
    const scoped = useMemo(() => (tab === 'images' ? memos : memos.filter(m => m.kind === kind)), [memos, tab, kind]);

    const folderPaths = useMemo(
        () => collectFolders(tab === 'images' ? [...folderMap.memo, ...folderMap.todo] : folderMap[kind], scoped.map(m => m.category)),
        [folderMap, tab, kind, scoped],
    );
    const tree = useMemo(() => buildTree(folderPaths, countByFolder(scoped.map(m => m.category))), [folderPaths, scoped]);
    const unfiledCount = useMemo(() => scoped.filter(m => !m.category).length, [scoped]);
    const currentNode = folder ? findNode(tree, folder) : undefined;

    const foldersFor = (k: MemoKind) => collectFolders(folderMap[k], memos.filter(m => m.kind === k).map(m => m.category));
    const frequentFoldersFor = (k: MemoKind) =>
        [...countByFolder(memos.filter(m => m.kind === k).map(m => m.category)).entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 6);

    const latestDaily = useMemo(
        () =>
            memos
                .filter(m => m.kind === 'todo' && isDaily(m.category))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
        [memos],
    );

    const allTags = useMemo(() => {
        const count = new Map<string, number>();
        memos.forEach(m => m.hashtags.forEach(t => count.set(t, (count.get(t) ?? 0) + 1)));
        return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    }, [memos]);

    const scopedTags = useMemo(() => {
        const count = new Map<string, number>();
        scoped.forEach(m => m.hashtags.forEach(t => count.set(t, (count.get(t) ?? 0) + 1)));
        return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    }, [scoped]);

    const visible = useMemo(() => {
        const list = scoped.filter(
            m =>
                inFolder(m, folder) &&
                (!favoritesOnly || m.isFavorite) &&
                (!activeTag || m.hashtags.includes(activeTag)) &&
                (!query.trim() || matches(m, query)),
        );
        return list.sort((a, b) => {
            const cmp = sortKey === 'title' ? a.title.localeCompare(b.title, 'ko', {numeric: true}) : a[sortKey].localeCompare(b[sortKey]);
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [scoped, folder, favoritesOnly, activeTag, query, sortKey, sortDir]);

    const hasFilter = !!(folder !== null || favoritesOnly || activeTag || query.trim());
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const pageItems = visible.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

    // 조건이 바뀌면 첫 페이지로
    useEffect(() => {
        setPage(0);
    }, [tab, folder, favoritesOnly, activeTag, query, sortKey, sortDir, pageSize]);

    useEffect(() => {
        try {
            sessionStorage.setItem(TAB_KEY, tab);
        } catch { /* 무시 */ }
    }, [tab]);

    const clearFilters = useCallback(() => {
        setFolder(null);
        setFavoritesOnly(false);
        setActiveTag(null);
        setQuery('');
    }, []);

    // 다른 화면에서 특정 글로 이동: 필터를 풀고, 그 글이 있는 페이지로 가서 스크롤
    useEffect(() => {
        if (focusId == null || tab === 'images') return;
        const idx = visible.findIndex(m => m.id === focusId);
        if (idx < 0) {
            if (hasFilter) clearFilters();
            return;
        }
        const target = Math.floor(idx / pageSize);
        if (target !== currentPage) {
            setPage(target);
            return;
        }
        requestAnimationFrame(() => document.getElementById(`memo-${focusId}`)?.scrollIntoView({behavior: 'smooth', block: 'start'}));
        const t = setTimeout(() => setFocusId(null), 2500);
        return () => clearTimeout(t);
    }, [focusId, tab, visible, pageSize, currentPage, hasFilter, clearFilters]);

    // ─── 폴더 ───────────────────────────────────────
    const folderActions = useFolderActions(
        kind,
        folderPaths,
        async (from, to) => {
            await reload();
            // 보고 있던 폴더가 옮겨지면 새 위치를 따라간다
            if (from !== undefined && to !== undefined && folder && isInside(folder, from)) setFolder(movePath(folder, from, to) || null);
        },
        showToast,
    );
    const expanded = useExpanded('memo.folderOpen');
    const canManage = tab !== 'images';

    const selectFolder = (path: string | null) => {
        setFolder(path);
        setFavoritesOnly(false);
        if (path) expanded.reveal(path);
        setDrawerOpen(false);
    };

    const moveMemos = async (ids: number[], dest: string) => {
        setMoveTarget(null);
        if (!ids.length) return;
        try {
            await moveMemosTo(ids, kind, dest);
            await reload();
            setSelectedIds(new Set());
            showToast(`${ids.length}개를 '${dest ? pathLabel(dest) : '폴더 없음'}'(으)로 옮겼습니다`);
        } catch {
            showToast('옮기지 못했습니다');
        }
    };

    const dnd: FolderDnd | undefined = canManage
        ? {
              onDropMemos: (ids, path) => moveMemos(ids, path),
              onDropFolder: (from, toParent) => folderActions.relocate(from, joinPath(toParent, folderName(from))),
          }
        : undefined;
    const [dropOver, setDropOver] = useState<string | null>(null);

    const startDrag = (e: React.DragEvent, memo: Memo) => {
        const ids = selecting && memo.id != null && selectedIds.has(memo.id) ? [...selectedIds] : memo.id != null ? [memo.id] : [];
        e.dataTransfer.setData(MIME_MEMOS, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
    };

    // ─── 선택 모드 ──────────────────────────────────
    const toggleSelect = (memo: Memo) =>
        memo.id != null &&
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(memo.id as number)) next.delete(memo.id as number);
            else next.add(memo.id as number);
            return next;
        });

    const endSelecting = () => {
        setSelecting(false);
        setSelectedIds(new Set());
    };

    const pageIds = pageItems.map(m => m.id).filter((id): id is number => id != null);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));

    const deleteSelected = async () => {
        const targets = memos.filter(m => m.id != null && selectedIds.has(m.id));
        if (!targets.length || !window.confirm(`선택한 ${targets.length}개를 삭제할까요?\n첨부한 이미지도 함께 삭제됩니다.`)) return;
        for (const m of targets) {
            await deleteMemoWithImages(m);
            releaseImageUrls(m.imageIds);
        }
        endSelecting();
        await reload();
        showToast(`${targets.length}개를 삭제했습니다`);
    };

    // ─── 글 동작 ────────────────────────────────────
    const handleSave = async (memo: Memo, removedImageIds: string[]) => {
        await saveMemo(memo);
        // 할일 항목에서 만든 메모면 그 항목에 연결
        const target = editor?.linkTo;
        const todo = target && memos.find(m => m.id === target.todoId);
        if (target && todo) {
            await saveMemo({...todo, content: addTaskLink(todo.content, target.line, memo.uid, target.text), updatedAt: new Date().toISOString()});
        }
        if (removedImageIds.length) {
            await deleteImages(removedImageIds);
            releaseImageUrls(removedImageIds);
        }
        setEditor(null);
        await reload();
        showToast('저장했습니다');
    };

    const handleDelete = async (memo: Memo) => {
        if (!window.confirm(`"${memo.title}" 메모를 삭제할까요?\n첨부한 이미지도 함께 삭제됩니다.`)) return;
        await deleteMemoWithImages(memo);
        releaseImageUrls(memo.imageIds);
        await reload();
        showToast('삭제했습니다');
    };

    /** 화면을 먼저 갱신하고 DB에 저장 */
    const persist = async (next: Memo) => {
        setMemos(list => list.map(m => (m.id === next.id ? next : m)));
        try {
            await saveMemo(next);
        } catch {
            showToast('저장하지 못했습니다');
            await reload();
        }
    };

    // 댓글도 기록 활동이므로 메모의 수정일을 갱신한다 (다른 기기와 합칠 때 최신본 판단에도 쓰임)
    const addComment = (memo: Memo, content: string) => {
        const now = new Date().toISOString();
        return persist({...memo, updatedAt: now, comments: [...memo.comments, {id: newId(), content, createdAt: now, updatedAt: now}]});
    };

    const editComment = (memo: Memo, commentId: string, content: string) => {
        const now = new Date().toISOString();
        return persist({
            ...memo,
            updatedAt: now,
            comments: memo.comments.map(c => (c.id === commentId ? {...c, content, updatedAt: now} : c)),
        });
    };

    const removeComment = (memo: Memo, commentId: string) => {
        if (!window.confirm('댓글을 삭제할까요?')) return Promise.resolve();
        return persist({...memo, updatedAt: new Date().toISOString(), comments: memo.comments.filter(c => c.id !== commentId)});
    };

    const updateContent = (memo: Memo, content: string) => persist({...memo, content, updatedAt: new Date().toISOString()});

    const copyReport = async (memo: Memo) => {
        const ok = await copyText(toReportText(memo.title, memo.content));
        showToast(ok ? '보고용 텍스트를 복사했습니다' : '복사하지 못했습니다');
    };

    const toggleFavorite = async (memo: Memo) => {
        // 즐겨찾기는 내용 수정이 아니므로 수정일을 바꾸지 않는다
        const next = {...memo, isFavorite: !memo.isFavorite};
        setMemos(list => list.map(m => (m.id === memo.id ? next : m)));
        await saveMemo(next);
    };

    // ─── 할일 ↔ 메모 연결 ───────────────────────────
    const memosByUid = useMemo(() => new Map(memos.filter(m => m.kind === 'memo').map(m => [m.uid, m])), [memos]);

    /** 메모 uid → 이 메모가 연결된 할일 항목 (최근 할일 먼저, 같은 문구는 한 번만) */
    const backlinks = useMemo(() => {
        const map = new Map<string, {todo: Memo; text: string}[]>();
        memos
            .filter(m => m.kind === 'todo')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .forEach(todo =>
                parseTodo(todo.content).tasks.forEach(task =>
                    task.links.forEach(uid => {
                        const list = map.get(uid) ?? [];
                        if (!list.some(x => x.text === task.text)) list.push({todo, text: task.text});
                        map.set(uid, list);
                    }),
                ),
            );
        return map;
    }, [memos]);

    const linkApi = useMemo<TaskLinkApi>(
        () => ({
            memosByUid,
            openMemos: uids => setPopupUids(uids),
            createMemo: target => setEditor({memo: null, kind: 'memo', linkTo: target}),
            pickMemo: target => setPicker(target),
        }),
        [memosByUid],
    );

    const linkExisting = async (target: LinkTarget, uid: string) => {
        const todo = memos.find(m => m.id === target.todoId);
        setPicker(null);
        if (!todo) return;
        await persist({...todo, content: addTaskLink(todo.content, target.line, uid, target.text), updatedAt: new Date().toISOString()});
        showToast('메모를 연결했습니다');
    };

    const changeTab = (t: Tab) => {
        setTab(t);
        setFolder(null); // 폴더는 탭마다 다르므로 초기화
        setFabOpen(false);
        endSelecting();
    };

    const openTodo = (todoId: number) => {
        setPopupUids(null);
        changeTab('todos');
        setFocusId(todoId);
    };

    const pickerTask = picker && parseTodo(memos.find(m => m.id === picker.todoId)?.content ?? '').tasks.find(t => t.line === picker.line);

    const openNew = (k: MemoKind, preset?: string) => {
        setFabOpen(false);
        if (k === 'todo' && preset === DAILY && latestDaily && localDate(latestDaily.createdAt) === todayStr()) {
            if (!window.confirm(`오늘 일일업무가 이미 있습니다.\n"${latestDaily.title}"\n\n새로 만들까요? (취소하면 기존 항목으로 이동)`)) {
                changeTab('todos');
                setFocusId(latestDaily.id ?? null);
                return;
            }
        }
        // 빈 글은 지금 보고 있는 폴더에 만든다
        setEditor({memo: null, kind: k, preset, folder: !preset && folder ? folder : undefined});
    };

    const renderCard = (memo: Memo, opts: {highlight?: boolean; inList?: boolean} = {}) => (
        <MemoCard
            key={memo.id}
            memo={memo}
            highlight={opts.highlight}
            compact={opts.inList && compact}
            activeTag={activeTag}
            commentPageSize={settings.commentPageSize}
            selectable={opts.inList && selecting}
            selected={memo.id != null && selectedIds.has(memo.id)}
            onToggleSelect={toggleSelect}
            onDragHandleStart={opts.inList && canManage ? startDrag : undefined}
            onEdit={m => setEditor({memo: m, kind: m.kind})}
            onDelete={handleDelete}
            onMove={m => m.id != null && setMoveTarget({ids: [m.id], current: m.category})}
            onToggleFavorite={toggleFavorite}
            onAddComment={addComment}
            onEditComment={editComment}
            onDeleteComment={removeComment}
            onUpdateContent={updateContent}
            onCopyReport={copyReport}
            backlinks={backlinks.get(memo.uid)}
            onOpenTodo={openTodo}
            onTagClick={t => {
                setPopupUids(null);
                setActiveTag(activeTag === t ? null : t);
            }}
            onCategoryClick={c => {
                setPopupUids(null);
                if (memo.kind !== kind && tab !== 'images') changeTab(memo.kind === 'todo' ? 'todos' : 'memos');
                selectFolder(c);
            }}
        />
    );

    const goPage = (p: number) => {
        setPage(p);
        window.scrollTo({top: 0});
    };

    // ─── 화면 조각 ──────────────────────────────────
    const chip = (active: boolean) =>
        `flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-gray-100 font-medium text-gray-900' : 'bg-gray-800 text-gray-300'}`;

    const navRow = (active: boolean) =>
        `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'}`;

    /** 사이드바(PC)와 폴더 서랍(모바일)에서 같이 쓰는 폴더 목록 */
    const folderPanel = (
        <div className="space-y-1">
            <button onClick={() => selectFolder(null)} className={navRow(folder === null && !favoritesOnly)}>
                <FiList size={15} className="shrink-0 text-gray-400" />
                <span className="flex-1">전체</span>
                <span className="text-xs text-gray-500">{scoped.length}</span>
            </button>
            <button
                onClick={() => {
                    setFavoritesOnly(v => !v);
                    setDrawerOpen(false);
                }}
                aria-pressed={favoritesOnly}
                className={navRow(favoritesOnly)}
            >
                <FiStar size={15} className="shrink-0 text-amber-400" fill="currentColor" />
                <span className="flex-1">즐겨찾기</span>
                <span className="text-xs text-gray-500">{scoped.filter(m => m.isFavorite).length}</span>
            </button>
            <button
                onClick={() => selectFolder('')}
                className={`${navRow(folder === '')} ${dropOver === '' ? 'bg-emerald-900/60 ring-1 ring-emerald-500' : ''}`}
                {...dropHandlers('', dnd, setDropOver)}
            >
                <FiInbox size={15} className="shrink-0 text-gray-400" />
                <span className="flex-1">폴더 없음</span>
                <span className="text-xs text-gray-500">{unfiledCount}</span>
            </button>

            <div className="flex items-center justify-between px-2 pb-1 pt-4">
                <span className="text-xs font-medium text-gray-500">폴더</span>
                {canManage && (
                    <button onClick={() => folderActions.createIn('')} aria-label="새 폴더" title="새 폴더" className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200">
                        <FiFolderPlus size={16} />
                    </button>
                )}
            </div>
            {tree.length ? (
                <FolderTree
                    nodes={tree}
                    open={expanded.open}
                    onToggle={expanded.toggle}
                    selected={folder}
                    onSelect={selectFolder}
                    menu={canManage ? folderActions.menuFor : undefined}
                    dnd={dnd}
                />
            ) : (
                <p className="px-2 text-sm text-gray-500">폴더가 없습니다.{canManage && ' + 버튼으로 만들어 보세요.'}</p>
            )}
            {canManage && tree.length > 0 && (
                <p className="hidden px-2 pt-2 text-xs leading-relaxed text-gray-600 lg:block">글의 ⠿ 손잡이를 끌어 폴더에 놓으면 이동합니다. 폴더끼리도 끌어서 옮길 수 있습니다.</p>
            )}
        </div>
    );

    const emptyFolder = folder && !favoritesOnly && !activeTag && !query.trim();

    return (
        <TaskLinkContext.Provider value={linkApi}>
        <div className="min-h-[100dvh] bg-gray-900 text-gray-200">
            {/* 상단: 탭 · 검색 · 필터 · 정렬 */}
            <header ref={headerRef} className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto max-w-3xl space-y-2 px-4 py-2 lg:max-w-7xl lg:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="sr-only">메모</h1>
                        <div className="order-1 flex flex-1 rounded-lg bg-gray-800 p-0.5 text-sm lg:w-72 lg:flex-none">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => changeTab(t.id)}
                                    aria-pressed={tab === t.id}
                                    className={`flex-1 rounded-md py-1.5 ${tab === t.id ? 'bg-gray-600 font-medium text-white' : 'text-gray-400'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <label className="order-3 flex w-full items-center gap-2 rounded-lg bg-gray-800 px-3 lg:order-2 lg:w-auto lg:flex-1">
                            <FiSearch className="shrink-0 text-gray-500" />
                            <input
                                type="search"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="제목, 내용, 댓글, #태그 검색"
                                enterKeyHint="search"
                                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-500"
                            />
                            {query && (
                                <button onClick={() => setQuery('')} aria-label="검색어 지우기" className="p-1 text-gray-400">
                                    <FiX />
                                </button>
                            )}
                        </label>
                        <Link to="/memo/settings" aria-label="설정" title="설정" className="order-2 -mr-2 rounded-full p-2 text-gray-300 hover:bg-gray-800 lg:order-3">
                            <FiSettings size={20} />
                        </Link>
                    </div>

                    {/* 모바일: 전체 · 즐겨찾기 · 폴더 (PC는 왼쪽 사이드바) */}
                    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
                        <button onClick={() => { setFolder(null); setFavoritesOnly(false); }} className={chip(folder === null && !favoritesOnly)}>
                            전체 {scoped.length}
                        </button>
                        <button onClick={() => setFavoritesOnly(v => !v)} className={chip(favoritesOnly)}>
                            <FiStar className={favoritesOnly ? 'text-amber-500' : 'text-amber-400'} fill="currentColor" size={14} /> 즐겨찾기
                        </button>
                        <button onClick={() => setDrawerOpen(true)} className={`${chip(folder !== null)} max-w-[55%]`}>
                            <FiFolder size={14} className="shrink-0" />
                            <span className="truncate">{folder === null ? '폴더' : folder === '' ? '폴더 없음' : pathLabel(folder)}</span>
                            <FiChevronDown size={14} className="shrink-0" />
                        </button>
                    </div>
                    {/* 모바일: 지금 폴더의 상위 / 하위 폴더로 빠르게 이동 */}
                    {folder && (
                        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
                            <button onClick={() => selectFolder(parentPath(folder) || null)} className="flex shrink-0 items-center gap-1 rounded-full border border-gray-700 px-2.5 py-1 text-sm text-gray-400">
                                <FiCornerLeftUp size={14} /> {parentPath(folder) ? folderName(parentPath(folder)) : '전체'}
                            </button>
                            {currentNode?.children.map(c => (
                                <button key={c.path} onClick={() => selectFolder(c.path)} className="flex shrink-0 items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-sm text-gray-300">
                                    <FiFolder size={13} className="text-gray-500" /> {c.name} <span className="text-xs text-gray-500">{c.total}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {(activeTag || tab !== 'images') && (
                        <div className="flex items-center gap-2 text-sm">
                            {activeTag && (
                                <button onClick={() => setActiveTag(null)} className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-1 text-white">
                                    #{activeTag} <FiX size={14} />
                                </button>
                            )}
                            <span className="min-w-0 flex-1 truncate text-gray-500">
                                <span className="hidden lg:inline">
                                    {favoritesOnly ? '즐겨찾기 · ' : ''}
                                    {folder === null ? '전체' : folder === '' ? '폴더 없음' : pathLabel(folder)} ·{' '}
                                </span>
                                {visible.length}개
                            </span>
                            {tab !== 'images' && (
                                <>
                                    <select
                                        value={sortKey}
                                        onChange={e => updateSettings(s => ({...s, sort: {...s.sort, [kind]: {...s.sort[kind], key: e.target.value as SortKey}}}))}
                                        aria-label="정렬 기준"
                                        className="rounded-lg bg-gray-800 px-2 py-1.5 text-gray-200 outline-none"
                                    >
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                                            <option key={k} value={k}>{SORT_LABELS[k]}순</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => updateSettings(s => ({...s, sort: {...s.sort, [kind]: {...s.sort[kind], dir: sortDir === 'asc' ? 'desc' : 'asc'}}}))}
                                        className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-800 px-2 py-1.5 text-gray-200"
                                    >
                                        {sortDir === 'asc' ? <FiArrowUp /> : <FiArrowDown />}
                                        {sortKey === 'title' ? (sortDir === 'asc' ? '가→하' : '하→가') : sortDir === 'asc' ? '오래된 순' : '최신 순'}
                                    </button>
                                    <button
                                        onClick={() => updateSettings(s => ({...s, listView: {...s.listView, [kind]: compact ? 'full' : 'compact'}}))}
                                        aria-label={compact ? '기본 보기로 바꾸기' : '간략히 보기로 바꾸기'}
                                        title={compact ? '지금: 간략히 (누르면 기본)' : '지금: 기본 (누르면 간략히)'}
                                        className="shrink-0 rounded-lg bg-gray-800 p-2 text-gray-200"
                                    >
                                        {compact ? <FiList size={15} /> : <FiGrid size={15} />}
                                    </button>
                                    <button
                                        onClick={() => (selecting ? endSelecting() : setSelecting(true))}
                                        aria-pressed={selecting}
                                        className={`shrink-0 rounded-lg px-2 py-1.5 ${selecting ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-200'}`}
                                    >
                                        선택
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className="mx-auto lg:flex lg:max-w-7xl lg:gap-6 lg:px-6">
                {/* PC: 왼쪽 폴더 사이드바 */}
                <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
                    <div className="sticky overflow-y-auto py-4 pr-1" style={{top: headerH, maxHeight: `calc(100dvh - ${headerH}px)`}}>
                        {folderPanel}
                        {scopedTags.length > 0 && (
                            <div className="pt-5">
                                <div className="px-2 pb-2 text-xs font-medium text-gray-500">태그</div>
                                <div className="flex flex-wrap gap-1.5 px-2">
                                    {scopedTags.map(([t, n]) => (
                                        <button
                                            key={t}
                                            onClick={() => setActiveTag(activeTag === t ? null : t)}
                                            className={`rounded-full px-2 py-0.5 text-xs ${activeTag === t ? 'bg-indigo-500 text-white' : 'bg-indigo-900/40 text-indigo-200 hover:bg-indigo-900/70'}`}
                                        >
                                            #{t} <span className="opacity-60">{n}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="mx-auto min-w-0 max-w-3xl flex-1 px-4 pb-32 pt-4 lg:mx-0 lg:max-w-none lg:px-0">
                    {loading ? (
                        <p className="py-10 text-center text-gray-500">불러오는 중…</p>
                    ) : tab === 'images' ? (
                        <ImageGallery
                            memos={visible}
                            refreshKey={galleryKey}
                            pageSize={settings.imagePageSize}
                            onOpenMemo={id => {
                                const target = memos.find(m => m.id === id);
                                setTab(target?.kind === 'todo' ? 'todos' : 'memos');
                                setFocusId(id);
                            }}
                        />
                    ) : visible.length ? (
                        <>
                            <div className={`grid items-start ${compact ? 'gap-2' : 'gap-3'} ${!compact && settings.pcColumns === 2 ? 'xl:grid-cols-2' : ''}`}>
                                {pageItems.map(memo => renderCard(memo, {highlight: focusId === memo.id, inList: true}))}
                            </div>
                            {pageCount > 1 && (
                                <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                                    <span className="text-xs text-gray-500">
                                        {currentPage * pageSize + 1}–{Math.min(visible.length, (currentPage + 1) * pageSize)} / {visible.length}
                                    </span>
                                    <Pager label="목록 페이지" page={currentPage} count={pageCount} onPage={goPage} edges />
                                </div>
                            )}
                        </>
                    ) : emptyFolder ? (
                        <div className="py-16 text-center text-sm text-gray-500">
                            {folder === '' ? '폴더 밖에 있는 글이 없습니다.' : `'${pathLabel(folder as string)}' 폴더가 비어 있습니다.`}
                            {folder !== '' && (
                                <button onClick={() => openNew(kind)} className="mt-3 block w-full text-emerald-400">
                                    여기에 새 {tab === 'todos' ? '할일' : '메모'} 쓰기
                                </button>
                            )}
                        </div>
                    ) : hasFilter ? (
                        <div className="py-16 text-center text-sm text-gray-500">
                            조건에 맞는 {tab === 'todos' ? '할일이' : '메모가'} 없습니다.
                            <button onClick={clearFilters} className="mt-3 block w-full text-emerald-400">필터 모두 해제</button>
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <p className="mb-4 text-gray-400">{tab === 'todos' ? '어떤 할일부터 정리할까요?' : '무엇부터 기록할까요?'}</p>
                            <div className="mx-auto flex max-w-xs flex-col gap-2">
                                {presetsFor(kind).map(p => (
                                    <button key={p.name} onClick={() => openNew(kind, p.name)} className="rounded-xl bg-gray-800 px-4 py-3 text-left hover:bg-gray-700">
                                        {p.icon} {p.name} {tab === 'todos' ? '할일 만들기' : '기록하기'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* 선택 모드: 아래 작업 막대 */}
            {selecting ? (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-700 bg-gray-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
                    <div className="mx-auto flex max-w-3xl items-center gap-1.5 px-4 py-2.5 text-sm lg:max-w-7xl lg:gap-2 lg:px-6">
                        <span className="shrink-0 font-medium text-gray-100">{selectedIds.size}개</span>
                        <button
                            onClick={() => setSelectedIds(prev => {
                                const next = new Set(prev);
                                pageIds.forEach(id => (allPageSelected ? next.delete(id) : next.add(id)));
                                return next;
                            })}
                            className="shrink-0 rounded-lg px-2 py-1.5 text-gray-400 hover:bg-gray-800"
                        >
                            {allPageSelected ? '선택 해제' : '페이지 전체'}
                        </button>
                        <span className="flex-1" />
                        <button
                            onClick={() => setMoveTarget({ids: [...selectedIds], current: folder ?? ''})}
                            disabled={!selectedIds.size}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-800 px-2.5 py-1.5 text-gray-100 disabled:opacity-40"
                        >
                            <FiFolder className="hidden sm:block" /> 이동
                        </button>
                        <button
                            onClick={deleteSelected}
                            disabled={!selectedIds.size}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-800 px-2.5 py-1.5 text-red-300 disabled:opacity-40"
                        >
                            <FiTrash2 className="hidden sm:block" /> 삭제
                        </button>
                        <button onClick={endSelecting} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-medium text-white">
                            <FiCheckSquare className="hidden sm:block" /> 완료
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* 새 글 버튼: 누르면 종류 선택 */}
                    {fabOpen && <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setFabOpen(false)} />}
                    <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex flex-col items-end gap-2 lg:right-8">
                        {fabOpen &&
                            [
                                ...presetsFor(kind).map(p => ({key: p.name, label: `${p.icon} ${p.name}`, preset: p.name as string | undefined})),
                                {
                                    key: 'blank',
                                    label: `${tab === 'todos' ? '☑️ 빈 할일' : '📝 빈 메모'}${folder ? ` (${folderName(folder)})` : ''}`,
                                    preset: undefined,
                                },
                            ].map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => openNew(kind, item.preset)}
                                    className="rounded-full bg-gray-100 px-4 py-2.5 font-medium text-gray-900 shadow-lg"
                                >
                                    {item.label}
                                </button>
                            ))}
                        <button
                            onClick={() => setFabOpen(v => !v)}
                            aria-label={fabOpen ? '닫기' : tab === 'todos' ? '새 할일' : '새 메모'}
                            aria-expanded={fabOpen}
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500"
                        >
                            <FiPlus size={26} className={`transition-transform ${fabOpen ? 'rotate-45' : ''}`} />
                        </button>
                    </div>
                </>
            )}

            {/* 모바일: 폴더 서랍 */}
            {drawerOpen && (
                <div className="fixed inset-0 z-40 flex items-end bg-black/60 lg:hidden" onClick={() => setDrawerOpen(false)}>
                    <div
                        role="dialog"
                        aria-label="폴더"
                        onClick={e => e.stopPropagation()}
                        className="flex max-h-[80dvh] w-full flex-col rounded-t-2xl bg-gray-900"
                    >
                        <div className="flex items-center border-b border-gray-800 px-4 py-2">
                            <h2 className="flex-1 font-semibold text-gray-100">{tab === 'todos' ? '할일' : tab === 'images' ? '이미지' : '메모'} 폴더</h2>
                            <button onClick={() => setDrawerOpen(false)} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                                <FiX size={20} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{folderPanel}</div>
                    </div>
                </div>
            )}

            {editor && (
                <MemoEditor
                    memo={editor.memo}
                    kind={editor.kind}
                    preset={editor.preset}
                    latestDaily={latestDaily}
                    initialTitle={editor.linkTo?.text}
                    linkNote={editor.linkTo?.text}
                    initialFolder={editor.folder}
                    folders={foldersFor(editor.kind)}
                    frequentFolders={frequentFoldersFor(editor.kind)}
                    allTags={allTags}
                    onSave={handleSave}
                    onClose={() => setEditor(null)}
                />
            )}

            {moveTarget && (
                <FolderPicker
                    title={moveTarget.ids.length > 1 ? `${moveTarget.ids.length}개 폴더 이동` : '폴더 이동'}
                    folders={folderPaths}
                    current={moveTarget.current}
                    onClose={() => setMoveTarget(null)}
                    onConfirm={dest => moveMemos(moveTarget.ids, dest)}
                />
            )}

            {folderActions.dialogs}

            {toast && (
                <div role="status" className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[70] mx-auto w-fit max-w-[90%] rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-900 shadow-lg">
                    {toast}
                </div>
            )}

            {/* 할일 항목에 연결된 메모 팝업 (편집기는 이 위에 열림) */}
            {popupUids && (
                <div className="fixed inset-0 z-[35] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setPopupUids(null)}>
                    <div
                        role="dialog"
                        aria-label="연결된 메모"
                        onClick={e => e.stopPropagation()}
                        className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-gray-900 sm:max-w-2xl sm:rounded-2xl"
                    >
                        <div className="flex items-center border-b border-gray-800 px-4 py-2">
                            <h2 className="flex-1 font-semibold text-gray-100">연결된 메모 {popupUids.length > 1 ? popupUids.length : ''}</h2>
                            <button onClick={() => setPopupUids(null)} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                                <FiX size={20} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                            {popupUids.map(uid => memosByUid.get(uid)).filter((m): m is Memo => !!m).map(m => renderCard(m))}
                            {!popupUids.some(uid => memosByUid.has(uid)) && <p className="py-8 text-center text-sm text-gray-500">메모가 삭제되었습니다.</p>}
                        </div>
                    </div>
                </div>
            )}

            {picker && (
                <MemoPicker
                    taskText={picker.text}
                    memos={[...memosByUid.values()]}
                    linked={pickerTask?.links ?? []}
                    onPick={uid => linkExisting(picker, uid)}
                    onCreate={() => {
                        setPicker(null);
                        setEditor({memo: null, kind: 'memo', linkTo: picker});
                    }}
                    onClose={() => setPicker(null)}
                />
            )}
        </div>
        </TaskLinkContext.Provider>
    );
};

export default MemoPage;
