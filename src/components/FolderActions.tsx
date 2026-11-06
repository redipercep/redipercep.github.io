import React, {useState} from 'react';
import {FiEdit2, FiFolderPlus, FiMove, FiTrash2} from 'react-icons/fi';
import {addFolder, deleteFolder, moveFolder} from '../db/memoDB';
import type {MemoKind} from '../types/memo';
import {folderName, type FolderNode, isInside, joinPath, parentPath, pathLabel} from '../utils/folders';
import FolderPicker from './FolderPicker';
import type {MenuItem} from './FolderTree';
import NameDialog from './NameDialog';

type Dialog =
    | {type: 'create'; parent: string}
    | {type: 'rename'; path: string}
    | {type: 'move'; path: string}
    | null;

/**
 * 폴더 만들기 · 이름 바꾸기 · 이동 · 삭제
 * onChanged(from, to): 폴더 경로가 바뀌면 화면의 선택 상태를 맞출 수 있도록 알려준다
 */
export function useFolderActions(
    kind: MemoKind,
    folders: string[],
    onChanged: (from?: string, to?: string) => void | Promise<void>,
    notify: (msg: string) => void,
) {
    const [dialog, setDialog] = useState<Dialog>(null);
    const exists = (p: string) => folders.includes(p);

    const run = async (fn: () => Promise<void>, done: string, from?: string, to?: string) => {
        setDialog(null);
        try {
            await fn();
            await onChanged(from, to);
            notify(done);
        } catch {
            notify('폴더를 바꾸지 못했습니다');
        }
    };

    const relocate = (from: string, to: string) => {
        if (from === to) return setDialog(null);
        if (isInside(to, from)) return notify('폴더를 자기 안으로 옮길 수 없습니다');
        if (exists(to) && !window.confirm(`'${pathLabel(to)}' 폴더가 이미 있습니다. 두 폴더를 합칠까요?`)) return;
        run(() => moveFolder(kind, from, to), `'${pathLabel(to)}'(으)로 옮겼습니다`, from, to);
    };

    const remove = (node: FolderNode) => {
        const up = parentPath(node.path);
        const msg = node.total
            ? `'${node.name}' 폴더를 삭제할까요?\n안에 있는 글 ${node.total}개와 하위 폴더는 '${up ? pathLabel(up) : '최상위'}'(으)로 옮겨집니다.`
            : `'${node.name}' 폴더를 삭제할까요?`;
        if (window.confirm(msg)) run(() => deleteFolder(kind, node.path), '폴더를 삭제했습니다', node.path, up);
    };

    const menuFor = (node: FolderNode): MenuItem[] => [
        {label: '하위 폴더 만들기', icon: <FiFolderPlus />, onClick: () => setDialog({type: 'create', parent: node.path})},
        {label: '이름 바꾸기', icon: <FiEdit2 />, onClick: () => setDialog({type: 'rename', path: node.path})},
        {label: '다른 폴더로 이동', icon: <FiMove />, onClick: () => setDialog({type: 'move', path: node.path})},
        {label: '삭제', icon: <FiTrash2 />, danger: true, onClick: () => remove(node)},
    ];

    const dialogs =
        dialog?.type === 'create' ? (
            <NameDialog
                title="새 폴더"
                description={dialog.parent ? `'${pathLabel(dialog.parent)}' 안에 만듭니다` : undefined}
                confirmLabel="만들기"
                onClose={() => setDialog(null)}
                onConfirm={name => {
                    const path = joinPath(dialog.parent, name);
                    if (exists(path)) return notify('같은 이름의 폴더가 있습니다');
                    run(() => addFolder(kind, path), '폴더를 만들었습니다');
                }}
            />
        ) : dialog?.type === 'rename' ? (
            <NameDialog
                title="이름 바꾸기"
                initial={folderName(dialog.path)}
                confirmLabel="바꾸기"
                onClose={() => setDialog(null)}
                onConfirm={name => relocate(dialog.path, joinPath(parentPath(dialog.path), name))}
            />
        ) : dialog?.type === 'move' ? (
            <FolderPicker
                title={`'${folderName(dialog.path)}' 옮기기`}
                folders={folders}
                current={parentPath(dialog.path)}
                isDisabled={p => isInside(p, dialog.path)}
                rootLabel="최상위"
                onClose={() => setDialog(null)}
                onConfirm={dest => relocate(dialog.path, joinPath(dest, folderName(dialog.path)))}
            />
        ) : null;

    return {menuFor, createIn: (parent: string) => setDialog({type: 'create', parent}), relocate, dialogs};
}
