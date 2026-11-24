# Files and CLI

Node.js 22 or later and Blender are required. Run the commands in the app folder. Blender is detected automatically; if needed, point the `BLENDER` environment variable at the executable. Python is used only to unpack `.charakit`, and mesh processing runs in background Blender.

```text
node scripts/tripo-project.mjs CONFIG.json project.charakit
```

Paths inside CONFIG are resolved from CONFIG's folder. For the output, specify the same canonical path as the input. Check for concurrent updates with inspection and hashes, and replace from a temporary file. Do not mass-produce kits under other names.

## Registering candidates

```json
{"input":"project.charakit","action":"candidates","candidates":[
 {"source":"head","name":"Head candidate 1","fbx":"head-1.fbx","resources":[]},
 {"source":"body","name":"Body candidate 1","fbx":"body-1.fbx","resources":[]}
]}
```

In practice, register the four candidates you generated for each. Read each FBX's axes, units and dimensions, and compute the normalization for the initial display. If there are external textures, list their file paths in `resources`. Make the file names match the names the FBX references. Split duplicate files with the same name into separate bundles.

## Analysis, classification and export

Specify the adopted canonical kit saved by agent-session begin.

```json
{"input":"project.charakit","action":"analyze"}
```

Unpack the returned kit with `skills/charakit-project/scripts/unpack.py`, and compare `production.components` with the FBX at `production.inventory.path` by visual inspection. Classification example (replace the IDs with ones that actually exist):

```json
{"input":"project.charakit","action":"classify","classification":{
 "roles":{"head_00001":"head","head_00002":"hair","body_00001":"body","body_00002":"body","body_00003":"body","body_00004":"body","body_00005":"body","body_00006":"body"},
 "textureGroups":[
  {"id":"head","name":"Head","components":["head_00001"]},
  {"id":"hair","name":"Hair","components":["head_00002"]},
  {"id":"upper_body","name":"Upper body","components":["body_00001"]},
  {"id":"lower_body","name":"Lower body (outfit, legs, shoes)","components":["body_00002","body_00003","body_00004","body_00005"]},
  {"id":"accessories","name":"Large ribbon","components":["body_00006"]}
 ],
 "springGroups":[
  {"id":"skirt","name":"Skirt","kind":"skirt","components":["body_00002"]},
  {"id":"ribbon","name":"Large ribbon","kind":"ribbon","components":["body_00006"]}
 ]}}
```

The texture IDs are fixed as `hair/head/upper_body/lower_body/accessories`. Names can match the design. In the example, the lower body contains the skirt, small waist ornament, legs and shoes, and the large ribbon is included in accessories. Omit hair and accessories that do not exist. For boundaries and exceptions, use [the five categories](retexture-images.md#five-texture-categories).

Spring IDs start with a lowercase letter, use letters, digits, `_` and `-`, and are at most 60 characters. `roles` lists every component explicitly. Textures specify every component exactly once, and spring parts specify only the target components exactly once. Spring `kind` is `hair/skirt/ribbon/strap/other`. Spring parts that come from the head are only components with the `hair` role. Components of a spring `skirt` also belong to `lower_body` in the texture.

```json
{"input":"project.charakit","action":"prepare"}
```

Send each group's `prepared.path` to Tripo, and use `guides.front/back.path` for making the references. `prepared.stamp` identifies the source model and the component parts. Reusing output after the adoption or the component structure has changed is forbidden. If only the spring groups change, you can keep the existing textures and reassemble.

## References and returned models

```json
{"input":"project.charakit","action":"references","references":[
 {"id":"lower_body","view":"front","png":"lower-body-front.png"},
 {"id":"lower_body","view":"back","png":"lower-body-back.png"}
]}
```

```json
{"input":"project.charakit","action":"returns","returns":[
 {"id":"lower_body","fbx":"lower-body-textured.fbx","resources":[],"rotation":[0,0,0]}
]}
```

`rotation` is the XYZ angle that aligns the imported Blender coordinates back to the original. Do not copy the Y angle from Tripo's upload screen verbatim; check it in the actual FBX coordinate system. Specify it only when you have confirmed that the shape matches up/down and left/right. Each part's single Base Color image must be 4096×4096, or assembly cannot run. External PNG/JPEG/WebP images and FBX embedding are supported.

```json
{"input":"project.charakit","action":"assemble"}
```

The final FBX goes into the existing `body/head_neutral/hair`, with the Body and each outfit spring part as separate objects. Texture material assignments are preserved. Hair shares its normalization with the head. `weightTransferPlan` is also saved, so you do not need to reassess the same body's spring parts.

## Export for rigging

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-rig.py -- project.charakit head-body.fbx
node scripts/import-bones.mjs project.charakit tripo-rigged.fbx project.charakit
```

Also check the CLI output `head-body.json`. If you change the placement, export the FBX for Tripo again.

## Segmentation and local processing

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-segmentation.py -- project.charakit models/candidates
```

Re-upload head.glb and body.glb to Tripo and run a coarse segmentation. Fetch the result as FBX and inspect it with [tripo-studio-download](../../tripo-studio-download/SKILL.md), then register it.

```json
{"input":"project.charakit","action":"segmented","segmented":[{"source":"head","fbx":"models/segmented/head.fbx"},{"source":"body","fbx":"models/segmented/body.fbx"}]}
```

After that, apply analyze→classify→prepare→references→returns→assemble to the same project.charakit. Each CONFIG's relative paths are resolved from CONFIG's location.

```text
node scripts/run-local-job.mjs http://127.0.0.1:8766 transfer-weights project.charakit project.charakit
```

The same mechanism can run export-rig (output is FBX), production-analyze, production-prepare and production-assemble. Use the actual URL from the request text. This CLI does not perform Tripo generation or visual classification.
