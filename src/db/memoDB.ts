import type {Memo, MemoImage, MemoKind} from '../types/memo';
import {collectFolders, isInside, movePath, normalizePath, parentPath} from '../utils/folders';

const DB_NAME = 'memo-app';
const DB_VERSION = 2;
const MEMOS = 'memos';
const IMAGES = 'images';
const META = 'meta'; // 폴더 목록 등 앱 데이터 (v2)

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(MEMOS)) {
                    db.createObjectStore(MEMOS, {keyPath: 'id', autoIncrement: true});
                }
                if (!db.objectStoreNames.contains(IMAGES)) {
                    db.createObjectStore(IMAGES, {keyPath: 'id'});
                }
                if (!db.objectStoreNames.contains(META)) {
                    db.createObjectStore(META, {keyPath: 'key'});
                }
            };
            req.onsuccess = () => {
                // 다른 탭에서 새 버전이 열리면 연결을 닫아 업그레이드를 막지 않는다
                req.result.onversionchange = () => {
                    req.result.close();
                    dbPromise = null;
                };
                resolve(req.result);
            };
            req.onblocked = () => console.warn('다른 탭에서 메모 앱을 닫아 주세요 (DB 업그레이드 대기 중)');
            req.onerror = () => {
                dbPromise = null;
                reject(req.error);
            };
        });
    }
    return dbPromise;
}

/** 단일 스토어 작업: 트랜잭션이 완료된 뒤 결과를 돌려준다 */
async function run<T>(
    store: string,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDB();
    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

/** 여러 스토어를 한 트랜잭션으로 묶는다 (전부 성공하거나 전부 실패) */
async function runMulti(stores: string[], fn: (tx: IDBTransaction) => void): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        fn(tx);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

/** id가 비어 있으면 속성 자체를 지워야 autoIncrement 키가 생성된다 */
function forPut(memo: Memo): Memo {
    const copy = {...memo};
    if (copy.id == null) delete copy.id;
    return copy;
}

// ─── 메모 ──────────────────────────────────────────
/** 예전에 저장된 데이터에 없는 필드를 기본값으로 채운다 */
export const getAllMemos = () =>
    run<Memo[]>(MEMOS, 'readonly', s => s.getAll()).then(list => list.map(m => ({...m, kind: m.kind ?? 'memo', comments: m.comments ?? []})));

export const saveMemo = (memo: Memo) =>
    run<IDBValidKey>(MEMOS, 'readwrite', s => s.put(forPut(memo))).then(key => key as number);

/** 메모와 그 메모의 이미지를 함께 삭제 */
export const deleteMemoWithImages = (memo: Memo) =>
    runMulti([MEMOS, IMAGES], tx => {
        if (memo.id != null) tx.objectStore(MEMOS).delete(memo.id);
        memo.imageIds.forEach(id => tx.objectStore(IMAGES).delete(id));
    });

// ─── 이미지 ────────────────────────────────────────
export const getImage = (id: string) => run<MemoImage | undefined>(IMAGES, 'readonly', s => s.get(id));
export const getAllImages = () => run<MemoImage[]>(IMAGES, 'readonly', s => s.getAll());
export const addImage = (img: MemoImage) => run<IDBValidKey>(IMAGES, 'readwrite', s => s.put(img));

export const deleteImages = async (ids: string[]) => {
    if (!ids.length) return;
    await runMulti([IMAGES], tx => ids.forEach(id => tx.objectStore(IMAGES).delete(id)));
};

// ─── 폴더 ──────────────────────────────────────────
// 빈 폴더도 남도록 폴더 목록을 따로 저장한다. 글이 들어 있는 폴더는 글의 category로도 알 수 있다.
export type FolderMap = Record<MemoKind, string[]>;
const folderKey = (kind: MemoKind) => `folders:${kind}`;

export async function getFolderMap(): Promise<FolderMap> {
    const [memo, todo] = await Promise.all(
        (['memo', 'todo'] as MemoKind[]).map(kind =>
            run<{key: string; value: string[]} | undefined>(META, 'readonly', s => s.get(folderKey(kind))).then(r => r?.value ?? []),
        ),
    );
    return {memo, todo};
}

/** 메모 스토어를 훑으며 조건에 맞는 글의 폴더를 바꾸고, 폴더 목록도 같은 트랜잭션에서 갱신 */
function rewriteFolders(
    kind: MemoKind,
    mapCategory: (m: Memo) => string | null,          // null이면 그대로
    mapList: (list: string[]) => string[],
) {
    return runMulti([MEMOS, META], tx => {
        const cursorReq = tx.objectStore(MEMOS).openCursor();
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const m = cursor.value as Memo;
            if ((m.kind ?? 'memo') === kind) {
                const next = mapCategory(m);
                if (next !== null && next !== m.category) cursor.update({...m, category: next});
            }
            cursor.continue();
        };
        const metaStore = tx.objectStore(META);
        const getReq = metaStore.get(folderKey(kind));
        getReq.onsuccess = () => {
            const list: string[] = getReq.result?.value ?? [];
            metaStore.put({key: folderKey(kind), value: collectFolders(mapList(list), [])});
        };
    });
}

