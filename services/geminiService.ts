
import { TrackMetadata } from "../src/types";

export const fetchTrackMetadata = async (url: string): Promise<TrackMetadata[]> => {
    const response = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Unable to identify tracks. Please check the URL.");
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
};
