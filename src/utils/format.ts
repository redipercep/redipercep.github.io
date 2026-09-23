export function formatDate(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fileStamp(date = new Date()) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

/** http(LAN 테스트 등)에서는 crypto.randomUUID가 없으므로 대체값 사용 */
export function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 제목이 비었을 때 본문 첫 줄로 제목 생성 */
export function deriveTitle(content: string) {
    const line = content
        .split('\n')
        .map(l => l.replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/^[\s#>*\-+]+|\[[ xX]]\s*/g, '').trim())
        .find(Boolean);
    return line ? line.slice(0, 40) : `${formatDate(new Date().toISOString())} 메모`;
}
