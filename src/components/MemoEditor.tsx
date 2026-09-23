import React, {useEffect, useRef, useState} from 'react';
import {FaHeading, FaQuoteLeft} from 'react-icons/fa';
import {
    FiBold, FiCheckSquare, FiChevronDown, FiCode, FiColumns, FiEdit3, FiEye,
    FiHelpCircle, FiImage, FiItalic, FiLink, FiList, FiStar, FiX,
} from 'react-icons/fi';
import {addImage, deleteImages} from '../db/memoDB';
import type {Memo} from '../types/memo';
import {deriveTitle, newId} from '../utils/format';
import {extractImageIds, IMG_PROTOCOL, prepareImage, releaseImageUrls} from '../utils/image';
import {categoryChip, findPreset, PRESETS} from '../utils/presets';
import MarkdownHelp from './MarkdownHelp';
import MarkdownView from './MarkdownView';

type ViewMode = 'edit' | 'split' | 'preview';

interface Props {
    memo: Memo | null;          // null이면 새 메모
    preset?: string;            // 새 메모를 프리셋 카테고리로 시작
    categories: string[];
    allTags: string[];
    onSave: (memo: Memo, removedImageIds: string[]) => Promise<void>;
    onClose: () => void;
}

const VIEW_KEY = 'memo.editorView';
const normalizeTag = (t: string) => t.trim().replace(/^#+/, '').replace(/[,\s]+/g, '');

const MemoEditor: React.FC<Props> = ({memo, preset, categories, allTags, onSave, onClose}) => {
    const presetInfo = preset ? findPreset(preset) : undefined;
    const initial = useRef({
        title: memo?.title ?? '',
        category: memo?.category ?? preset ?? '',
        content: memo?.content ?? presetInfo?.template ?? '',
        tags: memo?.hashtags ?? [],
        isFavorite: memo?.isFavorite ?? false,
    }).current;

    const [title, setTitle] = useState(initial.title);
    const [category, setCategory] = useState(initial.category);
    const [content, setContent] = useState(initial.content);
    const [tags, setTags] = useState<string[]>(initial.tags);
    const [tagInput, setTagInput] = useState('');
    const [isFavorite, setIsFavorite] = useState(initial.isFavorite);
    const [view, setView] = useState<ViewMode>(() => {
        try {
            return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'split';
        } catch {
            return 'split';
        }
    });
    const [showMeta, setShowMeta] = useState(!memo && !preset);
    const [showHelp, setShowHelp] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const sessionImageIds = useRef<string[]>([]); // 이번 편집에서 새로 올린 이미지
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const chipCategories = [...new Set([...PRESETS.map(p => p.name), ...categories])];
    const [customCategory, setCustomCategory] = useState(chipCategories.includes(initial.category) ? '' : initial.category);

    // 편집기가 열려 있는 동안 뒤 화면 스크롤 방지
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    const changeView = (v: ViewMode) => {
        setView(v);
        try {
            localStorage.setItem(VIEW_KEY, v);
        } catch { /* 저장 불가 환경은 무시 */ }
    };

    const isDirty = () =>
        JSON.stringify({title, category, content, tags, isFavorite}) !== JSON.stringify(initial) ||
        tagInput.trim() !== '' || sessionImageIds.current.length > 0;

    // ─── 본문 편집 도우미 ──────────────────────────────
    const applyEdit = (fn: (text: string, start: number, end: number) => {text: string; selStart: number; selEnd: number}) => {
        const ta = textareaRef.current;
        const start = ta?.selectionStart ?? content.length;
        const end = ta?.selectionEnd ?? content.length;
        const r = fn(content, start, end);
        setContent(r.text);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(r.selStart, r.selEnd);
        });
    };

    const wrap = (before: string, after = before, placeholder = '텍스트') =>
        applyEdit((t, s, e) => {
            const sel = t.slice(s, e) || placeholder;
            return {
                text: t.slice(0, s) + before + sel + after + t.slice(e),
                selStart: s + before.length,
                selEnd: s + before.length + sel.length,
            };
        });

    const prefixLine = (prefix: string) =>
        applyEdit((t, s, e) => {
            const lineStart = t.lastIndexOf('\n', s - 1) + 1;
            return {
                text: t.slice(0, lineStart) + prefix + t.slice(lineStart),
                selStart: s + prefix.length,
                selEnd: e + prefix.length,
            };
        });

    const insertBlock = (snippet: string) =>
        applyEdit((t, s, e) => {
            const lead = s > 0 && t[s - 1] !== '\n' ? '\n' : '';
            const text = t.slice(0, s) + lead + snippet + t.slice(e);
            const pos = s + lead.length + snippet.length;
            return {text, selStart: pos, selEnd: pos};
        });

    // ─── 이미지 ──────────────────────────────────────
    const handleFiles = async (files: FileList | File[] | null) => {
        const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
        if (!list.length) return;
        setUploading(true);
        try {
            let snippet = '';
            for (const file of list) {
                const blob = await prepareImage(file);
                const id = newId();
                await addImage({
                    id,
                    name: file.name || 'image',
                    type: blob.type || file.type,
                    blob,
                    createdAt: new Date().toISOString(),
                });
                sessionImageIds.current.push(id);
                const alt = (file.name || '이미지').replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
                snippet += `![${alt}](${IMG_PROTOCOL}${id})\n`;
            }
            insertBlock(snippet);
        } catch {
            alert('이미지를 추가하지 못했습니다. 저장 공간이 부족한지 확인하세요.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const images = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
        if (images.length) {
            e.preventDefault();
            handleFiles(images);
        }
    };

    // ─── 카테고리 · 태그 ─────────────────────────────
    const pickCategory = (name: string) => {
        const next = category === name ? '' : name;
        setCategory(next);
        setCustomCategory('');
        const template = findPreset(next)?.template;
        if (template && !content.trim()) setContent(template);
    };

    const addTag = (raw: string) => {
        const t = normalizeTag(raw);
        if (t && !tags.includes(t)) setTags([...tags, t]);
        setTagInput('');
    };

    const tagSuggestions = allTags
        .filter(t => !tags.includes(t) && (!tagInput || t.toLowerCase().includes(normalizeTag(tagInput).toLowerCase())))
        .slice(0, 12);

    // ─── 저장 / 닫기 ────────────────────────────────
    const handleSave = async () => {
        if (!title.trim() && !content.trim()) {
            alert('제목이나 내용을 입력하세요.');
            return;
        }
        const now = new Date().toISOString();
        const imageIds = extractImageIds(content);
        const pendingTag = normalizeTag(tagInput);
        const next: Memo = {
            id: memo?.id,
            uid: memo?.uid ?? newId(),
            title: title.trim() || deriveTitle(content),
            category: category.trim(),
            content,
            hashtags: pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags,
            imageIds,
            isFavorite,
            createdAt: memo?.createdAt ?? now,
            updatedAt: now,
        };
        // 본문에서 빠진 이미지는 DB에서도 정리
        const removed = [...new Set([...(memo?.imageIds ?? []), ...sessionImageIds.current])].filter(id => !imageIds.includes(id));
        setSaving(true);
        try {
            await onSave(next, removed);
        } catch {
            alert('저장하지 못했습니다.');
            setSaving(false);
        }
    };

    const handleClose = async () => {
        if (isDirty() && !window.confirm('저장하지 않은 내용이 있습니다. 닫을까요?')) return;
        if (sessionImageIds.current.length) {
            await deleteImages(sessionImageIds.current);
            releaseImageUrls(sessionImageIds.current);
        }
        onClose();
    };

    // ─── 화면 ────────────────────────────────────────
    const tools: {label: string; icon: React.ReactNode; action: () => void}[] = [
        {label: '제목', icon: <FaHeading size={14} />, action: () => prefixLine('## ')},
        {label: '굵게', icon: <FiBold />, action: () => wrap('**')},
        {label: '기울임', icon: <FiItalic />, action: () => wrap('*')},
        {label: '목록', icon: <FiList />, action: () => prefixLine('- ')},
        {label: '체크리스트', icon: <FiCheckSquare />, action: () => prefixLine('- [ ] ')},
        {label: '인용', icon: <FaQuoteLeft size={13} />, action: () => prefixLine('> ')},
        {label: '코드', icon: <FiCode />, action: () => wrap('`')},
        {label: '링크', icon: <FiLink />, action: () => wrap('[', '](https://)', '링크 이름')},
        {label: '사진 추가', icon: <FiImage />, action: () => fileRef.current?.click()},
        {label: '작성법 도움말', icon: <FiHelpCircle />, action: () => setShowHelp(true)},
    ];

    const views: {mode: ViewMode; label: string; icon: React.ReactNode}[] = [
        {mode: 'edit', label: '편집만', icon: <FiEdit3 />},
        {mode: 'split', label: '편집과 미리보기', icon: <FiColumns />},
        {mode: 'preview', label: '미리보기만', icon: <FiEye />},
    ];

    const metaSummary = [category, ...tags.map(t => `#${t}`)].filter(Boolean).join(' ') || '카테고리 · 태그';

    return (
        <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-gray-900 text-gray-200">
            {/* 상단 바 */}
            <header className="flex items-center gap-1 border-b border-gray-800 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
                <button onClick={handleClose} aria-label="닫기" className="rounded-full p-2 hover:bg-gray-800">
                    <FiX size={22} />
                </button>
                <span className="flex-1 font-semibold">{memo ? '메모 수정' : '새 메모'}</span>
                <button
                    onClick={() => setIsFavorite(v => !v)}
                    aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                    aria-pressed={isFavorite}
                    className={`rounded-full p-2 hover:bg-gray-800 ${isFavorite ? 'text-amber-400' : 'text-gray-400'}`}
                >
                    <FiStar size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || uploading}
                    className="ml-1 rounded-full bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                    {saving ? '저장 중…' : uploading ? '사진 추가 중…' : '저장'}
                </button>
            </header>

            {/* 제목 · 카테고리 · 태그 */}
            <div className="space-y-2 border-b border-gray-800 px-3 py-2">
                <div className="flex items-center gap-2">
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="제목 (비우면 첫 줄로 자동 생성)"
                        className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-gray-600"
                        enterKeyHint="next"
                    />
                    <button
                        onClick={() => setShowMeta(v => !v)}
                        aria-expanded={showMeta}
                        className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300"
                    >
                        <span className="truncate">{metaSummary}</span>
                        <FiChevronDown className={`shrink-0 transition-transform ${showMeta ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {showMeta && (
                    <div className="space-y-2 pb-1">
                        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {chipCategories.map(name => (
                                <button
                                    key={name}
                                    onClick={() => pickCategory(name)}
                                    className={`shrink-0 rounded-full px-3 py-1 text-sm ${
                                        category === name ? `${categoryChip(name)} ring-2 ring-emerald-400` : 'bg-gray-800 text-gray-400'
                                    }`}
                                >
                                    {findPreset(name)?.icon} {name}
                                </button>
                            ))}
                            <input
                                value={customCategory}
                                onChange={e => {
                                    setCustomCategory(e.target.value);
                                    setCategory(e.target.value);
                                }}
                                placeholder="+ 새 카테고리"
                                className="w-32 shrink-0 rounded-full bg-gray-800 px-3 py-1 text-base outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-400 sm:text-sm"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {tags.map(t => (
                                <span key={t} className="flex items-center gap-1 rounded-full bg-indigo-900/60 py-0.5 pl-2.5 pr-1 text-sm text-indigo-200">
                                    #{t}
                                    <button onClick={() => setTags(tags.filter(x => x !== t))} aria-label={`${t} 태그 삭제`} className="rounded-full p-0.5 hover:bg-indigo-800">
                                        <FiX size={14} />
                                    </button>
                                </span>
                            ))}
                            <input
                                value={tagInput}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (/[,\s]$/.test(v)) addTag(v);
                                    else setTagInput(v);
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag(tagInput);
                                    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                                        setTags(tags.slice(0, -1));
                                    }
                                }}
                                onBlur={() => tagInput && addTag(tagInput)}
                                placeholder="#태그 입력 후 띄어쓰기"
                                enterKeyHint="done"
                                className="min-w-[8rem] flex-1 bg-transparent py-1 text-base outline-none placeholder:text-gray-500 sm:text-sm"
                            />
                        </div>

                        {tagSuggestions.length > 0 && (
                            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {tagSuggestions.map(t => (
                                    <button
                                        key={t}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => addTag(t)}
                                        className="shrink-0 rounded-full border border-gray-700 px-2.5 py-0.5 text-sm text-gray-400"
                                    >
                                        #{t}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 편집 도구 */}
            <div className="flex items-center gap-1 border-b border-gray-800 px-1 py-1">
                <div className="flex flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {tools.map(t => (
                        <button
                            key={t.label}
                            onMouseDown={e => e.preventDefault()} // 키보드가 닫히지 않도록 포커스 유지
                            onClick={t.action}
                            aria-label={t.label}
                            title={t.label}
                            className="shrink-0 rounded-lg p-2.5 text-gray-300 hover:bg-gray-800 active:bg-gray-700"
                        >
                            {t.icon}
                        </button>
                    ))}
                </div>
                <div className="flex shrink-0 rounded-lg bg-gray-800 p-0.5">
                    {views.map(v => (
                        <button
                            key={v.mode}
                            onClick={() => changeView(v.mode)}
                            aria-label={v.label}
                            aria-pressed={view === v.mode}
                            title={v.label}
                            className={`rounded-md p-2 ${view === v.mode ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
                        >
                            {v.icon}
                        </button>
                    ))}
                </div>
            </div>

            {/* 본문: 편집 / 미리보기 */}
            <div className={`flex min-h-0 flex-1 ${view === 'split' ? 'flex-col md:flex-row' : ''}`}>
                {view !== 'preview' && (
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        onPaste={handlePaste}
                        placeholder={'마크다운으로 작성하세요.\n예) ## 오늘 한 일\n- [ ] 보고서 초안'}
                        className={`min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-base leading-relaxed outline-none placeholder:text-gray-600 ${
                            view === 'split' ? 'border-b border-gray-800 md:border-b-0 md:border-r' : ''
                        }`}
                    />
                )}
                {view !== 'edit' && (
                    <div className={`min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ${view === 'split' ? 'bg-gray-950/40' : ''}`}>
                        {content.trim() ? <MarkdownView content={content} /> : <p className="text-sm text-gray-600">작성한 내용이 여기에 보입니다.</p>}
                    </div>
                )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
            {showHelp && <MarkdownHelp onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default MemoEditor;
