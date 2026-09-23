import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FiArrowDown, FiArrowUp, FiDownload, FiMoreVertical, FiPlus, FiSearch, FiStar, FiUpload, FiX} from 'react-icons/fi';
import ImageGallery from '../components/ImageGallery';
import MemoCard from '../components/MemoCard';
import MemoEditor from '../components/MemoEditor';
import {deleteMemoWithImages, deleteImages, getAllMemos, importData, saveMemo} from '../db/memoDB';
import type {Memo, MemoImage, SortDir, SortKey} from '../types/memo';
import {exportBackup, readBackup} from '../utils/backup';
import {clearImageUrlCache, releaseImageUrls} from '../utils/image';
import {categoryIcon, PRESETS} from '../utils/presets';

type Tab = 'memos' | 'images';
type EditorState = {memo: Memo | null; preset?: string} | null;

const SORT_LABELS: Record<SortKey, string> = {updatedAt: '수정일', createdAt: '작성일', title: '제목'};

/** 정렬 설정처럼 가벼운 값은 localStorage에 기억 */
function usePref<T extends string>(key: string, fallback: T) {
    const [value, setValue] = useState<T>(() => {
        try {
            return (localStorage.getItem(key) as T) || fallback;
        } catch {
            return fallback;
        }
    });
    const set = (v: T) => {
        setValue(v);
        try {
            localStorage.setItem(key, v);
        } catch { /* 무시 */ }
    };
    return [value, set] as const;
}

/** 공백으로 나눈 모든 단어가 포함되어야 일치. #으로 시작하면 해시태그만 검색 */
function matches(memo: Memo, query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = `${memo.title}\n${memo.content}\n${memo.category}`.toLowerCase();
    const tags = memo.hashtags.map(t => t.toLowerCase());
    return terms.every(term =>
        term.startsWith('#')
            ? tags.some(t => t.startsWith(term.slice(1)))
            : haystack.includes(term) || tags.some(t => t.includes(term)),
    );
}

