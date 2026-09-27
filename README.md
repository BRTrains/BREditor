# BREditor

An offline, browser-based editor for BRBuild projects.

## Running

Open `index.html` directly in a Chromium-based browser. No server or internet connection is required. Click **Choose workspace folder** and select the folder containing your BRBuild projects (for example `/home/jon`). The app lists child folders that contain both a root-level `BRBuild.yaml` and a `src` directory, then recursively lists YAML files inside the selected project's `src` directory.

The File System Access API is required for browsing and saving local folders. It is currently supported by Chromium-based browsers; Firefox and Safari do not support the required directory picker APIs.

## Current scope

- Select a workspace folder and switch between valid project folders.
- Discover `.yaml` and `.yml` files recursively under `src`.
- Edit with lightweight YAML syntax highlighting in the Raw YAML tab.
- Save changes directly to the selected file.
- The template editor provides guided fields for the common root-level `BRBuild.yaml` project settings. The Raw YAML tab remains available for direct editing of any discovered YAML file.
- The last workspace selection is stored locally and restored when permission remains available. On first use, choose the parent folder containing `BREditor` and the sibling projects.
- Reserved sprite panel for future sprite/light-position editing.
