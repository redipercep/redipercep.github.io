import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {MdDragIndicator} from 'react-icons/md';
import {
    FiCheck, FiCheckSquare, FiChevronRight, FiCopy, FiEdit2, FiEye, FiEyeOff, FiFileText, FiFolder, FiLink, FiLock, FiMessageCircle, FiMoreHorizontal, FiStar,
    FiTrash2, FiUnlock,
} from 'react-icons/fi';
import type {Memo} from '../types/memo';
import {formatDate} from '../utils/format';
import {pathLabel} from '../utils/folders';
import {categoryChip, categoryIcon} from '../utils/presets';
import {todoStats} from '../utils/todo';
import MarkdownView from './MarkdownView';
import MemoComments from './MemoComments';
import {MemoLinkContext} from './MemoLinkContext';
import TodoView from './TodoView';

interface Props {
    memo: Memo;
    highlight?: boolean;
    compact?: boolean;      // 간략히: 제목만 보이고 눌러서 펼침
    activeTag: string | null;
    commentPageSize?: number;
    // 선택 모드
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (memo: Memo) => void;
    // PC에서 끌어서 폴더로 옮기기
    onDragHandleStart?: (e: React.DragEvent, memo: Memo) => void;
    onEdit: (memo: Memo) => void;
    onDelete: (memo: Memo) => void;
    onMove: (memo: Memo) => void;
    onToggleHidden: (memo: Memo) => void;
    onToggleFavorite: (memo: Memo) => void;
    onTagClick: (tag: string) => void;
    onCategoryClick: (category: string) => void;
    onAddComment: (memo: Memo, content: string) => Promise<void>;
    onEditComment: (memo: Memo, commentId: string, content: string) => Promise<void>;
    onDeleteComment: (memo: Memo, commentId: string) => Promise<void>;
    onUpdateContent: (memo: Memo, content: string) => void;
    onCopyReport: (memo: Memo) => void;
    backlinks?: {todo: Memo; text: string}[];   // 이 메모가 연결된 할일 항목
    refBacklinks?: Memo[];                      // 본문·댓글에서 이 글을 링크한 글
    focusCommentId?: string;                    // 링크로 열린 댓글
    onCopyLink?: (memo: Memo, commentId?: string) => void;
    onToggleLock?: (memo: Memo) => void;        // 비밀번호로 잠그기 / 잠금 해제(보호 끄기)
    onUnlockRequest?: () => void;               // 잠긴 채 보이는 글의 '잠금 풀기'
    onOpenTodo?: (todoId: number) => void;
}

