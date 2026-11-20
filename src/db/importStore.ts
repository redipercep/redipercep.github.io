/**
 * 가져온 글 보관함
 *
 * 백업 파일을 바로 섞지 않고 별도 저장소(importBatches / stagedMemos / stagedImages)에 묶음으로 둔다.
 * 지금 쓰는 글을 읽는 코드는 이 저장소를 보지 않으므로, 보관함에 무엇이 있어도 현재 데이터에는 영향이 없다.
 * 사용자가 고른 글만 옮기고, 옮긴 글은 보관함에서 뺀다.
 */
import type {Memo, MemoImage} from '../types/memo';
import {joinPath, normalizePath} from '../utils/folders';
import {newId} from '../utils/format';
import type {VaultRecord} from '../utils/vault';
import {
    type FolderMap, forPut, getImageIds, getRawMemos, IMAGES, IMPORT_BATCHES, MEMOS, mergeVaults, run, runMulti, STAGED_IMAGES, STAGED_MEMOS,
} from './memoDB';

export interface ImportBatch {
    id: string;
    name: string;           // 탭에 보이는 이름 (바꿀 수 있음)
    fileName: string;
    importedAt: string;
    folders: Partial<FolderMap>;
    vaults: VaultRecord[];  // 이 백업의 잠근 글을 열기 위한 salt·확인값
    memoCount: number;      // 보관함에 남은 글 수
}

interface StagedMemoRec {
    key: string;
    batchId: string;
    memo: Memo;             // 백업에 들어 있던 그대로 (잠근 글은 암호문 상태)
}

interface StagedImageRec {
    key: string;
    batchId: string;
    image: MemoImage;
}

const key = (batchId: string, id: string) => `${batchId}|${id}`;
const pad = (n: number) => String(n).padStart(2, '0');

function defaultName(fileName: string) {
    const d = new Date();
    const base = fileName.replace(/\.json$/i, '').replace(/^memo-backup-/, '') || '백업';
    return `${base} (${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 가져옴)`;
}

// ─── 묶음 ──────────────────────────────────────────
export const listBatches = () =>
    run<ImportBatch[]>(IMPORT_BATCHES, 'readonly', s => s.getAll()).then(list => list.sort((a, b) => b.importedAt.localeCompare(a.importedAt)));

export const countStaged = () => run<number>(STAGED_MEMOS, 'readonly', s => s.count());

/** 백업 파일 내용을 새 묶음으로 보관 */
export async function stageBackup(
    parsed: {memos: Memo[]; images: MemoImage[]; folders: Partial<FolderMap>; vaults: VaultRecord[]},
    fileName: string,
): Promise<ImportBatch> {
    // 같은 백업 안에 같은 글이 여러 번 있으면 가장 최근 것만
    const byUid = new Map<string, Memo>();
    parsed.memos.forEach(m => {
        const cur = byUid.get(m.uid);
        if (!cur || m.updatedAt > cur.updatedAt) byUid.set(m.uid, m);
    });
    const memos = [...byUid.values()];
    const used = new Set(memos.flatMap(m => m.imageIds));
    const batch: ImportBatch = {
        id: newId(),
        name: defaultName(fileName),
        fileName,
        importedAt: new Date().toISOString(),
        folders: parsed.folders,
        vaults: parsed.vaults,
        memoCount: memos.length,
    };
    await runMulti([IMPORT_BATCHES, STAGED_MEMOS, STAGED_IMAGES], tx => {
        tx.objectStore(IMPORT_BATCHES).put(batch);
        const ms = tx.objectStore(STAGED_MEMOS);
        memos.forEach(m => {
            const {id: _id, isSealed: _s, ...memo} = m;
            ms.put({key: key(batch.id, m.uid), batchId: batch.id, memo} as StagedMemoRec);
        });
        const is = tx.objectStore(STAGED_IMAGES);
        parsed.images.filter(img => used.has(img.id)).forEach(image => is.put({key: key(batch.id, image.id), batchId: batch.id, image} as StagedImageRec));
    });
    return batch;
}

export async function renameBatch(id: string, name: string) {
    await runMulti([IMPORT_BATCHES], tx => {
        const st = tx.objectStore(IMPORT_BATCHES);
        const g = st.get(id);
        g.onsuccess = () => g.result && st.put({...g.result, name});
    });
}

/** 인덱스로 한 묶음의 기록을 모두 지운다 (같은 트랜잭션 안에서) */
function deleteByBatch(tx: IDBTransaction, store: string, batchId: string, keep?: (rec: StagedMemoRec | StagedImageRec) => boolean) {
    const req = tx.objectStore(store).index('batch').openCursor(IDBKeyRange.only(batchId));
    req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (!keep?.(c.value)) c.delete();
        c.continue();
    };
}

