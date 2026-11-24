---
name: character-parts-images
description: Split the character's source illustration into a head (including hair) and an outfit-included body, and create 8 images of front, left, right and back with the painting of a finished VTuber standing illustration. Handle part separation, multi-directional consistency and delivery as an image ZIP.
---

# 4-direction assets for the head (including hair) and body

The standard is **2 parts × 4 directions = 8 images: the head (face, hair and head accessories) and the body (neck, outfit, limbs)**. The face and hair are drawn together. New production bodies are always in a T-pose. Output is 2D reference PNGs for 3D generation. Keep a neutral face and eyes; UV layouts, expression variants, eye separation and 3D generation ordering are not included in this stage.

Finish all assets to the painting of a finished VTuber standing illustration viewed up close. Do not simplify the painting for separation. Aim for the same finish on not only facial makeup but also hair, exposed skin, cloth, leather and metal. Preserve the source illustration's shapes and color scheme, and even if the source painting is simple, do not stop the finish density there.

## Starting the work

1. Display the source illustration and read the facial features, hairstyle and full length, body shape, outfit structure, color scheme and patterns, and asymmetry. Separate multiple panels by role and do not mix different expressions or poses. Distinguish invisible parts such as the back from estimates.
2. Decide the split and visible surfaces with the [part and direction contract](references/part-contract.md). Do not make the head hairless or move long back hair to the body.
3. Read the [common painting standard](../character-material-brushup/references/painting.md) and [exploring and verbalizing finished works](../character-material-brushup/references/reference-research.md). For new asset production requests, browse finished works on Pinterest and put the painting elements to use for this character into words. There is no need to redo the search for each direction during the same 8-image production.

The source illustration is the design basis, and the painting text is the finish basis. Third-party reference works are for observation only and are not used as image input for generation, nor as images bundled into the kit, ZIP or skill. For cases where exploration is unavailable and for handling your own samples, follow the above references.

Part images are produced based on the single source illustration. The reference views for model editing are balance references made after part production with [character-three-views](../character-three-views/SKILL.md), and do not replace the input basis for part production. In a combined images request, hand off to the dedicated Skill after registering the 8 images, and run complete after finishing the reference view registration as well. An explicit request for part images only stops within that scope.

## Decide shape and finish in the front view

Use the built-in image_gen and follow the execution and saving procedure of the available imagegen skill. Put the target's structure and the painting specification verbalized from observation into the [generation prompts](references/prompts.md).

