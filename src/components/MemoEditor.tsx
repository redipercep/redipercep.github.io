import React, {useContext, useEffect, useRef, useState} from 'react';
import {FaHeading, FaQuoteLeft} from 'react-icons/fa';
import {MdFormatIndentDecrease, MdFormatIndentIncrease} from 'react-icons/md';
import {
    FiBold, FiCheckSquare, FiChevronDown, FiCode, FiColumns, FiEdit3, FiEye,
    FiFolder, FiHelpCircle, FiImage, FiItalic, FiLink, FiLink2, FiList, FiStar, FiX,
} from 'react-icons/fi';
import {addImage, deleteImages} from '../db/memoDB';
import type {Memo, MemoKind} from '../types/memo';
import {deriveTitle, newId} from '../utils/format';
import {extractImageIds, IMG_PROTOCOL, prepareImage, releaseImageUrls} from '../utils/image';
import {normalizePath, pathLabel} from '../utils/folders';
import {categoryChip, categoryIcon, DAILY, findPreset, isDaily, isTemplate, presetsFor} from '../utils/presets';
import type {IndentKeys} from '../utils/settings';
import {currentLine, isListLine, replaceWithUndo, shiftLines} from '../utils/textEdit';
import {dailyTitle, normalizeTodo, removeCompleted, todayStr} from '../utils/todo';
import FolderPicker from './FolderPicker';
import MarkdownHelp from './MarkdownHelp';
import MarkdownView from './MarkdownView';
import {MemoLinkContext} from './MemoLinkContext';
import RefPicker from './RefPicker';
import TodoView from './TodoView';

type ViewMode = 'edit' | 'split' | 'preview';

interface Props {
    memo: Memo | null;          // null이면 새 글
    kind: MemoKind;
    preset?: string;            // 새 글을 프리셋 카테고리로 시작
    latestDaily?: Memo | null;  // 가장 최근 일일업무 (새 일일업무의 바탕)
    initialTitle?: string;      // 새 글의 기본 제목 (할일에서 메모를 만들 때)
    linkNote?: string;          // 저장 시 연결될 할일 안내
    initialFolder?: string;     // 새 글의 기본 폴더 (지금 보고 있는 폴더)
    folders: string[];          // 고를 수 있는 전체 폴더
    frequentFolders: string[];  // 자주 쓰는 폴더 (빠른 선택)
    allTags: string[];
    indentKeys?: IndentKeys;    // 들여쓰기 단축키 (설정)
    /** close=false: Ctrl+S — 저장 후 계속 편집. 저장된 글(새 id 포함)을 돌려준다 */
    onSave: (memo: Memo, removedImageIds: string[], opts: {close: boolean}) => Promise<Memo>;
    onClose: () => void;
}