export const deleteBatch = (batchId: string) =>
    runMulti([IMPORT_BATCHES, STAGED_MEMOS, STAGED_IMAGES], tx => {
        tx.objectStore(IMPORT_BATCHES).delete(batchId);
        deleteByBatch(tx, STAGED_MEMOS, batchId);
        deleteByBatch(tx, STAGED_IMAGES, batchId);
    });

export const getBatchMemos = (batchId: string) =>
    run<StagedMemoRec[]>(STAGED_MEMOS, 'readonly', s => s.index('batch').getAll(IDBKeyRange.only(batchId))).then(r => r.map(x => x.memo));

export const getStagedImage = (batchId: string, imageId: string) =>
    run<StagedImageRec | undefined>(STAGED_IMAGES, 'readonly', s => s.get(key(batchId, imageId))).then(r => r?.image);

// ─── 지금 글과 비교 ─────────────────────────────────
export type StagedStatus = 'new' | 'same' | 'newer' | 'older' | 'differs';

export const STATUS_LABEL: Record<StagedStatus, string> = {
    new: '새 글',
    same: '이미 있음',
    newer: '가져온 쪽이 최근',
    older: '지금 쪽이 최근',
    differs: '내용 다름',
};

/** 비교용 서명: 잠근 글은 암호문, 나머지는 제목·본문·댓글·태그 */
const signature = (m: Memo) =>
    m.isLocked && m.sealed ? `L:${m.sealed.data}` : JSON.stringify([m.kind, m.title, m.content, m.comments.map(c => [c.id, c.content]), m.hashtags]);

export function compareStatus(staged: Memo, local: Memo | undefined): StagedStatus {
    if (!local) return 'new';
    if (signature(staged) === signature(local)) return 'same';
    if (staged.updatedAt > local.updatedAt) return 'newer';
    if (staged.updatedAt < local.updatedAt) return 'older';
    return 'differs';
}

/** 지금 저장된 글 (uid → 원본 기록) */
export const localByUid = async () => new Map((await getRawMemos()).map(m => [m.uid, m]));

// ─── 골라서 가져오기 ────────────────────────────────
export type ConflictAction = 'copy' | 'overwrite' | 'skip';

export interface ImportOptions {
    actions: Record<string, ConflictAction>;   // 같은 글이 이미 있을 때 글마다 (기본: 복사본)
    folderPrefix: string | null;                // null = 원래 폴더 그대로, 문자열 = 그 폴더 아래로
}

export interface ImportResult {
    added: number;          // 새 글
    copied: number;         // 복사본
    overwritten: number;
    skipped: number;        // 건너뛴 글 (보관함에 남음)
    batchEmptied: boolean;  // 다 옮겨서 묶음이 지워짐
}

const ID = '[A-Za-z0-9][A-Za-z0-9-]*';

/** 복사본에 새 id를 줬으면 본문·댓글 속 링크도 새 id로 맞춘다 (잠근 글은 암호문이라 그대로) */
function rewriteRefs(text: string, uidMap: Map<string, string>, imgMap: Map<string, string>) {
    if (!uidMap.size && !imgMap.size) return text;
    return text
        .replace(new RegExp(`memo:(${ID})`, 'g'), (all, id: string) => (uidMap.has(id) ? `memo:${uidMap.get(id)}` : all))
        .replace(new RegExp(`memo-img:(${ID})`, 'g'), (all, id: string) => (imgMap.has(id) ? `memo-img:${imgMap.get(id)}` : all))
        .replace(new RegExp(`🔗(\\s*)(${ID})`, 'gu'), (all, sp: string, id: string) => (uidMap.has(id) ? `🔗${sp}${uidMap.get(id)}` : all));
}

