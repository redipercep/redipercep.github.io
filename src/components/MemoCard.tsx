import React, {useEffect, useMemo, useState} from 'react';
import {FiCopy, FiEdit2, FiMessageCircle, FiStar, FiTrash2} from 'react-icons/fi';
import type {Memo} from '../types/memo';
import {formatDate} from '../utils/format';
import {categoryChip, categoryIcon} from '../utils/presets';
import MarkdownView from './MarkdownView';
import MemoComments from './MemoComments';
import TodoView from './TodoView';
import {todoStats} from '../utils/todo';

interface Props {
    memo: Memo;
    highlight?: boolean;
    activeTag: string | null;
    onEdit: (memo: Memo) => void;
    onDelete: (memo: Memo) => void;
    onToggleFavorite: (memo: Memo) => void;
    onTagClick: (tag: string) => void;
    onCategoryClick: (category: string) => void;
    onAddComment: (memo: Memo, content: string) => Promise<void>;
    onEditComment: (memo: Memo, commentId: string, content: string) => Promise<void>;
    onDeleteComment: (memo: Memo, commentId: string) => Promise<void>;
    onUpdateContent: (memo: Memo, content: string) => void;
    onCopyReport: (memo: Memo) => void;
    backlinks?: {todo: Memo; text: string}[];   // 이 메모가 연결된 할일 항목
    onOpenTodo?: (todoId: number) => void;
}

const MemoCard: React.FC<Props> = ({
    memo, highlight, activeTag, onEdit, onDelete, onToggleFavorite, onTagClick, onCategoryClick,
    onAddComment, onEditComment, onDeleteComment, onUpdateContent, onCopyReport, backlinks = [], onOpenTodo,
}) => {
    const isTodo = memo.kind === 'todo';
    const stats = useMemo(() => (isTodo ? todoStats(memo.content) : null), [isTodo, memo.content]);
    const [expanded, setExpanded] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const isLong = isTodo
        ? memo.content.split('\n').length > 20
        : memo.content.length > 220 || memo.content.split('\n').length > 8 || memo.imageIds.length > 0;
    const collapsed = isLong && !expanded;
    const edited = memo.updatedAt.slice(0, 16) !== memo.createdAt.slice(0, 16);

    useEffect(() => {
        if (highlight) setExpanded(true);
    }, [highlight]);

    return (
        <article
            id={`memo-${memo.id}`}
            className={`scroll-mt-48 rounded-xl bg-gray-800 p-4 ring-1 transition-shadow ${highlight ? 'ring-2 ring-emerald-400' : 'ring-gray-700/60'}`}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {memo.category && (
                        <button
                            onClick={() => onCategoryClick(memo.category)}
                            className={`mb-1 rounded-full px-2 py-0.5 text-xs ${categoryChip(memo.category)}`}
                        >
                            {categoryIcon(memo.category)} {memo.category}
                        </button>
                    )}
                    <h2 className="break-words text-base font-semibold leading-snug text-gray-50">{memo.title}</h2>
                    {stats && stats.total > 0 && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-700">
                                <div className="h-full rounded-full bg-emerald-500" style={{width: `${(stats.done / stats.total) * 100}%`}} />
                            </div>
                            <span>완료 {stats.done}/{stats.total}</span>
                            {stats.progress > 0 && <span className="text-sky-400">진행 {stats.progress}</span>}
                            {stats.overdue > 0 && <span className="font-medium text-red-400">마감 지남 {stats.overdue}</span>}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onToggleFavorite(memo)}
                    aria-label={memo.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                    aria-pressed={memo.isFavorite}
                    className={`-mr-2 -mt-1 rounded-full p-2 ${memo.isFavorite ? 'text-amber-400' : 'text-gray-500'}`}
                >
                    <FiStar size={20} fill={memo.isFavorite ? 'currentColor' : 'none'} />
                </button>
            </div>

            {memo.content.trim() && (
                <div className={`relative mt-2 ${collapsed ? 'max-h-48 overflow-hidden' : ''}`}>
                    {isTodo ? <TodoView content={memo.content} owner={memo} onChange={c => onUpdateContent(memo, c)} /> : <MarkdownView content={memo.content} />}
                    {collapsed && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-gray-800 to-transparent" />}
                </div>
            )}
            {isLong && (
                <button onClick={() => setExpanded(v => !v)} className="mt-1 py-1 text-sm font-medium text-emerald-400">
                    {expanded ? '접기' : '전체 보기'}
                </button>
            )}

            {backlinks.length > 0 && (
                <div className="mt-3 space-y-1">
                    <div className="text-xs text-gray-500">연결된 할일</div>
                    {backlinks.slice(0, 3).map(b => (
                        <button
                            key={`${b.todo.id}-${b.text}`}
                            onClick={() => b.todo.id != null && onOpenTodo?.(b.todo.id)}
                            className="flex w-full items-center gap-2 rounded-lg bg-gray-900/60 px-3 py-2 text-left text-sm hover:bg-gray-900"
                        >
                            <span className="min-w-0 flex-1 truncate text-gray-200">☑️ {b.text}</span>
                            <span className="max-w-[45%] shrink-0 truncate text-xs text-gray-500">{b.todo.title}</span>
                        </button>
                    ))}
                    {backlinks.length > 3 && <div className="text-xs text-gray-500">외 {backlinks.length - 3}개</div>}
                </div>
            )}

            {memo.hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {memo.hashtags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => onTagClick(tag)}
                            className={`rounded-full px-2 py-0.5 text-sm ${
                                activeTag === tag ? 'bg-indigo-500 text-white' : 'bg-indigo-900/50 text-indigo-200'
                            }`}
                        >
                            #{tag}
                        </button>
                    ))}
                </div>
            )}

            <footer className="mt-3 flex items-center gap-2 border-t border-gray-700/60 pt-2 text-xs text-gray-500">
                <div className="min-w-0 flex-1 leading-relaxed">
                    <div>작성 {formatDate(memo.createdAt)}</div>
                    {edited && <div>수정 {formatDate(memo.updatedAt)}</div>}
                </div>
                <button
                    onClick={() => setShowComments(v => !v)}
                    aria-expanded={showComments}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm ${showComments ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    <FiMessageCircle size={16} /> 댓글 {memo.comments.length || ''}
                </button>
                {isTodo && (
                    <button onClick={() => onCopyReport(memo)} aria-label="보고용 텍스트 복사" title="보고용 텍스트 복사" className="rounded-full p-2 text-gray-400 hover:bg-gray-700">
                        <FiCopy size={17} />
                    </button>
                )}
                <button onClick={() => onEdit(memo)} aria-label="수정" className="rounded-full p-2 text-gray-400 hover:bg-gray-700">
                    <FiEdit2 size={17} />
                </button>
                <button onClick={() => onDelete(memo)} aria-label="삭제" className="-mr-2 rounded-full p-2 text-gray-400 hover:bg-gray-700 hover:text-red-400">
                    <FiTrash2 size={17} />
                </button>
            </footer>

            {showComments && (
                <MemoComments
                    comments={memo.comments}
                    onAdd={content => onAddComment(memo, content)}
                    onEdit={(id, content) => onEditComment(memo, id, content)}
                    onDelete={id => onDeleteComment(memo, id)}
                />
            )}
        </article>
    );
};

export default MemoCard;
