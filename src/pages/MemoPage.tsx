import React, { useState, useEffect } from 'react';
import MemoItem from '../components/MemoItem';
import { Memo, MemoComment } from '../types/memo';
import { FaPlus } from 'react-icons/fa';
import { getMemos, addMemo, updateMemo, deleteMemo, addComment, deleteComment } from '../db/memoDB';
import MemoHeader from "../components/MemoHeader"; // DB 메서드

const MemoPage: React.FC = () => {
    const [memos, setMemos] = useState<Memo[]>([]);
    const [newMemoTitle, setNewMemoTitle] = useState('');
    const [newMemoCategory, setNewMemoCategory] = useState('');
    const [newMemoContent, setNewMemoContent] = useState('');
    const [newMemoHashtags, setNewMemoHashtags] = useState<string[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false); // 폼 열고 닫기 위한 상태 추가

    // 메모 불러오기
    useEffect(() => {
        const fetchMemos = async () => {
            const memos = await getMemos();
            setMemos(memos);
        };

        fetchMemos();
    }, []);

    // 메모 추가
    const handleAddMemo = async () => {
        if (newMemoTitle && newMemoCategory && newMemoContent) {
            const newMemo: Memo = {
                title: newMemoTitle,
                category: newMemoCategory,
                content: newMemoContent,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                hashtags: newMemoHashtags,
                comments: [],
            };

            await addMemo(newMemo); // DB에 메모 추가
            setMemos([newMemo, ...memos]); // 새 메모를 목록에 추가
            setNewMemoTitle('');
            setNewMemoCategory('');
            setNewMemoContent('');
            setNewMemoHashtags([]);
            setIsFormOpen(false); // 폼 추가 후 닫기
        }
    };

    // 메모 수정
    const handleEditMemo = async (updatedMemo: Memo) => {
        await updateMemo(updatedMemo); // DB에서 메모 수정
        setMemos(memos.map(memo => (memo.id === updatedMemo.id ? updatedMemo : memo)));
    };

    // 메모 삭제
    const handleDeleteMemo = async (memoId: number) => {
        await deleteMemo(memoId); // DB에서 메모 삭제
        setMemos(memos.filter(memo => memo.id !== memoId)); // 상태에서 메모 삭제
    };

    // 댓글 추가
    const handleAddComment = async (memoId: number, content: string) => {
        const newComment: MemoComment = {
            id: Date.now(),
            memoId,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await addComment(memoId, newComment); // DB에 댓글 추가

        // 메모 상태 업데이트
        const updatedMemos = memos.map(memo => {
            if (memo.id === memoId) {
                return { ...memo, comments: [newComment, ...memo.comments] };
            }
            return memo;
        });

        setMemos(updatedMemos); // 상태 업데이트
    };

    // 댓글 삭제
    const handleDeleteComment = async (commentId: number, memoId: number) => {
        await deleteComment(commentId); // DB에서 댓글 삭제

        const updatedMemos = memos.map(memo => {
            if (memo.id === memoId) {
                const updatedComments = memo.comments.filter(comment => comment.id !== commentId);
                return { ...memo, comments: updatedComments };
            }
            return memo;
        });

        setMemos(updatedMemos); // 상태 업데이트
    };

    // 댓글 수정
    const handleEditComment = (updatedComment: MemoComment, memoId: number) => {
        setMemos(prevMemos =>
            prevMemos.map(memo => {
                if (memo.id !== memoId) return memo;

                const updatedComments = memo.comments.map(comment =>
                    comment.id === updatedComment.id
                        ? { ...updatedComment } // 새 객체로 교체
                        : comment
                );

                return {
                    ...memo,
                    comments: updatedComments, // 새 배열로 교체
                };
            })
        );
    };

    const handleImport = (importedMemos: Memo[]) => {
        setMemos(importedMemos);
    }

    return (
        <div className="container mx-auto p-4">
            <MemoHeader onImport={handleImport} />
            <h1 className="text-xl font-bold text-gray-300">메모 페이지</h1>

            {/* 메모 추가 폼 토글 버튼 */}
            <button
                onClick={() => setIsFormOpen(!isFormOpen)} // 버튼 클릭 시 폼 열고 닫기
                className="flex mt-4 px-2 bg-green-950 text-gray-300 rounded-md hover:bg-green-700"
            >
                <FaPlus size="1rem" className="mt-1 mr-1" /> {isFormOpen ? '메모 추가 폼 닫기' : '메모 추가'}
            </button>

            {/* 메모 추가 폼 */}
            {isFormOpen && (
                <div className="mt-4 p-2 bg-gray-800 rounded-md">
                    <input
                        type="text"
                        placeholder="메모 제목"
                        className="p-2 w-full bg-gray-700 text-gray-300 rounded-md"
                        value={newMemoTitle}
                        onChange={(e) => setNewMemoTitle(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="메모 카테고리"
                        className="p-2 w-full mt-2 bg-gray-700 text-gray-300 rounded-md"
                        value={newMemoCategory}
                        onChange={(e) => setNewMemoCategory(e.target.value)}
                    />
                    <textarea
                        placeholder="메모 내용"
                        className="p-2 w-full mt-2 bg-gray-700 text-gray-300 rounded-md"
                        value={newMemoContent}
                        onChange={(e) => setNewMemoContent(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="해시태그 (쉼표로 구분)"
                        className="p-2 w-full mt-2 bg-gray-700 text-gray-300 rounded-md"
                        value={newMemoHashtags.join(', ')}
                        onChange={(e) => setNewMemoHashtags(e.target.value.split(',').map(tag => tag.trim()))}
                    />
                    <button
                        onClick={handleAddMemo}
                        className="flex mt-2 px-2 bg-blue-900 text-gray-300 rounded-md hover:bg-blue-700"
                    >
                        <FaPlus size="1rem" className="mt-1 mr-1" /> 메모 추가
                    </button>
                </div>
            )}

            {/* 메모 목록 */}
            <div className="mt-6">
                {memos.length > 0 ? (
                    memos.map((memo) => (
                        <MemoItem
                            key={memo.id}
                            memo={memo}
                            onDelete={handleDeleteMemo}
                            onEdit={handleEditMemo}
                            onAddComment={handleAddComment}
                            onDeleteComment={handleDeleteComment}
                            onEditComment={handleEditComment}
                        />
                    ))
                ) : (
                    <p className="text-gray-400">현재 작성된 메모가 없습니다.</p>
                )}
            </div>
        </div>
    );
};

export default MemoPage;
