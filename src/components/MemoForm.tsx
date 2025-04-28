import { useState } from 'react';
import { addMemo } from '../db/memoDB';
import { Memo } from '../types/memo';

interface MemoFormProps {
    onMemoAdded: () => void;
}

function MemoForm({ onMemoAdded }: MemoFormProps) {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [content, setContent] = useState('');
    const [hashtags, setHashtags] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim()) {
            alert('제목을 입력해주세요.');
            return;
        }

        const now = new Date().toISOString();
        const newMemo: Memo = {
            id: Date.now(),
            title,
            category,
            content,
            hashtags: hashtags.split(',').map(tag => tag.trim()),
            createdAt: now,
            updatedAt: now,
            comments: [],
        };

        await addMemo(newMemo);

        // 폼 초기화
        setTitle('');
        setCategory('');
        setContent('');
        setHashtags('');

        onMemoAdded();
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 p-6 bg-gray-800 rounded-lg shadow-md"
        >
            <h2 className="text-2xl font-semibold text-white mb-4">새 메모 작성</h2>

            <input
                type="text"
                placeholder="제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
                type="text"
                placeholder="구분"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
                placeholder="내용 (Markdown 지원)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-3 h-40 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            ></textarea>

            <input
                type="text"
                placeholder="해시태그 (쉼표로 구분)"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
                type="submit"
                className="w-full py-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold transition duration-300"
            >
                메모 저장
            </button>
        </form>
    );
}

export default MemoForm;
