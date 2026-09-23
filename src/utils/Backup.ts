import {getAllImages, getAllMemos} from '../db/memoDB';
import type {BackupFile, Memo, MemoImage} from '../types/memo';
import {fileStamp, formatDate, newId} from './format';
import {downloadBlob, extractImageIds} from './image';

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function dataUrlToBlob(dataUrl: string) {
    const [header, data] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'application/octet-stream';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {type: mime});
}

/** 메모 + 이미지를 JSON 한 파일로 내보내기 */
export async function exportBackup() {
    const [memos, images] = await Promise.all([getAllMemos(), getAllImages()]);
    const data: BackupFile = {
        app: 'memo-app',
        version: 1,
        exportedAt: new Date().toISOString(),
        memos,
        images: await Promise.all(
            images.map(async img => ({
                id: img.id,
                name: img.name,
                type: img.type,
                createdAt: img.createdAt,
                dataUrl: await blobToDataUrl(img.blob),
            })),
        ),
    };
    downloadBlob(new Blob([JSON.stringify(data)], {type: 'application/json'}), `memo-backup-${fileStamp()}.json`);
    return {memoCount: memos.length, imageCount: images.length};
}

type Raw = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** 이전 버전(댓글 포함) 형식도 받아들이도록 정규화 */
function normalizeMemo(r: Raw): Memo {
    const now = new Date().toISOString();
    let content = str(r.content);

    // 예전 댓글은 본문 아래로 옮겨 둔다
    if (Array.isArray(r.comments)) {
        const lines = (r.comments as Raw[])
            .filter(c => c && !c.isDeleted && str(c.content))
            .map(c => `- ${str(c.content)} _(${formatDate(str(c.createdAt))})_`);
        if (lines.length) content += `\n\n---\n### 댓글\n${lines.join('\n')}`;
    }

    return {
        id: typeof r.id === 'number' ? r.id : undefined,
        uid: str(r.uid) || newId(),
        title: str(r.title) || '제목 없음',
        category: str(r.category),
        content,
        hashtags: Array.isArray(r.hashtags)
            ? r.hashtags.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
            : [],
        imageIds: extractImageIds(content),
        isFavorite: r.isFavorite === true,
        createdAt: str(r.createdAt, now),
        updatedAt: str(r.updatedAt, str(r.createdAt, now)),
    };
}

export async function readBackup(file: File): Promise<{memos: Memo[]; images: MemoImage[]}> {
    let json: unknown;
    try {
        json = JSON.parse(await file.text());
    } catch {
        throw new Error('JSON 파일이 아닙니다.');
    }
    const obj = json as Raw;
    const rawMemos = Array.isArray(json) ? json : Array.isArray(obj?.memos) ? obj.memos : null;
    if (!rawMemos) throw new Error('메모 백업 파일 형식이 아닙니다.');

    const rawImages = Array.isArray(obj?.images) ? (obj.images as Raw[]) : [];
    const images: MemoImage[] = rawImages
        .filter(i => i && typeof i.id === 'string' && typeof i.dataUrl === 'string')
        .map(i => {
            const blob = dataUrlToBlob(i.dataUrl as string);
            return {
                id: i.id as string,
                name: str(i.name, 'image'),
                type: str(i.type, blob.type),
                createdAt: str(i.createdAt, new Date().toISOString()),
                blob,
            };
        });

    return {memos: (rawMemos as Raw[]).filter(Boolean).map(normalizeMemo), images};
}
