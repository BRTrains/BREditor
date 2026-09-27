# BREditor

An offline, browser-based editor for BRBuild projects.

## Running

Open `index.html` directly in a Chromium-based browser. No server or internet connection is required. Click **Choose workspace folder** and select the folder containing your BRBuild projects (for example `/home/jon`). The app lists child folders that contain a `src` directory, then recursively lists YAML files inside the selected project's `src` directory.

The File System Access API is required for browsing and saving local folders. It is currently supported by Chromium-based browsers; Firefox and Safari do not support the required directory picker APIs.

## Current scope

- Select a workspace folder and switch between valid project folders.
- Discover `.yaml` and `.yml` files recursively under `src`.
- Edit with lightweight YAML syntax highlighting.
- Save changes directly to the selected file.
- Reserved sprite panel for future sprite/light-position editing.
