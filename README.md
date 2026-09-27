# BREditor

An offline, browser-based editor for BRBuild projects.

## Running

Open `index.html` directly in a Chromium-based browser. No server or internet connection is required. Click **Choose workspace folder** and select the folder containing your BRBuild projects (for example `/home/<yourusername>/development`). The app lists child folders that contain both a root-level `BRBuild.yaml` and a `src` directory, then recursively lists YAML files inside the selected project's `src` directory.

The File System Access API is required for browsing and saving local folders. It is currently supported by Chromium-based browsers; Firefox and Safari do not support the required directory picker APIs.

## Current scope

- Select a workspace folder containing BRBuild projects and switch between them from a dropdown.
- A project is any sibling folder with both a root `BRBuild.yaml` and a `src` directory.
- The left column lists the project's configuration files and every vehicle YAML found under the `target_folders` declared in `BRBuild.yaml`.
- Dedicated forms for:
  - `BRBuild.yaml` — project name, build flag, target folders, palette, template folder.
  - `src/grf/GRF.yaml` — GRFID, names, description, versions, purchase list order.
  - `src/grf/RailTypes.yaml` — one field per logical track type, listing railtype labels in fallback order.
  - Vehicle files — identifier, name, subtitle, vehicle and train type (BRBuild enum values), weight, power, speed, introduction date, and fuel types.
- Every field carries a tooltip describing its range and usage.
- Raw YAML tab gives direct syntax-highlighted editing of whichever file is selected in the list.
- Forms write back to the same file, changing only the lines they own: comments, ordering and unrelated values are preserved.
- The last workspace selection is stored locally and restored when permission remains available. On first use, choose the parent folder containing `BREditor` and the sibling projects.
- Reserved sprite panel for future sprite/light-position editing.

## Verifying

`tools/verify.mjs` runs the real `src/app.js` under a minimal DOM and File System Access API stub, against a real project on disk, and fails if any vehicle form does not round-trip byte-for-byte or if a quoting/enum case is mishandled:

```bash
node tools/verify.mjs [path-to-project]   # defaults to /home/jon/BRTrains3
```

No dependencies; the exit code is 1 when anything is wrong.
