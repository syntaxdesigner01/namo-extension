import { hasPhrase } from "../utils/helpers.ts";
import type { IntentResult } from "../types.ts";

export const DEBUG_INTENT = true;

export function detectIntent(tokens: string[]): IntentResult {
    const scores: Record<string, number> = {
        GREET: 0,
        HOW_ARE_YOU: 0,
        IDENTITY: 0,
        AGE: 0,
        OPEN_SITE: 0,
        PLAY_MUSIC: 0,
        SEARCH_WEB: 0,
        PLAY_YOUTUBE: 0,
        GET_IMAGE: 0,
        MEDIA_CONTROL: 0,
        DEV_SEARCH: 0,
        TAB_CONTROL: 0,
        CLOSE_TAB: 0,
        TIME: 0,
        DATE: 0,
        HELP: 0,
        WEATHER: 0,
        UNKNOWN: 0,
        SEARCH_AND_READ: 0,
        NEWS: 0,
        CALCULATE: 0,
        READ_NEWS_ITEM: 0,
        OPEN_ALL_NEWS: 0,
        READ_PAGE: 0,
        READ_PAGE_RESTART: 0,
        READ_PAGE_CONTINUE: 0,
        READ_PAGE_NEXT: 0,
        READ_PAGE_PREV: 0,
        READ_PAGE_STOP: 0,
        READ_PAGE_LAST: 0,
        READ_PAGE_FINAL: 0,
        MUSIC_PAUSE: 0,
        MUSIC_RESUME: 0,
        MUSIC_STOP: 0,
        MUSIC_NEXT: 0,
        MUSIC_PREV: 0,
        MUSIC_REPLAY: 0,
        NEWS_OPEN_ITEM: 0,
        NEWS_READ_FULL: 0,
        NEWS_READ_ALL: 0,
        NEWS_STOP: 0,
        NEWS_LATEST: 0,
        NEWS_NEXT: 0,
        NEWS_PREV: 0,
        NEWS_READ_FULL_BODY: 0,
        NEWS_FULL_CHOICE: 0,
    };

    // ---- Greeting phrases (HIGH PRIORITY)
    if (
        hasPhrase(tokens, ["good", "morning"]) ||
        hasPhrase(tokens, ["good", "afternoon"]) ||
        hasPhrase(tokens, ["good", "evening"]) ||
        hasPhrase(tokens, ["whats", "up"]) ||
        tokens.includes("howdy") ||
        tokens.includes("yo")
    ) {
        scores.GREET += 5;
    }

    // ---- HOW ARE YOU (dual intent logic)
    const isHowAreYou =
        hasPhrase(tokens, ["how", "are", "you"]) ||
        hasPhrase(tokens, ["how", "you", "doing"]);

    if (isHowAreYou) {
        scores.HOW_ARE_YOU += 4;

        // Short versions behave like greetings
        if (tokens.length <= 4) {
            scores.GREET += 3;
        }
    }

    // ---- Identity
    if (
        hasPhrase(tokens, ["what", "your", "name"]) ||
        hasPhrase(tokens, ["who", "are", "you"])
    ) {
        scores.IDENTITY += 5;
    }

    // ---- Age
    if (
        hasPhrase(tokens, ["how", "old", "are", "you"]) ||
        tokens.includes("age")
    ) {
        scores.AGE += 5;
    }

    // ---- Close tab
    if (
        hasPhrase(tokens, ["close", "tab"]) ||
        hasPhrase(tokens, ["close", "this", "tab"])
    ) {
        scores.CLOSE_TAB += 5;
    }

    // ---- Search and Read
    if (
        hasPhrase(tokens, ["tell", "me", "about"]) ||
        hasPhrase(tokens, ["what", "is"]) ||
        hasPhrase(tokens, ["who", "is"]) ||
        hasPhrase(tokens, ["search", "and", "read"])
    ) {
        scores.SEARCH_AND_READ += 5;
    }

    // ---- News
    if (
        hasPhrase(tokens, ["latest", "news"]) ||
        hasPhrase(tokens, ["headlines"]) ||
        hasPhrase(tokens, ["what", "is", "happening"])
    ) {
        scores.NEWS += 5;
    }

    // ---- Math
    const mathTokens = [
        "plus", "minus", "times", "multiplied", "divided", "multiply", "add", "subtract",
        "power", "squared", "cubed", "root", "percent", "percentage", "factorial",
        "sin", "cos", "tan", "log", "ln", "exp", "abs", "modulo", "mod", "pi",
        "sum", "total", "product", "quotient", "difference", "average", "mean",
        "max", "maximum", "min", "minimum", "floor", "ceil", "round", "rounding",
        "cosine", "sine", "tangent", "arcsin", "arccos", "arctan", "hypot",
        "hypotenuse", "logarithm", "log10", "log2", "pow", "sqrt", "cbrt",
        "solve", "compute", "calculate", "math", "maths", "arithmetic",
        "math", "maths", "arithmetic", "equation", "formula", "eval", "evaluate", "expression", "digit", "numeric",
        "remainder", "logarithmic", "exponential", "absolute", "trigonometry",
        "currency", "convert", "conversion", "exchange", "rate", "usd", "eur", "gbp", "jpy", "cad", "aud", "naira", "ngn",
        "krw", "brl", "mxn", "sar", "try", "chf", "idr", "twd", "pln", "ars", "sek", "nok", "sgd", "thb", "aed", "zar", "egp", "cop", "clp", "myr", "php", "vnd", "pkr", "bdt", "irr", "dkk", "czk", "hkd", "nzd", "ils", "kzt", "qar", "kwd", "huf", "uah", "pen", "ron", "omr", "mad",
        "btc", "eth", "sol", "bnb", "xrp", "ada", "avax", "dot", "doge", "shib", "matic", "ltc", "trx", "link", "uni", "bch", "atom", "xlm", "xmr", "etc", "icp", "fil", "apt", "near", "arb", "op", "stx", "rndr", "inj", "tia", "sei", "sui", "grt", "algo", "qnt", "ftm", "sand", "mana", "axs", "flow", "eos", "theta"
    ];

    const mathSymbols = ["+", "-", "*", "/", "^", "%", "sqrt", "cbrt", "$", "€", "£"];

    const hasMathOperator = tokens.some(t => mathTokens.includes(t) || mathSymbols.some(s => t.includes(s)));
    const hasMathAction = tokens.includes("calculate") || tokens.includes("compute") || tokens.includes("solve") || tokens.includes("math") || tokens.includes("maths") || tokens.includes("convert");

    // Core math detection
    if (hasMathAction) {
        scores.CALCULATE += 6;
    }

    // High priority: Direct numeric expressions (e.g., "1 + 1", "5 * 10")
    const numericTokens = tokens.filter(t => !isNaN(parseFloat(t)));
    const operatorTokens = tokens.filter(t => mathSymbols.includes(t));

    if (numericTokens.length >= 2 && operatorTokens.length >= 1) {
        scores.CALCULATE += 8;
    }

    // Currency conversion pattern: [Numeric] [Currency] to [Currency]
    const currencyCodes = [
        "usd", "eur", "gbp", "jpy", "cad", "aud", "naira", "ngn", "dollars", "pounds", "euro", "yen",
        "krw", "won", "brl", "real", "mxn", "peso", "sar", "riyal", "try", "lira", "chf", "franc", "idr", "rupiah", "twd", "pln", "zloty",
        "ars", "sek", "krona", "nok", "krone", "sgd", "thb", "baht", "aed", "dirham", "zar", "rand", "egp", "cop", "clp", "myr", "ringgit", "php", "vnd", "dong",
        "pkr", "bdt", "taka", "irr", "dkk", "czk", "koruna", "hkd", "nzd", "ils", "shekel", "kzt", "qar", "kwd", "dinar", "huf", "forint", "uah", "hryvnia", "pen", "ron", "leu", "omr", "mad",
        "btc", "bitcoin", "eth", "ethereum", "sol", "solana", "bnb", "binance", "xrp", "ripple", "ada", "cardano", "avax", "avalanche", "dot", "polkadot",
        "doge", "dogecoin", "shib", "shiba", "matic", "polygon", "ltc", "litecoin", "trx", "tron", "link", "chainlink", "uni", "uniswap", "bch", "atom", "xlm", "xmr", "etc", "icp", "fil", "apt", "near", "arb", "op", "stx", "rndr", "inj", "tia", "sei", "sui", "grt", "algo", "qnt", "ftm", "sand", "mana", "axs", "flow", "eos", "theta"
    ];
    const hasCurrencyToCurrency = tokens.includes("to") && tokens.some(t => currencyCodes.includes(t));
    if (numericTokens.length >= 1 && hasCurrencyToCurrency) {
        scores.CALCULATE += 12;
    }

    // Pattern: [Number] [Operator] [Number]
    for (let i = 0; i < tokens.length - 2; i++) {
        if (!isNaN(parseFloat(tokens[i])) &&
            (mathSymbols.includes(tokens[i + 1]) || mathTokens.includes(tokens[i + 1])) &&
            !isNaN(parseFloat(tokens[i + 2]))) {
            scores.CALCULATE += 10;
            break;
        }
    }

    // Extreme boost: If the ENTIRE message is made of math components and basic helpers
    const mathHelpers = ["is", "the", "what", "whats", "result", "answer", "equal", "equals", "of", "and", "for", "to", "in"];
    const isPureMath = tokens.every(t =>
        !isNaN(parseFloat(t)) ||
        mathSymbols.some(s => t.includes(s)) ||
        mathTokens.includes(t) ||
        mathHelpers.includes(t) ||
        currencyCodes.includes(t)
    );

    if (isPureMath && tokens.length >= 1 && (numericTokens.length >= 1 || operatorTokens.length >= 1 || hasCurrencyToCurrency)) {
        scores.CALCULATE += 15;
    }

    // Natural language math phrases (extended variations)
    if (
        hasPhrase(tokens, ["what", "is"]) ||
        hasPhrase(tokens, ["how", "much"]) ||
        hasPhrase(tokens, ["calculate", "the"]) ||
        hasPhrase(tokens, ["compute", "this"]) ||
        hasPhrase(tokens, ["solve", "for"]) ||
        hasPhrase(tokens, ["result", "of"]) ||
        hasPhrase(tokens, ["value", "of"]) ||
        hasPhrase(tokens, ["sum", "of"]) ||
        hasPhrase(tokens, ["product", "of"]) ||
        hasPhrase(tokens, ["difference", "between"]) ||
        hasPhrase(tokens, ["quotient", "of"]) ||
        hasPhrase(tokens, ["square", "root"]) ||
        hasPhrase(tokens, ["cube", "root"]) ||
        hasPhrase(tokens, ["power", "of"]) ||
        hasPhrase(tokens, ["sin", "of"]) ||
        hasPhrase(tokens, ["cos", "of"]) ||
        hasPhrase(tokens, ["tan", "of"]) ||
        hasPhrase(tokens, ["log", "of"]) ||
        hasPhrase(tokens, ["factorial", "of"]) ||
        hasPhrase(tokens, ["absolute", "value"]) ||
        hasPhrase(tokens, ["percentage", "of"]) ||
        hasPhrase(tokens, ["percent", "of"]) ||
        hasPhrase(tokens, ["multiplied", "by"]) ||
        hasPhrase(tokens, ["divided", "by"]) ||
        hasPhrase(tokens, ["added", "to"]) ||
        hasPhrase(tokens, ["subtracted", "from"]) ||
        hasPhrase(tokens, ["raised", "to"]) ||
        hasPhrase(tokens, ["remainder", "of"]) ||
        hasPhrase(tokens, ["do", "the", "math"]) ||
        hasPhrase(tokens, ["math", "problem"]) ||
        hasPhrase(tokens, ["work", "out"]) ||
        hasPhrase(tokens, ["give", "me", "the", "answer"]) ||
        hasPhrase(tokens, ["what", "does", "it", "equal"]) ||
        hasPhrase(tokens, ["total", "of"]) ||
        hasPhrase(tokens, ["add", "up"]) ||
        hasPhrase(tokens, ["how", "many", "is"]) ||
        hasPhrase(tokens, ["find", "the", "sum"]) ||
        hasPhrase(tokens, ["solve", "this"]) ||
        hasPhrase(tokens, ["evaluate", "this"]) ||
        hasPhrase(tokens, ["math", "calculation"]) ||
        hasPhrase(tokens, ["numeric", "value"]) ||
        hasPhrase(tokens, ["solve", "equation"]) ||
        hasPhrase(tokens, ["find", "the", "result"]) ||
        hasPhrase(tokens, ["answer", "to"]) ||
        hasPhrase(tokens, ["calculate", "for", "me"]) ||
        hasPhrase(tokens, ["crunch", "the", "numbers"]) ||
        hasPhrase(tokens, ["total", "amount"]) ||
        hasPhrase(tokens, ["sum", "together"]) ||
        hasPhrase(tokens, ["math", "for"]) ||
        hasPhrase(tokens, ["average", "of"]) ||
        hasPhrase(tokens, ["mean", "of"]) ||
        hasPhrase(tokens, ["max", "of"]) ||
        hasPhrase(tokens, ["min", "of"]) ||
        hasPhrase(tokens, ["absolute", "of"]) ||
        hasPhrase(tokens, ["square", "of"]) ||
        hasPhrase(tokens, ["cube", "of"]) ||
        hasPhrase(tokens, ["floor", "of"]) ||
        hasPhrase(tokens, ["ceil", "of"]) ||
        hasPhrase(tokens, ["remainder", "when"]) ||
        hasPhrase(tokens, ["convert", "to"]) ||
        hasPhrase(tokens, ["exchange", "rate"]) ||
        hasPhrase(tokens, ["how", "many"])
    ) {
        if (hasMathOperator || tokens.some(t => !isNaN(parseFloat(t))) || hasCurrencyToCurrency) {
            scores.CALCULATE += 5;
        }
    }

    // Boost if multiple math tokens are present
    const mathTokenCount = tokens.filter(t => mathTokens.includes(t)).length;
    if (mathTokenCount >= 2) {
        scores.CALCULATE += 4;
    }

    // ---- Play music (explicit phrase, avoids "start" conflicting with reading)
    if (
        hasPhrase(tokens, ["play", "music"]) ||
        hasPhrase(tokens, ["play", "a", "song"]) ||
        hasPhrase(tokens, ["play", "song"]) ||
        hasPhrase(tokens, ["play", "some", "music"]) ||
        hasPhrase(tokens, ["play", "something"]) ||
        hasPhrase(tokens, ["put", "on", "music"]) ||
        hasPhrase(tokens, ["put", "on", "a", "song"]) ||
        hasPhrase(tokens, ["queue", "a", "song"]) ||
        hasPhrase(tokens, ["listen", "to", "music"]) ||
        hasPhrase(tokens, ["play", "tracks"])
    ) {
        scores.PLAY_MUSIC += 4;
    }

    const newsContext =
        tokens.includes("news") ||
        tokens.includes("headline") ||
        tokens.includes("headlines") ||
        tokens.includes("article") ||
        tokens.includes("articles") ||
        tokens.includes("story") ||
        tokens.includes("stories");

    // ---- Read News Item
    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.READ_NEWS_ITEM += 6;
    }

    if (
        newsContext &&
        (tokens.includes("reread") || tokens.includes("repeat")) &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.READ_NEWS_ITEM += 6;
    }

    // ---- Open All News
    if (
        hasPhrase(tokens, ["open", "all", "news"]) ||
        hasPhrase(tokens, ["show", "all", "news"])
    ) {
        scores.OPEN_ALL_NEWS += 5;
    }

    // ---- Open/Read Full News Item
    if (
        newsContext &&
        tokens.includes("open") &&
        tokens.some(t => ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(t)) &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.NEWS_OPEN_ITEM += 6;
    }

    // Exact pattern: "read #" / "open #" for headlines
    if (
        newsContext &&
        tokens.length >= 2 &&
        tokens[0] === "read" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1])
    ) {
        scores.READ_NEWS_ITEM += 7;
    }

    if (
        newsContext &&
        tokens.length >= 2 &&
        tokens[0] === "open" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1])
    ) {
        scores.NEWS_OPEN_ITEM += 7;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "read" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1]) &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[2])
    ) {
        scores.READ_NEWS_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "open" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1]) &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[2])
    ) {
        scores.NEWS_OPEN_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "read" &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[1]) &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[2])
    ) {
        scores.READ_NEWS_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "open" &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[1]) &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[2])
    ) {
        scores.NEWS_OPEN_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["full", "article", "fullpage", "page"].includes(t))
    ) {
        scores.NEWS_READ_FULL += 6;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["full", "body", "story"].includes(t))
    ) {
        scores.NEWS_READ_FULL_BODY += 7;
    }

    if (
        newsContext &&
        (tokens.includes("summary") ||
            tokens.includes("full") ||
            tokens.includes("article") ||
            tokens.includes("story"))
    ) {
        scores.NEWS_FULL_CHOICE += 4;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.includes("all") &&
        tokens.some(t => ["headlines", "news"].includes(t))
    ) {
        scores.NEWS_READ_ALL += 5;
    }

    if (
        newsContext &&
        tokens.includes("stop") &&
        tokens.some(t => ["news", "headlines"].includes(t))
    ) {
        scores.NEWS_STOP += 6;
    }

    if (
        newsContext &&
        (hasPhrase(tokens, ["open", "latest"]) ||
            hasPhrase(tokens, ["open", "the", "latest"]) ||
            hasPhrase(tokens, ["read", "latest"]) ||
            hasPhrase(tokens, ["read", "the", "latest"]) ||
            hasPhrase(tokens, ["read", "last", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "last", "headline"]) ||
            hasPhrase(tokens, ["open", "last", "headline"]) ||
            hasPhrase(tokens, ["open", "the", "last", "headline"]))
    ) {
        scores.NEWS_LATEST += 6;
    }

    if (
        newsContext &&
        (hasPhrase(tokens, ["read", "next", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "next", "headline"]) ||
            hasPhrase(tokens, ["next", "headline"]) ||
            hasPhrase(tokens, ["open", "next", "headline"]) ||
            hasPhrase(tokens, ["read", "previous", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "previous", "headline"]) ||
            hasPhrase(tokens, ["previous", "headline"]) ||
            hasPhrase(tokens, ["open", "previous", "headline"]))
    ) {
        if (tokens.includes("previous")) {
            scores.NEWS_PREV += 6;
        } else {
            scores.NEWS_NEXT += 6;
        }
    }

    // ---- Read Page
    if (
        hasPhrase(tokens, ["read", "this"]) ||
        hasPhrase(tokens, ["read", "page"]) ||
        hasPhrase(tokens, ["read", "this", "page"]) ||
        hasPhrase(tokens, ["read", "the", "page"]) ||
        hasPhrase(tokens, ["read", "this", "article"]) ||
        hasPhrase(tokens, ["read", "this", "for", "me"]) ||
        hasPhrase(tokens, ["page", "reader"]) ||
        hasPhrase(tokens, ["read", "it", "out"]) ||
        hasPhrase(tokens, ["read", "out", "loud"])
    ) {
        scores.READ_PAGE += 5;
    }

    // ---- Read Page Controls
    if (
        hasPhrase(tokens, ["start", "from", "beginning"]) ||
        hasPhrase(tokens, ["start", "from", "the", "beginning"]) ||
        hasPhrase(tokens, ["start", "over"]) ||
        hasPhrase(tokens, ["start", "again"]) ||
        hasPhrase(tokens, ["start", "afresh"]) ||
        hasPhrase(tokens, ["read", "from", "the", "beginning"]) ||
        hasPhrase(tokens, ["read", "again"]) ||
        hasPhrase(tokens, ["read", "this", "again"]) ||
        hasPhrase(tokens, ["read", "from", "start"])
    ) {
        scores.READ_PAGE_RESTART += 5;
    }

    // Extra boost when "start" + "beginning" appears
    if (tokens.includes("start") && tokens.includes("beginning")) {
        scores.READ_PAGE_RESTART += 2;
    }

    if (
        hasPhrase(tokens, ["continue", "reading"]) ||
        hasPhrase(tokens, ["resume", "reading"]) ||
        hasPhrase(tokens, ["keep", "reading"]) ||
        hasPhrase(tokens, ["continue", "the", "page"]) ||
        hasPhrase(tokens, ["resume", "the", "page"]) ||
        hasPhrase(tokens, ["start", "reading"])
    ) {
        scores.READ_PAGE_CONTINUE += 5;
    }

    if (
        hasPhrase(tokens, ["next", "paragraph"]) ||
        hasPhrase(tokens, ["next", "part"]) ||
        hasPhrase(tokens, ["next", "section"])
    ) {
        scores.READ_PAGE_NEXT += 5;
    }

    if (
        hasPhrase(tokens, ["previous", "paragraph"]) ||
        hasPhrase(tokens, ["go", "back"]) ||
        hasPhrase(tokens, ["back", "up"]) ||
        hasPhrase(tokens, ["previous", "part"]) ||
        hasPhrase(tokens, ["last", "paragraph"])
    ) {
        scores.READ_PAGE_PREV += 5;
    }

    if (
        hasPhrase(tokens, ["previous", "section"]) ||
        hasPhrase(tokens, ["read", "last", "paragraph"]) ||
        hasPhrase(tokens, ["final", "paragraph"]) ||
        hasPhrase(tokens, ["go", "to", "end"]) ||
        hasPhrase(tokens, ["end", "of", "page"]) ||
        hasPhrase(tokens, ["last", "section"])
    ) {
        scores.READ_PAGE_FINAL += 5;
    }

    if (
        hasPhrase(tokens, ["stop", "reading"]) ||
        hasPhrase(tokens, ["stop", "the", "page"]) ||
        hasPhrase(tokens, ["pause", "reading"]) ||
        hasPhrase(tokens, ["cancel", "reading"])
    ) {
        scores.READ_PAGE_STOP += 5;
    }

    // ---- Music controls (avoid conflicts with reading)
    const musicContext =
        tokens.includes("music") ||
        tokens.includes("song") ||
        tokens.includes("track") ||
        tokens.includes("spotify") ||
        tokens.includes("playlist") ||
        tokens.includes("album");

    if (
        musicContext &&
        (hasPhrase(tokens, ["pause", "music"]) ||
            hasPhrase(tokens, ["pause", "song"]) ||
            hasPhrase(tokens, ["pause", "track"]) ||
            hasPhrase(tokens, ["pause", "spotify"]) ||
            hasPhrase(tokens, ["hold", "music"]) ||
            hasPhrase(tokens, ["pause", "audio"]))
    ) {
        scores.MUSIC_PAUSE += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["resume", "music"]) ||
            hasPhrase(tokens, ["resume", "song"]) ||
            hasPhrase(tokens, ["resume", "track"]) ||
            hasPhrase(tokens, ["continue", "music"]) ||
            hasPhrase(tokens, ["keep", "playing"]) ||
            hasPhrase(tokens, ["play", "music", "again"]) ||
            hasPhrase(tokens, ["unpause", "music"]))
    ) {
        scores.MUSIC_RESUME += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["stop", "music"]) ||
            hasPhrase(tokens, ["stop", "song"]) ||
            hasPhrase(tokens, ["stop", "track"]) ||
            hasPhrase(tokens, ["stop", "spotify"]) ||
            hasPhrase(tokens, ["mute", "music"]) ||
            hasPhrase(tokens, ["kill", "music"]))
    ) {
        scores.MUSIC_STOP += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["next", "song"]) ||
            hasPhrase(tokens, ["next", "track"]) ||
            hasPhrase(tokens, ["skip", "song"]) ||
            hasPhrase(tokens, ["skip", "track"]) ||
            hasPhrase(tokens, ["skip", "this"]) ||
            hasPhrase(tokens, ["play", "next"]) ||
            hasPhrase(tokens, ["next", "music"]))
    ) {
        scores.MUSIC_NEXT += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["previous", "song"]) ||
            hasPhrase(tokens, ["previous", "track"]) ||
            hasPhrase(tokens, ["go", "back", "song"]) ||
            hasPhrase(tokens, ["play", "previous"]) ||
            hasPhrase(tokens, ["last", "song"]) ||
            hasPhrase(tokens, ["back", "track"]))
    ) {
        scores.MUSIC_PREV += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["replay", "song"]) ||
            hasPhrase(tokens, ["replay", "track"]) ||
            hasPhrase(tokens, ["restart", "song"]) ||
            hasPhrase(tokens, ["restart", "track"]) ||
            hasPhrase(tokens, ["play", "this", "again"]) ||
            hasPhrase(tokens, ["repeat", "song"]))
    ) {
        scores.MUSIC_REPLAY += 6;
    }

    // ---- Token-based scoring
    tokens.forEach((t) => {
        if (["hi", "hello", "hey"].includes(t)) scores.GREET += 3;
        if (t === "open") scores.OPEN_SITE += 2;
        if (["search", "find"].includes(t)) scores.SEARCH_WEB += 2;
        if (t === "play" && !tokens.includes("read")) scores.PLAY_MUSIC += 2;
        if (t === "youtube") scores.PLAY_YOUTUBE += 2;
        if (["pause", "resume", "stop"].includes(t) && !musicContext) scores.MEDIA_CONTROL += 2;
        if (t === "image") scores.GET_IMAGE += 2;
        if (["github", "npm", "stackoverflow"].includes(t)) scores.DEV_SEARCH += 2;
        if (["tab", "next"].includes(t)) scores.TAB_CONTROL += 2;
        if (["close", "exit"].includes(t)) scores.CLOSE_TAB += 2;
        if (t === "time") scores.TIME += 2;
        if (t === "date") scores.DATE += 2;
        if (["help", "commands"].includes(t)) scores.HELP += 2;
        if (t === "weather") scores.WEATHER += 2;
        if (t === "name") scores.IDENTITY += 2;
        if (t === "age") scores.AGE += 2;
        if (["news", "headline", "headlines", "article", "articles", "story", "stories"].includes(t)) scores.NEWS += 2;
        if (["calculate", "math", "plus", "minus", "multiply", "divide", "sum", "total", "product", "quotient", "difference", "average", "solve", "compute", "evaluate"].includes(t)) scores.CALCULATE += 2;
        if (["all"].includes(t)) scores.OPEN_ALL_NEWS += 2;
        if (["reader", "reading"].includes(t)) scores.READ_PAGE += 2;
    });

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [string, number][];
    const [intent, confidence] = sorted[0];

    return { intent, confidence, scores, sorted };
}
