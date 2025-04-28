import React, { useState, useEffect } from 'react';
import { FaRegEdit, FaDownload, FaUpload } from 'react-icons/fa'; // 아이콘을 위한 React Icons 패키지
import { exportMemos, importMemos } from '../db/memoDB';
import { Memo } from '../types/memo';


interface HeaderProps {
    onImport: (memos: Memo[]) => void;
}

const MemoHeader: React.FC<HeaderProps> = ({ onImport }) => {
    const [isImporting, setIsImporting] = useState(false);

    // 메모를 export하는 함수
    const handleExport = async () => {
        try {
            const blob = await exportMemos();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'memos.json';
            a.click();
        } catch (error) {
            console.error('메모 export 실패:', error);
        }
    };

    // 메모를 import하는 함수
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === 'application/json') {
            try {
                setIsImporting(true);
                const reader = new FileReader();
                reader.onload = async () => {
                    const data = JSON.parse(reader.result as string);
                    if (Array.isArray(data)) {
                        await importMemos(data);
                        onImport(data); // 부모 컴포넌트에 알리기
                    } else {
                        alert('유효하지 않은 JSON 파일입니다.');
                    }
                };
                reader.readAsText(file);
            } catch (error) {
                console.error('메모 import 실패:', error);
            } finally {
                setIsImporting(false);
            }
        } else {
            alert('JSON 파일을 선택해 주세요.');
        }
    };

    return (
        <header className="bg-gray-900 text-gray-300 flex justify-between items-center p-4 mb-4">
            <div className="text-xl font-semibold">메모 앱</div>

            {/* 메모 아이콘 */}
            <div className="flex space-x-4">
                {/* Export 버튼 */}
                <button
                    className="flex items-center px-4 py-2 bg-blue-950 hover:bg-blue-700 rounded-md"
                    onClick={handleExport}
                >
                    <FaDownload className="mr-2"/>
                    Export
                </button>

                {/* Import 버튼 */}
                <label className="flex items-center cursor-pointer px-4 py-2 bg-green-950 hover:bg-green-700 rounded-md">
                    <FaUpload className="mr-2" />
                    {isImporting ? 'Importing...' : 'Import'}
                    <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={handleImport}
                    />
                </label>
            </div>
        </header>
    );
};

export default MemoHeader;
