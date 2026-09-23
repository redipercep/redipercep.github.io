import React, {useEffect, useState} from 'react';
import {FiEdit2, FiStar, FiTrash2} from 'react-icons/fi';
import type {Memo} from '../types/memo';
import {formatDate} from '../utils/format';
import {categoryChip, categoryIcon} from '../utils/presets';
import MarkdownView from './MarkdownView';

interface Props {
    memo: Memo;
    highlight?: boolean;
    activeTag: string | null;
    onEdit: (memo: Memo) => void;
    onDelete: (memo: Memo) => void;
    onToggleFavorite: (memo: Memo) => void;
    onTagClick: (tag: string) => void;
    onCategoryClick: (category: string) => void;
}

const MemoCard: React.FC<Props> = ({memo, highlight, activeTag, onEdit, onDelete, onToggleFavorite, onTagClick, onCategoryClick}) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = memo.content.length > 220 || memo.content.split('\n').length > 8 || memo.imageIds.length > 0;
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
                    <MarkdownView content={memo.content} />
                    {collapsed && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-gray-800 to-transparent" />}
                </div>
            )}
            {isLong && (
                <button onClick={() => setExpanded(v => !v)} className="mt-1 py-1 text-sm font-medium text-emerald-400">
                    {expanded ? '접기' : '전체 보기'}
                </button>
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
                <button onClick={() => onEdit(memo)} aria-label="수정" className="rounded-full p-2 text-gray-400 hover:bg-gray-700">
                    <FiEdit2 size={17} />
                </button>
                <button onClick={() => onDelete(memo)} aria-label="삭제" className="-mr-2 rounded-full p-2 text-gray-400 hover:bg-gray-700 hover:text-red-400">
                    <FiTrash2 size={17} />
                </button>
            </footer>
        </article>
    );
};

export default MemoCard;
