import React, {useMemo, useState} from 'react';
import {FiCornerDownRight, FiFolderPlus, FiInbox, FiX} from 'react-icons/fi';
import {buildTree, cleanName, collectFolders, joinPath, pathLabel, withAncestors} from '../utils/folders';
import FolderTree from './FolderTree';

interface Props {
    title: string;
    folders: string[];                  // 선택할 수 있는 전체 폴더
    current?: string;                   // 지금 위치 (처음 선택값)
    isDisabled?: (path: string) => boolean;
    rootLabel?: string;
    confirmLabel?: string;
    onConfirm: (path: string) => void;  // '' = 최상위 (폴더 없음)
    onClose: () => void;
}

/** 폴더 고르기: 글 이동, 폴더 이동, 편집기의 폴더 선택에 공통으로 사용 */
const FolderPicker: React.FC<Props> = ({title, folders, current = '', isDisabled, rootLabel = '폴더 없음 (최상위)', confirmLabel = '여기로 이동', onConfirm, onClose}) => {
    const [created, setCreated] = useState<string[]>([]);
    const [selected, setSelected] = useState(current);
    const [newName, setNewName] = useState('');
    const all = useMemo(() => collectFolders([...folders, ...created], []), [folders, created]);
    const tree = useMemo(() => buildTree(all, new Map()), [all]);
    const [open, setOpen] = useState<Set<string>>(() =>
        new Set(all.length <= 30 ? all : withAncestors(current).slice(0, -1)),
    );
    const toggle = (p: string) => setOpen(prev => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        return next;
    });

    const create = () => {
        const name = cleanName(newName);
        if (!name) return;
        const path = joinPath(selected, name);
        setCreated(c => [...c, path]);
        setOpen(prev => new Set([...prev, ...withAncestors(path)]));
        setSelected(path);
        setNewName('');
    };

    return (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-label={title}
                onClick={e => e.stopPropagation()}
                className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-gray-900 text-gray-200 sm:max-w-md sm:rounded-2xl"
            >
                <div className="flex items-center border-b border-gray-800 px-4 py-3">
                    <h2 className="flex-1 font-semibold text-gray-50">{title}</h2>
                    <button onClick={onClose} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                        <FiX size={20} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <button
                        onClick={() => setSelected('')}
                        disabled={isDisabled?.('')}
                        aria-pressed={selected === ''}
                        className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40 ${selected === '' ? 'bg-gray-700 text-white' : 'hover:bg-gray-800'}`}
                    >
                        <FiInbox size={15} className="text-gray-400" /> {rootLabel}
                    </button>
                    <FolderTree nodes={tree} open={open} onToggle={toggle} selected={selected} onSelect={setSelected} isDisabled={isDisabled} showCount={false} />
                    {!all.length && <p className="px-3 py-4 text-sm text-gray-500">아직 폴더가 없습니다. 아래에서 새로 만들어 보세요.</p>}
                </div>

                <div className="space-y-3 border-t border-gray-800 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <div className="flex items-center gap-2">
                        <FiFolderPlus className="shrink-0 text-gray-500" />
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    create();
                                }
                            }}
                            placeholder={selected ? `'${pathLabel(selected)}' 안에 새 폴더` : '새 폴더'}
                            className="min-w-0 flex-1 rounded-lg bg-gray-800 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
                        />
                        <button onClick={create} disabled={!cleanName(newName)} className="shrink-0 rounded-lg bg-gray-700 px-3 py-2 text-sm disabled:opacity-40">
                            만들기
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-gray-400">
                            <FiCornerDownRight className="shrink-0" />
                            <span className="truncate">{selected ? pathLabel(selected) : rootLabel}</span>
                        </div>
                        <button
                            onClick={() => onConfirm(selected)}
                            disabled={isDisabled?.(selected)}
                            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-40"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FolderPicker;
