import React, {useState} from 'react';
import {FiAlertTriangle, FiLock} from 'react-icons/fi';
import {setupPassword, unlockWithPassword} from '../db/memoDB';
import {cryptoAvailable} from '../utils/vault';

interface Props {
    mode: 'unlock' | 'setup';
    reason?: string;            // 왜 묻는지 (예: "이 글을 잠그려면")
    onDone: () => void;
    onClose: () => void;
}

export const MIN_PASSWORD = 4;

/** 잠금 풀기 / 처음 비밀번호 정하기 */
const VaultDialog: React.FC<Props> = ({mode, reason, onDone, onClose}) => {
    const [pw, setPw] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const setup = mode === 'setup';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setError('');
        if (setup) {
            if (pw.length < MIN_PASSWORD) return setError(`${MIN_PASSWORD}자 이상 입력하세요`);
            if (pw !== confirm) return setError('두 비밀번호가 다릅니다');
        }
        setBusy(true);
        try {
            if (setup) await setupPassword(pw);
            else if (!(await unlockWithPassword(pw))) {
                setBusy(false);
                setPw('');
                return setError('비밀번호가 맞지 않습니다');
            }
            onDone();
        } catch {
            setBusy(false);
            setError('처리하지 못했습니다');
        }
    };

    return (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
            <form
                role="dialog"
                aria-label={setup ? '비밀번호 정하기' : '잠금 풀기'}
                onSubmit={submit}
                onClick={e => e.stopPropagation()}
                className="w-full rounded-t-2xl bg-gray-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-gray-200 sm:max-w-sm sm:rounded-2xl"
            >
                <div className="flex items-center gap-2">
                    <FiLock className="text-violet-300" />
                    <h2 className="text-lg font-semibold text-gray-50">{setup ? '비밀번호 정하기' : '잠금 풀기'}</h2>
                </div>
                {reason && <p className="mt-1 text-sm text-gray-400">{reason}</p>}

                {!cryptoAvailable() ? (
                    <p className="mt-4 text-sm text-amber-300">이 화면에서는 암호화를 쓸 수 없습니다. https 주소로 접속해 주세요.</p>
                ) : (
                    <>
                        <input
                            autoFocus
                            type="password"
                            autoComplete={setup ? 'new-password' : 'current-password'}
                            value={pw}
                            onChange={e => setPw(e.target.value)}
                            placeholder={setup ? `새 비밀번호 (${MIN_PASSWORD}자 이상)` : '비밀번호'}
                            aria-label={setup ? '새 비밀번호' : '비밀번호'}
                            className="mt-4 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        {setup && (
                            <>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder="한 번 더 입력"
                                    aria-label="비밀번호 확인"
                                    className="mt-2 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-violet-500"
                                />
                                <p className="mt-3 flex gap-2 rounded-lg bg-amber-950/50 p-2.5 text-xs leading-relaxed text-amber-200">
                                    <FiAlertTriangle className="mt-0.5 shrink-0" />
                                    비밀번호는 어디에도 저장되지 않습니다. 잊으면 잠근 글을 다시 열 방법이 없으니 따로 적어 두세요.
                                </p>
                            </>
                        )}
                        {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
                    </>
                )}

                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-gray-400 hover:bg-gray-800">취소</button>
                    <button
                        type="submit"
                        disabled={busy || !pw || !cryptoAvailable()}
                        className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-40"
                    >
                        {busy ? '확인 중…' : setup ? '정하기' : '풀기'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default VaultDialog;
