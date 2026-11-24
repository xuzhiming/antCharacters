# Building a VRM Humanoid and T-pose from markers (experimental)

Use the bundled `../scripts/humanoid_setup.py` inside Blender. Its scope is creating a new VRM Humanoid, placing bones in the original pose, provisional weights, T-pose correction of the arms, and converting the mesh and bones to rest. Fine weights, bone roll, eye bone centers, spring parts and final VRM quality are verified and adjusted on screen.

Run mechanical staged processing with MCP/scripts. Use Computer Use to observe, select and adjust shapes. Standard new production handles a normal face and fixed eyes, and does not preprocess expressions or the eyes.

## Inputs and preservation

- Use Blender 5.2 and the official VRM Add-on. Enable the installed `bl_ext.blender_org.vrm`, and use Add VRM Humanoid and VRM 1.0 bone assignment. Do not download the add-on or overwrite an existing rig.
- Inspect and unpack the `.charakit` with the bundled `charakit-project`, and specify its `project.json`. Coordinates are meters, Z up, front -Y, character's left +X. If you have repositioned the model in Blender, check that it still matches the markers before running. Do not reapply normalization or placements to the markers.
- The initial targets are an unrigged body and outfit. **State the names of the target mesh objects explicitly**; do not specify container Empties. For the head, hair and so on, state the rigid follow targets as needed. Do not select originals or other versions that you are not using.
- Objects and meshes are copied into the work collection `CharaKit_Rig_Work` and processed there. The original objects are not edited. Because the original and the copy overlap visually, make the work collection the visible target in the UI when checking. At each stage, save a `.blend` with a unique name and a JSON report in the output folder. Do not save over the current file.
- Do not apply it as-is to targets that have an existing rig, object animation, constraints, or additional active modifiers. Do not automatically delete modifiers that change vertex structure and carry on; tidy them separately in the work copy.

## How to run

Load the script in Blender's Scripting workspace. Load the bundled script as follows and call `run` **one stage at a time**. Replace the paths and object names with the real data's. This on-screen check at each stage is ordinary production judgment, not a step that waits for the user's approval every time.

```python
import runpy
setup = runpy.run_path('/absolute/path/to/kit/skills/tripo-character-setup/scripts/humanoid_setup.py')
report = setup['run']({
    'stage': 'create',
    'project_json': '/absolute/path/to/extracted/project.json',
    'output_dir': '/absolute/path/to/production/work/humanoid',
    'deform_objects': ['BodyMesh', 'SleeveMesh'],
    'rigid_objects': {'ExpressionHeadMesh': 'head', 'HairMesh': 'head'},
})
print(report['rig'])
```

`deform_objects` are the targets for automatic weights, and `rigid_objects` are the targets fixed 100% to the specified VRM human bone. Even if you later assign the pupils to the eye bones, look up the actual target names and specify them. The estimated eye bone positions are not their final positions.

Specify the generated rig name (for example `CharaKit_Humanoid`, with a sequence number if it is duplicated) in `rig` below. When you resume each stage from a saved file, use that same rig name.

```python
setup['run']({'stage': 'bind', 'rig': 'CharaKit_Humanoid'})
# Check the provisional weights on screen before running the next one
setup['run']({'stage': 'preview', 'rig': 'CharaKit_Humanoid'})
# Check the T-pose shoulders, armpits, sleeves and hands from multiple directions; repair in the UI first if needed, then commit
setup['run']({'stage': 'commit', 'rig': 'CharaKit_Humanoid'})
```

To use a JSON file, set `CONFIG_PATH` in the execution environment inside Blender and run the script. For background checks, use `blender --background input.blend --python humanoid_setup.py -- config.json`. There is no processing that connects to another Blender while production is running.

## 1. create: place bones in the original pose

Even for an A-pose or arms that hang a little lower, first place bones exactly as the original markers say. The shoulder marker is the start of the upper arm; the elbow is the end of the upper arm and the start of the forearm; the wrist is the end of the forearm and the start of the hand. The hand center is a guide for the direction and length of the hand bone. The start of the clavicle is estimated from the chest and neck.

Do not guess bone name strings on your own; get the target bones from the VRM Add-on's Humanoid assignment. For fingers with a complete set of markers, use those positions; for missing fingers, eyes, the top of the head and so on, place the template to match the parent bone. Check the roll and estimated parts in the UI. Coincident markers and zero-length bones are errors.

## 2. bind: provisional weights

Use Blender's automatic weights for the body and outfit. Rigid targets are assigned 100% to the specified bone. The Armature uses linear deformation with vertex groups. Stop if there are unweighted vertices. After a failure, go back to the output `before-bind` file and review the target structure. Do not apply the same bind again on an intermediate state.

Values appearing in automatic weights does not guarantee that the shoulders or sleeves deform naturally. Do the repairs needed to raise the shoulders, armpits and arms **before converting to rest**. Do not take the route of baking a collapsed shape into the base shape and fixing it after.

## 3. preview: bring the arms to a T-pose

Compute the upper arm, forearm and hand separately for left and right, and point them toward the character's left +X and right -X. Do not use fixed angles or left-right symmetry assumptions, and preserve bone lengths. If the arms are already horizontal, the correction is nearly 0. Do not reset the pose of the legs, head, eyes and fingers all at once. Check the hand direction and roll from multiple directions.

preview can be recomputed from the same input and does not rotate twice. However, because it recomputes the upper arm, forearm and hand poses, after you adjust those in the UI, check them and go on to commit without running preview again. Fix the bone roll at the stage after create when needed.

## 4. commit: convert mesh and bones to rest together

Save a recovery version just before committing, and write after computing the target mesh's coordinates in the T-pose. If there are shape keys, apply the same skinning transform to the Basis and each key, and preserve the names, relative keys and drivers without deleting the keys. Then apply the current bone pose as the rest pose. Keep the Armature modifier and weights, and check each key's coordinates for double deformation.

This experimental version targets a single Armature, linear skinning and unit bone scale. It refuses when it detects other active modifiers, constraints, animation, non-unit bone scale, a masked Armature, or dependent meshes that were not listed. It does not quietly exclude unsupported items and convert only part of the mesh to rest. If you add new bind targets during the work, tidy the structure before resuming.

The completion criteria are that the model stays in the T-pose even after resetting the pose, that the appearance does not change before and after committing, and that the existing shape keys and the deformation around the neck are preserved. A committed rig cannot be committed again. On failure, go back to the `before-rest-commit` file.

Keep the original markers as a record of the pose before correction. Do not reapply the original markers to the rig after T-posing. Do not automatically update the original .charakit or FBX; export from the adopted Blend through the existing handoff steps when needed.
