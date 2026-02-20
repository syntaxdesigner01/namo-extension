import { speak } from "../utils/speech.ts";
import { openTab } from "../utils/helpers.ts";

export async function searchAndRead(query: string) {
    speak(`Looking up ${query}`);
    try {
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        const data = await response.json();
        const summary = data.AbstractText || (data.RelatedTopics?.[0]?.Text);

        if (summary) {
            speak(summary.substring(0, 200));
        } else {
            speak(`I couldn't find a quick summary for ${query}. I'll open a search page for you.`);
            openTab(`https://www.google.com/search?q=${query}`);
        }
    } catch (error) {
        console.error("Failed to fetch summary:", error);
        speak(`Sorry, I had trouble looking that up. I'll open a search page instead.`);
        openTab(`https://www.google.com/search?q=${query}`);
    }
}
