import React, {useContext, useMemo, useState} from 'react';
import {FiCheckSquare, FiChevronLeft, FiChevronRight, FiEyeOff, FiFileText, FiLink, FiSearch, FiX} from 'react-icons/fi';
import type {Memo} from '../types/memo';
import {formatDate} from '../utils/format';
import {useImageUrl} from '../utils/image';
import {commentLabel, refMarkdown} from '../utils/links';
import {pathLabel} from '../utils/folders';
import {MemoLinkContext} from './MemoLinkContext';

interface Props {
    excludeUid?: string;                    // 지금 쓰고 있는 글
    onPick: (markdown: string) => void;     // 넣을 링크 (마크다운)
    onClose: () => void;
}

type KindFilter = 'all' | 'memo' | 'todo';

const Thumb: React.FC<{id: string; name: string; onClick: () => void}> = ({id, name, onClick}) => {
    const url = useImageUrl(id);
    return (
        <button onClick={onClick} aria-label={`${name} 이미지 연결`} className="aspect-square overflow-hidden rounded-md bg-gray-800 ring-violet-400 hover:ring-2">
            {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </button>
    );
};

/** '글 연결': 글을 고르고, 글 전체 · 댓글 · 이미지 중 무엇을 링크할지 고른다 */
const RefPicker: React.FC<Props> = ({excludeUid, onPick, onClose}) => {
    const api = useContext(MemoLinkContext);
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<KindFilter>('all');
    const [selected, setSelected] = useState<Memo | null>(null);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (api?.all ?? [])
            .filter(m => m.uid !== excludeUid && (kind === 'all' || m.kind === kind))
            .filter(m => !q || `${m.title}\n${m.content}\n${m.category}\n${m.hashtags.join(' ')}`.toLowerCase().includes(q))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 100);
    }, [api, query, kind, excludeUid]);

    const comments = selected ? [...selected.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-label="글 연결"
                onClick={e => e.stopPropagation()}
                className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-gray-900 text-gray-200 sm:max-w-lg sm:rounded-2xl"
            >
                <div className="flex items-center gap-1 border-b border-gray-800 px-2 py-2">
                    {selected && (
                        <button onClick={() => setSelected(null)} aria-label="목록으로" className="rounded-full p-2 hover:bg-gray-800">
                            <FiChevronLeft size={20} />
                        </button>
                    )}
                    <h2 className="min-w-0 flex-1 truncate px-2 font-semibold text-gray-50">{selected ? selected.title : '글 연결'}</h2>
                    <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-gray-800">
                        <FiX size={20} />
                    </button>
                </div>

                {!selected ? (
                    <>
                        <div className="space-y-2 border-b border-gray-800 px-3 py-2">
                            <label className="flex items-center gap-2 rounded-lg bg-gray-800 px-3">
                                <FiSearch className="shrink-0 text-gray-500" />
                                <input
                                    autoFocus
                                    type="search"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="연결할 글 검색"
                                    className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-500"
                                />
                            </label>
                            <div className="flex gap-1 text-sm">
                                {([['all', '전체'], ['memo', '메모'], ['todo', '할일']] as const).map(([k, label]) => (
                                    <button
                                        key={k}
                                        onClick={() => setKind(k)}
                                        aria-pressed={kind === k}
                                        className={`rounded-full px-3 py-1 ${kind === k ? 'bg-gray-100 font-medium text-gray-900' : 'bg-gray-800 text-gray-300'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                            {list.map(m => (
                                <li key={m.uid}>
                                    <button onClick={() => setSelected(m)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-800">
                                        {m.kind === 'todo' ? <FiCheckSquare className="shrink-0 text-gray-400" /> : <FiFileText className="shrink-0 text-gray-400" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 truncate text-gray-100">
                                                <span className="truncate">{m.title}</span>
                                                {m.isHidden && <FiEyeOff size={12} className="shrink-0 text-gray-500" />}
                                            </span>
                                            <span className="block truncate text-xs text-gray-500">
                                                {m.category && `${pathLabel(m.category)} · `}수정 {formatDate(m.updatedAt)}
                                                {(m.comments.length > 0 || m.imageIds.length > 0) && ` · 댓글 ${m.comments.length} · 이미지 ${m.imageIds.length}`}
                                            </span>
                                        </span>
                                        <FiChevronRight className="shrink-0 text-gray-600" />
                                    </button>
                                </li>
                            ))}
                            {!list.length && <li className="px-3 py-8 text-center text-sm text-gray-500">찾는 글이 없습니다.</li>}
                        </ul>
                    </>
                ) : (
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <button
                            onClick={() => onPick(refMarkdown(selected.title, {type: 'memo', uid: selected.uid}))}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700/80 py-3 font-medium text-white hover:bg-violet-600"
                        >
                            <FiLink /> 이 {selected.kind === 'todo' ? '할일' : '메모'} 연결
                        </button>

                        {comments.length > 0 && (
                            <section>
                                <h3 className="mb-1.5 text-sm text-gray-400">댓글 연결</h3>
                                <ul className="space-y-1.5">
                                    {comments.map(c => (
                                        <li key={c.id}>
                                            <button
                                                onClick={() => onPick(refMarkdown(commentLabel(selected.title, c.content), {type: 'comment', uid: selected.uid, commentId: c.id}))}
                                                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-left text-sm hover:bg-gray-700"
                                            >
                                                <span className="line-clamp-2 text-gray-200">{c.content}</span>
                                                <span className="mt-0.5 block text-xs text-gray-500">{formatDate(c.createdAt)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {selected.imageIds.length > 0 && (
                            <section>
                                <h3 className="mb-1.5 text-sm text-gray-400">이미지 연결</h3>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {selected.imageIds.map((id, i) => (
                                        <Thumb
                                            key={id}
                                            id={id}
                                            name={`${selected.title} 이미지 ${i + 1}`}
                                            onClick={() => onPick(refMarkdown(`${selected.title} 이미지 ${i + 1}`, {type: 'image', imageId: id}))}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RefPicker;
