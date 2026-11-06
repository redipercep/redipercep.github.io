import React from 'react';
import {FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight} from 'react-icons/fi';

interface Props {
    page: number;               // 0부터
    count: number;              // 전체 페이지 수
    onPage: (page: number) => void;
    label?: string;             // 스크린리더용 이름
    window?: number;            // 한 번에 보일 페이지 번호 수
    edges?: boolean;            // 처음/마지막 버튼
}

/** 현재 페이지 주변 번호만 보여주는 페이지 이동 */
const Pager: React.FC<Props> = ({page, count, onPage, label = '페이지', window: size = 5, edges = false}) => {
    if (count <= 1) return null;
    const start = Math.max(0, Math.min(page - Math.floor(size / 2), count - size));
    const pages = Array.from({length: Math.min(size, count)}, (_, i) => start + i);
    const go = (p: number) => onPage(Math.max(0, Math.min(count - 1, p)));
    const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm';
    const nav = `${btn} text-gray-400 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent`;

    return (
        <nav aria-label={label} className="flex items-center gap-0.5">
            {edges && (
                <button onClick={() => go(0)} disabled={page === 0} aria-label="첫 페이지" className={nav}>
                    <FiChevronsLeft />
                </button>
            )}
            <button onClick={() => go(page - 1)} disabled={page === 0} aria-label="이전 페이지" className={nav}>
                <FiChevronLeft />
            </button>
            {pages.map(p => (
                <button
                    key={p}
                    onClick={() => go(p)}
                    aria-label={`${p + 1}페이지`}
                    aria-current={p === page ? 'page' : undefined}
                    className={`${btn} ${p === page ? 'bg-gray-600 font-semibold text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    {p + 1}
                </button>
            ))}
            <button onClick={() => go(page + 1)} disabled={page >= count - 1} aria-label="다음 페이지" className={nav}>
                <FiChevronRight />
            </button>
            {edges && (
                <button onClick={() => go(count - 1)} disabled={page >= count - 1} aria-label="마지막 페이지" className={nav}>
                    <FiChevronsRight />
                </button>
            )}
        </nav>
    );
};

export default Pager;
