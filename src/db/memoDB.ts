import type {Memo, MemoImage} from '../types/memo';

const DB_NAME = 'memo-app';
const DB_VERSION = 1;
const MEMOS = 'memos';
const IMAGES = 'images';

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
            };
            req.onsuccess = () => resolve(req.result);
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
export const getAllMemos = () => run<Memo[]>(MEMOS, 'readonly', s => s.getAll());

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

// ─── 가져오기 ──────────────────────────────────────
/**
 * replace: 기존 데이터를 모두 지우고 교체
 * merge: uid가 같은 메모는 더 최근에 수정된 쪽을 남기고, 없는 메모는 추가
 */
export async function importData(memos: Memo[], images: MemoImage[], mode: 'merge' | 'replace') {
    const existing = mode === 'merge' ? await getAllMemos() : [];
    const byUid = new Map(existing.map(m => [m.uid, m]));
    const neededImages = new Set<string>();

    await runMulti([MEMOS, IMAGES], tx => {
        const ms = tx.objectStore(MEMOS);
        const is = tx.objectStore(IMAGES);

        if (mode === 'replace') {
            ms.clear();
            is.clear();
        }

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
