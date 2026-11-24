# Part production data contract

## Saving and restoring

When part production begins, the `.charakit` becomes v6. Legacy v4 and v5 can also be loaded. Kits without `production` are saved as v5. v6 cannot be opened by older app versions.

New production uses `production.version: 2` and `settings.maxTextures: 5`. Kits with legacy version 1 and a maximum of 7 can be loaded and saved without changes, and existing returned items can also be assembled. Reclassification of only spring parts retains the legacy textures. Reclassification for new textures migrates to version 2, and a new `prepare` is not run with the legacy classification. Version 2 cannot be opened by older app versions.

- `production.candidates.head/body`: up to 4 source FBXs each, SHA-256, external textures, normalization. Adopted IDs are managed separately in `selected`.
- `segmented.head/body`: the segmented FBX tied to the adopted candidate ID and normalization. This is the basis for retexture. Source candidates are retained.
- `components`: immutable independent part IDs, whether the source is head or body, semantic role, vertex and face counts, and bounding boxes in Blender coordinates. The canonical FBX is `inventory`.
- `textureGroups`: classify all components without duplication into `hair/head/upper_body/lower_body/accessories`. Head, upper body and lower body are required; non-existent hair and accessories are omitted. Lower body includes waist outfit, skirts or pants, legs and shoes. Retain `prepared`, `guides`, `references` and `returned` for each part.
- `springGroups`: classify the same part IDs independently. They do not need to match texture units. Head-derived spring parts are hair only.
- Save intermediate files to `documents/production/` and verify them with SHA-256 the same as normal assets. Using the input and intermediate canonical data, you can resume adoption changes, reclassification and regeneration.
- Adoption changes reset the analysis and everything after it. Texture composition changes invalidate the corresponding exports and returned items. Changes only to spring part classification can reuse textures. In all cases, do not carry over old bone placement or weights.

## Mesh processing

Components with spring part `kind: skirt` are also included in `lower_body` for textures. Create a single 4K texture from the integrated FBX and clothed-state reference images, return the UVs to the original parts, and then separate the skirt etc. into a separate mesh. Do not create texture classifications for legs, shoes or skirt alone. For decoration attribution and handling when separation is impossible, use [the five texture categories](../../tripo-agent-workflow/references/retexture-images.md#five-texture-categories).

Run `scripts/production.py` with background Blender. Separate all polygons of connected components and preserve the reference model's vertex coordinates, face vertex order and UVs. After adoption, use `export-segmentation.py` to make a triangulated GLB of the head and body, register Tripo's coarse segmentation result as FBX, and then separate and classify. Semantic decisions and cutting connected faces are not automated. If separation is impossible, confirm with the user whether to try with Blender Computer Use or to regenerate or reselect with Tripo.

Apply explicit rotation correction to returned models and align size and position using the bounding box of the whole part. Then check all vertex and face correspondences and **transfer UVs and materials without changing the reference mesh's coordinates or face structure**. Duplicate vertices at UV seams can be matched. Reject face structure changes from the reference, remeshing, missing faces, non-matching shapes, duplicate faces, etc., and keep the input kit. Do not infer front/back or left/right rotation from symmetric shapes.

Final FBXs are consolidated into the conventional `body/head_neutral/hair`. The head and hair keep their original relative position with the same normalization. The body's normal portion becomes `Body`, outfit spring parts become individual objects, and materials can be shared across groups. Save the body SHA and spring part names into `weightTransferPlan` and connect them to the existing weight transfer.

Rigging sends only the head and body to Tripo, and the existing `import-bones.mjs` imports only the bone placement with size correction. The scope of returned items differs between retexture and rigging.
