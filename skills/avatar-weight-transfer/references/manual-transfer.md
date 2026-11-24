# Advanced mode: manual transfer for an existing rig

This is not used by the exclusion judgment in the standard UI. Refer to it when explicitly directed by the marker path or repair of an existing rig. Script paths are relative to this Skill's folder.

## 1. Fit the base body

For repairing an old kit with `mode=parts` and `rigGuide`, or for an explicit manual request, follow [Preparation from bone placement](bone-guide.md) and use `from_guide.py`. In the standard path, the spring part judgment is done in [pre-separation](spring-review.md) before Tripo, and the app performs the transfer. `transfer.py fit` below is the existing-rig path.

In Blender, load `scripts/transfer.py` and run `fit(config)`. From the command line it is `blender WORK.blend --background --python-exit-code 1 --python transfer.py -- CONFIG.json`. Example input:

```json
{
  "stage": "fit",
  "target_armature": "Armature",
  "target_meshes": ["Body"],
  "donor_blend": "/absolute/path/to/user-donor.blend",
  "donor_armature": "DonorRig",
  "donor_meshes": ["DonorBody"],
  "output_dir": "/absolute/path/to/new-results",
  "torso_width": 1.0,
  "torso_depth": 1.0
}
```

As needed, specify landmarks such as `hips/chest/head/leftHand/rightHand/leftFoot/rightFoot` and actual bone names in `source_landmarks` / `target_landmarks`. Bones that cannot be matched automatically are specified explicitly with `bone_map: {"base body bone name":"destination bone name"}`. Do not assign to the nearest bone while the correspondence is ambiguous.

The process creates copies of the destination rig and meshes, and the fitted base body, in a new collection. The torso uses a continuous vertical deformation passing through the hips, neck and head plus uniform thickness adjustment, suppressing stretching caused by differences in sternum segment counts. For rigs without a neck, the chest is used instead. Above the head, a uniform scale is kept. Limbs match bone length and orientation, with thickness based on the overall scale. Width and depth corrections range from 0.8–1.2. This does not automatically guarantee extreme body types.

`fitted.blend`, `fitted-donor.fbx` and `report.json` are produced in a unique output location. To move the fitted base body in the app, use a temporary project; do not replace the destination production project with the base body. Check chest position, thickness, armpits, crotch and the reach of hands and feet from the front, side and diagonal views. If needed, Astra adjusts the working copy. **Confirm the appearance of the donor fit before continuing.** Avoid showing the original and the working copy duplicated.

## 2. Transfer

Run the following on the confirmed `fitted.blend`. Use the collection from the fit report.

```json
{"stage":"transfer","collection":"CharaKit_Weights_actual-ID","output_dir":"/absolute/path/to/new-results"}
```

Transfer only to copies of the targets by nearest-triangle interpolation, normalized to the top 4 weights. Report the number of vertices more than 5 cm away and the maximum distance. Parts where the outfit pulls away from the base body, places where fingers come close, and the crotch and armpits are prone to incorrect transfer, so inspect them visually. After corrections, retry from saving the fit.

## 3. Check with motion and return

Import `weighted-review.fbx` with **Import review FBX from Astra** in the app and check the bone correspondence. Use the walk and **Save contact sheet and report** to look for the chest riding up or collapsing, shoulder/hip breakage, and the head or clothes being left behind. Do not pass on vertex counts or weight totals alone. Tell the user that the set-aside spring parts are temporarily pinned to the waist and have no physics setup.

In `scripts/update-model.mjs`, specify `phase: "weighted"` and return a new .charakit. Outputs that do not include hair set `includesHair: false`. Keep the final Blend and report separately. Do not add expression, pupil, eye bone or spring part authoring to this stage.
