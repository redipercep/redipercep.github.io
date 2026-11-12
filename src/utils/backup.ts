import {type FolderMap, getAllImages, getFolderMap, getRawMemos, getVaultRecords} from '../db/memoDB';
import type {BackupFile, Memo, MemoImage} from '../types/memo';
import {fileStamp, newId} from './format';
import {normalizePath} from './folders';
import {downloadBlob, extractImageIds} from './image';
import type {Sealed, VaultRecord} from './vault';

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
    // 잠근 글과 그 이미지는 암호화된 그대로 내보낸다
    const [memos, images, folders, vaults] = await Promise.all([getRawMemos(), getAllImages(), getFolderMap(), getVaultRecords()]);
    const data: BackupFile = {
        app: 'memo-app',
        version: 1,
        exportedAt: new Date().toISOString(),
        memos,
        folders,
        vaults,
        images: await Promise.all(
            images.map(async img => ({
                id: img.id,
                name: img.name,
                type: img.type,
                createdAt: img.createdAt,
                dataUrl: await blobToDataUrl(img.blob),
                ...(img.enc ? {enc: img.enc} : {}),
            })),
        ),
    };
    downloadBlob(new Blob([JSON.stringify(data)], {type: 'application/json'}), `memo-backup-${fileStamp()}.json`);
    return {memoCount: memos.length, imageCount: images.length};
}

type Raw = Record<string, unknown>;
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isSealedValue = (v: unknown): v is Sealed =>
    !!v && typeof (v as Raw).v === 'string' && typeof (v as Raw).iv === 'string' && typeof (v as Raw).data === 'string';
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** 이전 버전(댓글 포함) 형식도 받아들이도록 정규화 */
function normalizeMemo(r: Raw): Memo {
    const now = new Date().toISOString();
    const content = str(r.content);
    const locked = r.isLocked === true && isSealedValue(r.sealed);
    const comments = Array.isArray(r.comments)
        ? (r.comments as Raw[])
              .filter(c => c && !c.isDeleted && str(c.content))
              .map(c => ({
                  id: typeof c.id === 'string' ? c.id : newId(), // 예전 형식은 숫자 id
                  content: str(c.content),
                  createdAt: str(c.createdAt, now),
                  updatedAt: str(c.updatedAt, str(c.createdAt, now)),
              }))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [];

    return {
        id: typeof r.id === 'number' ? r.id : undefined,
        uid: str(r.uid) || newId(),
        kind: r.kind === 'todo' ? 'todo' : 'memo',
        title: str(r.title) || '제목 없음',
        category: normalizePath(str(r.category)),
        content,
        hashtags: Array.isArray(r.hashtags)
            ? r.hashtags.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
            : [],
        // 잠근 글은 본문이 암호문이라 이미지 목록을 저장된 값으로 유지
        imageIds: locked ? strList(r.imageIds) : extractImageIds(content),
        isFavorite: r.isFavorite === true,
        isHidden: r.isHidden === true,
        ...(locked ? {isLocked: true, sealed: r.sealed as Sealed} : {}),
        comments,
        createdAt: str(r.createdAt, now),
        updatedAt: str(r.updatedAt, str(r.createdAt, now)),
    };
}

export async function readBackup(file: File): Promise<{memos: Memo[]; images: MemoImage[]; folders: Partial<FolderMap>; vaults: VaultRecord[]}> {
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
                ...(i.enc && typeof (i.enc as Raw).v === 'string' && typeof (i.enc as Raw).iv === 'string'
                    ? {enc: {v: (i.enc as Raw).v as string, iv: (i.enc as Raw).iv as string}}
                    : {}),
            };
        });

    const rawFolders = (obj?.folders ?? {}) as Raw;
    const folderList = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : []);
    const folders = {memo: folderList(rawFolders.memo), todo: folderList(rawFolders.todo)};

    const vaults = (Array.isArray(obj?.vaults) ? (obj.vaults as Raw[]) : []).filter(
        (v): v is Raw & VaultRecord => !!v && typeof v.id === 'string' && typeof v.salt === 'string' && isSealedValue(v.check),
    );

    return {memos: (rawMemos as Raw[]).filter(Boolean).map(normalizeMemo), images, folders, vaults};
}
