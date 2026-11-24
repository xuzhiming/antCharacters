# Project data contract (v5 and v6)

For the initial images, create 8 PNGs, 4 directions each of the head (including hair) and the outfit-included body, embed the actual prompts and register them into the same canonical kit. For independent image delivery requests, a ZIP can also be used. Keep reference images used for generation and revision on the user's side and do not copy them additionally. ZIP import also supports mixed JPEG and WebP. A single-image edit replaces only the current image in the target slot.

Read v4 and v5, and save as v6 when part production is included or as v5 otherwise. v6's `production` follows the [part production data contract](production-format.md). Legacy expression and eye images, FBXs and placements are retained as save-only. The 3D model screen and Blender import maintain the existing body, hair and neutral head roles. The new image screen has 4 directions each for the head (including hair) and the body, 8 images total. Projects that include legacy hair images also maintain the hair field and 12-image import and export.

`threeViews` (optional): `{version:1, visible:true, views:{front:{path,x,y,height,opacity,locked},side:{...},back:{...}}}`. Include only registered directions. `path` references PNG, JPEG or WebP in `assets` with `role:reference`. The image itself is also saved in the `.charakit`. `x` is the screen's horizontal direction, `y` is the image center's height direction in the viewer, and `height` is the image height, all in meters. `opacity` is 0 to 1, and `locked` locks the image's position and size. `side` is the character's own right side and corresponds to the `right` camera. Generated reference views get an optional `autoFit:true`. On the first model edit, they are tentatively aligned to the model's full height and soles, and `autoFit:false` is set. `frame` (optional) is the 0-1 vertical position ratio `{top,bottom}` excluding transparent margins. Existing position, size, opacity, lock and visibility settings are retained on re-registration. Images are overlaid on fixed front, right-side and back planes and do not change their position relative to the model as the camera moves. Except for the operation that replaces the images, preserve these settings and the images.

`workflow`:

```json
{"version":1,"rigging":"tripo","phase":"parts","attachHair":false,"boneMap":{}}
```

