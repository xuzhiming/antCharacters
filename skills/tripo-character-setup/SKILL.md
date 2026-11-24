---
name: tripo-character-setup
description: In Avatar Kit's detailed marker mode, build a Humanoid rig for normal-face head and body models. When the standard Tripo rig does not fit, rig by comparing the user's guides with the shape.
---

# Detailed-mode rigging

The standard path is rigging in Tripo. Use this skill when the user chooses the marker path. Because the agent rigs from markers, it takes extra time and tokens. Standard new production uses a normal face with a fixed gaze. Do not do preprocessing for expression meshes, pupils or the inside of the eyes.

1. Inspect and unpack with `charakit-project`, and separate the original from the work copy. Check the placement of the body and the normal head. Set the hair aside and rig the head and body first.
2. Current v5 and v6 use the staged setup in the next item, which references 21 points for the whole body and optionally 40 finger points. `charakit-project/scripts/import_guides.py` is only for the old v4. Compare the shoulders, elbows, hands, hips, knees and feet on the front, side and top views with the shape. Do not treat guide positions as confirmed joint centers.
3. Use [Humanoid staged setup](references/humanoid-setup-guide.md) to place bones on the work copy, and adjust the rest pose if needed. Do shape observation, selection and adjustment with Computer Use, and mechanical work with MCP/scripts. Keep the user's manual work to a minimum.
4. Export the rig with provisional weights to FBX, and check the bone mapping, shoulders, elbows, knees and neck with the app's automated checks. Do not treat provisional weights as final quality.
5. Return it with `scripts/update-model.mjs` using `phase: "rigged", includesHair: false`. Hand detailed body weights to `avatar-weight-transfer`, and spring parts and the VRM to `avatar-spring-setup`.

Keep the editing Blend, the rigged FBX and the check results. Do not overwrite the original, and do not apply normalization or placements twice. Do not go from this stage into expression authoring or preprocessing the inside of the eyes.
