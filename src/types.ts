export interface NewsItem {
    title: string;
    link: string;
    summary: string;
}

export interface NewsTopic {
    code: string;
    label: string;
}

export interface NewsState {
    pending: boolean;
    scope: "local" | "international" | null;
    topic: NewsTopic | null;
    lastReadIndex: number | null;
    pendingFullChoice: boolean;
    isReadingList: boolean;
    stopReadingList: boolean;
}

export interface ReadingState {
    chunks: string[];
    index: number;
    isReading: boolean;
    sourceUrl: string;
}

export interface WeatherState {
    pendingCityPrompt: boolean;
}

export interface Entities {
    query: string;
    newsScope?: "local" | "international" | null;
    newsTopic?: NewsTopic | null;
    newsIndex?: number | null;
}

export interface Task {
    intent: string;
    minConfidence: number;
    action: (entities: Entities) => void | Promise<void>;
}

export interface IntentResult {
    intent: string;
    confidence: number;
    scores: Record<string, number>;
    sorted: [string, number][];
}
