# Helper tools that support production in Blender

Build the base for the eyes with the skin mask fit and transfer, then finish in ordinary Blender editing. For the bulk mouth and brow transfer, use the [transfer procedure](transfer.md) and finish the necessary local areas. Use Blender 5.2 or later and the existing VRM Add-on with MToon support. For Computer Use, use the operation methods available to the agent. Replace INPUT / WORK / PROJECT with the actual paths for this request.

## Preparation

```text
node scripts/expression-lab.mjs init INPUT WORK --config CONFIG.json --project PROJECT
node scripts/expression-lab.mjs open WORK
node scripts/expression-lab.mjs serve WORK
```

CONFIG is `objects: [actual mesh names for face, eyes and eyelashes]` plus, if needed, `camera: {center,front,up,ortho_scale,size}`. When revising existing expressions, passing `keys: {blink: {mesh name: original key name}}` creates an editing copy that preserves the original keys. Check the display state so that the original key values and the work keys are not applied twice. Confirm the camera direction and crop with actual images. For a standalone model, omit --project. The app's WORK is `work/expression-authoring`. Do not repeat init into the same folder. Old attempts can be referenced in the comparison view, and old workers are not started.

When editing a model loaded into the Expressions tab, use the same file as `expressionEditor.imported.path` in project.json for INPUT. Import the VRM with the existing VRM Add-on and create a copy that preserves the existing expressions. The tab's `expressionEditor.controls` stores the selections, strengths, minimum and maximum values. Distinguish the preview's adjustment values from changes to the vertex modeling itself. Do not treat merely loading a file as having transferred expressions to another model.

init uses background Blender only for preparation. open opens the working copy in Blender with a UI and loads the helper panel. If the same copy is already open, resume with just the loading below and do not start another Blender. Do not overwrite unrelated unsaved work.

## Use from an open Blender

This is example preparation code to run from MCP or similar. Replace SCRIPT / WORK with actual paths.

```python
import importlib.util, sys
spec = importlib.util.spec_from_file_location('expression_studio', SCRIPT)
studio = importlib.util.module_from_spec(spec)
sys.modules['expression_studio'] = studio
spec.loader.exec_module(studio)
helper = studio.attach(WORK)
```

Resume by opening this WORK's current.blend. From a new working state, `attach(WORK, objects=[...], camera={...})` is available. Do not overwrite the original; create dedicated keys. In the N panel "Expressions" you can choose the expression, strength and capture direction. Capture only the views you need and finish with ordinary Blender editing. Work with the MToon display material copy and Standard, and switch to Solid when checking structure. Saving restores the original materials.

When targeting vertices on a dense mesh takes time, you can prepare the selection in Python from vertex numbers already identified from this request's images and structure. Use helper code for setting the target key, display, camera and proportional radius as well, and spend your time on looking at the shape and moving it. Confirm what the numbers mean on this model, and do not reuse them from another model. Before committing a large movement, check the selection position and influence range on screen.

```python
helper.expression('blink', 1)
helper.capture('blink')                 # capture the unsaved shape to Front
helper.capture('blink', .5)             # only the intermediate values you need
helper.capture('blink', 0, label='neutral')
helper.capture('blink', display='wire') # when structure is a concern
helper.suite('blink')                   # 4 directions, 5 strengths and structure at finishing
helper.capture(combination={'aa':1, 'blink':1})
helper.note('outer eye corner sharper than the target', 'restore the corner and surroundings', 'arc improved', 'check thickness from the side')
```

## Fit with landmarks specified by the agent

If you can already judge the face and parts, you can skip the lists and part captures. Use the following if needed. The tools only show geometrically connected components and do not classify meaning.

```python
parts = helper.list_blink_parts(['Head'])  # number / object / seed / count / bounds / color
helper.capture_blink_parts(['Head'], angles=['Front'])
helper.select_blink_part('Head', SEED)     # select that part in Edit Mode
helper.prepare_blink('Head', skin_seed=SKIN_SEED)
helper.set_blink_followers([{'object':'Hair', 'seed':LASH_SEED}])
```

`prepare_blink` uses the size of the selected skin part and the Studio camera direction to place the bundled mask and its initial eight points. It does not detect the eye. The agent aligns the landmarks by G-key manipulation on screen, world coordinates, or pixels of a fixed capture. L is camera-right (the right side of the front image) and R is camera-left. This is not necessarily the input model's local X axis.

