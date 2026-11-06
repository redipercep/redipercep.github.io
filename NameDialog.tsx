import React, {useState} from 'react';
import {cleanName} from '../utils/folders';

interface Props {
    title: string;
    description?: string;
    initial?: string;
    confirmLabel: string;
    onConfirm: (name: string) => void;
    onClose: () => void;
}

/** 폴더 이름 입력 */
const NameDialog: React.FC<Props> = ({title, description, initial = '', confirmLabel, onConfirm, onClose}) => {
    const [name, setName] = useState(initial);
    const clean = cleanName(name);
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (clean) onConfirm(clean);
    };
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <form
                role="dialog"
                aria-label={title}
                onSubmit={submit}
                onClick={e => e.stopPropagation()}
                className="w-full rounded-t-2xl bg-gray-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-gray-200 sm:max-w-sm sm:rounded-2xl"
            >
                <h2 className="text-lg font-semibold text-gray-50">{title}</h2>
                {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
                <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="폴더 이름"
                    enterKeyHint="done"
                    className="mt-4 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {name.includes('/') && <p className="mt-1 text-xs text-amber-300">이름에는 / 를 쓸 수 없어 띄어쓰기로 바뀝니다.</p>}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-gray-400 hover:bg-gray-800">취소</button>
                    <button type="submit" disabled={!clean} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-40">
                        {confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NameDialog;
