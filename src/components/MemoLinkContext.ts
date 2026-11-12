import {createContext} from 'react';
import type {Memo} from '../types/memo';
import type {RefTarget} from '../utils/links';

/** 본문·댓글 속 내부 링크가 쓰는 기능 (MemoPage가 제공) */
export interface MemoLinkApi {
    all: Memo[];                                // 링크할 수 있는 글 (메모 + 할일)
    byUid: Map<string, Memo>;
    open: (target: RefTarget) => void;
    showLinkButton: boolean;                    // 설정: '글 연결' 버튼 표시
    interactive: boolean;                       // false면 링크를 눌러도 열지 않음 (편집기 미리보기)
}

export const MemoLinkContext = createContext<MemoLinkApi | null>(null);
