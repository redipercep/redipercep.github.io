import {createContext} from 'react';
import type {Memo} from '../types/memo';

/** 할일 항목을 가리키는 정보 (줄 번호 + 문구로 찾음) */
export interface LinkTarget {
    todoId: number;
    line: number;
    text: string;
}

/** 할일 화면에서 메모를 열고, 만들고, 연결할 때 쓰는 기능 (MemoPage가 제공) */
export interface TaskLinkApi {
    memosByUid: Map<string, Memo>;
    openMemos: (uids: string[]) => void;
    createMemo: (target: LinkTarget) => void;
    pickMemo: (target: LinkTarget) => void;
}

export const TaskLinkContext = createContext<TaskLinkApi | null>(null);
