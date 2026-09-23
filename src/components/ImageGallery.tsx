import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FiChevronLeft, FiChevronRight, FiDownload, FiFileText, FiShare2, FiX} from 'react-icons/fi';
import {getAllImages} from '../db/memoDB';
import type {Memo, MemoImage} from '../types/memo';
import {downloadBlob, downloadName, useImageUrl} from '../utils/image';

interface Props {
    memos: Memo[];          // 현재 검색·필터 결과 (이 메모들의 이미지만 표시)
    refreshKey: number;
    onOpenMemo: (memoId: number) => void;
}

interface Entry {
    image: MemoImage;
    memo: Memo;
}

const Thumb: React.FC<{image: MemoImage; onClick: () => void}> = ({image, onClick}) => {
    const url = useImageUrl(image.id);
    return (
        <button onClick={onClick} className="relative aspect-square overflow-hidden rounded-md bg-gray-800" aria-label={`${image.name} 크게 보기`}>
            {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </button>
    );
};

const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

const Viewer: React.FC<{entries: Entry[]; index: number; onIndex: (i: number) => void; onClose: () => void; onOpenMemo: (id: number) => void}> = ({
    entries, index, onIndex, onClose, onOpenMemo,
}) => {
    const {image, memo} = entries[index];
    const url = useImageUrl(image.id);
    const touchX = useRef<number | null>(null);
    const prev = () => index > 0 && onIndex(index - 1);
    const next = () => index < entries.length - 1 && onIndex(index + 1);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') prev();
            if (e.key === 'ArrowRight') next();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const share = async () => {
        const file = new File([image.blob], downloadName(image), {type: image.type});
        if (navigator.canShare?.({files: [file]})) {
            try {
                await navigator.share({files: [file]});
            } catch { /* 사용자가 취소 */ }
        } else {
            downloadBlob(image.blob, downloadName(image));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-gray-100">
            <div className="flex items-center gap-1 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
                <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
                    <FiX size={22} />
                </button>
                <span className="flex-1 text-sm text-gray-400">{index + 1} / {entries.length}</span>
                {canShareFiles && (
                    <button onClick={share} aria-label="공유 또는 사진에 저장" className="rounded-full p-2 hover:bg-white/10">
                        <FiShare2 size={20} />
                    </button>
                )}
                <button onClick={() => downloadBlob(image.blob, downloadName(image))} aria-label="다운로드" className="rounded-full p-2 hover:bg-white/10">
                    <FiDownload size={20} />
                </button>
            </div>

            <div
                className="relative flex min-h-0 flex-1 items-center justify-center"
                onTouchStart={e => (touchX.current = e.touches[0].clientX)}
                onTouchEnd={e => {
                    if (touchX.current == null) return;
                    const dx = e.changedTouches[0].clientX - touchX.current;
                    if (dx > 50) prev();
                    if (dx < -50) next();
                    touchX.current = null;
                }}
            >
                {url && <img src={url} alt={image.name} className="max-h-full max-w-full object-contain" />}
                {index > 0 && (
                    <button onClick={prev} aria-label="이전 이미지" className="absolute left-2 rounded-full bg-black/50 p-2">
                        <FiChevronLeft size={24} />
                    </button>
                )}
                {index < entries.length - 1 && (
                    <button onClick={next} aria-label="다음 이미지" className="absolute right-2 rounded-full bg-black/50 p-2">
                        <FiChevronRight size={24} />
                    </button>
                )}
            </div>

            <button
                onClick={() => memo.id != null && onOpenMemo(memo.id)}
                className="mx-3 mb-[calc(0.75rem+env(safe-area-inset-bottom))] mt-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-left text-sm"
            >
                <FiFileText className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{memo.title}</span>
                <span className="shrink-0 text-gray-400">메모 보기</span>
            </button>
        </div>
    );
};

const ImageGallery: React.FC<Props> = ({memos, refreshKey, onOpenMemo}) => {
    const [images, setImages] = useState<Map<string, MemoImage> | null>(null);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    useEffect(() => {
        getAllImages().then(list => setImages(new Map(list.map(i => [i.id, i]))));
    }, [refreshKey]);

    // 메모 정렬 순서 → 본문 속 이미지 순서
    const entries = useMemo<Entry[]>(() => {
        if (!images) return [];
        return memos.flatMap(memo =>
            memo.imageIds.map(id => images.get(id)).filter((i): i is MemoImage => !!i).map(image => ({image, memo})),
        );
    }, [images, memos]);

    if (!images) return <p className="py-10 text-center text-gray-500">불러오는 중…</p>;
    if (!entries.length) {
        return (
            <p className="py-16 text-center text-sm leading-relaxed text-gray-500">
                표시할 이미지가 없습니다.
                <br />
                메모를 작성할 때 사진 버튼으로 이미지를 추가하세요.
            </p>
        );
    }

    return (
        <>
            <p className="mb-2 text-sm text-gray-500">이미지 {entries.length}개 — 눌러서 크게 보고 저장할 수 있어요</p>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5">
                {entries.map((e, i) => (
                    <Thumb key={`${e.memo.id}-${e.image.id}`} image={e.image} onClick={() => setViewerIndex(i)} />
                ))}
            </div>
            {viewerIndex != null && entries[viewerIndex] && (
                <Viewer
                    entries={entries}
                    index={viewerIndex}
                    onIndex={setViewerIndex}
                    onClose={() => setViewerIndex(null)}
                    onOpenMemo={id => {
                        setViewerIndex(null);
                        onOpenMemo(id);
                    }}
                />
            )}
        </>
    );
};

export default ImageGallery;
