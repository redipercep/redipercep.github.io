/**
 * 비밀번호 잠금 (브라우저 내장 Web Crypto 사용, 외부 라이브러리 없음)
 *
 *  - 마스터 비밀번호 + 무작위 salt → PBKDF2-SHA256 60만 회 → AES-256-GCM 키
 *  - 비밀번호와 키는 어디에도 저장하지 않는다. 키는 잠금을 푼 동안 메모리에만 있다.
 *  - 저장하는 것: salt, 그리고 비밀번호 확인용 문구를 암호화한 값(check)
 *  - 다른 기기에서 가져온 백업은 그 기기의 salt(금고)를 함께 들고 온다 → 금고가 여러 개일 수 있다.
 */
import {useEffect, useState} from 'react';

export interface VaultRecord {
    id: string;
    salt: string;           // base64
    iterations: number;
    check: Sealed;
    createdAt: string;
}

/** 암호화된 값: 어떤 금고의 키로, 어떤 iv로 */
export interface Sealed {
    v: string;              // 금고 id
    iv: string;             // base64
    data: string;           // base64
}

const ITERATIONS = 600_000;
const CHECK_TEXT = 'memo-app-vault-check';

const keys = new Map<string, CryptoKey>();   // 열린 금고들의 키 (메모리에만)
let activeId: string | null = null;           // 새로 잠글 때 쓰는 금고
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(fn => fn());

// ─── base64 ──────────────────────────────────────────
export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
};
export const fromB64 = (b64: string) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {name: 'PBKDF2', salt, iterations, hash: 'SHA-256'},
        base,
        {name: 'AES-GCM', length: 256},
        false, // 키를 밖으로 꺼낼 수 없게
        ['encrypt', 'decrypt'],
    );
}

async function encryptWith(key: CryptoKey, v: string, bytes: Uint8Array): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, bytes);
    return {v, iv: toB64(iv), data: toB64(data)};
}

async function decryptWith(key: CryptoKey, sealed: {iv: string; data: string}) {
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(sealed.iv)}, key, fromB64(sealed.data)));
}

// ─── 금고 열기 · 잠그기 ───────────────────────────────
export const isUnlocked = () => keys.size > 0;
export const canOpen = (v: string) => keys.has(v);
export const activeVault = () => activeId;

/** 새 금고 만들기 (처음 비밀번호를 정할 때, 비밀번호를 바꿀 때) */
export async function createVaultRecord(password: string): Promise<{record: VaultRecord; key: CryptoKey}> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const id = toB64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, '').slice(0, 12);
    const key = await deriveKey(password, salt, ITERATIONS);
    const check = await encryptWith(key, id, new TextEncoder().encode(CHECK_TEXT));
    return {record: {id, salt: toB64(salt), iterations: ITERATIONS, check, createdAt: new Date().toISOString()}, key};
}

/** 이 비밀번호로 열리는 금고들의 키를 찾는다 (하나도 없으면 빈 배열) */
export async function tryOpen(password: string, records: VaultRecord[]) {
    const opened: {id: string; key: CryptoKey}[] = [];
    for (const r of records) {
        try {
            const key = await deriveKey(password, fromB64(r.salt), r.iterations);
            const text = new TextDecoder().decode(await decryptWith(key, r.check));
            if (text === CHECK_TEXT) opened.push({id: r.id, key});
        } catch {
            /* 이 금고의 비밀번호가 아님 */
        }
    }
    return opened;
}

export function setOpened(opened: {id: string; key: CryptoKey}[], active: string | null) {
    opened.forEach(o => keys.set(o.id, o.key));
    activeId = active && keys.has(active) ? active : opened[0]?.id ?? activeId;
    notify();
}

export function lockVault() {
    if (!keys.size) return;
    keys.clear();
    notify();
}

// ─── 암호화 · 복호화 ─────────────────────────────────
export async function sealJSON(value: unknown): Promise<Sealed> {
    const key = activeId ? keys.get(activeId) : undefined;
    if (!key || !activeId) throw new Error('잠금이 풀려 있지 않습니다');
    return encryptWith(key, activeId, new TextEncoder().encode(JSON.stringify(value)));
}

export async function openJSON<T>(sealed: Sealed): Promise<T | null> {
    const key = keys.get(sealed.v);
    if (!key) return null;
    try {
        return JSON.parse(new TextDecoder().decode(await decryptWith(key, sealed))) as T;
    } catch {
        return null;
    }
}

export async function sealBytes(buf: ArrayBuffer): Promise<Sealed> {
    const key = activeId ? keys.get(activeId) : undefined;
    if (!key || !activeId) throw new Error('잠금이 풀려 있지 않습니다');
    return encryptWith(key, activeId, new Uint8Array(buf));
}

export async function openBytes(sealed: Sealed): Promise<Uint8Array | null> {
    const key = keys.get(sealed.v);
    if (!key) return null;
    try {
        return await decryptWith(key, sealed);
    } catch {
        return null;
    }
}

// ─── React ───────────────────────────────────────────
export function subscribeVault(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** 잠금 상태가 바뀌면 다시 그린다 */
export function useVaultState() {
    const [unlocked, setUnlocked] = useState(isUnlocked());
    useEffect(() => subscribeVault(() => setUnlocked(isUnlocked())), []);
    return unlocked;
}

/**
 * 자동 잠금: 조작이 minutes분 없거나(0이면 끔), lockOnHide이면 다른 앱·탭으로 갈 때 잠근다.
 * paused(편집 중)에는 잠그지 않는다 — 잠그면 편집 중인 잠근 글을 저장할 수 없기 때문.
 */
export function useAutoLock(minutes: number, lockOnHide: boolean, paused: boolean) {
    const unlocked = useVaultState();
    useEffect(() => {
        if (!unlocked || paused) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arm = () => {
            if (timer) clearTimeout(timer);
            if (minutes > 0) timer = setTimeout(lockVault, minutes * 60_000);
        };
        const onVisibility = () => {
            if (lockOnHide && document.visibilityState === 'hidden') lockVault();
        };
        const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
        events.forEach(e => window.addEventListener(e, arm, {passive: true}));
        document.addEventListener('visibilitychange', onVisibility);
        arm();
        return () => {
            if (timer) clearTimeout(timer);
            events.forEach(e => window.removeEventListener(e, arm));
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [unlocked, paused, minutes, lockOnHide]);
}
