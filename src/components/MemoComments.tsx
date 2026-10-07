import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {FiChevronLeft, FiChevronRight, FiEdit2, FiSend, FiTrash2} from 'react-icons/fi';
import type {MemoComment} from '../types/memo';
import {formatDate} from '../utils/format';
import MarkdownView from './MarkdownView';

interface Props {
    comments: MemoComment[];
    onAdd: (content: string) => Promise<void>;
    onEdit: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
}

/** 내용에 맞춰 높이가 늘어나는 입력창 */
const AutoTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = props => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [props.value]);
    return <textarea ref={ref} rows={1} {...props} />;
};

const inputClass =
    'min-w-0 flex-1 resize-none rounded-lg bg-gray-900 px-3 py-2 text-base leading-relaxed text-gray-200 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-500 sm:text-sm';

const PAGE_SIZE = 5;

/** 페이지 번호: 현재 페이지 주변으로 최대 5개 */
const Pager: React.FC<{page: number; count: number; onPage: (p: number) => void}> = ({page, count, onPage}) => {
    const start = Math.max(0, Math.min(page - 2, count - 5));
    const pages = Array.from({length: Math.min(5, count)}, (_, i) => start + i);
    const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm';
    return (
        <nav aria-label="댓글 페이지" className="flex items-center gap-0.5">
            <button onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="최신 댓글 쪽으로" className={`${btn} text-gray-400 hover:bg-gray-700 disabled:opacity-30`}>
                <FiChevronLeft />
            </button>
            {pages.map(p => (
                <button
                    key={p}
                    onClick={() => onPage(p)}
                    aria-label={`${p + 1}페이지`}
                    aria-current={p === page ? 'page' : undefined}
                    className={`${btn} ${p === page ? 'bg-gray-600 font-semibold text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    {p + 1}
                </button>
            ))}
            <button onClick={() => onPage(page + 1)} disabled={page >= count - 1} aria-label="이전 댓글 쪽으로" className={`${btn} text-gray-400 hover:bg-gray-700 disabled:opacity-30`}>
                <FiChevronRight />
            </button>
        </nav>
    );
};

const MemoComments: React.FC<Props> = ({comments, onAdd, onEdit, onDelete}) => {
    // 최신 댓글이 위로
    const sorted = useMemo(() => [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [comments]);
    const [paging, setPaging] = useState(false); // 더보기를 눌러 페이지 이동 중
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const current = paging ? Math.min(page, pageCount - 1) : 0; // 삭제로 페이지가 줄어도 범위 안으로
    const shown = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
    const showPager = paging && pageCount > 1;

    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const text = draft.trim();
        if (!text || busy) return;
        setBusy(true);
        await onAdd(text);
        setDraft('');
        setPage(0); // 새 댓글이 보이도록 첫 페이지로
        setBusy(false);
    };

    const saveEdit = async () => {
        const text = editDraft.trim();
        if (!editingId || !text || busy) return;
        setBusy(true);
        await onEdit(editingId, text);
        setEditingId(null);
        setBusy(false);
    };

    // PC에서는 Ctrl/Cmd + Enter로 등록, 모바일에서는 버튼으로 등록
    const submitOnShortcut = (fn: () => void) => (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            fn();
        }
    };

    return (
        <div className="mt-2 space-y-2">
            <div className="flex items-end gap-2">
                <AutoTextarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={submitOnShortcut(submit)}
                    placeholder={comments.length ? '댓글 추가' : '진행 상황이나 덧붙일 생각을 남겨 보세요'}
                    aria-label="댓글 입력"
                    className={inputClass}
                />
                <button
                    onClick={submit}
                    disabled={!draft.trim() || busy}
                    aria-label="댓글 등록"
                    className="shrink-0 rounded-lg bg-emerald-600 p-2.5 text-white disabled:opacity-40"
                >
                    <FiSend size={18} />
                </button>
            </div>

            {shown.map(c =>
                editingId === c.id ? (
                    <div key={c.id} className="space-y-2 rounded-lg bg-gray-900/60 p-2">
                        <AutoTextarea
                            value={editDraft}
                            onChange={e => setEditDraft(e.target.value)}
                            onKeyDown={submitOnShortcut(saveEdit)}
                            autoFocus
                            className={`${inputClass} w-full`}
                        />
                        <div className="flex justify-end gap-2 text-sm">
                            <button onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1.5 text-gray-400 hover:bg-gray-700">
                                취소
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={!editDraft.trim() || busy}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                            >
                                수정 저장
                            </button>
                        </div>
                    </div>
                ) : (
                    <div key={c.id} className="rounded-lg bg-gray-900/60 px-3 pb-1 pt-2 [&_p:last-child]:mb-0">
                        <MarkdownView content={c.content} />
                        <div className="mt-1 flex items-center text-xs text-gray-500">
                            <span className="flex-1">
                                {formatDate(c.createdAt)}
                                {c.updatedAt.slice(0, 16) !== c.createdAt.slice(0, 16) && ' (수정됨)'}
                            </span>
                            <button
                                onClick={() => {
                                    setEditingId(c.id);
                                    setEditDraft(c.content);
                                }}
                                aria-label="댓글 수정"
                                className="rounded-full p-2 text-gray-400 hover:bg-gray-700"
                            >
                                <FiEdit2 size={14} />
                            </button>
                            <button
                                onClick={() => onDelete(c.id)}
                                aria-label="댓글 삭제"
                                className="-mr-2 rounded-full p-2 text-gray-400 hover:bg-gray-700 hover:text-red-400"
                            >
                                <FiTrash2 size={14} />
                            </button>
                        </div>
                    </div>
                ),
            )}

            {!paging && sorted.length > PAGE_SIZE && (
                <button
                    onClick={() => {
                        setPaging(true);
                        setPage(1);
                    }}
                    className="w-full rounded-lg py-2 text-sm text-gray-400 hover:bg-gray-700/60"
                >
                    이전 댓글 {sorted.length - PAGE_SIZE}개 더보기
                </button>
            )}

            {showPager && (
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={() => {
                            setPaging(false);
                            setPage(0);
                        }}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-700"
                    >
                        접기
                    </button>
                    <span className="hidden text-xs text-gray-500 min-[400px]:inline">
                        {current * PAGE_SIZE + 1}–{Math.min(sorted.length, current * PAGE_SIZE + PAGE_SIZE)} / {sorted.length}
                    </span>
                    <Pager page={current} count={pageCount} onPage={p => setPage(Math.max(0, Math.min(pageCount - 1, p)))} />
                </div>
            )}
        </div>
    );
};

export default MemoComments;