const time = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const VIEW_KEY = 'memo.editorView';
const normalizeTag = (t: string) => t.trim().replace(/^#+/, '').replace(/[,\s]+/g, '');

const MemoEditor: React.FC<Props> = ({memo, kind, preset, latestDaily, initialTitle, linkNote, initialFolder, folders, frequentFolders, allTags, indentKeys = 'both', onSave, onClose}) => {
    const isTodo = kind === 'todo';
    const presetInfo = preset ? findPreset(preset, kind) : undefined;
    // 새 일일업무: 오늘 날짜 제목 + 가장 최근 일일업무 내용을 이어받음
    const dailyInit = isTodo && !memo && preset === DAILY;
    // 변경 여부를 판단하는 기준. Ctrl+S로 저장할 때마다 새로 맞춘다
    const initialRef = useRef({
        title: memo?.title ?? initialTitle ?? (dailyInit ? dailyTitle() : ''),
        category: memo?.category ?? preset ?? initialFolder ?? '',
        content: memo?.content ?? (dailyInit && latestDaily ? latestDaily.content : presetInfo?.template ?? ''),
        tags: memo?.hashtags ?? [],
        isFavorite: memo?.isFavorite ?? false,
    });
    const initial = initialRef.current;
    // 마지막으로 저장된 글 (새 글은 첫 저장 뒤 id가 생긴다)
    const [base, setBase] = useState<Memo | null>(memo);
    const [savedAt, setSavedAt] = useState<string | null>(null);

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
    const [carriedFrom, setCarriedFrom] = useState<string | null>(dailyInit && latestDaily ? latestDaily.title : null);
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);
    const [refPickerOpen, setRefPickerOpen] = useState(false);
    const linkApi = useContext(MemoLinkContext);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const sessionImageIds = useRef<string[]>([]); // 이번 편집에서 새로 올린 이미지
    const escPressed = useRef(false);             // Esc 다음 Tab은 원래대로 다음 칸으로 이동
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // 빠른 선택: 기본 폴더(템플릿) + 자주 쓰는 폴더
    const quickFolders = [...new Set([...presetsFor(kind).map(p => p.name), ...frequentFolders])].slice(0, 10);

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
        JSON.stringify({title, category, content, tags, isFavorite}) !== JSON.stringify(initialRef.current) ||
        tagInput.trim() !== '' || sessionImageIds.current.some(id => !base?.imageIds.includes(id));

    // ─── 본문 편집 도우미 ──────────────────────────────
    /** 본문을 바꾼다. 편집창이 보이면 브라우저 입력으로 넣어 Ctrl+Z 되돌리기가 유지되게 한다 */
    const replaceContent = (next: string, selStart?: number, selEnd?: number) => {
        const el = textareaRef.current;
        if (!el || !replaceWithUndo(el, next)) setContent(next);
        if (selStart === undefined) return;
        requestAnimationFrame(() => {
            const t = textareaRef.current;
            if (!t) return;
            t.focus();
            t.setSelectionRange(selStart, selEnd ?? selStart);
        });
    };

    const applyEdit = (fn: (text: string, start: number, end: number) => {text: string; selStart: number; selEnd: number} | null) => {
        const ta = textareaRef.current;
        const cur = ta ? ta.value : content;
        const start = ta?.selectionStart ?? cur.length;
        const end = ta?.selectionEnd ?? cur.length;
        const r = fn(cur, start, end);
        if (r) replaceContent(r.text, r.selStart, r.selEnd);
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

    // 하위 항목까지 함께 한 단계 들여쓰기 / 내어쓰기
    const indent = () => applyEdit((t, s, e) => shiftLines(t, s, e, 1));
    const outdent = () => applyEdit((t, s, e) => shiftLines(t, s, e, -1));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return; // 한글 조합 중에는 건드리지 않음
        const ta = e.currentTarget;

        // Esc → 다음 Tab은 편집창 밖으로 이동 (키보드 사용자가 갇히지 않도록)
        if (e.key === 'Escape') {
            escPressed.current = true;
            return;
        }
        const afterEsc = escPressed.current;
        escPressed.current = false;

        // Tab / Shift+Tab: 들여쓰기 · 내어쓰기
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && (indentKeys === 'tab' || indentKeys === 'both') && !afterEsc) {
            e.preventDefault();
            if (e.shiftKey) outdent();
            else indent();
            return;
        }
        // Ctrl+→ / Ctrl+←: 목록 줄에서만 (일반 문장에서는 단어 단위 이동 그대로)
        if (
            (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey &&
            (indentKeys === 'ctrl' || indentKeys === 'both') && isListLine(currentLine(ta.value, ta.selectionStart))
        ) {
            e.preventDefault();
            if (e.key === 'ArrowRight') indent();
            else outdent();
            return;
        }

        /** 목록 줄에서 줄바꿈하면 같은 들여쓰기로 다음 항목을 이어준다. 빈 항목에서 누르면 목록 종료 */
        if (e.key !== 'Enter' || e.shiftKey) return;
        const pos = ta.selectionStart;
        if (pos !== ta.selectionEnd) return;
        const ls = ta.value.lastIndexOf('\n', pos - 1) + 1;
        const before = ta.value.slice(ls, pos);
        const m = /^([ \t]*)(?:([-*+])|(\d+)([.)]))[ \t]+(\[[ xX/-]\][ \t]*)?/.exec(before);
        if (!m) return;
        e.preventDefault();
        if (!before.slice(m[0].length).trim()) {
            applyEdit(t => ({text: t.slice(0, ls) + t.slice(pos), selStart: ls, selEnd: ls}));
            return;
        }
        const bullet = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
        const box = m[5] || isTodo ? '[ ] ' : '';
        const snippet = `\n${m[1]}${bullet} ${box}`;
        applyEdit(t => ({text: t.slice(0, pos) + snippet + t.slice(pos), selStart: pos + snippet.length, selEnd: pos + snippet.length}));
    };

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
    const pickCategory = (name: string, toggle = true) => {
        const next = toggle && category === name ? '' : normalizePath(name);
        setCategory(next);
        if (!isTemplate(content, kind)) return; // 이미 작성한 내용은 건드리지 않음
        if (isTodo && !memo && isDaily(next)) {
            if (!title.trim()) setTitle(dailyTitle());
            replaceContent(latestDaily?.content ?? findPreset(DAILY, kind)?.template ?? '');
            setCarriedFrom(latestDaily?.title ?? null);
            return;
        }
        const template = findPreset(next, kind)?.template;
        if (template) replaceContent(template);
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
    /** 이미지 정리: 이번 편집에서 다룬 이미지 중 최종 본문에 없는 것 */
    const unusedImages = (keep: string[]) =>
        [...new Set([...(memo?.imageIds ?? []), ...(base?.imageIds ?? []), ...sessionImageIds.current])].filter(id => !keep.includes(id));

    const handleSave = async (close = true) => {
        if (saving || uploading) return;
        if (!title.trim() && !content.trim()) {
            alert('제목이나 내용을 입력하세요.');
            return;
        }
        const now = new Date().toISOString();
        const finalContent = isTodo ? normalizeTodo(content, todayStr()) : content;
        const imageIds = extractImageIds(finalContent);
        const pendingTag = normalizeTag(tagInput);
        const finalTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
        const finalTitle = title.trim() || (isTodo && isDaily(category) ? dailyTitle() : deriveTitle(finalContent));
        const next: Memo = {
            ...(base ?? {}),  // 숨김·잠금 등 편집기에서 다루지 않는 값은 그대로 유지
            id: base?.id,
            uid: base?.uid ?? newId(),
            kind,
            title: finalTitle,
            category: normalizePath(category),
            content: finalContent,
            hashtags: finalTags,
            imageIds,
            isFavorite,
            comments: base?.comments ?? [],
            createdAt: base?.createdAt ?? now,
            updatedAt: now,
        };
        // 계속 편집할 때는 이미지를 지우지 않는다 (되돌리기로 다시 살릴 수 있으므로). 닫을 때 정리
        const removed = close ? unusedImages(imageIds) : [];
        setSaving(true);
        try {
            const saved = await onSave(next, removed, {close});
            if (close) return;
            // 계속 편집: 저장된 내용을 새 기준으로
            setBase(saved);
            if (finalContent !== content) {
                const ta = textareaRef.current;
                replaceContent(finalContent, ta?.selectionStart, ta?.selectionEnd);
            }
            if (finalTitle !== title) setTitle(finalTitle);
            if (finalTags !== tags) {
                setTags(finalTags);
                setTagInput('');
            }
            setCarriedFrom(null);
            initialRef.current = {title: finalTitle, category: next.category, content: finalContent, tags: finalTags, isFavorite};
            setSavedAt(time());
            setSaving(false);
        } catch {
            alert('저장하지 못했습니다.');
            setSaving(false);
        }
    };

    // Ctrl+S (맥은 Cmd+S): 저장하고 계속 편집. 한글 입력 상태에서도 동작하도록 e.code로 판단
    const saveRef = useRef(handleSave);
    saveRef.current = handleSave;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
                e.preventDefault(); // 브라우저의 '페이지 저장' 창 막기
                if (!e.repeat) saveRef.current(false);
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, []);

    const handleClose = async () => {
        if (isDirty() && !window.confirm('저장하지 않은 내용이 있습니다. 닫을까요?')) return;
        // 마지막 저장본에 없는 이미지 정리 (저장 없이 닫으면 이번에 올린 이미지가 대상)
        const orphan = unusedImages(base?.imageIds ?? []);
        if (orphan.length) {
            await deleteImages(orphan);
            releaseImageUrls(orphan);
        }
        onClose();
    };

    // ─── 화면 ────────────────────────────────────────
    const listTools = [
        {label: isTodo ? '할일 추가' : '체크리스트', icon: <FiCheckSquare />, action: () => (isTodo ? insertBlock('- [ ] ') : prefixLine('- [ ] '))},
        {label: '들여쓰기(하위 항목)', icon: <MdFormatIndentIncrease size={18} />, action: indent},
        {label: '내어쓰기', icon: <MdFormatIndentDecrease size={18} />, action: outdent},
    ];
    const tools: {label: string; icon: React.ReactNode; action: () => void}[] = [
        ...(isTodo ? listTools : []),
        {label: '제목', icon: <FaHeading size={14} />, action: () => prefixLine('## ')},
        {label: '굵게', icon: <FiBold />, action: () => wrap('**')},
        {label: '기울임', icon: <FiItalic />, action: () => wrap('*')},
        {label: '목록', icon: <FiList />, action: () => prefixLine('- ')},
        ...(isTodo ? [] : listTools),
        {label: '인용', icon: <FaQuoteLeft size={13} />, action: () => prefixLine('> ')},
        {label: '코드', icon: <FiCode />, action: () => wrap('`')},
        {label: '링크', icon: <FiLink />, action: () => wrap('[', '](https://)', '링크 이름')},
        ...(linkApi?.showLinkButton ? [{label: '글 연결 (다른 글·댓글·이미지)', icon: <FiLink2 />, action: () => setRefPickerOpen(true)}] : []),
        {label: '사진 추가', icon: <FiImage />, action: () => fileRef.current?.click()},
        {label: '작성법 도움말', icon: <FiHelpCircle />, action: () => setShowHelp(true)},
    ];

    const views: {mode: ViewMode; label: string; icon: React.ReactNode}[] = [
        {mode: 'edit', label: '편집만', icon: <FiEdit3 />},
        {mode: 'split', label: '편집과 미리보기', icon: <FiColumns />},
        {mode: 'preview', label: '미리보기만', icon: <FiEye />},
    ];

    const metaSummary = [category && `📁 ${pathLabel(category)}`, ...tags.map(t => `#${t}`)].filter(Boolean).join(' ') || '폴더 · 태그';

    return (
        <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-gray-900 text-gray-200">
            {/* 상단 바 */}
            <header className="flex items-center gap-1 border-b border-gray-800 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
                <button onClick={handleClose} aria-label="닫기" className="rounded-full p-2 hover:bg-gray-800">
                    <FiX size={22} />
                </button>
                <span className="min-w-0 flex-1 truncate font-semibold">
                    {isTodo ? (base ? '할일 수정' : '새 할일') : base ? '메모 수정' : '새 메모'}
                    {savedAt && <span className="ml-2 text-xs font-normal text-emerald-400">{savedAt} 저장됨</span>}
                </span>
                <button
                    onClick={() => setIsFavorite(v => !v)}
                    aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                    aria-pressed={isFavorite}
                    className={`rounded-full p-2 hover:bg-gray-800 ${isFavorite ? 'text-amber-400' : 'text-gray-400'}`}
                >
                    <FiStar size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                    onClick={() => handleSave(true)}
                    title="저장하고 닫기 (Ctrl+S: 저장하고 계속 편집)"
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
                            <button
                                onClick={() => setFolderPickerOpen(true)}
                                className={`flex max-w-[60%] shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ${
                                    category ? `${categoryChip(category)} ring-emerald-400` : 'bg-gray-800 text-gray-300 ring-gray-600'
                                }`}
                            >
                                <FiFolder className="shrink-0" />
                                <span className="truncate">{category ? pathLabel(category) : '폴더 선택'}</span>
                                <FiChevronDown className="shrink-0" />
                            </button>
                            {quickFolders.filter(f => f !== category).map(name => (
                                <button
                                    key={name}
                                    onClick={() => pickCategory(name)}
                                    className="shrink-0 rounded-full bg-gray-800 px-3 py-1 text-sm text-gray-400"
                                >
                                    {categoryIcon(name)} {pathLabel(name)}
                                </button>
                            ))}
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

            {linkNote && (
                <div className="border-b border-gray-800 bg-violet-950/50 px-3 py-1.5 text-sm text-violet-200">
                    <span className="block truncate">🔗 저장하면 할일 "{linkNote}"에 연결됩니다</span>
                </div>
            )}

            {carriedFrom && (
                <div className="flex items-center gap-2 border-b border-gray-800 bg-emerald-950/50 px-3 py-1.5 text-sm text-emerald-200">
                    <span className="min-w-0 flex-1 truncate">{carriedFrom}에서 이어받음</span>
                    <button onClick={() => setContent(removeCompleted(content))} className="shrink-0 rounded-full bg-emerald-800/70 px-3 py-1 text-xs">
                        완료 항목 빼기
                    </button>
                    <button onClick={() => setCarriedFrom(null)} aria-label="안내 닫기" className="shrink-0 p-1">
                        <FiX size={16} />
                    </button>
                </div>
            )}

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
                        onKeyDown={handleKeyDown}
                        placeholder={isTodo ? '- [ ] 할 일을 적으세요\n  - [ ] 들여쓰면 하위 항목' : '마크다운으로 작성하세요.\n예) ## 오늘 한 일\n- [ ] 보고서 초안'}
                        className={`min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-base leading-relaxed outline-none placeholder:text-gray-600 ${
                            view === 'split' ? 'border-b border-gray-800 md:border-b-0 md:border-r' : ''
                        }`}
                    />
                )}
                {view !== 'edit' && (
                    <MemoLinkContext.Provider value={linkApi && {...linkApi, interactive: false}}>
                    <div className={`min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ${view === 'split' ? 'bg-gray-950/40' : ''}`}>
                        {!content.trim() ? <p className="text-sm text-gray-600">작성한 내용이 여기에 보입니다.</p> : isTodo ? <TodoView content={content} /> : <MarkdownView content={content} />}
                        {/* 미리보기의 링크는 눌러도 열지 않는다 (편집 중인 내용을 잃지 않도록) */}
                    </div>
                    </MemoLinkContext.Provider>
                )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
            {showHelp && <MarkdownHelp kind={kind} onClose={() => setShowHelp(false)} />}
            {refPickerOpen && (
                <RefPicker
                    excludeUid={base?.uid}
                    onClose={() => setRefPickerOpen(false)}
                    onPick={md => {
                        setRefPickerOpen(false);
                        applyEdit((t, s, e) => {
                            const pad = s > 0 && !/\s$/.test(t.slice(0, s)) ? ' ' : '';
                            const at = s + pad.length + md.length;
                            return {text: t.slice(0, s) + pad + md + t.slice(e), selStart: at, selEnd: at};
                        });
                    }}
                />
            )}
            {folderPickerOpen && (
                <FolderPicker
                    title="폴더 선택"
                    folders={folders}
                    current={category}
                    confirmLabel="선택"
                    onClose={() => setFolderPickerOpen(false)}
                    onConfirm={path => {
                        setFolderPickerOpen(false);
                        pickCategory(path, false);
                    }}
                />
            )}
        </div>
    );
};

export default MemoEditor;
