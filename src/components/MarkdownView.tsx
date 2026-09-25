import React from 'react';
import ReactMarkdown, {defaultUrlTransform, type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {IMG_PROTOCOL, useImageUrl} from '../utils/image';

// 기본 설정은 알 수 없는 주소를 지우므로 memo-img: 주소는 통과시킨다
const urlTransform = (url: string) => (url.startsWith(IMG_PROTOCOL) ? url : defaultUrlTransform(url));

const MemoImg: React.FC<{src?: string; alt?: string}> = ({src, alt}) => {
    const localId = src?.startsWith(IMG_PROTOCOL) ? src.slice(IMG_PROTOCOL.length) : null;
    const localUrl = useImageUrl(localId);
    const url = localId ? localUrl : src;

    if (url === undefined) return <span className="my-2 block h-32 w-full animate-pulse rounded-lg bg-gray-700/60" />;
    if (!url) return <span className="my-2 block rounded-lg bg-gray-700/60 px-3 py-2 text-sm text-gray-400">이미지를 찾을 수 없습니다</span>;
    return <img src={url} alt={alt ?? ''} loading="lazy" className="my-2 block h-auto max-w-full rounded-lg" />;
};

const components: Components = {
    h1: ({node: _n, children, ...p}) => <h1 className="mb-2 mt-4 text-xl font-bold text-gray-50 first:mt-0" {...p}>{children}</h1>,
    h2: ({node: _n, children, ...p}) => <h2 className="mb-2 mt-4 text-lg font-bold text-gray-50 first:mt-0" {...p}>{children}</h2>,
    h3: ({node: _n, children, ...p}) => <h3 className="mb-1 mt-3 font-semibold text-gray-100 first:mt-0" {...p}>{children}</h3>,
    h4: ({node: _n, children, ...p}) => <h4 className="mb-1 mt-3 font-semibold text-gray-100" {...p}>{children}</h4>,
    p: ({node: _n, ...p}) => <p className="mb-2 leading-relaxed" {...p} />,
    a: ({node: _n, children, ...p}) => (
        <a className="text-sky-400 underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p}>
            {children}
        </a>
    ),
    ul: ({node: _n, className, ...p}) => (
        <ul className={className?.includes('contains-task-list') ? 'mb-2 space-y-1' : 'mb-2 list-disc space-y-1 pl-5'} {...p} />
    ),
    ol: ({node: _n, ...p}) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...p} />,
    li: ({node: _n, className, ...p}) => <li className={className?.includes('task-list-item') ? 'list-none' : ''} {...p} />,
    input: ({node: _n, ...p}) =>
        p.type === 'checkbox'
            ? <input {...p} className="mr-2 h-4 w-4 translate-y-0.5 accent-emerald-500" />
            : <input {...p} />,
    blockquote: ({node: _n, ...p}) => <blockquote className="my-2 border-l-4 border-gray-600 pl-3 text-gray-400" {...p} />,
    code: ({node: _n, className, ...p}) => (
        <code className={`${className ?? ''} rounded bg-gray-900 px-1 py-0.5 text-[0.9em] text-emerald-300`} {...p} />
    ),
    pre: ({node: _n, ...p}) => (
        <pre className="my-2 overflow-x-auto rounded-lg bg-gray-950 p-3 text-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-gray-200" {...p} />
    ),
    table: ({node: _n, ...p}) => (
        <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm" {...p} />
        </div>
    ),
    th: ({node: _n, ...p}) => <th className="border border-gray-600 bg-gray-700/50 px-2 py-1 text-left" {...p} />,
    td: ({node: _n, ...p}) => <td className="border border-gray-600 px-2 py-1" {...p} />,
    hr: () => <hr className="my-4 border-gray-600" />,
    img: ({src, alt}) => <MemoImg src={typeof src === 'string' ? src : undefined} alt={alt} />,
};

const MarkdownView: React.FC<{content: string}> = ({content}) => (
    <div className="break-words text-[15px] text-gray-300">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
            {content}
        </ReactMarkdown>
    </div>
);

export default React.memo(MarkdownView);
