import type {Sealed, VaultRecord} from '../utils/vault';

export type MemoKind = 'memo' | 'todo';

export interface Memo {
    id?: number;            // IndexedDB autoIncrement 키 (장치마다 다를 수 있음)
    uid: string;            // 장치 간 이동 시 같은 메모인지 판별하는 고유 ID
    kind: MemoKind;         // 메모 / 할일
    title: string;
    category: string;
    content: string;        // 마크다운 원문
    hashtags: string[];
    imageIds: string[];     // 본문에서 참조하는 이미지 ID 목록
    isFavorite: boolean;
    isHidden?: boolean;     // 숨긴 글: 평소 목록·검색에서 빠지고 '숨긴 글'에서만 보임
    isLocked?: boolean;     // 비밀번호로 잠근 글: 제목·본문·댓글·태그를 암호화해 저장
    sealed?: Sealed;        // (저장 형태) 암호화된 제목·본문·댓글·태그
    isSealed?: boolean;     // (화면 전용) 잠금을 풀지 않아 내용을 볼 수 없는 상태
    comments: MemoComment[]; // 오래된 순
    createdAt: string;      // ISO 문자열
    updatedAt: string;
}

export interface MemoComment {
    id: string;
    content: string;        // 마크다운
    createdAt: string;
    updatedAt: string;
}

export interface MemoImage {
    id: string;
    name: string;
    type: string;
    blob: Blob;             // enc가 있으면 암호화된 바이트
    createdAt: string;
    enc?: {v: string; iv: string};  // 잠근 글의 이미지: 어떤 금고 키로 암호화했는지
}

export type SortKey = 'updatedAt' | 'createdAt' | 'title';
export type SortDir = 'asc' | 'desc';

export interface BackupImage {
    id: string;
    name: string;
    type: string;
    createdAt: string;
    dataUrl: string;
    enc?: {v: string; iv: string};
}

export interface BackupFile {
    app: 'memo-app';
    version: 1;
    exportedAt: string;
    memos: Memo[];
    images: BackupImage[];
    folders?: {memo: string[]; todo: string[]};  // 빈 폴더까지 옮기기 위한 폴더 목록
    vaults?: VaultRecord[];                      // 잠근 글을 다른 기기에서 열기 위한 salt·확인값 (비밀번호는 없음)
}