- One generation is one part, one direction, one individual. Start from the front, decide the reference where the face, hair and clothes are finished sufficiently, and then proceed to other directions. Specify finished quality from the first attempt and do not intentionally pass through a flat underdrawing.
- For the head front, correct the source's tilt and straighten it into a true front with both eyes' reference height horizontal and the facial centerline vertical. Close the mouth naturally and give a neutral expression with relaxed brows and eye area. Do not inherit the source's smile or open mouth, and maintain the facial features and finished painting.
- For the head, check that the face and hair fit, the hair's depth and the longest hair tips. For the body, supplement the collar, shoulders, back and hem beneath the removed hair within the original design's scope.
- The body T-pose slightly opens the legs to about hip width, and in front and back views leaves a background gap between the inner sides of the left and right shoes. Even if the source has closed legs, adjust to this posture and keep the adopted spacing in other directions. For details, follow [posture and scale](references/part-contract.md#posture-and-scale).
- For long hair where fitting the whole head makes the face small, also check an enlarged view of the face. Do not cut the hair or change the proportions in order to make the face look larger.
- If the painting is insufficient, finish the relevant part with [character-material-brushup](../character-material-brushup/SKILL.md). Do not mass-produce other directions while only the eye area, only the hair or only the clothes remain simplified. Do not apply unnecessary re-editing to good images.

For generation immediately after viewing third-party works, explicitly pass only the inputs you may use, such as the edit target, the user's source illustration and adopted generated images. Do not reference recent conversation images all together and mix in observation-only images.

Rectangular crops of the source illustration or your own generation results, and enlargements that preserve the aspect ratio, can be used for observation. Keep the original files, ranges and outputs traceable, and retain the originals. A crop is not restoration of detail. Do not substitute redrawing, flipping or outline deformation with code.

## Multiple directions and quality checks

Use the adopted front of the same part as the main reference and other directions of the source illustration as auxiliary shape references. Match the color scheme, materials and detail density in new viewpoints as well. Draw highlights according to surface orientation; do not paste the front's lighting in screen coordinates.

Display the generated results and check the following independently.

- **Structure and boundaries**: Does the head have all the hair without body or collar mixed in? Does the body have the necessary neck without face or back hair remaining? Have the original facial features, hair locks, clothing shapes or patterns been redesigned without permission?
- **Direction and scale**: The character's left and right and the screen's front, positions of asymmetry, the pose, and the heights of the crown, chin and hair tips / shoulders, hem and shoe soles. Have the arms or legs been moved to show them in the side view?
- **Body foot spacing**: In front and back views, do the left and right shoes avoid touching, and can the inner outlines from below the knees to the shoes be read separately? Is it not a wide straddle, knock-knees or front/back foot offset? Side views may allow projected overlap.
- **Head posture and expression**: Are both eyes horizontal in the front view and the facial centerline vertical, with no head tilt, looking up or looking down remaining? Is the mouth naturally closed, with no smile or tension remaining in the brows or eye area? Is the same upright posture and neutral expression maintained in other directions?
- **Painting**: Check skin, hair and outfit each with the [painting standard's check items](../character-material-brushup/references/painting.md#output-review). Do not treat something as finished just because the outline is clean, shadows exist or it is high resolution.
- **Between parts**: Do the hair length and body, the skin color of the face and neck/limbs, the strength of light and shadow, and the finish density of outfit and hair connect? The screen occupancy of each part is not the actual size ratio.

For corrections, specify the lacking areas and color expression concretely and work from a good reference. If the same problem does not improve after two corrections, stop continuous editing and communicate the residual and an alternative method. Visual inspection of images alone does not guarantee 3D consistency or painting reproducibility.

## Saving and returning to the app

```text
head/{front,left,right,back}.png
body/{front,left,right,back}.png
```

Each image is square and includes the full outline and margins. Unless a background is specified, use a transparent PNG with a genuine alpha channel and do not substitute a drawn checkerboard pattern. Align the 4 images within a part to the same dimensions, scale and vertical reference.

Follow [saving and returning images](../charakit-project/references/image-delivery.md), put the actual prompts into the PNG metadata with `scripts/package-images.mjs`, and return the 8 images as a ZIP. If needed, you can check files and dimensions with this skill's `scripts/check_assets.py`. The inspection manifest is for work and is not included in the delivery ZIP. Instruct the user to select the ZIP with the app's "Import ZIP".

For editing a single image, compare the slot, path and SHA-256 from the request text, and return a new .charakit using `expectedSha256` in `scripts/update-images.mjs`. Do not change existing slot names or save formats. Keep legacy `hair/*` images as compatibility data and do not merge, delete or replace them unless requested. New production does not need to fill 4 hair-only images.

Delivery is the current images and the actual prompts. Do not bundle third-party images, copies of references, candidate history, adoption reasons, an HTML viewing page or separate explanatory materials. Preserve the source illustration and input kit, and do not treat image changes as reflected in the model.

## Saving with local integration

For requests that include agent-session.mjs begin (the legacy form is start), register both 8-image production and single-image edits into the same canonical project as the input with scripts/update-images.mjs. Save the actual prompt and notify the app with complete. On this path, do not request manual ZIP registration, kit attachment or creation of a renamed kit. The ZIP delivery above applies to requests for independent file delivery.
