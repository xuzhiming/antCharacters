# Preparation from the original meshes and bone placement

The app's Tripo import-back saves `mode=parts, workflow.phase=bones`. Bones are already size-corrected for Blender's Z-up, meters convention. Do not re-normalize them. If the head or body assets or their placement change, re-export and re-rig are required.

Specify the unpacked `project.json` and run it in background Blender with factory settings.

```sh
blender --background --factory-startup --python-exit-code 1 --python skills/avatar-weight-transfer/scripts/from_guide.py -- prepare.json
```

```json
{
  "project": "/absolute/path/to/project.json",
  "output_dir": "/absolute/path/to/private-results",
  "inventory_only": true
}
```

Output `inventory.blend` and `components.json` to a unique `prepare-*` directory. Each ID is an independent component within a mesh of the original FBX. Visualize them to judge skirts, ribbons, straps and their decorations. Do not decide that things are the same part just because they overlap; compare front, side and back. If there are only connected faces, report that they cannot be separated.

Add the following to the same project's config, set `inventory_only` to false, and run again.

```json
{
  "donor_blend": "/absolute/path/to/user-donor.blend",
  "donor_armature": "DonorRig",
  "donor_meshes": ["DonorBody"],
  "exclude_components": ["body:0:actual-number"]
}
```

Specify a user-provided base body. Confirm mesh names in the actual file. `exclude_components` should specify only the body components you have confirmed. Apply fixed Head weights to the head and target only the body for transfer. Excluded parts become separate objects that preserve UVs, faces and materials, and are temporarily pinned at the waist for review. Do not include hair in this output; use the original from the returned kit.

Keep the base body's bone hierarchy and bone names, and fit the corresponding joint positions to `rigGuide`. Use elbows and knees in addition to wrists and ankles. Mirror editing on the base body is disabled, so Tripo's left-right asymmetry is preserved. Non-bone work groups in a provided base body are not included in the transfer.

`fit.output` in `report.json` contains the fitted base body FBX. After checking from the front and side, use `prepared.blend` and `fit_collection` to proceed to the transfer stage of `transfer.py`. Do not overwrite the original. The automatic fit is a draft; places where the outfit pulls away from the base body, and the fingers, are candidates for visual correction.

## Returning the judgment to the app

For the same input kit, run `node scripts/set-weight-plan.mjs plan.json reviewed.charakit`. Existing files are not overwritten.

```json
{"input":"original.charakit","excludeComponents":["body:0:123"]}
```

Replace the number with the actual ID from `components.json`. The input path is relative to the config file. If you have confirmed there are no exclusions, always specify an empty array `[]`. The script associates the judgment with the current head and body hashes and placement. If the model or placement changes, judge again.

The user opens the returned kit and presses **Rigging** → **Transfer weights**. The automatic path runs donor fitting, separation of independent components, transfer, and loading into Motion check. It is not a feature that automatically splits faces that cannot be cut apart. Even when you run it on the user's behalf, do not skip the judgment and insert an empty array.
