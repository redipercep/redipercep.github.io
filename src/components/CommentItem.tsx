import React, { useState } from 'react';
import { MemoComment } from '../types/memo';
import ReactMarkdown from 'react-markdown';
import { FaEdit, FaTrash } from 'react-icons/fa';
import remarkGfm from "remark-gfm";

interface CommentItemProps {
    comment: MemoComment;
    onEdit: (updatedComment: MemoComment) => void; // 댓글 수정 처리
    onDelete: (commentId: number) => void; // 댓글 삭제 처리
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, onEdit, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(comment.content);

    // 댓글 내용 수정 시 상태 업데이트
    const handleEditChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditedContent(event.target.value);
    };

    // 수정된 댓글 저장
    const handleSaveEdit = () => {
        if (editedContent !== comment.content) {
            // 수정된 댓글이 있을 때만 수정 처리
            const updatedComment: MemoComment = {
                ...comment,
                content: editedContent,
                updatedAt: new Date().toISOString(), // 수정 일시 갱신
            };
            onEdit(updatedComment); // 부모에게 수정된 댓글 전달
        }
        setIsEditing(false);
    };

    // 수정 취소
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedContent(comment.content); // 원래 내용으로 복원
    };

    // 댓글 삭제 처리
    const handleDelete = () => {
        if (window.confirm('댓글을 삭제하시겠습니까?')) {
            onDelete(comment.id!); // 부모에게 삭제할 댓글 ID 전달
        }
    };

    return (
        <div className="p-4 mb-4 bg-gray-800 rounded-lg">
            {/* 댓글 작성자 및 작성일 */}
            <div className="flex justify-between items-center text-sm text-gray-400">
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
                <div className="flex space-x-2">
                    <button onClick={() => setIsEditing(true)} className="text-sky-800 hover:text-sky-600">
                        <FaEdit />
                    </button>
                    <button onClick={handleDelete} className="text-red-900 hover:text-red-700">
                        <FaTrash />
                    </button>
                </div>
            </div>

            {/* 댓글 내용 */}
            {isEditing ? (
                <div>
                    <textarea
                        value={editedContent}
                        onChange={handleEditChange}
                        rows={4}
                        className="w-full p-2 mt-2 bg-gray-700 text-white rounded-md"
                    />
                    <div className="flex justify-end space-x-2 mt-2">
                        <button
                            onClick={handleCancelEdit}
                            className="px-2 bg-gray-700 rounded-md text-sm text-gray-200 hover:bg-gray-500"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            className="px-2 bg-blue-800 rounded-md text-sm text-white hover:bg-blue-500"
                        >
                            저장
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-2 text-sm text-gray-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content}</ReactMarkdown>
                </div>
            )}
        </div>
    );
};

export default CommentItem;
