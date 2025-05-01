import Dexie, { Table } from 'dexie';
import { Memo, MemoComment } from '../types/memo';

// 1. Dexie 데이터베이스 설정
class MemoAppDatabase extends Dexie {
    memos!: Table<Memo>;       // memos 테이블 정의
    comments!: Table<MemoComment>;  // comments 테이블 정의

    constructor() {
        super('MemoAppDatabase');
        this.version(1).stores({
            memos: '++id, title, category, content, createdAt, updatedAt, hashtags, isDeleted, comments',  // memos 테이블
            comments: '++id, memoId, content, createdAt, updatedAt, isDeleted'  // comments 테이블
        });
    }
}

// 2. db 인스턴스 생성
const db = new MemoAppDatabase();

// 3. DB 초기화 (기본 메모 데이터가 없으면 임시 데이터 추가)
db.open().catch((err) => {
    console.error('Failed to open db:', err);
});

export default db;