export const addFolder = (kind: MemoKind, path: string) =>
    rewriteFolders(kind, () => null, list => [...list, normalizePath(path)]);

/** 폴더 이름 바꾸기 / 다른 폴더로 옮기기 (하위 폴더와 글이 함께 이동) */
export const moveFolder = (kind: MemoKind, from: string, to: string) =>
    rewriteFolders(
        kind,
        m => (isInside(m.category, from) ? movePath(m.category, from, to) : null),
        list => [...list.map(p => movePath(p, from, to)), to],
    );

/** 폴더 삭제: 안의 글과 하위 폴더는 한 단계 위로 올라간다 (글은 지우지 않음) */
export const deleteFolder = (kind: MemoKind, path: string) => {
    const up = parentPath(path);
    return rewriteFolders(
        kind,
        m => (isInside(m.category, path) ? movePath(m.category, path, up) : null),
        list => list.filter(p => p !== path).map(p => movePath(p, path, up)),
    );
};

/** 여러 글을 한 폴더로 이동 */
export const moveMemosTo = (ids: number[], kind: MemoKind, dest: string) => {
    const target = new Set(ids);
    return rewriteFolders(kind, m => (m.id != null && target.has(m.id) ? normalizePath(dest) : null), list => (dest ? [...list, dest] : list));
};

// ─── 가져오기 ──────────────────────────────────────
/**
 * replace: 기존 데이터를 모두 지우고 교체
 * merge: uid가 같은 메모는 더 최근에 수정된 쪽을 남기고, 없는 메모는 추가
 */
export async function importData(memos: Memo[], images: MemoImage[], mode: 'merge' | 'replace', folders?: Partial<FolderMap>) {
    const existing = mode === 'merge' ? await getAllMemos() : [];
    const byUid = new Map(existing.map(m => [m.uid, m]));
    const neededImages = new Set<string>();

    const currentFolders = mode === 'merge' ? await getFolderMap() : {memo: [], todo: []};

    await runMulti([MEMOS, IMAGES, META], tx => {
        const ms = tx.objectStore(MEMOS);
        const is = tx.objectStore(IMAGES);
        const meta = tx.objectStore(META);

        if (mode === 'replace') {
            ms.clear();
            is.clear();
        }
        (['memo', 'todo'] as MemoKind[]).forEach(kind =>
            meta.put({key: folderKey(kind), value: collectFolders([...currentFolders[kind], ...(folders?.[kind] ?? [])], [])}),
        );

        for (const memo of memos) {
            const local = byUid.get(memo.uid);
            if (mode === 'replace') {
                ms.put(forPut(memo));
            } else if (local) {
                if (memo.updatedAt <= local.updatedAt) continue; // 기기에 있는 쪽이 최신
                ms.put({...memo, id: local.id});
            } else {
                ms.put(forPut({...memo, id: undefined}));
            }
            memo.imageIds.forEach(id => neededImages.add(id));
        }

        images.filter(img => neededImages.has(img.id)).forEach(img => is.put(img));
    });
}