```python
helper.set_blink_points({'eyeInnerL':[world_x, world_y, world_z]})
# Or use pixels with the top-left origin of an image captured with the same session.camera.
projection = helper.set_blink_pixels({
    'eyeInnerL':[px,py], 'eyeOuterL':[px,py],
    'eyeUpperL':[px,py], 'eyeLowerL':[px,py],
    'eyeInnerR':[px,py], 'eyeOuterR':[px,py],
    'eyeUpperR':[px,py], 'eyeLowerR':[px,py],
}, angle='Front', snap_pixels=12)
helper.fit_blink()
helper.capture_fit(angles=['Front'])
```

Pixels are coordinates in the original captured image. Do not pass coordinates from a cropped or zoomed display as they are. Projection raycasts only onto the specified skin part's Basis and does not reference the iris or eyelashes of other parts. When it does not hit a front-facing surface, it snaps to nearby projected vertices only within an explicitly specified snap_pixels range. Check each returned point's world/method/pixel_error (and vertex when snapped). If a position is wrong, respecify and refit. Even if surface_ray succeeds, it may be hitting skin beyond an opening. Do not adopt it just because the front position matches; check the actual depth of the eye rim at 45 degrees and profile. If it is ambiguous, select the actual vertices of the eye rim in Wireframe and pass the world coordinates from inspect_mesh's points to set_blink_points. set_blink_points can update only some of the points.

The default affine fits sourceY→targetY for the eight specified points by least squares and reflects the Y-handle movement in the fit as well. If sourceY is constant it fits only the offset, and stops on negative scale. The result is kept in `helper.state['mask']['fitted_depth']` as scale/offset/method. When you want to keep manual depth_scale/depth_offset, specify depth_mode='manual'. Only when you judge that local depth correction is needed, use depth_mode='handles' and refit with depth_influence (default 0.2) and similar chosen relative to this affine. Brows and influence ranges are also not meaning-inferred; the agent specifies the region's bottom/top/fade/back/depth_fade (normalized coordinates) when needed.

When correcting the mask's neutral face itself:

```python
helper.edit_blink_mask()          # shape the mask's Basis with ordinary Blender editing
helper.commit_mask_adjustment()  # keep the same offset on the neutral face and all eye poses
helper.fit_blink()               # the kept offset survives refitting
# use helper.reset_mask_adjustment() only when you intend to discard the correction
```

Basis edits made before committing are also taken into the offset just before refitting, so they are not lost. This is not a procedure of editing only the mask's blink key directly. When rebuilding for a different target, explicitly specify reset=True in prepare_blink.

```python
helper.transfer_blink(reviewed=True)  # after looking at the fit and the explicitly selected parts
helper.capture('blink', .5, angles=['Front'])
helper.capture('blink', display='standard', angles=['Oblique45'])
```

When including follower parts from other objects in the capture, also check what is displayed. If you had narrowed it to the face only, set the actual object names for this request in each variable of `helper.state['render_objects']=[HEAD, LASHES, HAIR]` and capture the look with hair. The transfer targets and what you show in captures can be chosen separately.

In the transfer, check 0→1→0, create dedicated keys on the other parts as well, and synchronize expression switching, capture and the GLB. Do not leave modifiers. Retransferring replaces the finishing on the editing keys, so do it intentionally. Preserve the finished model's Basis, existing keys, UVs, faces and materials.

capture captures only Front by default, or the directions given in angles, from the current mesh, and restores the key values, camera, materials, Edit Mode and so on. It handles unsaved edits without reloading the saved file. In the comparison view, use "Read latest capture" to overlay it on the target or the pre-revision state. standard is the original material, mtoon is the display copy, and solid/wire are for checking structure. Judge shape finishing from actual images, and use screen operations and helper processing appropriately.

When adding a generated target:

```text
node scripts/expression-lab.mjs target WORK blink Front IMAGE.png
```

## After finishing

```python
helper.save(export=True)
```

```text
node scripts/expression-lab.mjs register WORK PROJECT
```

save is a minimal preservation check plus saving the Blend/GLB. Judge the finish in the comparison before returning it. ready_for_review is the agent's judgement of presentation and is separate from user approval. Save intermediate work with ordinary helper.save(). Do not require selection registration, NPZ checkpoints, displacement diagnostics, or review/finalize procedures. Attach the returned model, targets, comparisons and short record to the same .charakit, and do not change the existing VRM. Work can also be resumed from the comparison view on another PC.
