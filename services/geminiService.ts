
import { GoogleGenAI, Type } from "@google/genai";
import { TrackMetadata } from "../src/types";

// Client-side instance for Serverless operation
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      trackName: {
        type: Type.STRING,
        description: "The name of the track."
      },
      artistName: {
        type: Type.STRING,
        description: "The name of the primary artist."
      },
      albumName: {
        type: Type.STRING,
        description: "The name of the album."
      },
      albumArtUrl: {
        type: Type.STRING,
        description: "High resolution cover art URL."
      },
       url: {
        type: Type.STRING,
        description: "The URL of the track."
      },
      duration: {
        type: Type.STRING,
        description: "Duration in MM:SS."
      }
    },
    required: ["trackName", "artistName", "albumName", "albumArtUrl", "url"]
  }
};

export const fetchTrackMetadata = async (url: string): Promise<TrackMetadata[]> => {
    try {
        const prompt = `Extract metadata for this music URL: ${url}. 
        Return a JSON array of tracks conforming to the schema. 
        If it's a playlist, list all tracks.`;
        
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const jsonString = response.text?.trim();
        if (!jsonString) return [];
        
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [parsed];

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Unable to identify tracks. Please check the URL.");
    }
};
