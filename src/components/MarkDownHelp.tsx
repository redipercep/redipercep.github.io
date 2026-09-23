import React from 'react';
import {FiX} from 'react-icons/fi';
import MarkdownView from './MarkdownView';

const ITEMS: {label: string; syntax: string}[] = [
    {label: '제목', syntax: '# 큰 제목\n## 중간 제목\n### 작은 제목'},
    {label: '강조', syntax: '**굵게** *기울임* ~~취소선~~'},
    {label: '목록', syntax: '- 항목\n- 항목\n  - 하위 항목'},
    {label: '번호 목록', syntax: '1. 첫째\n2. 둘째'},
    {label: '체크리스트', syntax: '- [ ] 할 일\n- [x] 끝낸 일'},
    {label: '인용', syntax: '> 인용하거나 강조할 문장'},
    {label: '코드', syntax: '`한 줄 코드`\n\n```\n여러 줄 코드\n```'},
    {label: '링크', syntax: '[표시할 글자](https://example.com)'},
    {label: '표', syntax: '| 항목 | 상태 |\n|---|---|\n| 기획 | 완료 |'},
    {label: '구분선', syntax: '위 내용\n\n---\n\n아래 내용'},
];

const MarkdownHelp: React.FC<{onClose: () => void}> = ({onClose}) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
        <div
            role="dialog"
            aria-label="마크다운 작성법"
            className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-gray-900 text-gray-200 sm:max-w-lg sm:rounded-2xl"
            onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <h2 className="font-semibold">마크다운 작성법</h2>
                <button onClick={onClose} aria-label="닫기" className="-mr-2 rounded-full p-2 hover:bg-gray-800">
                    <FiX size={20} />
                </button>
            </div>
            <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {ITEMS.map(item => (
                    <section key={item.label} className="border-b border-gray-800 py-3 last:border-0">
                        <h3 className="mb-2 text-sm font-semibold text-gray-400">{item.label}</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-950 p-2 font-mono text-sm text-gray-300">{item.syntax}</pre>
                            <div className="rounded-lg bg-gray-800 p-2">
                                <MarkdownView content={item.syntax} />
                            </div>
                        </div>
                    </section>
                ))}
                <p className="pt-3 text-sm text-gray-400">
                    이미지는 편집 도구의 사진 버튼으로 추가합니다. 본문에 들어가는 <code className="text-emerald-300">memo-img:</code> 주소는 지우지 마세요.
                </p>
            </div>
        </div>
    </div>
);

export default MarkdownHelp;
