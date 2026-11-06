import React, {useMemo, useState} from 'react';
import {FiCheck, FiPlus, FiSearch, FiX} from 'react-icons/fi';
import type {Memo} from '../types/memo';
import {formatDate} from '../utils/format';
import {categoryIcon} from '../utils/presets';

interface Props {
    taskText: string;
    memos: Memo[];              // 연결 가능한 메모 (kind === 'memo')
    linked: string[];           // 이미 연결된 uid
    onPick: (uid: string) => void;
    onCreate: () => void;
    onClose: () => void;
}

/** 할일 항목에 연결할 기존 메모 고르기 */
const MemoPicker: React.FC<Props> = ({taskText, memos, linked, onPick, onCreate, onClose}) => {
    const [query, setQuery] = useState('');
    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return memos
            .filter(m => !q || `${m.title}\n${m.content}\n${m.category}\n${m.hashtags.join(' ')}`.toLowerCase().includes(q))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [memos, query]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-label="메모 연결"
                onClick={e => e.stopPropagation()}
                className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-gray-900 text-gray-200 sm:max-w-md sm:rounded-2xl"
            >
                <div className="border-b border-gray-800 px-4 pb-3 pt-3">
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <h2 className="font-semibold text-gray-50">메모 연결</h2>
                            <p className="truncate text-sm text-gray-400">☑️ {taskText}</p>
                        </div>
                        <button onClick={onClose} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                            <FiX size={20} />
                        </button>
                    </div>
                    <label className="mt-3 flex items-center gap-2 rounded-lg bg-gray-800 px-3">
                        <FiSearch className="shrink-0 text-gray-500" />
                        <input
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="메모 검색"
                            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-gray-500"
                        />
                    </label>
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <li>
                        <button onClick={onCreate} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-violet-300 hover:bg-gray-800">
                            <FiPlus /> 새 메모 작성해서 연결
                        </button>
                    </li>
                    {list.map(m => {
                        const done = linked.includes(m.uid);
                        return (
                            <li key={m.uid}>
                                <button
                                    onClick={() => onPick(m.uid)}
                                    disabled={done}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-800 disabled:opacity-60"
                                >
                                    <span className="shrink-0">{m.category ? categoryIcon(m.category) : '📝'}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-gray-100">{m.title}</span>
                                        <span className="block text-xs text-gray-500">
                                            {m.category && `${m.category} · `}수정 {formatDate(m.updatedAt)}
                                        </span>
                                    </span>
                                    {done && <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400"><FiCheck /> 연결됨</span>}
                                </button>
                            </li>
                        );
                    })}
                    {!list.length && <li className="px-3 py-6 text-center text-sm text-gray-500">{memos.length ? '검색 결과가 없습니다.' : '아직 작성한 메모가 없습니다.'}</li>}
                </ul>
            </div>
        </div>
    );
};

export default MemoPicker;
