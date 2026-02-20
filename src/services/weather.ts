import { speak } from "../utils/speech.ts";
import { openTab } from "../utils/helpers.ts";

export async function fetchWeather(query: string) {
    speak(`Checking the weather ${query ? `for ${query}` : ""}.`);
    try {
        const response = await fetch(`https://wttr.in/${query}?format=%C+and+%t`);
        if (response.ok) {
            const text = await response.text();
            speak(`It is currently ${text}.`);
        }
    } catch (e) {
        console.error("Weather fetch failed", e);
    }
    openTab(`https://www.google.com/search?q=weather+${query}`);
}
