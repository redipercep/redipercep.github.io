import type {Memo, MemoImage, MemoKind} from '../types/memo';
import {collectFolders, isInside, movePath, normalizePath, parentPath} from '../utils/folders';
import {
    createVaultRecord, fromB64, openBytes, openJSON, sealBytes, sealJSON, setOpened, toB64, tryOpen, type VaultRecord,
} from '../utils/vault';

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
// 잠근 글은 이 경계에서 암호화·복호화한다 → 나머지 화면 코드는 평범한 글처럼 다룬다
interface LockedPayload {
    title: string;
    content: string;
    comments: Memo['comments'];
    hashtags: string[];
}
export const LOCKED_TITLE = '🔒 잠긴 글';

/** 저장된 그대로 (잠근 글은 암호문 상태) — 백업·가져오기용 */
export const getRawMemos = () => run<Memo[]>(MEMOS, 'readonly', s => s.getAll());

async function decode(r: Memo): Promise<Memo> {
    const m = {...r, kind: r.kind ?? 'memo', comments: r.comments ?? []} as Memo;
    if (!m.isLocked || !m.sealed) return m;
    const {sealed, ...rest} = m;
    const p = await openJSON<LockedPayload>(sealed);
    if (!p) return {...rest, title: LOCKED_TITLE, content: '', comments: [], hashtags: [], isSealed: true};
    return {...rest, ...p, isSealed: false};
}

/** 예전에 저장된 데이터에 없는 필드를 기본값으로 채우고, 열 수 있는 잠근 글은 풀어서 돌려준다 */
export const getAllMemos = async () => Promise.all((await getRawMemos()).map(decode));

async function encode(memo: Memo): Promise<Memo> {
    const {isSealed: _s, sealed: _old, ...m} = memo;
    if (!m.isLocked) return m;
    const sealed = await sealJSON({title: m.title, content: m.content, comments: m.comments, hashtags: m.hashtags} as LockedPayload);
    return {...m, title: '', content: '', comments: [], hashtags: [], sealed};
}

/** 잠근 글의 이미지는 암호화, 잠금을 푼 글의 이미지는 원래대로 */
async function syncImageLock(ids: string[], locked: boolean) {
    for (const id of ids) {
        const img = await getImage(id);
        if (!img || !!img.enc === locked) continue;
        const bytes = await img.blob.arrayBuffer();
        if (locked) {
            const s = await sealBytes(bytes);
            await addImage({...img, blob: new Blob([fromB64(s.data)]), enc: {v: s.v, iv: s.iv}});
        } else if (img.enc) {
            const plain = await openBytes({v: img.enc.v, iv: img.enc.iv, data: toB64(bytes)});
            if (!plain) continue; // 다른 비밀번호의 이미지 — 그대로 둔다
            const {enc: _e, ...rest} = img;
            await addImage({...rest, blob: new Blob([plain], {type: img.type})});
        }
    }
}

export async function saveMemo(memo: Memo): Promise<number> {
    if (memo.isSealed) {
        // 잠긴 채 보이는 글: 암호문은 그대로 두고 즐겨찾기·숨김·폴더만 저장
        const id = memo.id;
        if (id == null) throw new Error('잠긴 글은 새로 만들 수 없습니다');
        await runMulti([MEMOS], tx => {
            const st = tx.objectStore(MEMOS);
            const g = st.get(id);
            g.onsuccess = () => g.result && st.put({...g.result, isFavorite: memo.isFavorite, isHidden: memo.isHidden, category: memo.category});
        });
        return id;
    }
    const record = await encode(memo);
    await syncImageLock(record.imageIds, !!record.isLocked);
    return run<IDBValidKey>(MEMOS, 'readwrite', s => s.put(forPut(record))).then(key => key as number);
}

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

/** 여러 글의 표시 상태(숨김 등)를 한 번에 바꾼다. 내용 수정이 아니므로 수정일은 그대로 */
export const updateMemos = (ids: number[], patch: Partial<Pick<Memo, 'isHidden' | 'isFavorite'>>) => {
    const target = new Set(ids);
    return runMulti([MEMOS], tx => {
        const req = tx.objectStore(MEMOS).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const m = cursor.value as Memo;
            if (m.id != null && target.has(m.id)) cursor.update({...m, ...patch});
            cursor.continue();
        };
    });
};