const SelectBox: React.FC<{checked: boolean; label: string; onChange: () => void}> = ({checked, label, onChange}) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
            checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-500'
        }`}
    >
        {checked && <FiCheck size={14} strokeWidth={3} />}
    </button>
);

const MemoCard: React.FC<Props> = ({
    memo, highlight, compact = false, activeTag, commentPageSize, selectable, selected = false, onToggleSelect, onDragHandleStart,
    onEdit, onDelete, onMove, onToggleHidden, onToggleFavorite, onTagClick, onCategoryClick,
    onAddComment, onEditComment, onDeleteComment, onUpdateContent, onCopyReport, backlinks = [], onOpenTodo,
    refBacklinks = [], focusCommentId, onCopyLink, onToggleLock, onUnlockRequest,
}) => {
    const linkApi = useContext(MemoLinkContext);
    const isTodo = memo.kind === 'todo';
    const stats = useMemo(() => (isTodo ? todoStats(memo.content) : null), [isTodo, memo.content]);
    const [expanded, setExpanded] = useState(false);
    const [showComments, setShowComments] = useState(!!focusCommentId);
    const [open, setOpen] = useState(false); // 간략히 모드에서 펼침 여부
    const [menuOpen, setMenuOpen] = useState(false);
    const ref = useRef<HTMLElement>(null);
    const isLong = isTodo
        ? memo.content.split('\n').length > 20
        : memo.content.length > 220 || memo.content.split('\n').length > 8 || memo.imageIds.length > 0;
    // 간략히 모드에서 펼친 글은 내용을 모두 보여준다
    const collapsed = isLong && !expanded && !compact;
    const edited = memo.updatedAt.slice(0, 16) !== memo.createdAt.slice(0, 16);

    useEffect(() => {
        if (focusCommentId) setShowComments(true);
    }, [focusCommentId]);

    useEffect(() => {
        if (!highlight) return;
        setExpanded(true);
        setOpen(true);
    }, [highlight]);

    const ring = highlight ? 'ring-2 ring-emerald-400' : selected ? 'ring-2 ring-emerald-600' : 'ring-1 ring-gray-700/60';

    const hiddenBadge = (memo.isHidden || memo.isLocked) && (
        <>
            {memo.isLocked && !memo.isSealed && (
                <span title="비밀번호로 잠근 글" className="ml-2 inline-flex items-center gap-1 rounded-full bg-violet-900/60 px-1.5 py-0.5 align-middle text-[11px] font-normal text-violet-200">
                    <FiLock size={11} /> 잠금
                </span>
            )}
            {memo.isHidden && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-700 px-1.5 py-0.5 align-middle text-[11px] font-normal text-gray-400">
                    <FiEyeOff size={11} /> 숨김
                </span>
            )}
        </>
    );

    const select = selectable && (
        <SelectBox checked={selected} label={`${memo.title} 선택`} onChange={() => onToggleSelect?.(memo)} />
    );

    // PC에서만 보이는 손잡이 — 카드 전체를 끌게 하면 글자 선택(복사)이 어려워진다
    const dragHandle = onDragHandleStart && (
        <span
            draggable
            onDragStart={e => {
                onDragHandleStart(e, memo);
                if (ref.current) e.dataTransfer.setDragImage(ref.current, 24, 20);
            }}
            title="끌어서 왼쪽 폴더에 놓으면 이동합니다"
            aria-hidden
            className="-ml-2 mt-0.5 hidden shrink-0 cursor-grab rounded text-gray-600 hover:text-gray-300 active:cursor-grabbing lg:block"
        >
            <MdDragIndicator size={18} />
        </span>
    );

    const titleToggle = (
        <button
            type="button"
            onClick={() => (selectable ? onToggleSelect?.(memo) : setOpen(v => !v))}
            aria-expanded={selectable ? undefined : open}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
            {!selectable && <FiChevronRight size={18} className={`mt-0.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />}
            <h2 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-gray-50">
                {memo.title}
                {hiddenBadge}
            </h2>
        </button>
    );

    // 간략히 + 닫힘: 제목만 (PC 넓은 화면에서는 오른쪽에 폴더와 날짜를 흐리게)
    if (compact && (!open || selectable)) {
        return (
            <article ref={ref} id={`memo-${memo.id}`} className={`scroll-mt-48 rounded-lg bg-gray-800 px-4 py-3 ${ring}`}>
                <div className="flex items-start gap-2">
                    {dragHandle}
                    {select}
                    {titleToggle}
                    <span className="hidden max-w-[40%] shrink-0 truncate pt-0.5 text-xs text-gray-500 lg:block">
                        {memo.category && `${pathLabel(memo.category)} · `}
                        {formatDate(memo.updatedAt).slice(2)}
                    </span>
                </div>
            </article>
        );
    }

    const categoryButton = memo.category && (
        <button
            onClick={() => onCategoryClick(memo.category)}
            title={`'${pathLabel(memo.category)}' 폴더 보기`}
            className={`${compact ? 'ml-[26px] mt-2' : 'mb-1'} max-w-full truncate rounded-full px-2 py-0.5 text-xs ${categoryChip(memo.category)}`}
        >
            {categoryIcon(memo.category)} {pathLabel(memo.category)}
        </button>
    );

    const menuItems = [
        ...(onCopyLink ? [{label: '링크 복사', icon: <FiLink />, onClick: () => onCopyLink(memo)}] : []),
        {label: '폴더 이동', icon: <FiFolder />, onClick: () => onMove(memo)},
        memo.isHidden
            ? {label: '숨김 해제', icon: <FiEye />, onClick: () => onToggleHidden(memo)}
            : {label: '숨기기', icon: <FiEyeOff />, onClick: () => onToggleHidden(memo)},
        ...(isTodo ? [{label: '보고용 텍스트 복사', icon: <FiCopy />, onClick: () => onCopyReport(memo)}] : []),
        ...(onToggleLock && !memo.isSealed
            ? [memo.isLocked
                ? {label: '잠금 해제 (보호 끄기)', icon: <FiUnlock />, onClick: () => onToggleLock(memo)}
                : {label: '비밀번호로 잠그기', icon: <FiLock />, onClick: () => onToggleLock(memo)}]
            : []),
        {label: '삭제', icon: <FiTrash2 />, danger: true, onClick: () => onDelete(memo)},
    ];

    const moreMenu = (
        <div className="relative -mr-2">
            <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label="더보기"
                aria-expanded={menuOpen}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-700"
            >
                <FiMoreHorizontal size={18} />
            </button>
            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                    <div role="menu" className="absolute bottom-full right-0 z-30 mb-1 w-52 overflow-hidden rounded-xl bg-gray-900 py-1 shadow-xl ring-1 ring-gray-700">
                        {menuItems.map(item => (
                            <button
                                key={item.label}
                                role="menuitem"
                                onClick={() => {
                                    setMenuOpen(false);
                                    item.onClick();
                                }}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-800 ${item.danger ? 'text-red-300' : 'text-gray-200'}`}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );

    // 잠긴 채 보이는 글: 내용 대신 잠금 풀기 버튼. 폴더 이동·숨기기·삭제·즐겨찾기만 가능
    if (memo.isSealed) {
        return (
            <article ref={ref} id={`memo-${memo.id}`} className={`scroll-mt-48 bg-gray-800 ${compact ? 'rounded-lg px-4 py-3' : 'rounded-xl p-4'} ${ring}`}>
                <div className="flex items-center gap-2">
                    {dragHandle}
                    {select}
                    <FiLock className="shrink-0 text-violet-300" />
                    <h2 className="min-w-0 flex-1 truncate font-semibold text-gray-300">
                        잠긴 {memo.kind === 'todo' ? '할일' : '글'}
                        {memo.isHidden && <span className="ml-2 text-xs font-normal text-gray-500">숨김</span>}
                    </h2>
                    {memo.category && <span className="hidden max-w-[40%] truncate text-xs text-gray-500 sm:block">{pathLabel(memo.category)}</span>}
                    {!compact && (
                        <button
                            onClick={() => onToggleFavorite(memo)}
                            aria-label={memo.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                            className={`rounded-full p-1.5 ${memo.isFavorite ? 'text-amber-400' : 'text-gray-500'}`}
                        >
                            <FiStar size={18} fill={memo.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                    )}
                </div>
                {!selectable && (
                    <div className={`flex items-center gap-2 ${compact ? 'mt-2' : 'mt-3 border-t border-gray-700/60 pt-2'}`}>
                        <span className="min-w-0 flex-1 text-xs text-gray-500">작성 {formatDate(memo.createdAt)}</span>
                        {onUnlockRequest && (
                            <button onClick={onUnlockRequest} className="flex items-center gap-1.5 rounded-full bg-violet-700/70 px-3 py-1.5 text-sm text-white hover:bg-violet-600">
                                <FiUnlock size={14} /> 잠금 풀기
                            </button>
                        )}
                        {moreMenu}
                    </div>
                )}
            </article>
        );
    }

    return (
        <article
            ref={ref}
            id={`memo-${memo.id}`}
            className={`scroll-mt-48 bg-gray-800 transition-shadow ${compact ? 'rounded-lg px-4 py-3' : 'rounded-xl p-4'} ${ring}`}
        >
            <div className="flex items-start gap-2">
                {dragHandle}
                {select}
                <div className="min-w-0 flex-1">
                    {compact ? (
                        <>
                            <div className="flex">{titleToggle}</div>
                            {categoryButton}
                        </>
                    ) : (
                        <>
                            {categoryButton}
                            <h2
                                className={`break-words text-base font-semibold leading-snug text-gray-50 ${selectable ? 'cursor-pointer' : ''}`}
                                onClick={selectable ? () => onToggleSelect?.(memo) : undefined}
                            >
                                {memo.title}
                                {hiddenBadge}
                            </h2>
                        </>
                    )}
                    {stats && stats.total > 0 && (
                        <div className={`mt-1.5 flex items-center gap-2 text-xs text-gray-400 ${compact ? 'ml-[26px]' : ''}`}>
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
            {isLong && !compact && (
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

            {refBacklinks.length > 0 && (
                <div className="mt-3 space-y-1">
                    <div className="text-xs text-gray-500">이 글을 링크한 글</div>
                    {refBacklinks.slice(0, 3).map(src => (
                        <button
                            key={src.uid}
                            onClick={() => linkApi?.open({type: 'memo', uid: src.uid})}
                            className="flex w-full items-center gap-2 rounded-lg bg-gray-900/60 px-3 py-2 text-left text-sm hover:bg-gray-900"
                        >
                            {src.kind === 'todo' ? <FiCheckSquare className="shrink-0 text-gray-500" /> : <FiFileText className="shrink-0 text-gray-500" />}
                            <span className="min-w-0 flex-1 truncate text-gray-200">{src.title}</span>
                        </button>
                    ))}
                    {refBacklinks.length > 3 && <div className="text-xs text-gray-500">외 {refBacklinks.length - 3}개</div>}
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

            <footer className="mt-3 flex items-center gap-1 border-t border-gray-700/60 pt-2 text-xs text-gray-500">
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
                <button onClick={() => onEdit(memo)} aria-label="수정" className="rounded-full p-2 text-gray-400 hover:bg-gray-700">
                    <FiEdit2 size={17} />
                </button>
                {moreMenu}
            </footer>

            {showComments && (
                <MemoComments
                    comments={memo.comments}
                    pageSize={commentPageSize}
                    focusId={focusCommentId}
                    ownerUid={memo.uid}
                    onCopyLink={onCopyLink ? id => onCopyLink(memo, id) : undefined}
                    onAdd={content => onAddComment(memo, content)}
                    onEdit={(id, content) => onEditComment(memo, id, content)}
                    onDelete={id => onDeleteComment(memo, id)}
                />
            )}
        </article>
    );
};

export default MemoCard;
