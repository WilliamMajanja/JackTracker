
# JackTracker UI

JackTracker is a sleek web interface for downloading high-quality audio from Spotify and YouTube. By leveraging the power of `spotDL` and `yt-dlp`, it can process individual tracks, albums, or entire playlists and download them as high-quality MP3 files. The application features a Node.js backend to handle the download logic and a modern Vite-powered React frontend to provide a fast, responsive user experience.

## Features

- **YouTube & Spotify Support**: Paste a link from Spotify (track, album, playlist) or YouTube (video, playlist) to download the audio.
- **Concurrent Downloads**: Downloads up to 3 tracks at once for huge speed improvements on playlists.
- **Real-Time Progress**: Watch the progress of each individual download live via WebSockets.
- **High-Quality Audio**: Downloads tracks in MP3 format (320kbps for Spotify, best available for YouTube).
- **Robust Queueing**: A clear view of active and completed downloads.
- **Direct Downloads**: Completed tracks can be downloaded directly from the browser.

---

## Prerequisites

Before you begin, ensure you have the following software installed on your system.

1.  **Node.js**: Required to run the backend server and the frontend development environment.
    -   [Download Node.js](https://nodejs.org/) (LTS version is recommended)

2.  **Python & Pip**: `spotDL` and `yt-dlp` are Python packages.
    -   [Download Python](https://www.python.org/downloads/) (Make sure to check "Add Python to PATH" during installation)

3.  **spotDL & yt-dlp**: The core command-line tools used for downloading.
    -   Install them via `pip` by running the following command in your terminal:
        ```bash
        pip install spotdl yt-dlp
        ```

4.  **FFmpeg**: A critical dependency for `spotDL` and `yt-dlp` to process audio files.
    -   [Download FFmpeg](https://ffmpeg.org/download.html)
    -   After downloading, you **must** add the `bin` directory from the FFmpeg folder to your system's PATH environment variable so it can be executed from the command line.

---

## Installation & Setup

Follow these steps to get the project running on your local machine.

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/jacktracker-ui.git
    cd jacktracker-ui
    ```

2.  **Install All Dependencies**
    This single command installs both the backend (Node.js) and frontend (Vite/React) dependencies.
    ```bash
    npm install
    ```

---

## Running the Application

1.  **Start Both Servers Concurrently**
    This command will start the backend Node.js server on `http://localhost:3001` and the frontend Vite development server on `http://localhost:5173` at the same time.
    ```bash
    npm run dev
    ```

2.  **Open the Application**
    Your browser should automatically open to `http://localhost:5173`. If not, navigate to that URL manually. The application is now ready to use.

---

## How to Use

1.  Open the application at `http://localhost:5173`.
2.  Find a track, album, or playlist on Spotify or a video/playlist on YouTube and copy its URL.
3.  Paste the URL into the input field in JackTracker and click the download button.
4.  The tracks will be added to the queue and appear in the "Active Downloads" section.
5.  Downloads will start automatically, with up to 3 files processing at once. You can watch their progress in real-time.
6.  Once a track is complete, it will move to the "Completed Downloads" list.
7.  Click on any card in the completed list to download the MP3 file to your computer.
8.  You can clear the completed list using the "Clear Completed" button.

---

## Troubleshooting

-   **`spotdl: command not found` or `yt-dlp: command not found`**: This means the required tool is either not installed or its installation location is not in your system's PATH. Try running `pip install spotdl yt-dlp` again.
-   **FFmpeg Errors**: If you see errors related to FFmpeg, it's almost certainly because it's not correctly installed or not accessible from your system's PATH. Double-check your environment variable settings.
-   **"Failed to process link"**: This usually means the URL is invalid, private, or the downloader couldn't find a match for it. Check the console where you ran `npm run dev` for detailed error messages from the backend.
