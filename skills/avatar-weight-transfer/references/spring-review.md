# Spring part judgment before sending to Tripo

In a standalone separation request, Astra is responsible for the **visual judgment, separation of independent components, naming and kit return** of outfit spring part candidates. In a combined rig request, do not stop at separation; continue through bone placement, weight transfer and spring setup. Also read the [common rules](../../charakit-project/references/common.md).

1. Inspect and unpack the input with `skills/charakit-project/scripts/unpack.py INPUT.charakit NEW_DIRECTORY`. Use the body FBX from `mode=parts`, before it is sent to Tripo.
2. In the app's folder, run Blender in the background with the config JSON specified. Use a new `output_dir` every time.

   ```sh
   blender --background --factory-startup --python-exit-code 1 --python scripts/separate-springs.py -- review.json
   ```

   ```json
   {"project":"/absolute/path/to/unpacked/project.json","output_dir":"/absolute/path/to/review-001","inventory_only":true}
   ```

3. Cross-check the IDs in `components.json` with the front, side and back views in `inventory.blend`. Judge skirts, straps, ribbons and so on as meaningful groups. When multiple components form one part, put them in the same group. Do not treat clusters as identical just because they are near each other. Connected faces cannot be cut automatically. For those places, attach an annotated image and ask the user.
4. After the judgment, remove `inventory_only`, specify the chosen component IDs in `groups` with a new `output_dir`, and run again. Specify `groups: []` **only when you have confirmed** there are no targets.

   ```json
   {"project":"/absolute/path/to/unpacked/project.json","output_dir":"/absolute/path/to/separated-001","groups":[{"name":"BackRibbon_Left","kind":"ribbon","components":["body:0:12","body:0:13"]}]}
   ```

   `kind` is `skirt`, `ribbon`, `strap` or `other`. Names must be unique and easy to understand, and the main body becomes `Body`. The output `body.fbx` contains Body and the named spring parts as separate objects. Do not move their positions; preserve the appearance including the outfit.
5. Register into the same canonical kit with `node scripts/update-spring-parts.mjs separation-input.json project.charakit`. The config JSON has the following format. Paths are relative to the config file or absolute.

   ```json
   {"input":"project.charakit","report":"separated-001/separation.json","fbx":"separated-001/body.fbx"}
   ```

   The script cross-checks the original body hash, the output FBX hash and `springObjects`. After checking, it updates the same canonical project as the input. In a combined request, continue to the next stage and run complete after reaching the requested confirmation point.

Whether to include spring parts in Tripo is awaiting the user's verification. For now, even after separation, pass the appearance including the outfit to Tripo. Exclude spring parts from the targets only during weight transfer.
