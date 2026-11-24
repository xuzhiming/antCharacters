---
name: tripo-studio-download
description: Download finished Tripo Studio models as FBX with the normal Export operation, inspect the actual local file, and receive it into the production folder. Use it in the fetch steps for candidate generation, segmentation, retexture and rigging. Do not use the generation API or the browser's download-waiting features.
---

# Receiving FBX files from Tripo Studio

Fetching proceeds as **normal Export → the browser's save folder → actual-file check → copy into the production folder**. No extra download extension, Tripo API key or DCC Bridge is needed. Model generation and registration in the canonical project are left to the calling stage.

## Preparation before Export

1. Follow the skill of the browser control tool you are using and [Choosing and reusing a browser](../../docs/browser-use.md), and use the user's existing browser, window and profile. On the current Studio screen, check the target model ID, preview and stage. Who opened the tab is not a condition for whether you can fetch.
2. Check the folder the browser actually saves to. Do not adopt the default Downloads from guesswork alone; if the destination is changed or the browser is set to "Ask where to save each file", also check the current save dialog. Run browser control and file operations on the same PC. If a different PC or a cloud environment cannot read the local Downloads, report the missing connection.
3. Use the existing `work/` inside the production folder confirmed by the app's begin, and run prepare below. Record the model ID, purpose and start time, and issue a unique name that will not collide with past files.

```text
node "<kit>/skills/tripo-studio-download/scripts/receive.mjs" prepare --work "<production folder>/work" --downloads "<browser save folder>" --model "<Studio model ID>" --label "head-candidate-1"
```

From the `prepared` output, note `job`, `exportName` and `source`. Give body, segmentation, retexture group and rig labels that make the purpose clear too. Use the file names issued by this operation.

## The normal Export operation

Open Export on the current screen and check the **FBX and Blender preset** and the texture settings you need. Enter `exportName` (without extension) in the name field, and click the screen's Export button normally. Record the correspondence between the settings and the target model in work. If the browser's standard save dialog appears, specify the same destination and unique name through the operable UI.

**For Tripo Studio Export, do not also use `waitForEvent('download')`, `downloadMedia`, or wrappers that wait for, capture or save download events.** Leave saving to the browser's standard behavior and go on to the file check below. Do not wrap the normal click in another download helper. This restriction applies only to the Studio fetch path.

## Checking and receiving the actual file

```text
node "<kit>/skills/tripo-studio-download/scripts/receive.mjs" receive --job "<job returned by prepare>" --timeout-ms 20000
```

- `pending`: the specified file has not arrived, a `.crdownload` exists, or the size and modification time are not stable. Check the browser's current state, and without pressing Export again, rerun receive for the same job. Normally aim for up to 120 seconds in total, and if an in-progress display continues, report the progress.
- `received`: the new FBX's format header matched, the size was stable, and the SHA256 before and after copying matched. `path` holds the copy inside the production folder. Keep the original file in Downloads and existing deliverables. Rerunning rechecks the hash of the saved copy.
- Error: do not register it as a successful fetch. Do not quietly substitute an existing file, an automatic numbered copy under another name, HTML, a ZIP, a different model, or an unexpected destination.

The header check does not guarantee a valid mesh. Load the received FBX in the app or the work Blender, and check the target shape, orientation and units, face structure, materials, UVs and needed textures. If there are external textures, save the referenced paths and images and pass them to the calling stage. If the output is a ZIP, do not pass it to this FBX script; check the contents, safely extract the needed FBX and images, and inspect them separately.

Leave the model ID, purpose, preset, destination, size and SHA256 in the fetch record in work, and pass them to the calling stage's registration command. Even for the same model, the FBX hash can change with each export, so also use vertices, faces, bounding boxes and so on to compare shapes. A fetch-only request does not change the adoption state of the canonical project.

## When it fails

If the browser, OS or control tool explicitly refuses the Export or the save, do not repeat the same operation; report the target, format, destination and error. Follow the tool's approval procedure, and do not switch to another session that bypasses restrictions or to extracting credentials. If it is only a wait timeout, first check whether the specified actual file exists and what the browser shows, and distinguish it from a refusal. Explain the connection or save settings that need attention, and do not ask the user to export by hand as an ordinary recovery step. Do not regenerate for the download or run additional paid processing.

The normal Export has been verified on existing tabs, tabs added by the agent, and tabs added after all tabs were closed. A conflict with the download-waiting feature is a strong hypothesis, but it is not treated as a confirmed root cause.
