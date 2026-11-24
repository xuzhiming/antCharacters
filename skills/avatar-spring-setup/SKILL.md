---
name: avatar-spring-setup
description: Restore hair onto the weight-transferred Avatar Kit model, set up spring bones, weights and collisions for hair and outfit, and export a VRM. Standard new production uses fixed eyes and a normal face. Complete the technical automated checks and leave appearance evaluation to the user's Motion check.
---

# Spring parts and VRM export

Restore the rigged model passed from `charakit-project` and the original hair. Use Computer Use to judge and correct shapes and the range to swing, and use MCP/scripts for iterative processing of the confirmed bone chains and weights, and for input, output and checks. Do not assume the user will operate Blender.

1. Save and update the working Blend at work/character.blend. Preserve the existing full-body rig, body and face weights, materials and UVs. Do not reuse bone names or fixed coordinates from the original model for other models.
2. Check the position of the restored hair from the front, side and back. Fix the roots to the head, and swing only the necessary ranges such as long hair, bangs, skirts and ribbons as separate groups. Do not add eye bones, LookAt or expression keys.
3. Observe the model and determine the root, tip and parent bone of each chain, and the target vertex groups. If spring paths already exist, refer to them as intent, but they are not required. Fix the roots and connect weights smoothly to the tips. Check for incorrect transfer to nearby parts on the left and right.
4. Using the installed VRM Add-on, set up VRM 1.0 Humanoid bone mapping, spring bones, and the needed colliders for head, chest, hips, legs and so on. Do not run unknown APIs by guessing; confirm with the installed version's properties or the official documentation. Do not change the existing full-body rest bones or body weights.
   Always register and check the visually created bone chains and target meshes with `scripts/spring-setup.py` below. Record every target part as either spring or fixed. Fixing requires a confirmed reason; do not treat unconfigured parts as fixed to pass the checks.
5. Check the real VRM's vertex response with physics ON/OFF using the script below. The user decides whether the appearance looks good, how much interpenetration is acceptable, and how they like the swing. Do not make the agent's visual sign-off a completion criterion, and do not run an automatic appearance-fixing loop because of the checks.
6. Preserve the user's model name, author and usage conditions if provided. Even if they are not provided, proceed through registering the configured Blend and the review FBX; the app prepares the VRM and automatically shows it in Motion check. Model information is confirmed and registered in the app at the formal **Export VRM** time. Do not decide rights holders or distribution conditions on your own.
7. **At rig complete, run through the automated checks of the completed VRM.** The app generates and checks the VRM from the saved Blend, and shows the same VRM in Motion check. Stop at Motion check and leave appearance evaluation to the user.

What the agent registers is the editing Blend, the review FBX including hair, and the updated same canonical .charakit. complete registers the checked VRM and the check results into the same canonical project. Specify `phase: "springs", includesHair: true, blend: "work/character.blend"` in `scripts/update-model.mjs`. The FBX is not a storage location for VRM settings. During review and formal saving, do not rebuild the settings from the FBX.

## Reproducible registration and per-part checks

`scripts/spring-setup.py` is a tool for registering and checking existing spring bones and weights. Create the swing ranges, bone positions, weights and needed collision shapes by observing the actual model. Do not infer parts from names or proximity alone. Do not change body bones, body weights or parent-child relationships.

Example config JSON (names match the actual model):

```json
{
  "armature": "Rig",
  "chains": [
    {"name": "left_sleeve", "bones": ["Sleeve_L_1", "Sleeve_L_2"], "stiffness": 1, "gravityPower": 0.15, "dragForce": 0.4, "hitRadius": 0.01, "colliderGroups": []}
  ],
  "targets": [
    {"mesh": "Sleeve_Left", "source": "Spring_04_sleeve_left", "mode": "spring", "chains": ["left_sleeve"]},
    {"mesh": "ShortHair", "source": "hair", "mode": "fixed", "reason": "visually confirmed short hair, not swung in this design"}
  ]
}
```

