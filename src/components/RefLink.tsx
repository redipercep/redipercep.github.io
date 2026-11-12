import React, {useContext} from 'react';
import {FiCheckSquare, FiFileText, FiImage, FiMessageCircle} from 'react-icons/fi';
import type {RefTarget} from '../utils/links';
import {MemoLinkContext} from './MemoLinkContext';

/** 본문 속 내부 링크: 아이콘이 붙은 칩. 대상이 지워졌으면 흐리게 */
const RefLink: React.FC<{target: RefTarget; children: React.ReactNode}> = ({target, children}) => {
    const api = useContext(MemoLinkContext);
    const memo = target.type === 'image' ? undefined : api?.byUid.get(target.uid);
    const missing = target.type !== 'image' && !!api && !memo;
    const commentMissing = target.type === 'comment' && memo && !memo.comments.some(c => c.id === target.commentId);

    const Icon = target.type === 'image' ? FiImage : target.type === 'comment' ? FiMessageCircle : memo?.kind === 'todo' ? FiCheckSquare : FiFileText;
    const title = missing ? '삭제된 글' : commentMissing ? '삭제된 댓글' : memo ? `${memo.kind === 'todo' ? '할일' : '메모'}: ${memo.title}` : undefined;
    const cls = `mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-md px-1.5 py-px align-baseline text-[0.95em] ${
        missing || commentMissing ? 'bg-gray-700/50 text-gray-500 line-through' : 'bg-violet-900/40 text-violet-200'
    }`;
    const body = (
        <>
            <Icon size={12} className="shrink-0 translate-y-[1px]" />
            <span className="truncate">{children}</span>
        </>
    );

    if (!api?.interactive || missing) return <span className={cls} title={title}>{body}</span>;
    return (
        <button
            type="button"
            title={title}
            onClick={e => {
                e.stopPropagation(); // 할일 항목 안에서 눌러도 항목의 상태 창이 열리지 않게
                api.open(target);
            }}
            className={`${cls} hover:bg-violet-800/60`}
        >
            {body}
        </button>
    );
};

export default RefLink;
