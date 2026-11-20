import {createContext, useContext, useEffect, useState} from 'react';

/** 본문 속 이미지를 어디서 읽을지 바꿀 때 (가져온 글 보관함 미리보기 → 보관함 이미지) */
export interface ImageSource {
    key: string;                                    // 바뀌면 다시 읽음
    load: (imageId: string) => Promise<Blob | null>;
}

export const ImageSourceContext = createContext<ImageSource | null>(null);

/** 지정된 곳에서 이미지를 읽어 주소로. undefined = 읽는 중, null = 없음 */
export function useSourceImageUrl(id: string | null) {
    const source = useContext(ImageSourceContext);
    const [url, setUrl] = useState<string | null | undefined>(undefined);
    useEffect(() => {
        if (!source || !id) return;
        let alive = true;
        let made: string | null = null;
        setUrl(undefined);
        source.load(id).then(blob => {
            if (!alive) return;
            made = blob ? URL.createObjectURL(blob) : null;
            setUrl(made);
        }).catch(() => alive && setUrl(null));
        return () => {
            alive = false;
            if (made) URL.revokeObjectURL(made);
        };
    }, [source, id]);
    return {active: !!source, url};
}
