export interface Preset {
    name: string;
    icon: string;
    chip: string;       // 카테고리 칩 색상 (Tailwind 클래스)
    template: string;   // 빈 메모에서 선택하면 채워지는 기본 틀
}

export const PRESETS: Preset[] = [
    {
        name: '업무',
        icon: '💼',
        chip: 'bg-sky-900/70 text-sky-200',
        template: '## 진행 상황\n- [ ] \n\n## 이슈 / 막힌 점\n- \n\n## 다음 할 일\n- [ ] \n',
    },
    {
        name: '상태',
        icon: '🌡️',
        chip: 'bg-rose-900/60 text-rose-200',
        template: '## 컨디션\n- 에너지: /5\n- 기분: \n\n## 지금 드는 생각\n',
    },
    {
        name: '아이디어',
        icon: '💡',
        chip: 'bg-amber-900/60 text-amber-200',
        template: '## 아이디어\n\n## 왜 필요한가\n\n## 다음 단계\n- [ ] \n',
    },
];

export const findPreset = (category: string) => PRESETS.find(p => p.name === category);
export const categoryIcon = (category: string) => findPreset(category)?.icon ?? '📁';
export const categoryChip = (category: string) => findPreset(category)?.chip ?? 'bg-gray-700 text-gray-200';
