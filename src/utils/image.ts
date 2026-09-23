import {useEffect, useState} from 'react';
import {getImage} from '../db/memoDB';
import type {MemoImage} from '../types/memo';

/** 본문에서 저장된 이미지를 가리키는 주소: ![설명](memo-img:이미지ID) */
export const IMG_PROTOCOL = 'memo-img:';

const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function getImageUrl(id: string): Promise<string | null> {
    const cached = urlCache.get(id);
    if (cached) return Promise.resolve(cached);
    let p = pending.get(id);
    if (!p) {
        p = getImage(id)
            .then(img => {
                if (!img) return null;
                const url = URL.createObjectURL(img.blob);
                urlCache.set(id, url);
                return url;
            })
            .catch(() => null)
            .finally(() => pending.delete(id));
        pending.set(id, p);
    }
    return p;
}

export function releaseImageUrls(ids: string[]) {
    ids.forEach(id => {
        const url = urlCache.get(id);
        if (url) URL.revokeObjectURL(url);
        urlCache.delete(id);
    });
}

export function clearImageUrlCache() {
    urlCache.forEach(url => URL.revokeObjectURL(url));
    urlCache.clear();
}

/** undefined = 불러오는 중, null = 없음 */
export function useImageUrl(id: string | null) {
    const [url, setUrl] = useState<string | null | undefined>(() => (id ? urlCache.get(id) : null));
    useEffect(() => {
        if (!id) {
            setUrl(null);
            return;
        }
        let alive = true;
        getImageUrl(id).then(u => alive && setUrl(u));
        return () => {
            alive = false;
        };
    }, [id]);
    return url;
}

export function extractImageIds(markdown: string): string[] {
    const ids = new Set<string>();
    const re = /memo-img:([A-Za-z0-9-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown))) ids.add(m[1]);
    return [...ids];
}

/** 휴대폰 사진은 크기가 커서 긴 변 2048px로 줄여 저장 (GIF/SVG는 원본 유지) */
export async function prepareImage(file: File): Promise<Blob> {
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }
    const MAX = 2048;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        bitmap.close();
        return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, 0.85));
    return blob && blob.size < file.size ? blob : file;
}

const EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
};

export function downloadName(img: MemoImage) {
    const base = img.name.replace(/\.[^.]+$/, '') || 'image';
    return `${base}.${EXT[img.type] ?? 'img'}`;
}

export function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
