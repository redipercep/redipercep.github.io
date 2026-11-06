import {useCallback, useState} from 'react';
import type {MemoKind, SortDir, SortKey} from '../types/memo';

export type ListView = 'compact' | 'full';

/** 화면 표시 설정 — 기기마다 다를 수 있으므로 localStorage에 저장 (백업에는 포함하지 않음) */
export interface Settings {
    listView: Record<MemoKind, ListView>;
    sort: Record<MemoKind, {key: SortKey; dir: SortDir}>;
    pageSize: number;           // 메모·할일 한 페이지 글 수
    imagePageSize: number;      // 이미지 한 페이지 개수
    commentPageSize: number;    // 댓글 한 번에 보기
    pcColumns: 1 | 2;           // PC 넓은 화면에서 기본 보기 카드 열 수
}

export const PAGE_SIZES = [10, 20, 30, 50];
export const IMAGE_PAGE_SIZES = [30, 60, 90];
export const COMMENT_PAGE_SIZES = [3, 5, 10];
export const SORT_LABELS: Record<SortKey, string> = {updatedAt: '수정일', createdAt: '작성일', title: '제목'};

const KEY = 'memo.settings';

const read = (k: string) => {
    try {
        return localStorage.getItem(k);
    } catch {
        return null;
    }
};

/** 예전 버전에서 따로 저장하던 값을 처음 한 번 가져온다 */
function defaults(): Settings {
    const sk = (k: string, f: SortKey) => (read(k) as SortKey) || f;
    const sd = (k: string, f: SortDir) => (read(k) as SortDir) || f;
    const lv = (k: string) => ((read(k) as ListView) || 'full');
    return {
        listView: {memo: lv('memo.listView'), todo: lv('todo.listView')},
        sort: {
            memo: {key: sk('memo.sortKey', 'updatedAt'), dir: sd('memo.sortDir', 'desc')},
            todo: {key: sk('todo.sortKey', 'createdAt'), dir: sd('todo.sortDir', 'desc')},
        },
        pageSize: 20,
        imagePageSize: 60,
        commentPageSize: 5,
        pcColumns: 2,
    };
}

export function loadSettings(): Settings {
    const base = defaults();
    try {
        const saved = JSON.parse(read(KEY) ?? 'null') as Partial<Settings> | null;
        if (!saved) return base;
        return {
            ...base,
            ...saved,
            listView: {...base.listView, ...saved.listView},
            sort: {memo: {...base.sort.memo, ...saved.sort?.memo}, todo: {...base.sort.todo, ...saved.sort?.todo}},
        };
    } catch {
        return base;
    }
}

export function useSettings() {
    const [settings, setSettings] = useState<Settings>(loadSettings);
    const update = useCallback((patch: (s: Settings) => Settings) => {
        setSettings(prev => {
            const next = patch(prev);
            try {
                localStorage.setItem(KEY, JSON.stringify(next));
            } catch { /* 저장 불가 환경은 무시 */ }
            return next;
        });
    }, []);
    return [settings, update] as const;
}

/** 화면 너비 조건 (예: PC에서만 끌어서 옮기기) */
export function matchesMedia(query: string) {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}
