import React, {useCallback, useState} from 'react';
import {FiChevronRight, FiFolder, FiMoreHorizontal} from 'react-icons/fi';
import type {FolderNode} from '../utils/folders';
import {withAncestors} from '../utils/folders';
import {findPreset} from '../utils/presets';

export const MIME_MEMOS = 'application/x-memo-ids';
export const MIME_FOLDER = 'application/x-memo-folder';

export interface MenuItem {
    label: string;
    icon?: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
}

export interface FolderDnd {
    onDropMemos: (ids: number[], path: string) => void;
    onDropFolder: (from: string, toParent: string) => void;
}

/** 펼친 폴더를 기기에 기억 */
export function useExpanded(storageKey: string) {
    const [open, setOpen] = useState<Set<string>>(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
        } catch {
            return new Set();
        }
    });
    const save = (next: Set<string>) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch { /* 무시 */ }
        return next;
    };
    const toggle = useCallback((path: string) => setOpen(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return save(next);
    }), []); // eslint-disable-line react-hooks/exhaustive-deps
    /** 해당 폴더가 보이도록 상위 폴더를 펼침 */
    const reveal = useCallback((path: string) => setOpen(prev => {
        const need = withAncestors(path).slice(0, -1).filter(p => !prev.has(p));
        if (!need.length) return prev;
        return save(new Set([...prev, ...need]));
    }), []); // eslint-disable-line react-hooks/exhaustive-deps
    return {open, toggle, reveal};
}

export const FolderIcon: React.FC<{path: string; depth: number}> = ({path, depth}) => {
    const preset = depth === 0 ? findPreset(path) : undefined;
    return preset
        ? <span className="w-4 shrink-0 text-center text-sm leading-none">{preset.icon}</span>
        : <FiFolder size={15} className="shrink-0 text-gray-400" />;
};

/** 드롭 대상 공통 처리 (폴더 행과 "폴더 없음" 행에서 함께 사용) */
export function dropHandlers(path: string, dnd: FolderDnd | undefined, setOver: (p: string | null) => void) {
    if (!dnd) return {};
    const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(MIME_MEMOS) || e.dataTransfer.types.includes(MIME_FOLDER);
    return {
        onDragOver: (e: React.DragEvent) => {
            if (!accepts(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(path);
        },
        onDragLeave: () => setOver(null),
        onDrop: (e: React.DragEvent) => {
            setOver(null);
            const ids = e.dataTransfer.getData(MIME_MEMOS);
            const folder = e.dataTransfer.getData(MIME_FOLDER);
            if (!ids && !folder) return;
            e.preventDefault();
            if (ids) dnd.onDropMemos(JSON.parse(ids) as number[], path);
            else dnd.onDropFolder(folder, path);
        },
    };
}

interface Props {
    nodes: FolderNode[];
    open: Set<string>;
    onToggle: (path: string) => void;
    selected?: string | null;
    onSelect?: (path: string) => void;
    menu?: (node: FolderNode) => MenuItem[];
    dnd?: FolderDnd;
    isDisabled?: (path: string) => boolean;
    showCount?: boolean;
    dense?: boolean;
}

const FolderTree: React.FC<Props> = ({nodes, open, onToggle, selected, onSelect, menu, dnd, isDisabled, showCount = true, dense}) => {
    const [menuPath, setMenuPath] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);

    const renderNode = (node: FolderNode): React.ReactNode => {
        const expanded = open.has(node.path);
        const disabled = isDisabled?.(node.path) ?? false;
        const active = selected === node.path;
        const items = menu && menuPath === node.path ? menu(node) : null;

        return (
            <li key={node.path} role="treeitem" aria-expanded={node.children.length ? expanded : undefined} aria-selected={active}>
                <div
                    className={`group relative flex items-center gap-1.5 rounded-lg pr-1 ${dense ? 'py-1' : 'py-1.5'} ${
                        over === node.path ? 'bg-emerald-900/60 ring-1 ring-emerald-500'
                            : active ? 'bg-gray-700 text-white' : disabled ? 'opacity-40' : 'hover:bg-gray-800'
                    }`}
                    style={{paddingLeft: 4 + node.depth * 16}}
                    draggable={!!dnd}
                    onDragStart={dnd ? e => {
                        e.dataTransfer.setData(MIME_FOLDER, node.path);
                        e.dataTransfer.effectAllowed = 'move';
                    } : undefined}
                    {...dropHandlers(node.path, dnd, setOver)}
                >
                    {node.children.length ? (
                        <button
                            type="button"
                            onClick={() => onToggle(node.path)}
                            aria-label={expanded ? `${node.name} 접기` : `${node.name} 펼치기`}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:text-gray-200"
                        >
                            <FiChevronRight size={15} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                    ) : (
                        <span className="w-6 shrink-0" />
                    )}
                    <button
                        type="button"
                        onClick={() => !disabled && onSelect?.(node.path)}
                        disabled={disabled}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    >
                        <FolderIcon path={node.path} depth={node.depth} />
                        <span className="min-w-0 flex-1 truncate">{node.name}</span>
                        {showCount && node.total > 0 && <span className="shrink-0 text-xs text-gray-500">{node.total}</span>}
                    </button>
                    {menu && (
                        <button
                            type="button"
                            onClick={() => setMenuPath(menuPath === node.path ? null : node.path)}
                            aria-label={`${node.name} 폴더 메뉴`}
                            aria-expanded={!!items}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-200 lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100"
                        >
                            <FiMoreHorizontal size={16} />
                        </button>
                    )}
                    {items && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuPath(null)} />
                            <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl bg-gray-800 py-1 shadow-xl ring-1 ring-gray-700">
                                {items.map(item => (
                                    <button
                                        key={item.label}
                                        role="menuitem"
                                        onClick={() => {
                                            setMenuPath(null);
                                            item.onClick();
                                        }}
                                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-700 ${item.danger ? 'text-red-300' : 'text-gray-200'}`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                {expanded && node.children.length > 0 && <ul role="group">{node.children.map(renderNode)}</ul>}
            </li>
        );
    };

    return <ul role="tree" className="space-y-0.5">{nodes.map(renderNode)}</ul>;
};

export default FolderTree;
