import React, {useContext, useLayoutEffect, useRef, useState} from 'react';
import {FiCheckSquare, FiLink, FiLink2, FiList} from 'react-icons/fi';
import {MdFormatIndentDecrease, MdFormatIndentIncrease} from 'react-icons/md';
import {continueList, type EditResult, insertInline, replaceWithUndo, shiftLines, toggleListPrefix} from '../utils/textEdit';
import {MemoLinkContext} from './MemoLinkContext';
import RefPicker from './RefPicker';

interface Props {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;           // Ctrl/Cmd+Enter
    placeholder?: string;
    label: string;
    autoFocus?: boolean;
    alwaysShowTools?: boolean;      // false면 입력창을 누르거나 내용이 있을 때만 도구 막대 표시
    ownerUid?: string;              // 글 연결에서 자기 글 제외
    className?: string;
    trailing?: React.ReactNode;     // 오른쪽 버튼 (등록)
}

const inputClass =
    'min-w-0 flex-1 resize-none rounded-lg bg-gray-900 px-3 py-2 text-base leading-relaxed text-gray-200 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-500 sm:text-sm';

/** 'example.com' 처럼 적어도 열리도록 */
const normalizeUrl = (raw: string) => {
    const u = raw.trim();
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    return `https://${u.replace(/^\/+/, '')}`;
};

/** 주소 · 표시할 글자를 받아 링크를 넣는 작은 창 (모바일에서 [ ]( ) 를 직접 치지 않게) */
const LinkDialog: React.FC<{initialText: string; onInsert: (md: string) => void; onClose: () => void}> = ({initialText, onInsert, onClose}) => {
    const [url, setUrl] = useState('');
    const [text, setText] = useState(initialText);
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const href = normalizeUrl(url);
        if (!href) return;
        const label = text.trim().replace(/[[\]]/g, '');
        onInsert(label ? `[${label}](${href})` : href);
    };
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
            <form
                role="dialog"
                aria-label="링크 넣기"
                onSubmit={submit}
                noValidate // 'example.com'처럼 https:// 없이 적어도 받아서 직접 고쳐 넣는다
                onClick={e => e.stopPropagation()}
                className="w-full rounded-t-2xl bg-gray-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-gray-200 sm:max-w-sm sm:rounded-2xl"
            >
                <h2 className="text-lg font-semibold text-gray-50">링크 넣기</h2>
                <input
                    autoFocus
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="주소 (예: example.com)"
                    aria-label="주소"
                    className="mt-4 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="표시할 글자 (비우면 주소 그대로)"
                    aria-label="표시할 글자"
                    enterKeyHint="done"
                    className="mt-2 w-full rounded-lg bg-gray-800 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-gray-400 hover:bg-gray-800">취소</button>
                    <button type="submit" disabled={!url.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-40">넣기</button>
                </div>
            </form>
        </div>
    );
};

