# Saving and returning images

## The first 8 images

For the head (including the face and hair as one) and the outfit-included body, create one PNG each for front, left, right and back. Inside the ZIP use two folders, `head` and `body`, each with 4 directions, such as `head/front.png`, `head/left.png` and `body/back.png`. Do not add hair-only images or empty dummy images.

Put the prompt actually used into each PNG's `AvatarKit` metadata. Reference inputs such as the source illustration are kept on the user's side and are not copied additionally into the ZIP. Third-party observation images are not used as image input for generation either. Do not deliver the reason for adoption, revision history, an HTML viewing page or explanatory documents.

Bundle the 8 images with `node scripts/package-images.mjs images.json images.zip`. `images.json` has the following format, and relative paths are based on the config file. Do not run it with just the example line; specify all 8 slots.

```json
{"images":[{"slot":"head/front","file":"head-front.png","prompt":"the prompt actually used"}]}
```

ZIP slot names do not include `/neutral`. The app maps them to `head/front/neutral` etc. when loading. The existing file formats, prompt storage and hash checks are used as is. Return the images and ZIP and instruct the user to select them with the app's "Import ZIP". Do not ask the user to register individually or extract manually.

The app's ZIP import also supports mixed PNG, JPEG and WebP. Extensions are `.png`, `.jpg`, `.jpeg` and `.webp`. Prompt embedding targets PNG. `references/` is ignored on import. If you are explicitly asked to bundle your own sample kit, handle it in a separate stage and do not add it automatically to a ZIP that contains only production images.

## Reference views for balance adjustment

In a combined images request, use [character-three-views](../../character-three-views/SKILL.md) after producing and registering the 8 part images. Keep the single source illustration as the design basis for part production, and make the reference views last for balance. Registration and the ZIP `threeViews` setting follow [the dedicated delivery format](../../character-three-views/references/delivery.md). Do not include reference views in the part slots; the app loads them automatically.

## Compatibility with the legacy 3-way split

The existing 12 images of `head`, `hair` and `body` can also be imported and exported. `package-images.mjs` also accepts a complete legacy 12-image set. New production standardizes on 8 images, and incomplete sets other than 8 or a complete legacy 12 are not delivered as an initial package.

In projects that have legacy hair-only images, keep the legacy hair field on the image screen. Do not automatically interpret an existing head image as including hair, or delete legacy hair images. Do not treat merely splitting images in two as having migrated the 3D model's roles, placements or meshes.

## Editing a single image inside the kit

Confirm the target with the slot, image path and hash from the request text. Make only the changes the user specified and do not touch other images, models or placements. Save the actual prompt and return with `node scripts/update-images.mjs changes.json project.charakit`. Do not retain the target slot's past images or old reference links pointing to them. Legacy config `references` and `key` are accepted, but reference files are not loaded or copied.

```json
{"input":"original.charakit","images":[{"slot":"head/front/neutral","file":"revised.png","expectedSha256":"the 64-character SHA-256 in the request text","prompt":"the actual revision prompt used"}]}
```

Slots on this side require `/neutral`. Specified edits to legacy `hair/*/neutral` are also possible, but do not infer conversion to a 2-way split from that request. Retain legacy expression and eye data, but do not make them current production targets. Do not treat merely changing an image as reflected in the 3D model.

## Saving with local integration

For requests that include agent-session.mjs begin (the legacy form is start), register both 8-image production and single-image edits into the same canonical project as the input with scripts/update-images.mjs. Save the actual prompt and notify the app with complete. On this path, do not request manual ZIP registration, kit attachment or creation of a renamed kit. The ZIP delivery above applies to requests for independent file delivery.
