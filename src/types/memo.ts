export interface Memo {
    id?: number;            // IndexedDB autoIncrement 키 (장치마다 다를 수 있음)
    uid: string;            // 장치 간 이동 시 같은 메모인지 판별하는 고유 ID
    title: string;
    category: string;
    content: string;        // 마크다운 원문
    hashtags: string[];
    imageIds: string[];     // 본문에서 참조하는 이미지 ID 목록
    isFavorite: boolean;
    createdAt: string;      // ISO 문자열
    updatedAt: string;
}

export interface MemoImage {
    id: string;
    name: string;
    type: string;
    blob: Blob;
    createdAt: string;
}

export type SortKey = 'updatedAt' | 'createdAt' | 'title';
export type SortDir = 'asc' | 'desc';

export interface BackupImage {
    id: string;
    name: string;
    type: string;
    createdAt: string;
    dataUrl: string;
}

export interface BackupFile {
    app: 'memo-app';
    version: 1;
    exportedAt: string;
    memos: Memo[];
    images: BackupImage[];
}
