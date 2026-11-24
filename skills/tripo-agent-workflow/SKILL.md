---
name: tripo-agent-workflow
description: Operate the avatar kit's candidate generation, part classification, Smart UV and 4K retexture, and Tripo rigging, updating the same .charakit. Retexture uses five categories (hair, head, upper body including outfit, lower body, accessories), and spring parts are classified independently.
---

# Operating Tripo

Run the stage the user requested. Compare the app's request text with the canonical kit saved by start, and inspect and unpack it with [charakit-project](../charakit-project/SKILL.md). `production` is the canonical project mid-production. Do not treat candidate FBX files, separate components, texture groups and spring groups as meaning the same thing.

Operate Tripo with Computer Use if available, or with browser control on a connected Chrome. Read the control tool's skill and [Choosing and reusing a browser](../../docs/browser-use.md) first, and use the user's existing browser and logged-in tabs. If the target tab is missing, add it to the same window and profile, and start a new browser only when you have confirmed that no browser is open at all. If there is no connection, ask the user to connect and log in; do not automatically switch to a Codex-internal browser or another automation session. Do not evade the terms of service, guess at private APIs, or extract browser profiles or credentials. Do file handling with the bundled scripts.

Because the UI changes, [Settings to check on screen](references/tripo-ui.md) is only a clue for exploration. Every time, check the current screen and the actual selected values. Do not send the already-requested ordinary operations for generation, Smart UV, texturing and rigging back to a waiting-for-approval state at each stage. If an additional purchase or plan change is needed, confirm that operation with the user.

Fetch every Studio output with [tripo-studio-download](../tripo-studio-download/SKILL.md). Click the normal Export, check the actual file in the browser's save folder, and receive it into the production folder. Do not also use download-event wait or save helpers. Do not treat a refusal, an incomplete download or a different model as success; follow the same skill for recovery and actual-file inspection.

## Generate candidates

1. Check the adopted `head/{front,left,right,back}/neutral` and `body/{front,left,right,back}/neutral` in the kit. The head includes all hair, and the body is always in a T-pose. Missing images, an A-pose or an obvious direction mismatch go back to the image stage. Do not quietly fall back to single-image generation.
2. Give one part's four directions to Tripo's multiview. Check **Smart Mesh P2.0, quad faces, 25,000, 4 generations** and generate the head and the body separately. Do not confuse batch image input with multiview.
3. Fetch every candidate as FBX with [tripo-studio-download](../tripo-studio-download/SKILL.md) and inspect them, saving the needed textures alongside. Register them with `candidates` in the [CLI contract](references/commands.md). Keep the correspondence between the model ID, purpose and SHA256 in the fetch record and the source images.
4. Update the same canonical project and run complete, then stop where the user decides the head and body in the app. The agent does not rewrite anything to adopted.

## Combined request from segmentation to assembly

A materials request does not stop midway through classification or separation; it runs through to completed assembly. First run `scripts/export-segmentation.py` in Blender and export the adopted head and body as GLB (triangle faces). Re-upload them to Tripo and run a coarse segmentation. Fetch the result as FBX and inspect it with [tripo-studio-download](../tripo-studio-download/SKILL.md), then register it with segmented in tripo-project.mjs. Keep the original candidates and the adopted IDs, and make the post-segmentation model the new basis.

## Classify separate components

1. If both candidates are adopted, run `analyze`. The app's "Separate selected candidates" does the same processing. It lists the components connected by vertices and separates them while preserving the face structure of the registered base model.
2. Display `components.fbx` in the app or the work Blender, and compare the front, side and back views with each component shown on its own. **The agent classifies meaning by visual inspection.** Do not decide hair or skin from size, position or connection count alone.
3. Give each component a `head`, `hair` or `body` role. Hair uses the same coordinate system as the head. For textures, follow [the five categories](references/retexture-images.md#five-texture-categories) and assign every component exactly once to `hair`, `head`, `upper_body`, `lower_body` or `accessories`. **The lower body combines the waist outfit, skirt, legs and footwear into one set. Do not create texture categories for just the legs, shoes or skirt.** Do not change how the initial eight images are split between head and body.
4. Spring groups specify the same component IDs separately. **Even if the skirt and legs are separated for spring parts, they are still the same lower body for textures.** Specify the groups needed for how the skirt, ribbons, hair strands and so on should sway, and do not match them to the five texture categories or the texture count. Even if a large ribbon is classified as an accessory, whether it sways is decided separately. If there are no targets, confirm that and use an empty array.
5. If the boundary you want to separate lies inside connected faces, show the images and confirm the following options with the user: **try separating by operating Blender with Computer Use (unstable, uses more tokens) / regenerate in Tripo or choose candidates again (relatively stable)**. Do not cut or omit anything on your own. If you change the shape by hand, register it again as a new candidate and redo the analysis onward.

## Smart UV and retexture

1. Register the classification and use `prepare` to create the part FBX and the front and back wire guides. Merge the components in each texture group into one mesh object and export it. Do not weld vertices of distant components; keep the base part separation and the spring groups. The export is a Y-up baked FBX. The initial correction on upload is 0°; check the face's forward direction and up/down in Tripo's actual preview. Record the correction that is needed, and do not stack 90° rotations.
2. Following [Retexture references](references/retexture-images.md), match the shape with the guides and the painting with the adopted multiview, and generate a **front and back PNG for each part**. Register them in the kit with `references`.
3. Upload to Tripo one group at a time, **run Smart UV first**, then regenerate the texture with image references. Resolution is **fixed at 4K**. Remove Lighting follows `production.settings.removeLighting` and defaults to OFF. Do not remesh or decimate.
4. Fetch and inspect the regenerated FBX with [tripo-studio-download](../tripo-studio-download/SKILL.md), match it to each group ID and register it with `returns`. Check for mixed-up output files by their preview and shape. `assemble` transfers the UVs and materials to the vertices and faces of the base parts, removes Tripo's position and size changes, applies MToon to every mesh's materials with `scripts/mtoon-export.py`, and saves `assembly.blend`. In the app, the display from proportion adjustment onward is also MToon. On later FBX imports, reapply MToon and keep it through the work Blend and the final VRM. If an explicit axis correction is needed, specify `rotation` (Blender XYZ degrees). Do not guess and correct the orientation from a symmetric shape.
5. If restoration fails, investigate the output's axes, base parts, face structure and textures. Do not treat a failed mesh correspondence as a successful size correction. If repairing is difficult, show the affected part to the user. Return the assembled kit; the user aligns the head and body size and position in the app.

## Rigging in Tripo

Once the user finishes placement and requests it, take the head plus body from `scripts/export-rig.py` or the app's export, and run rigging in Tripo. Do not include hair; include the outfit and the separated spring parts. Check the bone position preview, and fetch and inspect the FBX with [tripo-studio-download](../tripo-studio-download/SKILL.md).

With `node scripts/import-bones.mjs INPUT.charakit RETURNED.fbx INPUT.charakit`, save only the bone placement scaled back to the original size. Do not replace the original textured parts with Tripo's rigged mesh or weights. For a combined rig request, continue with scripts/run-local-job.mjs through weight transfer → deformation check → spring setup, register the check FBX in the same canonical project with phase=springs, and run complete. The official VRM output comes after the user's Motion check. Distinguish the spring classification result from actually completed physics setup.
