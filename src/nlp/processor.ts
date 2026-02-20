import { parse, normalizeTokens } from "../utils/helpers.ts";
import { detectIntent } from "./intent.ts";
import {
    extractQuery,
    extractNewsScope,
    extractNewsTopic,
    extractNewsIndex
} from "./entities.ts";
import type { Entities } from "../types.ts";

export function understand(input: string) {
    let tokens = parse(input);
    tokens = normalizeTokens(tokens);

    const { intent, confidence, scores, sorted } = detectIntent(tokens);

    const entities: Entities = {
        query: extractQuery(tokens, [
            "play", "pause", "resume", "stop", "replay", "next", "previous", "skip",
            "open", "search", "image", "weather", "me", "some", "a", "an", "to", "on",
            "for", "in", "get", "date", "time", "what", "is", "who", "are", "tell",
            "about", "read", "reread", "repeat", "and", "find", "this", "page",
            "reader", "reading", "continue", "resume", "paragraph", "start",
            "beginning", "over", "again", "music", "song", "track", "spotify",
            "playlist", "album", "news", "headline", "headlines", "latest",
            "article", "full", "fullpage", "local", "international", "global",
            "world", "tech", "technology", "finance", "business", "sports",
            "sport", "health", "science", "entertainment", "movies", "politics",
            "national",
        ]),
        newsScope: extractNewsScope(tokens),
        newsTopic: extractNewsTopic(tokens),
        newsIndex: extractNewsIndex(tokens),
    };

    return { intent, confidence, entities, scores, sorted };
}
