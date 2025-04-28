// types/memo.ts

// 1. 메모 타입 정의
export interface Memo {
    id?: number;               // 메모의 고유 ID (자동 증가)
    title: string;             // 메모 제목
    category: string;          // 메모 카테고리
    content: string;           // 메모 내용
    createdAt: string;         // 작성일 (ISO 8601 형식)
    updatedAt: string;         // 수정일 (ISO 8601 형식)
    hashtags: string[];        // 해시태그 (배열)
    comments: MemoComment[];
}

// 2. 댓글 타입 정의
export interface MemoComment {
    id?: number;               // 댓글 고유 ID (자동 증가)
    memoId: number;            // 해당 댓글이 속한 메모의 ID
    content: string;           // 댓글 내용
    createdAt: string;         // 댓글 작성일 (ISO 8601 형식)
    updatedAt: string;         // 댓글 수정일 (ISO 8601 형식)
}