const MemoPage: React.FC = () => {
    const [memos, setMemos] = useState<Memo[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('memos');
    const [editor, setEditor] = useState<EditorState>(null);
    const [fabOpen, setFabOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [sortKey, setSortKey] = usePref<SortKey>('memo.sortKey', 'updatedAt');
    const [sortDir, setSortDir] = usePref<SortDir>('memo.sortDir', 'desc');

    const [focusId, setFocusId] = useState<number | null>(null);
    const [galleryKey, setGalleryKey] = useState(0);
    const [pendingImport, setPendingImport] = useState<{memos: Memo[]; images: MemoImage[]} | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const reload = useCallback(async () => {
        setMemos(await getAllMemos());
        setGalleryKey(k => k + 1);
        setLoading(false);
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
    };

    // ─── 파생 데이터 ────────────────────────────────
    const categories = useMemo(() => {
        const count = new Map<string, number>();
        memos.forEach(m => m.category && count.set(m.category, (count.get(m.category) ?? 0) + 1));
        return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({name, n}));
    }, [memos]);

    const allTags = useMemo(() => {
        const count = new Map<string, number>();
        memos.forEach(m => m.hashtags.forEach(t => count.set(t, (count.get(t) ?? 0) + 1)));
        return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    }, [memos]);

    const visible = useMemo(() => {
        const list = memos.filter(
            m =>
                (!category || m.category === category) &&
                (!favoritesOnly || m.isFavorite) &&
                (!activeTag || m.hashtags.includes(activeTag)) &&
                (!query.trim() || matches(m, query)),
        );
        return list.sort((a, b) => {
            const cmp = sortKey === 'title' ? a.title.localeCompare(b.title, 'ko') : a[sortKey].localeCompare(b[sortKey]);
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [memos, category, favoritesOnly, activeTag, query, sortKey, sortDir]);

    const hasFilter = !!(category || favoritesOnly || activeTag || query.trim());

    // 이미지 보기에서 메모로 이동
    useEffect(() => {
        if (focusId == null || tab !== 'memos') return;
        requestAnimationFrame(() => document.getElementById(`memo-${focusId}`)?.scrollIntoView({behavior: 'smooth', block: 'start'}));
        const t = setTimeout(() => setFocusId(null), 2500);
        return () => clearTimeout(t);
    }, [focusId, tab]);

    // ─── 동작 ───────────────────────────────────────
    const handleSave = async (memo: Memo, removedImageIds: string[]) => {
        await saveMemo(memo);
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

    const toggleFavorite = async (memo: Memo) => {
        // 즐겨찾기는 내용 수정이 아니므로 수정일을 바꾸지 않는다
        const next = {...memo, isFavorite: !memo.isFavorite};
        setMemos(list => list.map(m => (m.id === memo.id ? next : m)));
        await saveMemo(next);
    };

    const handleExport = async () => {
        setMenuOpen(false);
        try {
            const {memoCount, imageCount} = await exportBackup();
            showToast(`메모 ${memoCount}개, 이미지 ${imageCount}개를 내보냈습니다`);
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
        if (mode === 'replace' && !window.confirm('이 기기의 메모와 이미지를 모두 지우고 백업으로 교체합니다. 계속할까요?')) return;
        try {
            await importData(pendingImport.memos, pendingImport.images, mode);
            clearImageUrlCache();
            await reload();
            showToast(`메모 ${pendingImport.memos.length}개를 가져왔습니다`);
        } catch {
            showToast('가져오기에 실패했습니다. 저장 공간을 확인하세요');
        }
        setPendingImport(null);
    };

    const clearFilters = () => {
        setCategory(null);
        setFavoritesOnly(false);
        setActiveTag(null);
        setQuery('');
    };

    const chip = (active: boolean) =>
        `shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-gray-100 font-medium text-gray-900' : 'bg-gray-800 text-gray-300'}`;

    return (
        <div className="min-h-[100dvh] bg-gray-900 text-gray-200">
            {/* 상단: 탭 · 검색 · 필터 · 정렬 */}
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto max-w-3xl space-y-2 px-4 py-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-50">메모</h1>
                        <div className="ml-2 flex flex-1 rounded-lg bg-gray-800 p-0.5 text-sm">
                            {(['memos', 'images'] as Tab[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`flex-1 rounded-md py-1.5 ${tab === t ? 'bg-gray-600 font-medium text-white' : 'text-gray-400'}`}
                                >
                                    {t === 'memos' ? '메모' : '이미지 모아보기'}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <button onClick={() => setMenuOpen(v => !v)} aria-label="더보기 메뉴" aria-expanded={menuOpen} className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                                <FiMoreVertical size={20} />
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl bg-gray-800 shadow-xl ring-1 ring-gray-700">
                                        <button onClick={handleExport} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-700">
                                            <FiDownload /> 백업 파일 내보내기
                                        </button>
                                        <button
                                            onClick={() => {
                                                setMenuOpen(false);
                                                importRef.current?.click();
                                            }}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-700"
                                        >
                                            <FiUpload /> 백업 파일 가져오기
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <label className="flex items-center gap-2 rounded-lg bg-gray-800 px-3">
                        <FiSearch className="shrink-0 text-gray-500" />
                        <input
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="제목, 내용, #태그 검색"
                            enterKeyHint="search"
                            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-500"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} aria-label="검색어 지우기" className="p-1 text-gray-400">
                                <FiX />
                            </button>
                        )}
                    </label>

                    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <button onClick={() => { setCategory(null); setFavoritesOnly(false); }} className={chip(!category && !favoritesOnly)}>
                            전체 {memos.length}
                        </button>
                        <button onClick={() => setFavoritesOnly(v => !v)} className={`${chip(favoritesOnly)} flex items-center gap-1`}>
                            <FiStar className={favoritesOnly ? 'text-amber-500' : 'text-amber-400'} fill="currentColor" size={14} /> 즐겨찾기
                        </button>
                        {categories.map(c => (
                            <button key={c.name} onClick={() => setCategory(category === c.name ? null : c.name)} className={chip(category === c.name)}>
                                {categoryIcon(c.name)} {c.name} {c.n}
                            </button>
                        ))}
                    </div>

                    {(activeTag || tab === 'memos') && (
                        <div className="flex items-center gap-2 text-sm">
                            {activeTag && (
                                <button onClick={() => setActiveTag(null)} className="flex items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-1 text-white">
                                    #{activeTag} <FiX size={14} />
                                </button>
                            )}
                            {tab === 'memos' && (
                                <>
                                    <span className="flex-1 text-gray-500">{visible.length}개</span>
                                    <select
                                        value={sortKey}
                                        onChange={e => setSortKey(e.target.value as SortKey)}
                                        aria-label="정렬 기준"
                                        className="rounded-lg bg-gray-800 px-2 py-1.5 text-gray-200 outline-none"
                                    >
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                                            <option key={k} value={k}>{SORT_LABELS[k]}순</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                                        className="flex items-center gap-1 rounded-lg bg-gray-800 px-2 py-1.5 text-gray-200"
                                    >
                                        {sortDir === 'asc' ? <FiArrowUp /> : <FiArrowDown />}
                                        {sortKey === 'title' ? (sortDir === 'asc' ? '가→하' : '하→가') : sortDir === 'asc' ? '오래된 순' : '최신 순'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
                {loading ? (
                    <p className="py-10 text-center text-gray-500">불러오는 중…</p>
                ) : tab === 'images' ? (
                    <ImageGallery
                        memos={visible}
                        refreshKey={galleryKey}
                        onOpenMemo={id => {
                            setTab('memos');
                            setFocusId(id);
                        }}
                    />
                ) : visible.length ? (
                    <div className="space-y-3">
                        {visible.map(memo => (
                            <MemoCard
                                key={memo.id}
                                memo={memo}
                                highlight={focusId === memo.id}
                                activeTag={activeTag}
                                onEdit={m => setEditor({memo: m})}
                                onDelete={handleDelete}
                                onToggleFavorite={toggleFavorite}
                                onTagClick={t => setActiveTag(activeTag === t ? null : t)}
                                onCategoryClick={c => setCategory(c)}
                            />
                        ))}
                    </div>
                ) : hasFilter ? (
                    <div className="py-16 text-center text-sm text-gray-500">
                        조건에 맞는 메모가 없습니다.
                        <button onClick={clearFilters} className="mt-3 block w-full text-emerald-400">필터 모두 해제</button>
                    </div>
                ) : (
                    <div className="py-12 text-center">
                        <p className="mb-4 text-gray-400">무엇부터 기록할까요?</p>
                        <div className="mx-auto flex max-w-xs flex-col gap-2">
                            {PRESETS.map(p => (
                                <button key={p.name} onClick={() => setEditor({memo: null, preset: p.name})} className="rounded-xl bg-gray-800 px-4 py-3 text-left hover:bg-gray-700">
                                    {p.icon} {p.name} 기록하기
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* 새 메모 버튼: 누르면 종류 선택 */}
            {fabOpen && <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setFabOpen(false)} />}
            <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex flex-col items-end gap-2">
                {fabOpen &&
                    [...PRESETS.map(p => ({key: p.name, label: `${p.icon} ${p.name}`, preset: p.name as string | undefined})), {key: 'blank', label: '📝 빈 메모', preset: undefined}].map(item => (
                        <button
                            key={item.key}
                            onClick={() => {
                                setFabOpen(false);
                                setEditor({memo: null, preset: item.preset});
                            }}
                            className="rounded-full bg-gray-100 px-4 py-2.5 font-medium text-gray-900 shadow-lg"
                        >
                            {item.label}
                        </button>
                    ))}
                <button
                    onClick={() => setFabOpen(v => !v)}
                    aria-label={fabOpen ? '닫기' : '새 메모'}
                    aria-expanded={fabOpen}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500"
                >
                    <FiPlus size={26} className={`transition-transform ${fabOpen ? 'rotate-45' : ''}`} />
                </button>
            </div>

            {editor && (
                <MemoEditor
                    memo={editor.memo}
                    preset={editor.preset}
                    categories={categories.map(c => c.name)}
                    allTags={allTags}
                    onSave={handleSave}
                    onClose={() => setEditor(null)}
                />
            )}

            {/* 가져오기 방식 선택 */}
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
                            메모 {pendingImport.memos.length}개, 이미지 {pendingImport.images.length}개가 들어 있습니다.
                        </p>
                        <div className="mt-4 space-y-2">
                            <button onClick={() => runImport('merge')} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-left text-white">
                                <div className="font-semibold">합치기</div>
                                <div className="text-sm text-emerald-100">기존 메모는 유지하고, 같은 메모는 최근 수정본으로 맞춥니다</div>
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
                <div role="status" className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 mx-auto w-fit max-w-[90%] rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-900 shadow-lg">
                    {toast}
                </div>
            )}

            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => handleImportFile(e.target.files?.[0])} />
        </div>
    );
};

export default MemoPage;
