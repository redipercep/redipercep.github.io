import React, { useState } from 'react';
import { Memo, MemoComment } from '../types/memo';
import { FaEdit } from 'react-icons/fa';
import CommentItem from './CommentItem';
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import commentItem from "./CommentItem";

interface MemoItemProps {
    memo: Memo;
    onDelete: (memoId: number) => void;
    onEdit: (memo: Memo) => void;
    onAddComment: (memoId: number, content: string) => void;  // 댓글 추가를 부모에서 처리
    onDeleteComment: (commentId: number, memoId: number) => void;
    onEditComment: (updatedComment: MemoComment, memoId: number) => void;
}

const MemoItem: React.FC<MemoItemProps> = ({ memo, onDelete, onEdit, onAddComment, onDeleteComment }) => {
    const [isOpen, setIsOpen] = useState(false); // 메모 전체 열기/닫기
    const [isCommentsOpen, setIsCommentsOpen] = useState(false); // 댓글 전용 열기/닫기
    const [newComment, setNewComment] = useState('');
    const [isEditing, setIsEditing] = useState(false); // 수정 폼 표시 여부
    const [newTitle, setNewTitle] = useState(memo.title);
    const [newContent, setNewContent] = useState(memo.content);
    const [newCategory, setNewCategory] = useState(memo.category);
    const [visibleCommentCount, setVisibleCommentCount] = useState(5);

    // 메모 열기/닫기 토글
    const toggleContent = () => {
        setIsOpen(prev => !prev);
    };

    // 댓글 열기/닫기 토글
    const toggleComments = () => {
        setIsCommentsOpen(prev => !prev);
    };

    // 댓글 더 불러오기
    const handleLoadMoreComments = () => {
        setVisibleCommentCount((prev) => prev + 5);
    }

    // 댓글 간단히
    const handleLoadLessComments = () => {
        setVisibleCommentCount(prev => 5);
    }

    // 메모 삭제
    const handleDeleteMemo = () => {
        onDelete(memo.id!);
    };

    const handleEditMemo = () => {
        const updatedMemo: Memo = {
            ...memo,
            title: newTitle,
            content: newContent,
            category: newCategory,
            updatedAt: new Date().toISOString(),
        };
        onEdit(updatedMemo); // 부모로 수정된 메모를 전달
        setIsEditing(false); // 수정 폼을 닫음
        toggleContent();
    };

    // 댓글 추가 버튼 클릭 시
    const handleAddComment = () => {
        if (newComment.trim()) {
            onAddComment(memo.id!, newComment);  // 부모에서 전달된 onAddComment 호출
            setNewComment('');  // 댓글 작성 후 입력 필드 비우기
        }
    };

    // 댓글 삭제 처리
    const handleDeleteComment = (commentId: number) => {
        if (window.confirm('댓글을 삭제하시겠습니까?')) {
            onDeleteComment(commentId, memo.id!); // 부모에서 전달된 onDeleteComment 호출
        }
    };

    // 댓글 수정
    const handleEditComment = (updatedComment: MemoComment) => {
        // 댓글 수정 시, 메모의 댓글을 갱신
        const updatedComments = memo.comments?.map(comment =>
            comment.id === updatedComment.id ? updatedComment : comment
        );

        const updatedMemo = {
            ...memo,
            comments: updatedComments, // 수정된 댓글 리스트 반영
        };

        onEdit(updatedMemo); // 수정된 메모를 부모로 전달
    };

    return (
        <div className="p-4 mb-4 bg-gray-900 rounded-lg">
            {/* 메모 제목과 작성 일시 */}
            <div
                onClick={toggleContent}  // 제목 클릭 시 열고 닫기
                className="cursor-pointer flex justify-between items-center"
            >
                <h3 className="text-xl text-white font-semibold">{memo.title}</h3>
                <div className="flex justify-between items-center">
                    {/* 수정 버튼 */}
                    {isOpen && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="mr-2 text-sky-800 hover:text-sky-600"
                        >
                            <FaEdit />
                        </button>
                    )}
                    <span className="text-sm text-gray-400">{new Date(memo.createdAt).toLocaleString()}</span>
                </div>
            </div>

            {/* 수정 폼 */}
            {isEditing && (
                <div className="mt-4">
                    <input
                        type="text"
                        className="p-2 w-full bg-gray-700 text-gray-300 rounded-md"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                    />
                    <textarea
                        className="p-2 w-full mt-2 bg-gray-700 text-gray-300 rounded-md"
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                    />
                    <input
                        type="text"
                        className="p-2 w-full mt-2 bg-gray-700 text-gray-300 rounded-md"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                    />
                    <button
                        onClick={handleEditMemo}
                        className="mt-2 px-2 bg-blue-800 text-xs text-gray-300 rounded-md hover:bg-blue-600"
                    >
                        수정 완료
                    </button>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="mt-2 ml-2 px-2 bg-gray-700 text-xs text-gray-300 rounded-md hover:bg-gray-600"
                    >
                        취소
                    </button>
                </div>
            )}

            {/* 메모 내용 (전체) */}
            {isOpen && (
                <div className="mt-4 text-gray-200 md-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {memo.content}
                    </ReactMarkdown>
                </div>
            )}

            {/* 댓글 토글 버튼 */}
            {isOpen && (
                <button
                    onClick={toggleComments}
                    className="mt-4 text-sm text-blue-400 hover:underline"
                >
                    {isCommentsOpen ? '댓글 닫기 ▲' : `댓글 ${memo.comments.length}개 보기 ▼`}
                </button>
            )}

            {/* 댓글 목록 */}
            {isOpen && isCommentsOpen && memo.comments?.length > 0 && (
                <div className="mt-2 ml-2">
                    {visibleCommentCount < memo.comments.length && (
                        <button
                            onClick={handleLoadMoreComments}
                            className="mb-2 text-xs text-gray-700 hover:text-blue-400"
                        >
                            댓글 더보기 ▲
                        </button>
                    )}
                    {visibleCommentCount >= memo.comments.length && memo.comments.length > 5 && (
                        <button
                            onClick={handleLoadLessComments}
                            className="mb-2 text-xs text-gray-700 hover:text-blue-400"
                        >
                            댓글 간단히 ▼
                        </button>
                    )}
                    {[...memo.comments]
                        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                        .slice(memo.comments.length - visibleCommentCount < 0 ? 0 : memo.comments.length - visibleCommentCount, memo.comments.length)
                        .map((comment) => (
                            <CommentItem
                                key={comment.id}
                                comment={comment}
                                onEdit={handleEditComment}
                                onDelete={handleDeleteComment}
                            />
                        ))}
                </div>
            )}

            {/* 댓글 입력 */}
            {isOpen && isCommentsOpen && (
                <div className="mt-4">
                    <textarea
                        placeholder="댓글을 작성하세요"
                        className="p-2 w-full bg-gray-700 text-white rounded-md"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                    />
                    <button
                        onClick={handleAddComment}
                        className="mt-2 px-2 text-xs bg-green-950 text-gray-400 rounded-md hover:bg-green-800"
                    >
                        댓글 추가
                    </button>
                </div>
            )}

            {/* 삭제 버튼 */}
            {isOpen && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleDeleteMemo}
                        className="px-2 bg-red-950 text-sm text-gray-300 rounded-md hover:bg-red-800"
                    >
                        메모 삭제
                    </button>
                </div>
            )}
        </div>
    );
};

export default MemoItem;
