
import db from './db';
import {Memo, MemoComment} from '../types/memo';


// 1. 메모 추가 함수
export async function addMemo(memo: Memo) {
    try {
        const id = await db.memos.add(memo);
        return id;
    } catch (error) {
        console.error('메모 추가 실패:', error);
    }
}

// 2. 메모 수정 함수
export async function updateMemo(memo: Memo) {
    try {
        await db.memos.put(memo);
        return memo;
    } catch (error) {
        console.error('메모 수정 실패:', error);
    }
}

// 3. 메모 삭제 함수
export async function deleteMemo(id: number) {
    try {
        await db.memos.delete(id);
        return id;
    } catch (error) {
        console.error('메모 삭제 실패:', error);
    }
}

// 4. 메모 조회 함수 (전체 메모)
export async function getMemos() {
    try {
        const memos = await db.memos.toArray();
        const comments = await db.comments.toArray();

        return memos.map(memo => ({
            ...memo,
            comments: comments.filter(c => c.memoId === memo.id)
        }));

    } catch (error) {
        console.error('메모 조회 실패:', error);
        return [];
    }
}

// 5. 메모 ID로 개별 메모 조회
export async function getMemo(id: number) {
    try {
        return await db.memos.get(id);
    } catch (error) {
        console.error('메모 조회 실패:', error);
    }
}

// 6. 댓글 추가 함수
export async function addComment(memoId: number, comment: MemoComment) {
    try {
        const id = await db.comments.add({ ...comment, memoId });
        return { ...comment, id };
    } catch (error) {
        console.error('댓글 추가 실패:', error);
        return { ...comment };
    }
}

// 7. 메모에 댓글 조회
export async function getComments(memoId: number) {
    try {
        return await db.comments.where('memoId').equals(memoId).toArray();
    } catch (error) {
        console.error('댓글 조회 실패:', error);
    }
}

// 8. 메모에서 댓글 삭제
export async function deleteComment(id: number) {
    try {
        await db.comments.delete(id);
        return id;
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
    }
}

// 9. 메모 Export (모든 메모 JSON으로)
export async function exportMemos() {
    try {
        const allMemos = await db.memos.toArray();
        const json = JSON.stringify(allMemos, null, 2);
        return new Blob([json], { type: 'application/json' });
    } catch (error) {
        console.error('메모 Export 실패:', error);
        return new Blob([], { type: 'application/json' }); // 빈 blob을 반환
    }
}

// 10. 메모 Import (JSON 데이터로 메모 추가)
export async function importMemos(memos: Memo[]) {
    try {
        for (const memo of memos) {
            const exists = await db.memos.get(memo.id);
            if (!exists) {
                await db.memos.add(memo);
            }
        }
    } catch (error) {
        console.error('메모 Import 실패:', error);
    }
}