/** 댓글 입력창 + 도구 막대 (목록 · 체크리스트 · 내어쓰기 · 들여쓰기 · 링크 · 글 연결) */
const CommentInput: React.FC<Props> = ({value, onChange, onSubmit, placeholder, label, autoFocus, alwaysShowTools, ownerUid, className, trailing}) => {
    const linkApi = useContext(MemoLinkContext);
    const ref = useRef<HTMLTextAreaElement>(null);
    const savedSel = useRef<[number, number]>([0, 0]); // 창을 여는 동안 커서 위치 기억
    const [focused, setFocused] = useState(!!autoFocus);
    const [dialog, setDialog] = useState<'link' | 'ref' | null>(null);

    // 내용에 맞춰 높이 조절
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [value]);

    /** 되돌리기(Ctrl+Z)가 유지되게 바꾸고 커서 위치를 맞춘다 */
    const apply = (fn: (text: string, s: number, e: number) => EditResult | null, sel?: [number, number]) => {
        const el = ref.current;
        if (!el) return;
        const [s, e] = sel ?? [el.selectionStart, el.selectionEnd];
        const r = fn(el.value, s, e);
        if (!r) return;
        if (replaceWithUndo(el, r.text)) {
            // 바로 커서를 맞춘다 (한 박자 늦으면 빠르게 이어 친 글자가 엉뚱한 자리에 들어감)
            el.focus();
            el.setSelectionRange(r.selStart, r.selEnd);
            return;
        }
        onChange(r.text);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(r.selStart, r.selEnd);
        });
    };

    const openDialog = (d: 'link' | 'ref') => {
        const el = ref.current;
        savedSel.current = el ? [el.selectionStart, el.selectionEnd] : [value.length, value.length];
        setDialog(d);
    };

    const insertAtSaved = (md: string) => {
        setDialog(null);
        apply((t, s, e) => insertInline(t, s, e, md), savedSel.current);
    };

    const tools: {label: string; icon: React.ReactNode; onClick: () => void}[] = [
        {label: '목록 (-)', icon: <FiList size={17} />, onClick: () => apply((t, s, e) => toggleListPrefix(t, s, e, 'bullet'))},
        {label: '체크리스트', icon: <FiCheckSquare size={17} />, onClick: () => apply((t, s, e) => toggleListPrefix(t, s, e, 'task'))},
        {label: '내어쓰기', icon: <MdFormatIndentDecrease size={19} />, onClick: () => apply((t, s, e) => shiftLines(t, s, e, -1))},
        {label: '들여쓰기', icon: <MdFormatIndentIncrease size={19} />, onClick: () => apply((t, s, e) => shiftLines(t, s, e, 1))},
        {label: '링크 넣기', icon: <FiLink size={17} />, onClick: () => openDialog('link')},
        ...(linkApi?.showLinkButton ? [{label: '글 연결', icon: <FiLink2 size={17} />, onClick: () => openDialog('ref')}] : []),
    ];

    const showTools = alwaysShowTools || focused || !!value || !!dialog;
    const el = ref.current;
    const selectedText = el ? el.value.slice(savedSel.current[0], savedSel.current[1]) : '';

    return (
        <div
            className={className}
            onFocus={() => setFocused(true)}
            onBlur={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
            }}
        >
            {showTools && (
                <div role="toolbar" aria-label={`${label} 도구`} className="mb-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {tools.map(t => (
                        <button
                            key={t.label}
                            type="button"
                            // 누를 때 입력창 포커스(모바일 키보드)가 사라지지 않게
                            onPointerDown={e => e.preventDefault()}
                            onMouseDown={e => e.preventDefault()}
                            onClick={t.onClick}
                            aria-label={t.label}
                            title={t.label}
                            className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-gray-400 hover:bg-gray-700 hover:text-gray-200 active:bg-gray-600"
                        >
                            {t.icon}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex items-end gap-2">
                <textarea
                    ref={ref}
                    rows={1}
                    value={value}
                    autoFocus={autoFocus}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={e => {
                        if (e.nativeEvent.isComposing) return; // 한글 조합 중
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            onSubmit();
                            return;
                        }
                        // 목록 줄에서 줄바꿈하면 다음 항목을 이어 준다
                        if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                            const ta = e.currentTarget;
                            if (ta.selectionStart !== ta.selectionEnd) return;
                            const r = continueList(ta.value, ta.selectionStart);
                            if (!r) return;
                            e.preventDefault();
                            apply(() => r);
                        }
                    }}
                    placeholder={placeholder}
                    aria-label={label}
                    className={inputClass}
                />
                {trailing}
            </div>

            {dialog === 'link' && <LinkDialog initialText={selectedText} onInsert={insertAtSaved} onClose={() => setDialog(null)} />}
            {dialog === 'ref' && <RefPicker excludeUid={ownerUid} onPick={insertAtSaved} onClose={() => setDialog(null)} />}
        </div>
    );
};

export default CommentInput;
