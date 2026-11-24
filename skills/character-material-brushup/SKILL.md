---
name: character-material-brushup
description: Bring character assets such as the head (including hair) and body to the painting quality of a finished VTuber illustration while preserving shape and design. Use for the shared quality standard of face, hair and outfit, for observing and verbalizing finished works on Pinterest, and for paint-only revisions.
---

# Finish the painting of a completed illustration

The goal is painting that holds up as a finished VTuber illustration even as a single part. Do not limit this to facial warmth; finish hair, skin and outfit all to one quality standard. Combine delicate, clear lines, color layers within a form, shading that makes the shape readable, sheen appropriate to each material, and quiet open areas.

The standard asset set is two parts: the head (containing face and hair together) and the body. Hair-only images or outfit-only revisions of existing assets are also supported, but do not change the boundaries of the requested target. Part separation and four-direction production are handled by [character-parts-images](../character-parts-images/SKILL.md). Do not add parts, ornaments or expressions on your own here.

## Design and finish standard

First display the edit target and the source illustration. What you preserve from the source illustration is the facial features, body type, hairstyle and length, outfit construction, base colors, and patterns and ornaments. Do not limit the density of the finish because the source illustration is small, its painting is simple, or the separated image is flat.

When finishing a new head asset, maintain the upright pose and neutral expression required by the [part and direction contract](../character-parts-images/references/part-contract.md#posture-and-scale). Do not revert to the source illustration's tilt, smile or open mouth. For requests that only revise the painting of an existing asset, keep that asset's adopted pose and expression.

Read [the shared painting and per-material expression](references/painting.md) and make this request's gaps concrete for skin, eye area, hair and outfit. Changes such as painting sheen onto the eyelashes without redesigning the face, layering color within a form without adding locks, or painting cloth shading without changing the outfit belong to this stage. Do not fix one character's pink, white skin, jewel patterns or strong blush onto every character.

## Look at finished works and put them into words

For a new paint finish, browse finished works on Pinterest following the [search and observation procedure](references/reference-research.md). If the work in progress already has the same standard, carry it over. There is no need to search every time for local fixes of typos or shapes unrelated to painting.

Third-party images are for observation only. Neither Pinterest images nor third-party works provided by the user are fed directly into image generation. What you pass to generation is text that verbalizes the relationships of color, shading, boundaries and sheen that fit this request. Do not copy source images, crops, screenshots or embedded data into the kit, delivery ZIP, skill or distributed files.

When using your own sample as the kit's standard, use only the samples that were specified. Do not automatically create samples derived from third-party works or new distribution images on the grounds that this skill is being run.

## Assembling the generation

1. **Check the shape**: Check the differences from the source illustration. Use good shapes as they are. Do not treat a different viewing angle as a facial-feature error, and do not mix redesigns such as enlarging the eyes or changing the chin into the painting instructions.
2. **Painting instructions**: Put the observed expression and this request's gaps into the [prompt examples](references/prompts.md). Write the shared finish first, then make the relevant skin, hair and outfit points concrete. Do not fill the prompt with prohibitions alone.
3. **Check the image inputs**: State the roles of the usable images, such as the edit target, the user's source illustration, and adopted generated images. Even if third-party observation images are in the recent conversation, do not include them all as image references.
4. **Generate and display**: Use the built-in image_gen and the available imagegen skill. One part and one direction per run. Do not substitute code-based saturation changes, blurring or overpainting for repainting.
5. **Evaluate and carry over**: Check shape and painting separately with the [output review](references/painting.md#output-review), and carry colors and materials from the finished standard to the other directions.

## Revision and saving

Limit the locations and expression that are lacking, and edit the good source image. If two revision attempts on the same problem bring no improvement, do not repeat aimlessly; report what remains. If the request is for one image, stop at that one image and do not change other images or the 3D model.

Save the current image and the actual prompt according to [saving and returning images](../charakit-project/references/image-delivery.md). The initial eight-image production uses an image ZIP; a single-image revision inside the kit checks the slot, image path and hash, passes `expectedSha256` to `scripts/update-images.mjs`, and returns a new .charakit.

Do not add reference images, adoption reasons, revision history, candidate lists or explanatory HTML to the delivery. Preserve the user's source illustration and the original inputs. Improvement through image generation and reproducibility in 3D are separate; report only the range you actually checked.

## Saving with local integration

In requests that include agent-session.mjs begin (the legacy form is start), register both eight-image production and single-image revisions into the same canonical project as the input via scripts/update-images.mjs. Save the actual prompt and notify the app with complete. On this path, do not ask for manual ZIP registration, kit attachment or creation of a differently named kit. The ZIP delivery above applies to requests for an independent file delivery.
