import React, {useEffect, useMemo, useState} from 'react';
import {FiEdit2, FiLink, FiSend, FiTrash2} from 'react-icons/fi';
import type {MemoComment} from '../types/memo';
import {formatDate} from '../utils/format';
import CommentInput from './CommentInput';
import MarkdownView from './MarkdownView';
import Pager from './Pager';

interface Props {
    comments: MemoComment[];
    onAdd: (content: string) => Promise<void>;
    onEdit: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    pageSize?: number;      // 한 번에 보이는 댓글 수 (설정)
    focusId?: string;       // 링크로 열었을 때 보여줄 댓글
    ownerUid?: string;      // 이 댓글이 달린 글 (글 연결에서 자기 자신 제외)
    onCopyLink?: (commentId: string) => void;
}

const MemoComments: React.FC<Props> = ({comments, onAdd, onEdit, onDelete, pageSize: PAGE_SIZE = 5, focusId, ownerUid, onCopyLink}) => {
    // 최신 댓글이 위로
    const sorted = useMemo(() => [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [comments]);
    const [paging, setPaging] = useState(false); // 더보기를 눌러 페이지 이동 중
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const current = paging ? Math.min(page, pageCount - 1) : 0; // 삭제로 페이지가 줄어도 범위 안으로
    const shown = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
    const showPager = paging && pageCount > 1;

    // 링크로 특정 댓글을 열면: 그 댓글이 있는 페이지로 넘기고 강조
    useEffect(() => {
        if (!focusId) return;
        const idx = sorted.findIndex(c => c.id === focusId);
        if (idx < 0) return;
        const p = Math.floor(idx / PAGE_SIZE);
        setPaging(p > 0);
        setPage(p);
        const t = setTimeout(() => document.getElementById(`comment-${focusId}`)?.scrollIntoView({behavior: 'smooth', block: 'center'}), 80);
        return () => clearTimeout(t);
    }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    return (
        <div className="mt-2 space-y-2">
            <CommentInput
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                placeholder={comments.length ? '댓글 추가' : '진행 상황이나 덧붙일 생각을 남겨 보세요'}
                label="댓글 입력"
                ownerUid={ownerUid}
                trailing={
                    <button
                        onClick={submit}
                        disabled={!draft.trim() || busy}
                        aria-label="댓글 등록"
                        className="shrink-0 rounded-lg bg-emerald-600 p-2.5 text-white disabled:opacity-40"
                    >
                        <FiSend size={18} />
                    </button>
                }
            />

            {shown.map(c =>
                editingId === c.id ? (
                    <div key={c.id} className="space-y-2 rounded-lg bg-gray-900/60 p-2">
                        <CommentInput
                            value={editDraft}
                            onChange={setEditDraft}
                            onSubmit={saveEdit}
                            label="댓글 수정"
                            autoFocus
                            alwaysShowTools
                            ownerUid={ownerUid}
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
                    <div
                        key={c.id}
                        id={`comment-${c.id}`}
                        className={`scroll-mt-24 rounded-lg px-3 pb-1 pt-2 [&_p:last-child]:mb-0 ${c.id === focusId ? 'bg-violet-950/70 ring-1 ring-violet-500' : 'bg-gray-900/60'}`}
                    >
                        <MarkdownView content={c.content} />
                        <div className="mt-1 flex items-center text-xs text-gray-500">
                            <span className="flex-1">
                                {formatDate(c.createdAt)}
                                {c.updatedAt.slice(0, 16) !== c.createdAt.slice(0, 16) && ' (수정됨)'}
                            </span>
                            {onCopyLink && (
                                <button onClick={() => onCopyLink(c.id)} aria-label="댓글 링크 복사" title="링크 복사" className="rounded-full p-2 text-gray-400 hover:bg-gray-700">
                                    <FiLink size={14} />
                                </button>
                            )}
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
                    <Pager label="댓글 페이지" page={current} count={pageCount} onPage={setPage} />
                </div>
            )}
        </div>
    );
};

export default MemoComments;