- `bones` are the **deform bones** from root to tip. In VRM 1.0 the last joint is used only for position, so the script adds a non-deform terminal bone and registers it in the joint list too. Specify `includesTerminal: true` only when the tip is already included. Re-running does not duplicate bones or chains.
- `source` is the original part name from `weightTransferPlan.springObjects[].name`. Use `hair` for hair. Parts that were split get the same source on multiple targets. Record every target: hair, sleeves, veils, skirts, ribbons, straps and so on.
- Fix the roots and connect weights smoothly to the tips. The process checks for a valid Armature modifier and weights on the actual spring bones. Even if normalized, fixing only to full-body bones fails.
- Observe and set up colliders first, and register only the needed ones in `colliderGroups`. Do not delete existing colliders or other chains. `gravityDir` is in Blender coordinates (default `[0,0,-1]`), and `center` is the actual bone name of the root or an ancestor.
- When reproducing inertia from parent movement for hair, skirts and so on, omit `center` by default. Setting the head as the hair's center or the hips as the skirt's center makes the part follow that bone, canceling the motion, which can weaken the swing even with physics ON. Set center only for explicit uses where you want to cancel movement, and check that the part responds during a normal walk. The physics switch in Motion check is ON when a new model is loaded or the app starts.

To fix only the base settings of an existing Blend, you can use `update-centers` with explicit chain names. `null` clears center. Existing bone chains, weights, physics strength, colliders and the per-part plan are preserved, and changes are applied after validating all the specifications.

```json
{"armature":"Rig","centers":{"left_hair":null,"skirt":null}}
```

```sh
blender --background work/character.blend --disable-autoexec --python-exit-code 1 --python KIT/scripts/spring-setup.py -- update-centers work/center-changes.json work/character.blend work/center-result.json
```

After updating, re-register the Blend hash and re-export and check the completed VRM. Do not overwrite settings only on the displayed VRM to make it swing differently from the saved and exported one.

```sh
blender --background work/character.blend --disable-autoexec --python-exit-code 1 --python KIT/scripts/spring-setup.py -- setup work/spring-config.json work/character.blend work/spring-plan.json
```

rig complete reads the saved Blend in a separate process, checks the plan for every part, actual bones, weights and registration with the review FBX, and also generates the VRM. In addition, **for each part of the exported VRM, it compares the actual vertex positions with physics ON/OFF over 90 frames**. Missing settings, missing tips, missing chains, ineffective weights and settings that do not move cannot complete. To run it individually:

```sh
node KIT/scripts/verify-springs.mjs exports/avatar.vrm work/spring-plan.json work/spring-runtime.json
```

These mechanical checks confirm that valid physics exists. The user judges interpenetration, swing strength and the look of the roots in Motion check. Even without metadata, the work completes through the VRM checks and is shown directly in Motion check. Model information is registered in the app at formal export time. Do not use a placeholder author name from internal checks in formal output.

For a local combined rig request, register the review FBX after spring setup into the same canonical project and proceed to Motion check at complete. Even without VRM metadata, the work can complete through Motion check. For formal saving, confirm model information with **Export VRM** in the app, then use **Save information and export** to save exports/avatar.vrm and exports/avatar.blend. Only the information portion of the review VRM is finalized; shape, materials and physics are preserved. No additional finish request is needed.

## MToon display and saving

The Motion check view displays the checked completed VRM's own MToon, textures and SpringBone. The FBX itself is not a storage location for MToon settings, so convert all needed meshes to MToon on the Blender side as well. Run `apply_mtoon(meshes)` from `scripts/mtoon-export.py` before exporting the review FBX, and save `work/character.blend`. Preserve existing MToon materials, the full-body rig, weights, shape keys and VRM expression binds.

For an explicit standalone VRM export request, specify the configured Humanoid and all needed meshes and use `save_outputs(meshes, "exports/avatar.blend", armature=rig, vrm="exports/avatar.vrm")`. The function applies MToon, exports the VRM, checks all used materials, and saves a Blend with the textures packed. Set the model name, author and usage conditions in advance with the user's own values. Do not infer metadata in this process. The installed VRM add-on is required.

From background Blender you can run `blender --background work/character.blend --python-exit-code 1 --python KIT/scripts/mtoon-export.py -- --mesh Body --mesh Hair --armature Rig --blend exports/avatar.blend --vrm exports/avatar.vrm`. Replace `Body`, `Hair` and `Rig` with names obtained by observing the actual model, and specify `--mesh` for every needed mesh. To save only a review Blend, omit `--vrm`. Do not silently discard transparency from separate images or rotated UVs; fix the targets of conversion errors and run again. The completion notice checks the real VRM's MToon settings and rejects output that still contains standard PBR.