export async function importFromBatch(batchId: string, uids: string[], opts: ImportOptions): Promise<ImportResult> {
    const wanted = new Set(uids);
    const [allStaged, local, localImages, batches] = await Promise.all([getBatchMemos(batchId), localByUid(), getImageIds(), listBatches()]);
    const batch = batches.find(b => b.id === batchId);
    const staged = allStaged.filter(m => wanted.has(m.uid));
    const localImageSet = new Set(localImages);

    // 1) 글마다 할 일 정하기
    type Plan = {m: Memo; action: 'new' | ConflictAction; local?: Memo};
    const plans: Plan[] = staged.map(m => {
        const l = local.get(m.uid);
        let action: Plan['action'] = l ? opts.actions[m.uid] ?? 'copy' : 'new';
        if (action === 'copy' && m.isLocked) action = 'skip'; // 잠근 글은 암호문이라 복사본을 만들 수 없음
        return {m, action, local: l};
    });

    // 2) 복사본은 새 uid, 이미 있는 이미지 id와 겹치면 새 이미지 id
    const uidMap = new Map<string, string>();
    plans.filter(p => p.action === 'copy').forEach(p => uidMap.set(p.m.uid, newId()));
    const imgMap = new Map<string, string>();
    plans
        .filter(p => p.action === 'new' || p.action === 'copy')
        .forEach(p => p.m.imageIds.forEach(id => localImageSet.has(id) && !p.m.isLocked && imgMap.set(id, newId())));

    const place = (category: string) => (opts.folderPrefix === null ? normalizePath(category) : joinPath(opts.folderPrefix, category));
    const rw = (m: Memo, text: string) => (m.isLocked ? text : rewriteRefs(text, uidMap, imgMap));

    const records: Memo[] = [];
    const imagesToCopy: {from: string; to: string}[] = [];
    const orphanLocalImages: string[] = [];
    const done = new Set<string>();
    const result: ImportResult = {added: 0, copied: 0, overwritten: 0, skipped: 0, batchEmptied: false};

    for (const p of plans) {
        if (p.action === 'skip') {
            result.skipped++;
            continue;
        }
        const {m} = p;
        const imageIds = m.imageIds.map(id => imgMap.get(id) ?? id);
        const base: Memo = {
            ...m,
            content: rw(m, m.content),
            comments: m.comments.map(c => ({...c, content: rw(m, c.content)})),
            imageIds,
        };
        if (p.action === 'overwrite' && p.local) {
            // 덮어쓰기: 내용은 가져온 것, 위치(폴더)·id는 지금 글 그대로
            records.push({...base, id: p.local.id, category: p.local.category});
            p.local.imageIds.filter(id => !imageIds.includes(id)).forEach(id => orphanLocalImages.push(id));
            result.overwritten++;
        } else if (p.action === 'copy') {
            records.push({...base, id: undefined, uid: uidMap.get(m.uid) as string, title: `${m.title} (가져온 사본)`, category: place(m.category)});
            result.copied++;
        } else {
            records.push({...base, id: undefined, category: place(m.category)});
            result.added++;
        }
        m.imageIds.forEach(id => imagesToCopy.push({from: id, to: imgMap.get(id) ?? id}));
        done.add(m.uid);
    }

    // 3) 이미지 읽어 두기 (트랜잭션 밖에서)
    const images = (await Promise.all(imagesToCopy.map(async ({from, to}) => {
        const img = await getStagedImage(batchId, from);
        return img ? {...img, id: to} : null;
    }))).filter((x): x is MemoImage => !!x);

    // 잠근 글을 옮기면 그 백업의 금고(salt·확인값)도 함께
    if (batch && records.some(r => r.isLocked)) await mergeVaults(batch.vaults);

    // 4) 쓰기 + 보관함에서 빼기를 한 번에 (중간에 실패하면 아무것도 바뀌지 않음)
    const remaining = allStaged.filter(m => !done.has(m.uid));
    const stillUsed = new Set(remaining.flatMap(m => m.imageIds));
    await runMulti([MEMOS, IMAGES, STAGED_MEMOS, STAGED_IMAGES, IMPORT_BATCHES], tx => {
        const ms = tx.objectStore(MEMOS);
        records.forEach(r => ms.put(forPut(r)));
        const is = tx.objectStore(IMAGES);
        images.forEach(img => is.put(img));
        orphanLocalImages.forEach(id => is.delete(id));

        const sm = tx.objectStore(STAGED_MEMOS);
        done.forEach(uid => sm.delete(key(batchId, uid)));
        const si = tx.objectStore(STAGED_IMAGES);
        imagesToCopy.forEach(({from}) => !stillUsed.has(from) && si.delete(key(batchId, from)));

        const bs = tx.objectStore(IMPORT_BATCHES);
        if (!remaining.length) bs.delete(batchId);
        else if (batch) bs.put({...batch, memoCount: remaining.length});
    });
    result.batchEmptied = !remaining.length;
    return result;
}

/** 가져오지 않고 보관함에서만 빼기 (이미 있는 같은 글 정리 등) */
export async function removeFromBatch(batchId: string, uids: string[]) {
    const drop = new Set(uids);
    const [all, batches] = await Promise.all([getBatchMemos(batchId), listBatches()]);
    const batch = batches.find(b => b.id === batchId);
    const remaining = all.filter(m => !drop.has(m.uid));
    const stillUsed = new Set(remaining.flatMap(m => m.imageIds));
    await runMulti([STAGED_MEMOS, STAGED_IMAGES, IMPORT_BATCHES], tx => {
        const sm = tx.objectStore(STAGED_MEMOS);
        all.filter(m => drop.has(m.uid)).forEach(m => {
            sm.delete(key(batchId, m.uid));
            m.imageIds.forEach(id => !stillUsed.has(id) && tx.objectStore(STAGED_IMAGES).delete(key(batchId, id)));
        });
        const bs = tx.objectStore(IMPORT_BATCHES);
        if (!remaining.length) bs.delete(batchId);
        else if (batch) bs.put({...batch, memoCount: remaining.length});
    });
    return !remaining.length;
}