// ─── 가져오기 ──────────────────────────────────────
/**
 * replace: 기존 데이터를 모두 지우고 교체
 * merge: uid가 같은 메모는 더 최근에 수정된 쪽을 남기고, 없는 메모는 추가
 */
export async function importData(memos: Memo[], images: MemoImage[], mode: 'merge' | 'replace', folders?: Partial<FolderMap>, vaults: VaultRecord[] = []) {
    const localVaults = await getVaultRecords();
    const existing = mode === 'merge' ? await getRawMemos() : [];
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
        // 잠근 글을 열 수 있도록 금고(salt·확인값)도 합친다. 이 기기에 금고가 없으면 가져온 것을 기본으로
        if (vaults.length) {
            const merged = [...localVaults, ...vaults.filter(v => !localVaults.some(l => l.id === v.id))];
            meta.put({key: VAULTS, value: merged});
            if (!localVaults.length) meta.put({key: ACTIVE_VAULT, value: vaults[vaults.length - 1].id});
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

// ─── 비밀번호 잠금 ──────────────────────────────────
const VAULTS = 'vaults';
const ACTIVE_VAULT = 'vault:active';

export const getVaultRecords = () =>
    run<{key: string; value: VaultRecord[]} | undefined>(META, 'readonly', s => s.get(VAULTS)).then(r => r?.value ?? []);
const getActiveVaultId = () =>
    run<{key: string; value: string} | undefined>(META, 'readonly', s => s.get(ACTIVE_VAULT)).then(r => r?.value ?? null);
const putMeta = (key: string, value: unknown) => run<IDBValidKey>(META, 'readwrite', s => s.put({key, value}));

/** 처음 비밀번호 정하기 (정한 뒤 바로 열린 상태) */
export async function setupPassword(password: string) {
    const {record, key} = await createVaultRecord(password);
    await putMeta(VAULTS, [...(await getVaultRecords()), record]);
    await putMeta(ACTIVE_VAULT, record.id);
    setOpened([{id: record.id, key}], record.id);
}

/** 잠금 풀기. 비밀번호가 맞는 금고가 하나도 없으면 false */
export async function unlockWithPassword(password: string) {
    const opened = await tryOpen(password, await getVaultRecords());
    if (!opened.length) return false;
    setOpened(opened, await getActiveVaultId());
    return true;
}

/**
 * 비밀번호 바꾸기: 새 금고를 만들고, 기존 비밀번호로 열리는 잠근 글·이미지를 모두 새 키로 다시 암호화.
 * 다른 비밀번호로 잠긴 글(다른 기기에서 가져온 것 등)은 그대로 남는다.
 */
export async function changePassword(oldPassword: string, newPassword: string) {
    const records = await getVaultRecords();
    const opened = await tryOpen(oldPassword, records);
    if (!opened.length) return false;
    const {record, key} = await createVaultRecord(newPassword);
    setOpened([...opened, {id: record.id, key}], record.id);
    const oldIds = new Set(opened.map(o => o.id));

    for (const raw of await getRawMemos()) {
        if (!raw.isLocked || !raw.sealed || !oldIds.has(raw.sealed.v)) continue;
        const plain = await decode(raw);
        if (plain.isSealed) continue;
        const rec = await encode(plain); // 새 금고 키로 다시 암호화
        await run<IDBValidKey>(MEMOS, 'readwrite', s => s.put(forPut(rec)));
    }
    for (const img of await getAllImages()) {
        if (!img.enc || !oldIds.has(img.enc.v)) continue;
        const bytes = await openBytes({v: img.enc.v, iv: img.enc.iv, data: toB64(await img.blob.arrayBuffer())});
        if (!bytes) continue;
        const s = await sealBytes(bytes.buffer as ArrayBuffer);
        await addImage({...img, blob: new Blob([fromB64(s.data)]), enc: {v: s.v, iv: s.iv}});
    }
    await putMeta(VAULTS, [...records.filter(r => !oldIds.has(r.id)), record]);
    await putMeta(ACTIVE_VAULT, record.id);
    return true;
}