- `rigging`: `tripo` (standard) or `markers` (detailed).
- `phase`: the standard is `parts` → `bones` → `weighted` → `springs`. `rigged` is the existing rig / detailed marker path. It is a self-declared stage state and not quality assurance.
- `attachHair`: whether to import the assembled model together with the original hair. False if the returned FBX already contains hair. FBX coordinates must match the original placement.
- `boneMap`: the mapping from Humanoid keys for automated checks to actual FBX bone names.
- `rigExport`: `sourceStamp`, `at`, an optional `bounds: {min:[x,y,z],max:[x,y,z]}` (viewer's Y-up, meters), and `coordinateProfile`. It detects changes after export from the head and body asset hashes, normalization and placement. Changes to hair alone do not require re-export.
- `returnAlignment`: `version:1`, `sourceStamp`, `sourceHeight`, `returnedHeight`, `scale`. This is a record of size correction for returned Tripo items. On the bone-only path, the correction is baked into `rigGuide`. For repairing legacy assembled models, save it to `placements.assembled`. Clear the record when replacing it with a different processing result.

`rigGuide` (optional): `{version:1, sourceStamp, sourceHash, bones:[{name,parent,head,tail,rollAxis}]}`. `parent` is the array index of a preceding bone or null. head/tail are Blender Z-up in meters, and rollAxis is a normalized direction vector. Bone names are unique. `sourceHash` is the SHA-256 of the imported FBX, and the FBX itself is not saved. It is used for display and base body fitting only when `sourceStamp` matches the current head and body. This is the stage of overlaying guide bones on the original 3 parts in `mode=parts`, and Tripo's mesh, materials and weights are not adopted. The shape of the imported FBX is used temporarily only for size calculation. Do not change the head + body originals or the saved placement.

The bone-only CLI is `node scripts/import-bones.mjs project.charakit tripo.fbx project.charakit`. It performs the same import as the standard UI. For transfer preparation, use `avatar-weight-transfer/scripts/from_guide.py`. Do not treat the bone-only stage as passing the Motion check.

`mode=assembled` reads the FBX at `updatedModel.path`. It does not re-apply the original parts' normalization to the returned model. Only the hair with `attachHair=true` gets the original parts' normalization and placements applied. For repairing legacy Tripo returned models, align uniform scale and position to the saved head + body's full height, bottom and horizontal center. Legacy projects can recompute the basis from the original parts. If the head or body was changed after export, reject the correction. Posture, orientation and body shape changes are not fixed by this correction and require visual comparison. Do not automatically apply the correction to Astra's processed FBX. On the Blender import side, work from a state where `placements.assembled` has been applied.

Tripo FBX is output with the unrigged head + body placement baked into vertices, Y-up in meters, with mesh position and rotation zero and scale 1 (`baked-y-up-meters-v1`). The viewer's reflection suppression is display-only. Do not rewrite the original FBX or textures.

Model return CLI:

```sh
node scripts/update-model.mjs changes.json project.charakit
```

```json
{
  "input": "project.charakit",
  "fbx": "weighted-review.fbx",
  "phase": "weighted",
  "includesHair": false,
  "boneMap": {"hips":"Hips"},
  "textures": [{"file":"body.png","path":"body.png"}],
  "documents": ["report.json"]
}
```

File references are paths relative to config or absolute paths. For output, specify the same canonical path as the input, and replace it after checking and conflict detection. Do not overwrite existing files other than the input. Preserve original parts, past returned models and images. The texture path uses the relative name referenced by the FBX. If embedded, textures can be omitted. VRM and Blend are separate deliverables.

`phase: "springs"` also requires `blend: "work/character.blend"`. `springSetup: {version:1, blendHash, modelHash}` ties the SHA-256 of the saved Blend and the confirmed FBX. The Blend is not embedded in .charakit but kept in the production folder. `scripts/spring-setup.py` saves the per-part plan into the rig's `charakit_spring_plan_v1` and maps each part's source to the original springObjects name (hair is `hair`). Parts judged as fixed require a reason.

The app's rig/finish complete directly inspects the deliverables and records the result in `springVerification: {version:1, blendHash, vrmHash?, targets, runtime?}`. rig checks the saved bone chains, per-part weights and all targets; finish checks the VRM's references, tips and actual physics ON/OFF response. Do not judge success from the stage name, chain count, weight normalization or the mere presence of this record. If you update a registered model or a previous stage, discard the check results and re-check.

Use the conventional `scripts/update-images.mjs` to add images. New production targets are `(head|body)/(front|left|right|back)/neutral`. Legacy `hair/*/neutral` is also accepted for compatibility and specified edits. The legacy expression authoring procedure does not apply to new production.

## Standard spring part separation (v2)

Before sending to Tripo, Astra visually judges the independent components of the body FBX and separates them into `Body` and named spring part objects with `scripts/separate-springs.py`. For connected parts that cannot be cut, confirm with the user using annotated images. `scripts/update-spring-parts.mjs` saves **the separated body FBX itself** and the following judgment into the same canonical kit. The original candidates are retained in production. If the legacy single-part path needs a restore source, retain only the original body FBX in models/candidates and do not duplicate the whole kit. After complete, the app reloads automatically. The Tripo FBX includes the separated outfit parts. This export method has not been verified on actual models.

```json
{"version":2,"bodyHash":"SHA-256 of the separated body FBX","bodyObject":"Body","springObjects":[{"name":"BackRibbon_Left","kind":"ribbon","separated":true}]}
```

`kind` is `skirt`, `ribbon`, `strap` or `other`. If you confirm that there are no spring parts, save `springObjects: []`. A judgment whose `bodyHash` does not match the current body asset is rejected as stale. Import only the bone placement from the Tripo return and transfer the base body weights to the body only with the local processing CLI. Leave the separated spring parts for the later VRM spring setup.

## Legacy exclusion judgment (v1 compatibility)

Legacy kits' `weightTransferPlan` can also be read in the following format. Omission and an empty array are different. New standard production uses v2 above.

```json
{"version":1,"sourceStamp":"the current rigSourceStamp of the head and body","excludeComponents":["body:0:123"]}
```

`excludeComponents` are the body's independent component IDs confirmed by Astra. Up to 2048, no duplicates, format `body:mesh number:component number`. Judged with no exclusions is `[]`. Undetermined or stale judgments reject transfer. Save it associated with the current model with `node scripts/set-weight-plan.mjs plan.json project.charakit`. The setting format is `{"input":"project.charakit","excludeComponents":[]}`. Component existence is also checked at the Blender preparation stage.

The local app sends the current kit to `POST /api/transfer-weights` and confirms completion with `GET /api/transfer-weights/{id}`. It obtains the new .charakit from `/file` and switches the screen's model after inspection and model construction succeed. On failure, it keeps the original data. There is one concurrent job, input up to 256MB, and Blender processing up to 10 minutes.

The returned kit saves all original assets, images and placements, plus the new assembled FBX, the `weighted` stage, `attachHair=true` and the transfer report. Excluded parts are temporarily fixed, with `springsReady=false` and `visualCheckRequired=true`. You can also obtain the editable Blend and fitted base body FBX from the job's `/blend` and `/donor`, but temporary files are deleted 30 minutes after completion. If needed, save them to the production folder within that time.

The extracted high-poly base body and bones are bundled in `assets/donor/weighted-body.blend`. A different base body can be specified with `donor: {blend,armature,meshes}` in `local/config.json` (or `CHARAKIT_CONFIG`). The base body's local path is not accepted from the browser. Optional `samples: {parts,walk,reference}` are also specified only in this local setting. Local samples are not included in the distribution.
